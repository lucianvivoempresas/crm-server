const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

function carregarEnvLocal() {
    const envPath = path.join(__dirname, '.env');

    if (!fs.existsSync(envPath)) {
        return;
    }

    try {
        const conteudo = fs.readFileSync(envPath, 'utf8');
        conteudo.split(/\r?\n/).forEach((linha) => {
            const texto = linha.trim();

            if (!texto || texto.startsWith('#')) {
                return;
            }

            const separadorIndex = texto.indexOf('=');
            if (separadorIndex <= 0) {
                return;
            }

            const chave = texto.slice(0, separadorIndex).trim();
            let valor = texto.slice(separadorIndex + 1).trim();

            if (!chave || process.env[chave] !== undefined) {
                return;
            }

            if (
                (valor.startsWith('"') && valor.endsWith('"')) ||
                (valor.startsWith("'") && valor.endsWith("'"))
            ) {
                valor = valor.slice(1, -1);
            }

            process.env[chave] = valor;
        });
    } catch (error) {
        console.warn('⚠️ Falha ao carregar .env local:', error.message);
    }
}

carregarEnvLocal();

const app = express();

const IS_PROD = process.env.NODE_ENV === 'production';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const configuredTokenSecret = String(process.env.AUTH_TOKEN_SECRET || '').trim();
const knownWeakSecrets = new Set([
    'change-this-to-a-long-random-secret-2026-03-16',
    'change-me',
    'secret',
    'changeme'
]);

if (IS_PROD && (configuredTokenSecret.length < 32 || knownWeakSecrets.has(configuredTokenSecret.toLowerCase()))) {
    throw new Error('AUTH_TOKEN_SECRET ausente ou fraco. Configure pelo menos 32 caracteres aleatórios antes de iniciar em produção.');
}
const TOKEN_SECRET = configuredTokenSecret || crypto.randomBytes(48).toString('base64url');

app.set('trust proxy', 1);

const allowedOrigins = (
    process.env.CORS_ALLOWED_ORIGINS ||
    [
        'https://www.voltconect.com.br',
        'https://voltconect.com.br',
        'https://www.loconecta.com.br',
        'https://loconecta.com.br',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ].join(',')
)
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

function isAllowedOrigin(origin) {
    const isLocalDevOrigin = !IS_PROD && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
    return !origin || allowedOrigins.includes(origin) || isLocalDevOrigin;
}

const blockedPublicFiles = new Set([
    'debug-auth.html',
    'debug-cnpj.html',
    'diagnostico.html',
    'teste-usuarios.html'
]);

app.disable('x-powered-by');

// Permite requisições de outras origens e aumenta limite de tamanho para a importação de Excel
app.use(cors({
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Origem não permitida pelo CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Perfil', 'X-Allow-Data-Reset']
}));

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob:",
            "font-src 'self' data: https://fonts.gstatic.com",
            "connect-src 'self'",
            "worker-src 'self' blob:"
        ].join('; ')
    );
    if (IS_PROD) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
});

app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.get('Origin');
    if (origin && !isAllowedOrigin(origin)) {
        return res.status(403).json({ success: false, error: 'Origem não permitida.' });
    }
    next();
});

app.use(express.json({
    limit: '10mb',
    strict: true,
    type: ['application/json', 'application/*+json']
}));

function criarLimitador({ janelaMs, maximo, chave = req => req.ip || 'unknown' }) {
    const buckets = new Map();
    const timer = setInterval(() => {
        const agora = Date.now();
        for (const [key, value] of buckets) {
            if (agora - value.inicio >= janelaMs) buckets.delete(key);
        }
    }, Math.min(janelaMs, 60000));
    timer.unref();

    return (req, res, next) => {
        const agora = Date.now();
        const key = String(chave(req));
        let bucket = buckets.get(key);
        if (!bucket || agora - bucket.inicio >= janelaMs) {
            bucket = { inicio: agora, quantidade: 0 };
        }
        bucket.quantidade += 1;
        buckets.set(key, bucket);
        res.setHeader('RateLimit-Limit', String(maximo));
        res.setHeader('RateLimit-Remaining', String(Math.max(0, maximo - bucket.quantidade)));
        if (bucket.quantidade > maximo) {
            res.setHeader('Retry-After', String(Math.ceil((janelaMs - (agora - bucket.inicio)) / 1000)));
            return res.status(429).json({ success: false, error: 'Muitas requisições. Aguarde e tente novamente.' });
        }
        next();
    };
}

const limitarEscritasApi = criarLimitador({ janelaMs: 60 * 1000, maximo: 240 });
const limitarTelegram = criarLimitador({
    janelaMs: 60 * 1000,
    maximo: 12,
    chave: req => `${req.ip || 'unknown'}:${req.energiaAuth?.userId || 'anonymous'}`
});

const CHATWOOT_INTEGRATION_TOKEN = String(
    process.env.CHATWOOT_INTEGRATION_TOKEN || ''
).trim();
const CHATWOOT_PUBLIC_URL = String(
    process.env.CHATWOOT_PUBLIC_URL || 'https://chat.voltconect.com.br'
).replace(/\/+$/, '');

function requireChatwootIntegration(req, res, next) {
    if (CHATWOOT_INTEGRATION_TOKEN.length < 32) {
        return res.status(503).json({
            success: false,
            error: 'Integração com Chatwoot não configurada.'
        });
    }

    const provided = String(req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const expectedBuffer = Buffer.from(CHATWOOT_INTEGRATION_TOKEN);
    const providedBuffer = Buffer.from(provided);
    if (
        expectedBuffer.length !== providedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
        return res.status(401).json({ success: false, error: 'Token de integração inválido.' });
    }
    return next();
}

app.use('/api', (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    return limitarEscritasApi(req, res, next);
});

function noStoreHtml(req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
}

if (IS_PROD) {
    app.use((req, res, next) => {
        const filename = path.basename(req.path || '').toLowerCase();
        if (blockedPublicFiles.has(filename)) {
            return res.status(404).send('Not Found');
        }
        return next();
    });
}

// Serve os arquivos do seu CRM (HTML, CSS, JS) automaticamente
app.use(express.static(path.join(__dirname, 'public'), {
    index: false,
    setHeaders(res, filePath) {
        if (['.html', '.js', '.css'].includes(path.extname(filePath).toLowerCase())) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
        }
    }
}));

// Landing page inicial e rota dedicada para o CRM
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/crm', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/energia', noStoreHtml, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'energia.html'));
});

app.get('/energiavolt', noStoreHtml, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'energia.html'));
});

app.get('/calculadora', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'calculadora.html'));
});

app.get('/premium', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'premium.html'));
});

app.get('/politica-de-privacidade', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'politica-de-privacidade.html'));
});

app.get('/termos-de-uso', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'termos-de-uso.html'));
});

app.get('/contato', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contato.html'));
});

function resolverCaminhoDados(configurado, padrao) {
    if (!configurado) return path.join(__dirname, padrao);
    return path.isAbsolute(configurado) ? configurado : path.join(__dirname, configurado);
}

const DB_PATH = resolverCaminhoDados(process.env.CRM_DB_PATH, 'crm_database.sqlite');
const ENERGIA_DB_PATH = resolverCaminhoDados(process.env.ENERGIA_DB_PATH, 'energia_database.sqlite');
const DB_BACKUP_DIR = resolverCaminhoDados(process.env.DB_BACKUP_DIR, 'database-backups');
const ENERGIA_JSON_BACKUP_DIR = path.join(DB_BACKUP_DIR, 'energia-json');
const ENERGIA_BACKUP_RETENTION = parseEnvInt(process.env.ENERGIA_BACKUP_RETENTION, 200);
const ENERGIA_INTERNAL_BACKUP_RETENTION = parseEnvInt(process.env.ENERGIA_INTERNAL_BACKUP_RETENTION, 20);
const ENERGIA_PERIODIC_BACKUP_MS = parseEnvInt(process.env.ENERGIA_PERIODIC_BACKUP_MINUTES, 180) * 60 * 1000;
const SQLITE_BACKUP_RETENTION = parseEnvInt(process.env.SQLITE_BACKUP_RETENTION, 30);

function ensureBackupDirectory() {
    try {
        fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
        fs.mkdirSync(ENERGIA_JSON_BACKUP_DIR, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') {
            console.warn('⚠️ Falha ao criar diretório de backups de banco de dados:', err.message);
        }
    }
}

function timestampArquivo() {
    return new Date().toISOString().replace(/[:.]/g, '').replace(/T/, '_').replace(/Z$/, '');
}

function contarRegistrosEnergia(payload) {
    const contagem = {};
    let total = 0;
    ['clientes', 'produtos', 'vendas', 'vendedores', 'followups', 'pagamentos', 'metas', 'usuarios', 'oportunidades'].forEach(key => {
        const qtd = Array.isArray(payload?.[key]) ? payload[key].length : 0;
        contagem[key] = qtd;
        total += qtd;
    });
    contagem.total = total;
    return contagem;
}

function revisaoEnergia(payload, scope = 'master', sellerId = null) {
    if (scope === 'seller') {
        return Number(payload?._sellerRevisions?.[String(sellerId || '')]) || 0;
    }
    return Number(payload?._revision) || 0;
}

function aplicarNovaRevisaoEnergia(payload, scope = 'master', sellerId = null) {
    const next = { ...payload };
    if (scope === 'seller') {
        const key = String(sellerId || '');
        next._sellerRevisions = {
            ...(payload?._sellerRevisions && typeof payload._sellerRevisions === 'object' ? payload._sellerRevisions : {}),
            [key]: revisaoEnergia(payload, 'seller', key) + 1
        };
    } else {
        next._revision = revisaoEnergia(payload, 'master') + 1;
        next._sellerRevisions = payload?._sellerRevisions && typeof payload._sellerRevisions === 'object'
            ? payload._sellerRevisions
            : {};
    }
    return next;
}

function limparBackupsEnergiaAntigos() {
    try {
        ensureBackupDirectory();
        const arquivos = fs.readdirSync(ENERGIA_JSON_BACKUP_DIR)
            .filter(nome => nome.endsWith('.json'))
            .map(nome => {
                const fullPath = path.join(ENERGIA_JSON_BACKUP_DIR, nome);
                const stat = fs.statSync(fullPath);
                return { fullPath, mtimeMs: stat.mtimeMs };
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);

        arquivos.slice(ENERGIA_BACKUP_RETENTION).forEach(item => {
            try { fs.unlinkSync(item.fullPath); } catch (err) {
                console.warn('⚠️ Falha ao remover backup antigo:', item.fullPath, err.message);
            }
        });
    } catch (err) {
        console.warn('⚠️ Falha ao limpar backups antigos de energia:', err.message);
    }
}

function criarBackupEnergiaArquivo(payload, reason = 'manual') {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length === 0) return null;
    ensureBackupDirectory();
    const safeReason = String(reason || 'manual').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    const backupPath = path.join(ENERGIA_JSON_BACKUP_DIR, `energia_${safeReason}_${timestampArquivo()}.json`);
    const envelope = {
        criadoEm: new Date().toISOString(),
        reason,
        counts: contarRegistrosEnergia(payload),
        payload
    };
    try {
        fs.writeFileSync(backupPath, JSON.stringify(envelope, null, 2), 'utf8');
        limparBackupsEnergiaAntigos();
        console.log(`✅ Backup JSON do CRM Energia criado em: ${backupPath}`);
        return backupPath;
    } catch (err) {
        console.warn('⚠️ Falha ao criar backup JSON do CRM Energia:', err.message);
        return null;
    }
}

function sobrescritaEnergiaPerigosa(atual, proximo) {
    const atualCounts = contarRegistrosEnergia(atual);
    const nextCounts = contarRegistrosEnergia(proximo);
    if (atualCounts.total < 10) return null;

    const limiteMinimo = Math.max(3, Math.floor(atualCounts.total * 0.2));
    if (nextCounts.total < limiteMinimo) {
        return `bloqueado para evitar perda: total cairia de ${atualCounts.total} para ${nextCounts.total}`;
    }

    const colecoesCriticas = ['clientes', 'vendas', 'oportunidades'];
    for (const key of colecoesCriticas) {
        if (atualCounts[key] >= 5 && nextCounts[key] === 0) {
            return `bloqueado para evitar perda: coleção ${key} cairia de ${atualCounts[key]} para 0`;
        }
    }

    return null;
}

function criarBackupEnergiaPeriodico(reason = 'periodic') {
    if (!energiaDb) return;
    carregarEnergiaPayload()
        .then(({ payload }) => {
            criarBackupEnergiaArquivo(payload, reason);
        })
        .catch(err => {
            console.warn('⚠️ Falha ao criar backup periódico do CRM Energia:', err.message);
        });
}

function backupDatabaseFile(filePath, label, reason) {
    if (!fs.existsSync(filePath)) return;
    ensureBackupDirectory();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace(/T/, '_').replace(/Z$/, '');
    const backupName = `${path.basename(filePath)}.${label.replace(/\s+/g, '_').toLowerCase()}.${timestamp}.bak`;
    const backupPath = path.join(DB_BACKUP_DIR, backupName);

    try {
        fs.copyFileSync(filePath, backupPath);
        console.log(`✅ Backup do ${label} criado em: ${backupPath}`);
    } catch (copyErr) {
        console.warn(`⚠️ Falha ao criar backup do ${label}:`, copyErr.message);
    }
}

function limparSnapshotsSqliteAntigos() {
    try {
        ensureBackupDirectory();
        const arquivos = fs.readdirSync(DB_BACKUP_DIR)
            .filter(nome => nome.endsWith('.sqlite'))
            .map(nome => {
                const fullPath = path.join(DB_BACKUP_DIR, nome);
                return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);
        arquivos.slice(SQLITE_BACKUP_RETENTION).forEach(item => fs.unlinkSync(item.fullPath));
    } catch (err) {
        console.warn('⚠️ Falha ao limpar snapshots antigos do SQLite:', err.message);
    }
}

function criarSnapshotSqlite(dbInstance, label, reason = 'periodic') {
    if (!dbInstance || typeof dbInstance.backup !== 'function') return Promise.resolve(null);
    ensureBackupDirectory();
    const safeLabel = String(label).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const safeReason = String(reason).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const destino = path.join(DB_BACKUP_DIR, `${safeLabel}_${safeReason}_${timestampArquivo()}.sqlite`);
    return new Promise((resolve, reject) => {
        dbInstance.backup(destino, err => {
            if (err) {
                try { if (fs.existsSync(destino)) fs.unlinkSync(destino); } catch (cleanupErr) {}
                return reject(err);
            }
            limparSnapshotsSqliteAntigos();
            console.log(`✅ Snapshot consistente do ${label} criado em: ${destino}`);
            resolve(destino);
        });
    });
}

async function criarSnapshotsPeriodicos(reason = 'periodic') {
    const results = await Promise.allSettled([
        criarSnapshotSqlite(db, 'crm', reason),
        criarSnapshotSqlite(energiaDb, 'energia', reason)
    ]);
    results.forEach(result => {
        if (result.status === 'rejected') {
            console.warn('⚠️ Falha ao criar snapshot SQLite:', result.reason?.message || result.reason);
        }
    });
}

function openDatabaseWithRecovery(dbPath, label) {
    return new Promise((resolve, reject) => {
        const dbInstance = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error(`❌ Erro ao abrir o banco ${label}:`, err.message);
                if (fs.existsSync(dbPath)) backupDatabaseFile(dbPath, label, err.message);
                return reject(err);
            }

            dbInstance.get('PRAGMA quick_check', [], (checkErr, row) => {
                const integrityOk = !checkErr && row && row.quick_check === 'ok';
                if (!integrityOk) {
                    const reason = checkErr ? checkErr.message : `PRAGMA quick_check retornou ${String(row?.quick_check)}`;
                    console.error(`❌ ${label} inválido ou corrompido: ${reason}`);
                    if (fs.existsSync(dbPath)) backupDatabaseFile(dbPath, label, reason);
                    return dbInstance.close(() => reject(checkErr || new Error(reason)));
                }

                dbInstance.exec(
                    [
                        'PRAGMA journal_mode = WAL',
                        'PRAGMA synchronous = FULL',
                        'PRAGMA busy_timeout = 10000',
                        'PRAGMA foreign_keys = ON',
                        'PRAGMA wal_autocheckpoint = 1000'
                    ].join('; '),
                    (pragmaErr) => {
                        if (pragmaErr) {
                            return dbInstance.close(() => reject(pragmaErr));
                        }
                        console.log(`Conectado ao banco SQLite com segurança: ${dbPath}`);
                        resolve(dbInstance);
                    }
                );
            });
        });
    });
}

let db;
let energiaDb;

const dbReady = openDatabaseWithRecovery(DB_PATH, 'CRM principal')
    .then((database) => {
        db = database;
        return new Promise((resolve) => {
            db.get('PRAGMA quick_check', [], (checkErr, row) => {
                if (checkErr) {
                    console.error('Erro ao verificar integridade do banco SQLite:', checkErr.message);
                } else {
                    console.log('Integridade SQLite:', row?.quick_check || 'sem resultado');
                }
                resolve();
            });
        });
    })
    .catch((err) => {
        console.error('❌ Falha ao inicializar o banco principal:', err.message);
        throw err;
    });

const energiaDbReady = openDatabaseWithRecovery(ENERGIA_DB_PATH, 'CRM Energia')
    .then((database) => {
        energiaDb = database;
        console.log(`Conectado ao banco SQLite de energia: ${ENERGIA_DB_PATH}`);

        return new Promise((resolve) => {
            energiaDb.serialize(() => {
                energiaDb.run(`CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    collection TEXT,
                    payload TEXT
                )`, (err) => {
                    if (err) {
                        console.error('Erro ao criar tabela documents do banco de energia:', err.message);
                        return resolve();
                    }

                    energiaDb.get('PRAGMA quick_check', [], (checkErr, row) => {
                        if (checkErr) {
                            console.error('Erro ao verificar integridade do banco de energia:', checkErr.message);
                        } else {
                            console.log('Integridade SQLite energia:', row?.quick_check || 'sem resultado');
                        }
                        resolve();
                    });
                });
            });
        });
    })
    .catch((err) => {
        console.error('❌ Falha ao inicializar o banco de energia:', err.message);
        throw err;
    });

function dbRunAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve(this);
        });
    });
}

// ============ FUNÇÕES UTILITÁRIAS DE SEGURANÇA ============

function hashSenha(senha) {
    return crypto.createHash('sha256').update(senha).digest('hex');
}

const PASSWORD_ITERATIONS = 310000;

function hashSenhaForte(senha) {
    const salt = crypto.randomBytes(16).toString('base64url');
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(senha, salt, PASSWORD_ITERATIONS, 32, 'sha256', (err, derivedKey) => {
            if (err) return reject(err);
            resolve(`pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${derivedKey.toString('base64url')}`);
        });
    });
}

async function compararSenha(senha, storedHash) {
    const stored = String(storedHash || '');
    if (!stored.startsWith('pbkdf2$')) {
        const legacy = hashSenha(senha);
        const a = Buffer.from(legacy);
        const b = Buffer.from(stored);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    const [, iterationsRaw, salt, expectedRaw] = stored.split('$');
    const iterations = Number(iterationsRaw);
    if (!iterations || !salt || !expectedRaw) return false;
    const actual = await new Promise((resolve, reject) => {
        crypto.pbkdf2(senha, salt, iterations, 32, 'sha256', (err, derivedKey) => {
            if (err) return reject(err);
            resolve(derivedKey);
        });
    });
    const expected = Buffer.from(expectedRaw, 'base64url');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function compararSenhaUsuarioEnergia(usuario, senha) {
    if (!usuario) return false;
    if (usuario.senhaSegura) {
        return compararSenha(senha, usuario.senhaSegura);
    }
    if (!usuario.salt || !usuario.senhaHash) return false;

    const senhaHash = crypto.createHash('sha256').update(senha + '::' + usuario.salt).digest('hex');
    const actual = Buffer.from(senhaHash);
    const expected = Buffer.from(String(usuario.senhaHash || ''));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * Faz parse de JSON com segurança para evitar queda do processo.
 */
function parsePayloadSeguro(payload, collection, id) {
    try {
        return JSON.parse(payload);
    } catch (err) {
        console.error(`❌ JSON inválido em ${collection} (id=${id}):`, err.message);
        return null;
    }
}

function parseEnvInt(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function migrateEnergiaDataFromLegacyDb() {
    return new Promise((resolve) => {
        if (!fs.existsSync(DB_PATH)) {
            return resolve();
        }

        energiaDb.get("SELECT COUNT(*) AS count FROM documents WHERE collection = 'energia-data'", [], (err, row) => {
            if (err) {
                console.error('❌ Falha ao verificar energia-data no banco exclusivo:', err.message);
                return resolve();
            }

            if (row && row.count > 0) {
                console.log('ℹ️ Banco exclusivo já contém dados energia-data. Migração não necessária.');
                return resolve();
            }

            const sourceDb = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (openErr) => {
                if (openErr) {
                    console.error('❌ Falha ao abrir banco legado para migração:', openErr.message);
                    return resolve();
                }

                sourceDb.all("SELECT id, payload FROM documents WHERE collection = 'energia-data' ORDER BY id ASC", [], (queryErr, rows) => {
                    if (queryErr) {
                        console.error('❌ Falha ao ler dados de energia do banco legado:', queryErr.message);
                        sourceDb.close();
                        return resolve();
                    }

                    sourceDb.close();
                    const parsedRows = rows
                        .map(r => {
                            try {
                                return { id: r.id, payload: JSON.parse(r.payload) };
                            } catch (e) {
                                console.warn('⚠️ Payload inválido na migração de energia:', e.message);
                                return null;
                            }
                        })
                        .filter(Boolean);

                    const chunkRows = parsedRows.filter(r => r.payload && r.payload.chunked === true && typeof r.payload.chunkIndex === 'number' && typeof r.payload.data === 'string');
                    let validData = null;

                    if (chunkRows.length > 0) {
                        const ordered = chunkRows.sort((a, b) => a.payload.chunkIndex - b.payload.chunkIndex);
                        const fullString = ordered.map(r => r.payload.data).join('');
                        try {
                            validData = JSON.parse(fullString);
                        } catch (e) {
                            console.warn('⚠️ Falha ao montar chunks de energia do banco legado:', e.message);
                        }
                    }

                    if (!validData) {
                        const normalRows = parsedRows.filter(r => !r.payload || r.payload.chunked !== true);
                        const latest = normalRows.sort((a, b) => b.id - a.id)[0];
                        if (latest && latest.payload && typeof latest.payload === 'object') {
                            validData = latest.payload;
                        }
                    }

                    if (!validData) {
                        console.log('ℹ️ Nenhum dado válido de energia encontrado no banco legado para migrar.');
                        return resolve();
                    }

                    energiaDb.run(
                        "INSERT INTO documents (collection, payload) VALUES (?, ?)",
                        ['energia-data', JSON.stringify(validData)],
                        function(insertErr) {
                            if (insertErr) {
                                console.error('❌ Falha ao migrar dados de energia para o banco exclusivo:', insertErr.message);
                            } else {
                                console.log('✅ Dados de energia migrados do banco legado para energia_database.sqlite (id:', this.lastID, ')');
                            }
                            resolve();
                        }
                    );
                });
            });
        });
    });
}

function delay(ms) {
    if (!ms || ms <= 0) {
        return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}

function montarHtmlEmailMarketing(corpo) {
    return `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <p>${corpo.replace(/\n/g, '<br>')}</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Este é um email de marketing. Não responda este email.</p>
        </div>
    `;
}

/**
 * Normaliza campos legados de vendedor para um único vendedor_id numérico.
 */
function normalizarVendedorId(payloadBody) {
    if (!payloadBody || typeof payloadBody !== 'object') return payloadBody;

    const candidate = payloadBody.vendedor_id ?? payloadBody.vendedorId ?? payloadBody.usuario_id ?? payloadBody.userId;
    if (candidate !== undefined && candidate !== null && candidate !== '') {
        const parsed = parseInt(candidate, 10);
        if (!Number.isNaN(parsed)) {
            payloadBody.vendedor_id = parsed;
        }
    }

    delete payloadBody.vendedorId;
    delete payloadBody.usuario_id;
    delete payloadBody.userId;

    return payloadBody;
}

const SELLER_ID_SQL_EXPR = "COALESCE(CAST(json_extract(payload, '$.vendedor_id') AS INTEGER), CAST(json_extract(payload, '$.vendedorId') AS INTEGER), CAST(json_extract(payload, '$.usuario_id') AS INTEGER), CAST(json_extract(payload, '$.userId') AS INTEGER))";

function isSellerScopedCollection(collection) {
    return ['clientes', 'vendas', 'campanhas', 'campanha_leads', 'campanha_distribuicao_historico'].includes(collection);
}

const ALLOWED_DATA_COLLECTIONS = new Set([
    'clientes',
    'vendas',
    'comissoes',
    'metas',
    'campanhas',
    'campanha_leads',
    'campanha_distribuicao_historico'
]);
const MASTER_ONLY_WRITE_COLLECTIONS = new Set(['comissoes', 'metas']);

function validarColecaoDados(req, res, next) {
    if (!ALLOWED_DATA_COLLECTIONS.has(req.params.collection)) {
        return res.status(404).json({ success: false, error: 'Coleção não encontrada.' });
    }
    next();
}

function autorizarEscritaColecao(req, res, next) {
    if (MASTER_ONLY_WRITE_COLLECTIONS.has(req.params.collection) && req.auth?.perfil !== 'master') {
        return res.status(403).json({ success: false, error: 'Operação restrita ao perfil master.' });
    }
    next();
}

function migrarCamposLegadosDocumentos() {
    db.all(
        "SELECT id, collection, payload FROM documents WHERE collection IN ('clientes', 'vendas')",
        [],
        (err, rows) => {
            if (err) {
                console.error('❌ Erro ao buscar dados para migração legada:', err.message);
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('ℹ️ Migração legada: nenhum registro de clientes/vendas encontrado.');
                return;
            }

            let atualizados = 0;
            let ignorados = 0;
            let falhas = 0;
            let pendentes = 0;

            const finalizar = () => {
                console.log(`✅ Migração legada concluída: ${atualizados} atualizado(s), ${ignorados} sem mudança, ${falhas} falha(s).`);
            };

            rows.forEach(row => {
                const original = parsePayloadSeguro(row.payload, row.collection, row.id);
                if (!original) {
                    ignorados++;
                    return;
                }

                const normalizado = normalizarVendedorId({ ...original });
                let alterado = JSON.stringify(original) !== JSON.stringify(normalizado);

                if (row.collection === 'vendas') {
                    const clienteLegacy = normalizado.clienteId ?? normalizado.cliente_id;
                    if (clienteLegacy !== undefined && clienteLegacy !== null && clienteLegacy !== '') {
                        const parsedCliente = parseInt(clienteLegacy, 10);
                        if (!Number.isNaN(parsedCliente) && Number(normalizado.clienteId) !== parsedCliente) {
                            normalizado.clienteId = parsedCliente;
                            alterado = true;
                        }
                    }
                    if (normalizado.cliente_id !== undefined) {
                        delete normalizado.cliente_id;
                        alterado = true;
                    }
                }

                if (!alterado) {
                    ignorados++;
                    return;
                }

                pendentes++;
                db.run(
                    'UPDATE documents SET payload = ? WHERE id = ? AND collection = ?',
                    [JSON.stringify(normalizado), row.id, row.collection],
                    (updateErr) => {
                        if (updateErr) {
                            falhas++;
                            console.error(`❌ Erro ao migrar ${row.collection}#${row.id}:`, updateErr.message);
                        } else {
                            atualizados++;
                        }

                        pendentes--;
                        if (pendentes === 0) {
                            finalizar();
                        }
                    }
                );
            });

            if (pendentes === 0) {
                finalizar();
            }
        }
    );
}

function toBase64Url(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(input) {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (normalized.length % 4)) % 4;
    return Buffer.from(normalized + '='.repeat(padLength), 'base64').toString('utf8');
}

function assinarToken(payloadRaw) {
    return crypto
        .createHmac('sha256', TOKEN_SECRET)
        .update(payloadRaw)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function gerarTokenSessao(user) {
    if (!TOKEN_SECRET) return null;
    const payloadObj = {
        userId: user.id,
        perfil: user.perfil,
        exp: Date.now() + TOKEN_TTL_MS
    };
    const payloadRaw = JSON.stringify(payloadObj);
    const payload = toBase64Url(payloadRaw);
    const signature = assinarToken(payloadRaw);
    return `${payload}.${signature}`;
}

function validarTokenSessao(token) {
    if (!TOKEN_SECRET || !token || !token.includes('.')) return null;

    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    try {
        const payloadRaw = fromBase64Url(payload);
        const expectedSignature = assinarToken(payloadRaw);
        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);
        if (sigBuffer.length !== expectedBuffer.length) return null;
        if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

        const parsed = JSON.parse(payloadRaw);
        if (!parsed.exp || Date.now() > parsed.exp) return null;
        return parsed;
    } catch (err) {
        return null;
    }
}

function readCookies(req) {
    const header = req.headers.cookie || '';
    return header
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((acc, part) => {
            const idx = part.indexOf('=');
            if (idx > 0) {
                acc[decodeURIComponent(part.slice(0, idx))] = decodeURIComponent(part.slice(idx + 1));
            }
            return acc;
        }, {});
}

function setEnergiaSessionCookie(res, token) {
    const attrs = [
        `energia_session=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`
    ];
    if (IS_PROD) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
}

function setMainSessionCookie(res, token, persistent = false) {
    const attrs = [
        `crm_session=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict'
    ];
    if (persistent) attrs.push(`Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`);
    if (IS_PROD) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearMainSessionCookie(res) {
    const attrs = [
        'crm_session=',
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        'Max-Age=0'
    ];
    if (IS_PROD) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearEnergiaSessionCookie(res) {
    const attrs = [
        'energia_session=',
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        'Max-Age=0'
    ];
    if (IS_PROD) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
}

function extractBearerToken(req) {
    const authorization = req.get('Authorization') || '';
    if (!authorization.toLowerCase().startsWith('bearer ')) return null;
    return authorization.slice(7).trim();
}

function requireAuth(req, res, next) {
    const token = readCookies(req).crm_session || extractBearerToken(req);
    const auth = validarTokenSessao(token);
    if (!auth || !auth.userId) {
        clearMainSessionCookie(res);
        return res.status(401).json({ success: false, error: 'Não autenticado' });
    }
    req.auth = auth;
    next();
}

function requireMaster(req, res, next) {
    if (!req.auth || req.auth.perfil !== 'master') {
        return res.status(403).json({ success: false, error: 'Acesso restrito ao perfil master' });
    }
    next();
}

const loginAttempts = new Map();
setInterval(() => {
    const limite = Date.now() - (15 * 60 * 1000);
    for (const [key, value] of loginAttempts) {
        if (value.first < limite) loginAttempts.delete(key);
    }
}, 60 * 1000).unref();

function rateLimitLogin(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userKey = String(req.body?.login || req.body?.email || '').trim().toLowerCase();
    const key = `${ip}:${userKey}`;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 10;
    const current = loginAttempts.get(key) || { count: 0, first: now };

    if (now - current.first > windowMs) {
        current.count = 0;
        current.first = now;
    }

    current.count += 1;
    loginAttempts.set(key, current);

    if (current.count > maxAttempts) {
        return res.status(429).json({ success: false, error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }

    next();
}

function clearLoginAttempts(req) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userKey = String(req.body?.login || req.body?.email || '').trim().toLowerCase();
    loginAttempts.delete(`${ip}:${userKey}`);
}

async function requireEnergiaAuth(req, res, next) {
    try {
        const token = readCookies(req).energia_session;
        const session = validarTokenSessao(token);
        if (!session || !session.userId) {
            clearEnergiaSessionCookie(res);
            return res.status(401).json({ success: false, error: 'Não autenticado.' });
        }

        const { payload } = await carregarEnergiaPayload();
        const usuarios = Array.isArray(payload.usuarios) ? payload.usuarios : [];
        const usuario = usuarios.find(u => u.id === session.userId && u.ativo !== false);
        if (!usuario) {
            clearEnergiaSessionCookie(res);
            return res.status(401).json({ success: false, error: 'Usuário não encontrado.' });
        }

        req.energiaAuth = {
            userId: usuario.id,
            perfil: normalizarTipoEnergia(usuario),
            usuario
        };
        next();
    } catch (err) {
        console.error('Erro ao validar autenticação Energia:', err.message);
        return res.status(500).json({ success: false, error: 'Erro ao validar autenticação.' });
    }
}

function requireEnergiaMaster(req, res, next) {
    if (!req.energiaAuth || req.energiaAuth.perfil !== 'master') {
        return res.status(403).json({ success: false, error: 'Acesso restrito ao perfil master.' });
    }
    next();
}

// ============ CRIAÇÃO DE TABELAS ============

// Cria uma tabela universal (estilo NoSQL) para manter compatibilidade com o seu código anterior
function initializeMainDatabase() {
    return new Promise((resolve) => {
        db.serialize(() => {
    // Tabela de documentos (existente)
    db.run(`CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection TEXT,
        payload TEXT
    )`);
    
    // Tabela de Usuários (NOVA)
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        perfil TEXT CHECK(perfil IN ('vendedor', 'master')) NOT NULL DEFAULT 'vendedor',
        ativo BOOLEAN DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        ultimo_acesso DATETIME
    )`, (err) => {
        if (err) {
            console.error('❌ Erro ao criar tabela usuarios:', err.message);
        } else {
            console.log('✅ Tabela usuarios verificada/criada');
            
            // Em produção, criar usuários padrão só se explicitamente habilitado.
            if (!IS_PROD || process.env.ALLOW_DEFAULT_USERS === 'true') {
                criarUsuariosPadroes();
            } else {
                console.log('ℹ️ Criação automática de usuários padrão desabilitada em produção.');
            }
        }
    });

    // Tabela de Campanhas de Email (NOVA)
    db.run(`CREATE TABLE IF NOT EXISTS email_campanhas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        assunto TEXT NOT NULL,
        corpo TEXT NOT NULL,
        total_destinos INTEGER DEFAULT 0,
        total_enviados INTEGER DEFAULT 0,
        status TEXT DEFAULT 'enviado',
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )`, (err) => {
        if (err) {
            console.error('❌ Erro ao criar tabela email_campanhas:', err.message);
        } else {
            console.log('✅ Tabela email_campanhas verificada/criada');
        }
    });

    // Tabela de Email Log (para rastrear envios individuais)
    db.run(`CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id INTEGER NOT NULL,
        cliente_id INTEGER,
        email_destinatario TEXT NOT NULL,
        nome_cliente TEXT,
        status TEXT DEFAULT 'enviado',
        erro_mensagem TEXT,
        data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campanha_id) REFERENCES email_campanhas(id),
        FOREIGN KEY (cliente_id) REFERENCES documents(id)
    )`, (err) => {
        if (err) {
            console.error('❌ Erro ao criar tabela email_logs:', err.message);
        } else {
            console.log('✅ Tabela email_logs verificada/criada');
        }

        resolve();
    });
        });
    });
}

function montarEnergiaPayload(rows) {
    const parsedRows = (rows || [])
        .map(row => {
            try {
                return { id: row.id, payload: JSON.parse(row.payload) };
            } catch (e) {
                console.warn('Payload invalido em energia-data:', e.message);
                return null;
            }
        })
        .filter(Boolean);

    const normalRows = parsedRows.filter(row => !row.payload || row.payload.chunked !== true);
    const latest = normalRows.sort((a, b) => b.id - a.id)[0];

    const chunkRows = parsedRows.filter(row => row.payload && row.payload.chunked === true && typeof row.payload.chunkIndex === 'number' && typeof row.payload.data === 'string');
    if (chunkRows.length > 0) {
        const ordered = chunkRows.sort((a, b) => a.payload.chunkIndex - b.payload.chunkIndex);
        const fullString = ordered.map(r => r.payload.data).join('');
        try {
            const parsed = JSON.parse(fullString);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return { id: ordered[0].id, payload: parsed };
            }
        } catch (e) {
            console.warn('Falha ao montar chunks de energia-data:', e.message);
        }
    }

    if (latest && latest.payload && typeof latest.payload === 'object' && !Array.isArray(latest.payload)) {
        return { id: latest.id, payload: latest.payload };
    }

    return { id: null, payload: {} };
}

function carregarEnergiaPayload() {
    return new Promise((resolve, reject) => {
        energiaDb.all(
            "SELECT id, payload FROM documents WHERE collection = 'energia-data' ORDER BY id ASC",
            [],
            (err, rows) => {
                if (err) return reject(err);
                resolve(montarEnergiaPayload(rows));
            }
        );
    });
}

let energiaWriteQueue = Promise.resolve();

function enfileirarEscritaEnergia(operation) {
    const scheduled = energiaWriteQueue.then(operation, operation);
    energiaWriteQueue = scheduled.catch(() => {});
    return scheduled;
}

function salvarBackupEnergiaNoBanco(payload) {
    return new Promise((resolve, reject) => {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length === 0) {
            return resolve();
        }

        const arquivoBackup = criarBackupEnergiaArquivo(payload, 'before-write');
        if (!arquivoBackup) {
            const error = new Error('Backup de segurança anterior à escrita não pôde ser criado.');
            error.code = 'BACKUP_REQUIRED';
            return reject(error);
        }
        const backupPayload = JSON.stringify({
            criadoEm: new Date().toISOString(),
            counts: contarRegistrosEnergia(payload),
            payload
        });

        energiaDb.run(
            "INSERT INTO documents (collection, payload) VALUES (?, ?)",
            ['energia-data-backup', backupPayload],
            (err) => {
                if (err) {
                    console.warn('Falha ao criar backup de energia-data:', err.message);
                    const error = new Error('Backup interno anterior à escrita não pôde ser criado.');
                    error.code = 'BACKUP_REQUIRED';
                    return reject(error);
                }
                energiaDb.run(
                    `DELETE FROM documents
                     WHERE collection = 'energia-data-backup'
                       AND id NOT IN (
                         SELECT id FROM documents
                         WHERE collection = 'energia-data-backup'
                         ORDER BY id DESC LIMIT ?
                       )`,
                    [ENERGIA_INTERNAL_BACKUP_RETENTION],
                    cleanupErr => {
                        if (cleanupErr) console.warn('Falha ao rotacionar backups internos de energia-data:', cleanupErr.message);
                        resolve();
                    }
                );
            }
        );
    });
}

function gravarEnergiaPayload(payload) {
    return new Promise((resolve, reject) => {
        energiaDb.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
            if (beginErr) return reject(beginErr);

            energiaDb.run(
                "DELETE FROM documents WHERE collection = 'energia-data'",
                (deleteErr) => {
                    if (deleteErr) {
                        return energiaDb.run('ROLLBACK', () => reject(deleteErr));
                    }

                    energiaDb.run(
                        "INSERT INTO documents (collection, payload) VALUES (?, ?)",
                        ['energia-data', JSON.stringify(payload)],
                        function(insertErr) {
                            if (insertErr) {
                                return energiaDb.run('ROLLBACK', () => reject(insertErr));
                            }

                            const id = this.lastID;
                            energiaDb.run('COMMIT', (commitErr) => {
                                if (commitErr) {
                                    return energiaDb.run('ROLLBACK', () => reject(commitErr));
                                }
                                resolve(id);
                            });
                        }
                    );
                }
            );
        });
    });
}

function atualizarEnergiaDirecionado(transform, revisionScope = 'master', sellerId = null) {
    return enfileirarEscritaEnergia(async () => {
        const { payload: payloadAtual } = await carregarEnergiaPayload();
        await salvarBackupEnergiaNoBanco(payloadAtual);
        let payloadFinal = await transform(payloadAtual);
        if (!payloadFinal || typeof payloadFinal !== 'object' || Array.isArray(payloadFinal)) {
            throw new Error('Transformação de dados inválida.');
        }
        payloadFinal = aplicarNovaRevisaoEnergia(payloadFinal, revisionScope, sellerId);
        if (revisionScope === 'seller') {
            payloadFinal._revision = revisaoEnergia(payloadAtual, 'master');
        }
        const id = await gravarEnergiaPayload(payloadFinal);
        return { id, payload: payloadFinal };
    });
}

function textoIntegracao(value, maxLength = 500) {
    return String(value || '').trim().slice(0, maxLength);
}

function digitosIntegracao(value, maxLength = 20) {
    return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

function telefoneNacionalIntegracao(value) {
    let digits = digitosIntegracao(value, 15);
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        digits = digits.slice(2);
    }
    return digits.slice(0, 11);
}

function idIntegracao(prefix, value) {
    const digest = crypto
        .createHash('sha256')
        .update(String(value))
        .digest('hex')
        .slice(0, 24);
    return `${prefix}-${digest}`;
}

function validarLeadChatwoot(body) {
    const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const chatwoot = source.chatwoot && typeof source.chatwoot === 'object'
        ? source.chatwoot
        : {};
    const contact = source.contact && typeof source.contact === 'object'
        ? source.contact
        : {};
    const lead = source.lead && typeof source.lead === 'object'
        ? source.lead
        : {};

    const eventId = textoIntegracao(source.eventId, 180);
    const accountId = Number(chatwoot.accountId || 1);
    const contactId = Number(chatwoot.contactId);
    const conversationId = Number(chatwoot.conversationId);
    const phone = telefoneNacionalIntegracao(contact.phone);
    const document = digitosIntegracao(contact.document, 14);
    const product = textoIntegracao(lead.product, 80);

    if (!eventId || !Number.isInteger(accountId) || accountId <= 0) {
        throw new Error('Identificador da conta do Chatwoot inválido.');
    }
    if (!Number.isInteger(contactId) || contactId <= 0) {
        throw new Error('Identificador do contato do Chatwoot inválido.');
    }
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
        throw new Error('Identificador da conversa do Chatwoot inválido.');
    }
    if (phone.length < 10 || phone.length > 15) {
        throw new Error('Telefone do contato inválido.');
    }
    if (document && document.length !== 14) {
        throw new Error('CNPJ do contato inválido.');
    }
    if (!/energia/i.test(product)) {
        throw new Error('Somente oportunidades de Energia são aceitas por esta integração.');
    }

    return {
        eventId,
        accountId,
        contactId,
        conversationId,
        contact: {
            name: textoIntegracao(contact.name, 100) || 'Contato WhatsApp',
            company: textoIntegracao(contact.company, 150),
            phone,
            document,
            city: textoIntegracao(contact.city, 100)
        },
        lead: {
            product: 'Energia',
            monthlyBill: textoIntegracao(lead.monthlyBill, 60),
            summary: textoIntegracao(lead.summary, 1000)
        }
    };
}

function upsertLeadChatwootEnergia(payloadAtual, input) {
    const now = new Date().toISOString();
    const clientes = Array.isArray(payloadAtual.clientes) ? [...payloadAtual.clientes] : [];
    const oportunidades = Array.isArray(payloadAtual.oportunidades)
        ? [...payloadAtual.oportunidades]
        : [];
    const followups = Array.isArray(payloadAtual.followups)
        ? [...payloadAtual.followups]
        : [];

    let cliente = clientes.find(item =>
        Number(item.chatwootContactId) === input.contactId
    );
    if (!cliente && input.contact.document) {
        cliente = clientes.find(item =>
            digitosIntegracao(item.documento, 14) === input.contact.document
        );
    }
    if (!cliente) {
        cliente = clientes.find(item =>
            telefoneNacionalIntegracao(item.telefone) === input.contact.phone
        );
    }

    let clienteCreated = false;
    if (cliente) {
        const index = clientes.findIndex(item => item.id === cliente.id);
        cliente = {
            ...cliente,
            nome: cliente.nome || input.contact.company || input.contact.name,
            documento: cliente.documento || input.contact.document,
            telefone: telefoneNacionalIntegracao(cliente.telefone || input.contact.phone),
            origem: cliente.origem || 'whatsapp-chatwoot',
            chatwootContactId: input.contactId,
            chatwootConversationId: input.conversationId,
            cidadeUf: cliente.cidadeUf || input.contact.city,
            contatoResponsavel: cliente.contatoResponsavel || input.contact.name,
            atualizadoEm: now
        };
        clientes[index] = cliente;
    } else if (input.contact.document) {
        clienteCreated = true;
        cliente = {
            id: idIntegracao('cw-client', input.contactId),
            tipo: 'cnpj',
            documento: input.contact.document,
            nome: input.contact.company || input.contact.name,
            telefone: input.contact.phone,
            email: '',
            contrato: '',
            endereco: '',
            origem: 'whatsapp-chatwoot',
            indicadoPor: null,
            vendedorId: null,
            primeiroContato: now,
            notas: [],
            arquivos: [],
            chatwootContactId: input.contactId,
            chatwootConversationId: input.conversationId,
            cidadeUf: input.contact.city,
            contatoResponsavel: input.contact.name,
            criadoEm: now,
            atualizadoEm: now
        };
        clientes.push(cliente);
    }

    let oportunidade = oportunidades.find(item =>
        Number(item.chatwootConversationId) === input.conversationId
    );
    const clienteDados = {
        ...(oportunidade?.clienteDados || {}),
        nome: input.contact.company || input.contact.name,
        documento: input.contact.document,
        telefone: input.contact.phone,
        gestor: input.contact.name,
        cidadeUf: input.contact.city,
        valorContaEnergia: input.lead.monthlyBill
    };
    const produtoEnergia = (Array.isArray(payloadAtual.produtos) ? payloadAtual.produtos : [])
        .find(item => /energia/i.test(String(item.nome || '')));

    let oportunidadeCreated = false;
    if (oportunidade) {
        const index = oportunidades.findIndex(item => item.id === oportunidade.id);
        oportunidade = {
            ...oportunidade,
            clienteId: oportunidade.clienteId || cliente?.id || null,
            clienteDados,
            chatwootContactId: input.contactId,
            chatwootConversationId: input.conversationId,
            chatwootEventId: input.eventId,
            chatwootUrl: `${CHATWOOT_PUBLIC_URL}/app/accounts/${input.accountId}/conversations/${input.conversationId}`,
            chatwootResumo: input.lead.summary,
            valorContaEnergia: input.lead.monthlyBill,
            atualizadoEm: now
        };
        oportunidades[index] = oportunidade;
    } else {
        oportunidadeCreated = true;
        oportunidade = {
            id: idIntegracao('cw-opp', input.conversationId),
            titulo: `Energia - ${input.contact.company || input.contact.name}`,
            clienteId: cliente?.id || null,
            clienteDados,
            vendedorId: null,
            produtoId: produtoEnergia?.id || null,
            valor: 0,
            etapa: 'lead-novo',
            probabilidade: null,
            dataAbertura: now.slice(0, 10),
            dataPrevisao: null,
            dataFechamento: null,
            motivoPerda: null,
            observacoes: input.lead.summary,
            origem: 'whatsapp-chatwoot',
            chatwootContactId: input.contactId,
            chatwootConversationId: input.conversationId,
            chatwootEventId: input.eventId,
            chatwootUrl: `${CHATWOOT_PUBLIC_URL}/app/accounts/${input.accountId}/conversations/${input.conversationId}`,
            chatwootResumo: input.lead.summary,
            valorContaEnergia: input.lead.monthlyBill,
            criadoEm: now,
            atualizadoEm: now
        };
        oportunidades.push(oportunidade);
    }

    let followup = followups.find(item =>
        Number(item.chatwootConversationId) === input.conversationId &&
        item.origem === 'chatwoot-qualificacao'
    );
    let followupCreated = false;
    if (followup) {
        const index = followups.findIndex(item => item.id === followup.id);
        followup = {
            ...followup,
            clienteId: followup.clienteId || cliente?.id || null,
            vendedorId: followup.vendedorId || oportunidade.vendedorId || null,
            chatwootResumo: input.lead.summary,
            atualizadoEm: now
        };
        followups[index] = followup;
    } else {
        followupCreated = true;
        followup = {
            id: idIntegracao('cw-followup', input.conversationId),
            titulo: 'Revisar lead de Energia recebido pelo WhatsApp',
            data: now.slice(0, 10),
            hora: '',
            tipo: 'whatsapp',
            prioridade: 'alta',
            clienteId: cliente?.id || null,
            vendedorId: oportunidade.vendedorId || null,
            descricao: input.lead.summary,
            status: 'pendente',
            origem: 'chatwoot-qualificacao',
            chatwootConversationId: input.conversationId,
            chatwootResumo: input.lead.summary,
            aprovacaoHumanaObrigatoria: true,
            envioAutomatico: false,
            criadoEm: now,
            atualizadoEm: now
        };
        followups.push(followup);
    }

    return {
        payload: {
            ...payloadAtual,
            clientes,
            oportunidades,
            followups
        },
        result: {
            clienteId: cliente?.id || null,
            oportunidadeId: oportunidade.id,
            followupId: followup.id,
            clienteCreated,
            oportunidadeCreated,
            followupCreated
        }
    };
}

function validarEstruturaEnergia(payload) {
    const idKeys = new Set([
        'id',
        'clienteId',
        'produtoId',
        'vendedorId',
        'vendaId',
        'followupId',
        'oportunidadeId'
    ]);
    let nodes = 0;

    function walk(value, key = '', depth = 0) {
        nodes += 1;
        if (nodes > 300000 || depth > 20) {
            throw new Error('Payload excede a complexidade permitida.');
        }
        if (typeof value === 'string') {
            if (value.length > 8 * 1024 * 1024) {
                throw new Error(`Campo ${key || 'texto'} excede o tamanho permitido.`);
            }
            if (idKeys.has(key) && value && !/^[a-zA-Z0-9._:-]{1,128}$/.test(value)) {
                throw new Error(`Identificador inválido no campo ${key}.`);
            }
            return;
        }
        if (Array.isArray(value)) {
            if (value.length > 100000) throw new Error('Coleção excede o limite de registros.');
            value.forEach(item => walk(item, key, depth + 1));
            return;
        }
        if (value && typeof value === 'object') {
            Object.entries(value).forEach(([childKey, child]) => walk(child, childKey, depth + 1));
        }
    }

    walk(payload);
}

function substituirEnergiaPayloadAtomico(payloadString, res, okBodyFactory, options = {}) {
    let parsed;
    try {
        parsed = JSON.parse(payloadString);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Payload final inválido');
        }
        validarEstruturaEnergia(parsed);
    } catch (err) {
        return res.status(400).json({ error: 'Payload final inválido: ' + err.message });
    }

    enfileirarEscritaEnergia(async () => {
        const { payload: payloadAtual } = await carregarEnergiaPayload();
        await salvarBackupEnergiaNoBanco(payloadAtual);

        let payloadFinal = parsed;
        if (typeof options.transformPayload === 'function') {
            payloadFinal = options.transformPayload(payloadAtual, parsed);
        } else if (
            options.preserveConfig &&
            payloadAtual?.config &&
            typeof payloadAtual.config === 'object' &&
            !Array.isArray(payloadAtual.config)
        ) {
            payloadFinal = { ...parsed, config: payloadAtual.config };
        }

        if (options.revisionScope) {
            const sellerId = options.sellerId || null;
            const currentRevision = revisaoEnergia(payloadAtual, options.revisionScope, sellerId);
            if (options.enforceRevision && Number(parsed._revision) !== currentRevision) {
                const error = new Error('Os dados foram alterados por outra sessão. Recarregue a página antes de salvar novamente.');
                error.statusCode = 409;
                error.errorCode = 'STALE_REVISION';
                throw error;
            }
            delete payloadFinal._revision;
            delete payloadFinal._sellerRevisions;
            payloadFinal = aplicarNovaRevisaoEnergia(payloadFinal, options.revisionScope, sellerId);
            if (options.revisionScope === 'seller') {
                payloadFinal._revision = revisaoEnergia(payloadAtual, 'master');
                payloadFinal._sellerRevisions = {
                    ...(payloadAtual?._sellerRevisions || {}),
                    ...(payloadFinal._sellerRevisions || {})
                };
            }
        }

        if (!options.allowDangerousOverwrite) {
            const motivo = sobrescritaEnergiaPerigosa(payloadAtual, payloadFinal);
            if (motivo) {
                const error = new Error(motivo);
                error.statusCode = 409;
                error.currentCounts = contarRegistrosEnergia(payloadAtual);
                error.nextCounts = contarRegistrosEnergia(payloadFinal);
                throw error;
            }
        }

        const id = await gravarEnergiaPayload(payloadFinal);
        return { id, payload: payloadFinal };
    })
        .then(({ id, payload }) => {
            const context = { lastID: id, payload };
            const body = typeof okBodyFactory === 'function'
                ? okBodyFactory.call(context, id, payload)
                : { id };
            res.json(body);
        })
        .catch(err => {
            if (err.statusCode === 409) {
                console.warn('Salvamento do CRM Energia bloqueado:', err.message);
                return res.status(409).json({
                    error: 'Salvamento bloqueado para evitar perda de dados.',
                    code: err.errorCode || 'DANGEROUS_OVERWRITE',
                    detail: err.message,
                    currentCounts: err.currentCounts,
                    nextCounts: err.nextCounts
                });
            }
            if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Erro ao salvar energia-data:', err.message);
            return res.status(500).json({ error: err.message });
        });
}

function normalizarTipoEnergia(usuario) {
    const tipo = String(usuario?.tipo || '').trim().toLowerCase();
    if (tipo === 'master') return 'master';
    if (tipo === 'vendedor' || usuario?.vendedorId) return 'vendedor';
    return 'vendedor';
}

function usuarioEnergiaSeguro(usuario) {
    if (!usuario) return null;
    return {
        id: usuario.id,
        nome: usuario.nome,
        login: usuario.login,
        tipo: normalizarTipoEnergia(usuario),
        vendedorId: usuario.vendedorId || null,
        ativo: usuario.ativo !== false,
        chatIdTelegram: usuario.chatIdTelegram || null
    };
}

function configEnergiaSegura(config, incluirSegredos = false) {
    const safe = config && typeof config === 'object' && !Array.isArray(config)
        ? JSON.parse(JSON.stringify(config))
        : {};
    if (safe.telegram && typeof safe.telegram === 'object' && !incluirSegredos) {
        safe.telegram.token = '';
    }
    return safe;
}

function vendedorIdRegistro(registro) {
    return String(registro?.vendedorId ?? registro?.vendedor_id ?? '');
}

function filtrarPayloadEnergiaParaAuth(payload, auth) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const isMaster = auth?.perfil === 'master';
    if (isMaster) {
        return {
            ...source,
            _revision: revisaoEnergia(source, 'master'),
            _sellerRevisions: undefined,
            usuarios: Array.isArray(source.usuarios) ? source.usuarios.map(usuarioEnergiaSeguro) : [],
            config: configEnergiaSegura(source.config, false)
        };
    }

    const sellerId = String(auth?.usuario?.vendedorId || '');
    const vendas = (Array.isArray(source.vendas) ? source.vendas : [])
        .filter(item => vendedorIdRegistro(item) === sellerId);
    const oportunidades = (Array.isArray(source.oportunidades) ? source.oportunidades : [])
        .filter(item => vendedorIdRegistro(item) === sellerId);
    const clienteIds = new Set([
        ...vendas.map(item => item.clienteId),
        ...oportunidades.map(item => item.clienteId)
    ].filter(Boolean).map(String));
    const clientes = (Array.isArray(source.clientes) ? source.clientes : [])
        .filter(item => vendedorIdRegistro(item) === sellerId || clienteIds.has(String(item.id)));
    clientes.forEach(item => clienteIds.add(String(item.id)));
    const vendaIds = new Set(vendas.map(item => String(item.id)));

    return {
        clientes,
        produtos: Array.isArray(source.produtos) ? source.produtos : [],
        vendas,
        vendedores: (Array.isArray(source.vendedores) ? source.vendedores : [])
            .filter(item => String(item.id) === sellerId),
        followups: (Array.isArray(source.followups) ? source.followups : [])
            .filter(item => vendedorIdRegistro(item) === sellerId || clienteIds.has(String(item.clienteId))),
        pagamentos: (Array.isArray(source.pagamentos) ? source.pagamentos : [])
            .filter(item => vendaIds.has(String(item.vendaId))),
        metas: (Array.isArray(source.metas) ? source.metas : [])
            .filter(item => !vendedorIdRegistro(item) || vendedorIdRegistro(item) === sellerId),
        usuarios: [usuarioEnergiaSeguro(auth.usuario)].filter(Boolean),
        oportunidades,
        config: configEnergiaSegura(source.config, false),
        _revision: revisaoEnergia(source, 'seller', sellerId)
    };
}

function mergeColecaoDoVendedor(atual, recebido, sellerId, options = {}) {
    const current = Array.isArray(atual) ? atual : [];
    const incoming = Array.isArray(recebido) ? recebido : [];
    const ownCurrentIds = new Set(
        current
            .filter(item => options.isOwned ? options.isOwned(item) : vendedorIdRegistro(item) === sellerId)
            .map(item => String(item.id))
    );
    const allCurrentIds = new Set(current.map(item => String(item.id)));
    const preserved = current.filter(item => !ownCurrentIds.has(String(item.id)));
    const accepted = [];

    for (const raw of incoming) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const item = { ...raw };
        const id = String(item.id || '');
        if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
            const error = new Error('Registro com identificador inválido.');
            error.statusCode = 400;
            throw error;
        }
        if (allCurrentIds.has(id) && !ownCurrentIds.has(id)) {
            const error = new Error('Tentativa de alterar registro de outro vendedor.');
            error.statusCode = 403;
            throw error;
        }
        if (options.forceSeller !== false) {
            item.vendedorId = sellerId;
            delete item.vendedor_id;
        }
        accepted.push(item);
    }

    return [...preserved, ...accepted];
}

function mesclarPayloadEnergiaVendedor(payloadAtual, recebido, auth) {
    const sellerId = String(auth?.usuario?.vendedorId || '');
    if (!sellerId) {
        const error = new Error('Usuário vendedor sem vínculo com um vendedor.');
        error.statusCode = 403;
        throw error;
    }

    const ownSales = (Array.isArray(payloadAtual.vendas) ? payloadAtual.vendas : [])
        .filter(item => vendedorIdRegistro(item) === sellerId);
    const ownOpps = (Array.isArray(payloadAtual.oportunidades) ? payloadAtual.oportunidades : [])
        .filter(item => vendedorIdRegistro(item) === sellerId);
    const ownClientIds = new Set([
        ...(Array.isArray(payloadAtual.clientes) ? payloadAtual.clientes : [])
            .filter(item => vendedorIdRegistro(item) === sellerId)
            .map(item => item.id),
        ...ownSales.map(item => item.clienteId),
        ...ownOpps.map(item => item.clienteId)
    ].filter(Boolean).map(String));
    const ownSaleIds = new Set(ownSales.map(item => String(item.id)));

    const vendas = mergeColecaoDoVendedor(payloadAtual.vendas, recebido.vendas, sellerId);
    const oportunidades = mergeColecaoDoVendedor(payloadAtual.oportunidades, recebido.oportunidades, sellerId);
    const clientes = mergeColecaoDoVendedor(payloadAtual.clientes, recebido.clientes, sellerId, {
        isOwned: item => vendedorIdRegistro(item) === sellerId || ownClientIds.has(String(item.id))
    });
    const followups = mergeColecaoDoVendedor(payloadAtual.followups, recebido.followups, sellerId, {
        isOwned: item => vendedorIdRegistro(item) === sellerId || ownClientIds.has(String(item.clienteId))
    });
    const pagamentos = mergeColecaoDoVendedor(payloadAtual.pagamentos, recebido.pagamentos, sellerId, {
        isOwned: item => ownSaleIds.has(String(item.vendaId)),
        forceSeller: false
    });

    return {
        ...payloadAtual,
        clientes,
        vendas,
        followups,
        pagamentos,
        oportunidades,
        produtos: Array.isArray(payloadAtual.produtos) ? payloadAtual.produtos : [],
        vendedores: Array.isArray(payloadAtual.vendedores) ? payloadAtual.vendedores : [],
        metas: Array.isArray(payloadAtual.metas) ? payloadAtual.metas : [],
        usuarios: Array.isArray(payloadAtual.usuarios) ? payloadAtual.usuarios : [],
        config: payloadAtual.config && typeof payloadAtual.config === 'object' ? payloadAtual.config : {}
    };
}

function responderPayloadEnergia(res, payload, id, auth) {
    const safe = filtrarPayloadEnergiaParaAuth(payload, auth);
    return res.json([{ id, ...safe }]);
}

function opcoesEscritaEnergia(req, allowDangerousOverwrite = false) {
    if (allowDangerousOverwrite) {
        return { allowDangerousOverwrite: true };
    }

    if (req.energiaAuth?.perfil === 'master') {
        return {
            allowDangerousOverwrite: false,
            revisionScope: 'master',
            enforceRevision: true,
            transformPayload(payloadAtual, recebido) {
                return {
                    ...recebido,
                    usuarios: Array.isArray(payloadAtual.usuarios) ? payloadAtual.usuarios : [],
                    config: payloadAtual.config && typeof payloadAtual.config === 'object' ? payloadAtual.config : {},
                    _sellerRevisions: payloadAtual._sellerRevisions || {}
                };
            }
        };
    }

    return {
        allowDangerousOverwrite: false,
        revisionScope: 'seller',
        sellerId: String(req.energiaAuth?.usuario?.vendedorId || ''),
        enforceRevision: true,
        transformPayload(payloadAtual, recebido) {
            return mesclarPayloadEnergiaVendedor(payloadAtual, recebido, req.energiaAuth);
        }
    };
}

/**
 * Criar usuários de teste/padrão
 */
function criarUsuariosPadroes() {
    const usuarios = [
        {
            nome: 'Administrador',
            email: 'master@empresa.com',
            senha: hashSenha('JL10@dez'),
            perfil: 'master'
        },
        {
            nome: 'João Silva',
            email: 'felipe@empresa.com',
            senha: hashSenha('123456'),
            perfil: 'vendedor'
        },
        {
            nome: 'Maria Santos',
            email: 'vendedor@empresa.com',
            senha: hashSenha('123456'),
            perfil: 'vendedor'
        }
    ];

    // Evita recriar usuários padrão em cada reinício.
    // Só semeia a base na primeira execução (tabela vazia).
    db.get('SELECT COUNT(*) AS total FROM usuarios', [], (countErr, row) => {
        if (countErr) {
            console.error('❌ Erro ao verificar seed de usuários:', countErr.message);
            return;
        }

        const totalUsuarios = Number(row?.total || 0);
        if (totalUsuarios > 0) {
            console.log('ℹ️ Seed de usuários padrão ignorado: tabela já possui usuários cadastrados.');
            return;
        }

        usuarios.forEach(user => {
            db.run(
                'INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)',
                [user.nome, user.email, user.senha, user.perfil],
                function(err) {
                    if (err) {
                        console.error(`❌ Erro ao criar usuário ${user.email}:`, err.message);
                    } else {
                        console.log(`✅ Usuário criado: ${user.email} (${user.perfil})`);
                    }
                }
            );
        });
    });
}

// ============ ENDPOINTS DE AUTENTICAÇÃO ============

/**
 * POST /auth/login
 * Autentica usuário e retorna dados do usuário
 */
app.post('/auth/login', rateLimitLogin, (req, res) => {
    const { email, senha, lembrarSessao } = req.body;
    
    console.log(`🔐 Tentativa de login: ${email}`);
    
    // Validar entrada
    if (!email || !senha) {
        return res.json({ 
            success: false, 
            error: 'Email e senha são obrigatórios' 
        });
    }
    
    // Buscar usuário no banco
    db.get(
        'SELECT * FROM usuarios WHERE email = ? AND ativo = 1',
        [email],
        async (err, user) => {
            if (err) {
                console.error('❌ Erro ao buscar usuário:', err.message);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Erro ao buscar usuário' 
                });
            }
            
            // Usuário não encontrado
            if (!user) {
                console.warn(`❌ Usuário não encontrado ou inativo: ${email}`);
                return res.json({ 
                    success: false, 
                    error: 'Email ou senha incorretos' 
                });
            }
            
            // Validar senha
            if (!await compararSenha(senha, user.senha)) {
                console.warn(`❌ Senha incorreta para: ${email}`);
                return res.json({ 
                    success: false, 
                    error: 'Email ou senha incorretos' 
                });
            }
            
            // Login bem-sucedido
            console.log(`✅ Login bem-sucedido: ${email} (${user.perfil})`);
            clearLoginAttempts(req);

            if (!String(user.senha || '').startsWith('pbkdf2$')) {
                hashSenhaForte(senha)
                    .then(upgraded => db.run('UPDATE usuarios SET senha = ? WHERE id = ?', [upgraded, user.id]))
                    .catch(upgradeErr => console.warn('Falha ao atualizar hash legado:', upgradeErr.message));
            }
            
            // Atualizar último acesso
            const agora = new Date().toISOString();
            db.run(
                'UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?',
                [agora, user.id]
            );
            
            const token = gerarTokenSessao(user);
            if (!token) {
                return res.status(500).json({
                    success: false,
                    error: 'Servidor sem AUTH_TOKEN_SECRET configurado'
                });
            }
            setMainSessionCookie(res, token, lembrarSessao === true);

            // Retornar dados do usuário (sem a senha)
            res.json({
                success: true,
                usuario: {
                    id: user.id,
                    nome: user.nome,
                    email: user.email,
                    perfil: user.perfil
                }
            });
        }
    );
});

/**
 * POST /auth/logout
 * Faz logout do usuário (opcional, apenas para logs)
 */
app.post('/auth/logout', requireAuth, (req, res) => {
    console.log(`👋 Logout realizado`);
    clearMainSessionCookie(res);
    res.json({ success: true });
});

/**
 * GET /auth/me
 * Retorna dados do usuário atual (validando token, se implementado)
 */
app.get('/auth/me', requireAuth, (req, res) => {
    db.get(
        'SELECT id, nome, email, perfil, ativo FROM usuarios WHERE id = ? AND ativo = 1',
        [req.auth.userId],
        (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Erro ao buscar usuário' });
            }
            if (!user) {
                return res.status(401).json({ success: false, error: 'Não autenticado' });
            }
            return res.json({ success: true, usuario: user });
        }
    );
});

// ============ ENDPOINTS DE GERENCIAMENTO DE USUÁRIOS ============

/**
 * GET /api/usuarios
 * Lista todos os usuários (sem senhas)
 */
app.get('/api/usuarios', requireAuth, requireMaster, (req, res) => {
    db.all(
        'SELECT id, nome, email, perfil, ativo, ultimo_acesso FROM usuarios ORDER BY nome ASC',
        [],
        (err, rows) => {
            if (err) {
                console.error('❌ Erro ao buscar usuários:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

/**
 * POST /api/usuarios
 * Cria um novo usuário
 */
app.post('/api/usuarios', requireAuth, requireMaster, async (req, res) => {
    const { nome, email, senha, perfil = 'vendedor', ativo = 1 } = req.body;
    
    // Validações
    if (!nome || !email || !senha) {
        return res.json({ 
            success: false, 
            error: 'Nome, email e senha são obrigatórios' 
        });
    }
    
    if (!email.includes('@') || senha.length < 10) {
        return res.json({ 
            success: false, 
            error: senha.length < 10 ? 'Senha deve ter pelo menos 10 caracteres' : 'Email inválido'
        });
    }
    
    console.log(`➕ Criando novo usuário: ${email} (${perfil})`);
    
    const senhaHash = await hashSenhaForte(senha);
    
    db.run(
        'INSERT INTO usuarios (nome, email, senha, perfil, ativo) VALUES (?, ?, ?, ?, ?)',
        [nome, email, senhaHash, perfil, ativo],
        function(err) {
            if (err) {
                console.error('❌ Erro ao criar usuário:', err.message);
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.json({ 
                        success: false, 
                        error: 'Email já cadastrado' 
                    });
                }
                return res.status(500).json({ error: err.message });
            }
            console.log(`✅ Usuário criado com ID: ${this.lastID}`);
            res.json({ 
                success: true, 
                id: this.lastID,
                usuario: { id: this.lastID, nome, email, perfil, ativo }
            });
        }
    );
});

/**
 * PUT /api/usuarios/:id
 * Atualiza um usuário
 */
app.put('/api/usuarios/:id', requireAuth, requireMaster, async (req, res) => {
    const id = req.params.id;
    const { nome, email, senha, perfil, ativo } = req.body;
    
    console.log(`✏️ Atualizando usuário ID: ${id}`);
    
    // Construir query dinamicamente baseado no que foi enviado
    let campos = [];
    let valores = [];
    
    if (nome) {
        campos.push('nome = ?');
        valores.push(nome);
    }
    if (email) {
        campos.push('email = ?');
        valores.push(email);
    }
    if (senha && senha.trim()) {
        if (senha.length < 10) {
            return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 10 caracteres' });
        }
        campos.push('senha = ?');
        valores.push(await hashSenhaForte(senha));
    }
    if (perfil) {
        campos.push('perfil = ?');
        valores.push(perfil);
    }
    if (ativo !== undefined) {
        campos.push('ativo = ?');
        valores.push(ativo ? 1 : 0);
    }
    
    if (campos.length === 0) {
        return res.json({ 
            success: false, 
            error: 'Nenhum dado para atualizar' 
        });
    }
    
    valores.push(id);
    
    const query = `UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`;
    
    db.run(query, valores, function(err) {
        if (err) {
            console.error('❌ Erro ao atualizar usuário:', err.message);
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.json({ 
                    success: false, 
                    error: 'Email já cadastrado' 
                });
            }
            return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Usuário ${id} atualizado`);
        res.json({ success: true });
    });
});

/**
 * DELETE /api/usuarios/:id
 * Deleta um usuário
 */
app.delete('/api/usuarios/:id', requireAuth, requireMaster, (req, res) => {
    const id = req.params.id;
    
    // Proteção: não permitir deletar o master
    db.get(
        'SELECT perfil FROM usuarios WHERE id = ?',
        [id],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (!user) {
                return res.json({ 
                    success: false, 
                    error: 'Usuário não encontrado' 
                });
            }
            
            if (user.perfil === 'master') {
                return res.json({ 
                    success: false, 
                    error: 'Não é possível deletar um usuário administrador' 
                });
            }
            
            console.log(`🗑️ Deletando usuário ID: ${id}`);
            
            db.run(
                'DELETE FROM usuarios WHERE id = ?',
                [id],
                function(err) {
                    if (err) {
                        console.error('❌ Erro ao deletar usuário:', err.message);
                        return res.status(500).json({ error: err.message });
                    }
                    console.log(`✅ Usuário ${id} deletado`);
                    res.json({ success: true });
                }
            );
        }
    );
});

// ============ ROTAS DE DADOS (CLIENTES, VENDAS, ETC) ============
app.post('/api/clientes/bulk-upsert', requireAuth, (req, res) => {
    const userId = req.auth.userId;
    const perfil = req.auth.perfil;

    const createRows = Array.isArray(req.body?.create) ? req.body.create : [];
    const updateRows = Array.isArray(req.body?.update) ? req.body.update : [];

    if (!createRows.length && !updateRows.length) {
        return res.json({ success: true, created: 0, updated: 0 });
    }

    // Proteção simples para evitar payloads gigantes por requisição.
    if (createRows.length > 1000 || updateRows.length > 1000) {
        return res.status(400).json({
            success: false,
            error: 'Lote muito grande. Envie no máximo 1000 registros por tipo.'
        });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION', (beginErr) => {
            if (beginErr) return res.status(500).json({ success: false, error: beginErr.message });

            const totalOps = createRows.length + updateRows.length;
            let pending = totalOps;
            let created = 0;
            let updated = 0;
            let failed = false;

            const rollbackAndRespond = (err) => {
                if (failed) return;
                failed = true;
                db.run('ROLLBACK', () => {
                    res.status(500).json({ success: false, error: err.message || String(err) });
                });
            };

            const finishOne = () => {
                if (failed) return;
                pending -= 1;
                if (pending > 0) return;

                db.run('COMMIT', (commitErr) => {
                    if (commitErr) return rollbackAndRespond(commitErr);
                    return res.json({ success: true, created, updated });
                });
            };

            const normalizeForWrite = (payload) => {
                const normalized = normalizarVendedorId({ ...(payload || {}) });
                if (userId && perfil !== 'master') {
                    normalized.vendedor_id = parseInt(userId, 10);
                }
                return normalized;
            };

            createRows.forEach((row) => {
                const normalized = normalizeForWrite(row);
                db.run(
                    'INSERT INTO documents (collection, payload) VALUES (?, ?)',
                    ['clientes', JSON.stringify(normalized)],
                    function(insertErr) {
                        if (insertErr) return rollbackAndRespond(insertErr);
                        created += 1;
                        finishOne();
                    }
                );
            });

            updateRows.forEach((row) => {
                const id = Number(row?.id);
                if (!Number.isFinite(id) || id <= 0) {
                    return rollbackAndRespond(new Error('Registro de update sem id válido.'));
                }

                const normalized = normalizeForWrite(row?.payload);
                db.run(
                    'UPDATE documents SET payload = ? WHERE collection = ? AND id = ?',
                    [JSON.stringify(normalized), 'clientes', id],
                    function(updateErr) {
                        if (updateErr) return rollbackAndRespond(updateErr);
                        updated += 1;
                        finishOne();
                    }
                );
            });
        });
    });
});

// ============ ENDPOINTS PARA CRM ENERGIA (SEM AUTENTICAÇÃO) ============
// Estas rotas DEVEM estar ANTES das rotas genéricas /api/:collection para não serem capturadas por elas

app.post(
    '/api/integrations/chatwoot/leads',
    requireChatwootIntegration,
    async (req, res) => {
        let input;
        try {
            input = validarLeadChatwoot(req.body);
        } catch (error) {
            return res.status(400).json({ success: false, error: error.message });
        }

        try {
            let syncResult;
            const { payload } = await atualizarEnergiaDirecionado((payloadAtual) => {
                const upsert = upsertLeadChatwootEnergia(payloadAtual, input);
                syncResult = upsert.result;
                return upsert.payload;
            });
            return res.status(syncResult.oportunidadeCreated ? 201 : 200).json({
                success: true,
                ...syncResult,
                revision: revisaoEnergia(payload, 'master')
            });
        } catch (error) {
            console.error('Erro ao sincronizar lead do Chatwoot:', error.message);
            return res.status(500).json({
                success: false,
                error: 'Não foi possível sincronizar o lead.'
            });
        }
    }
);

app.post('/api/energia-login', rateLimitLogin, async (req, res) => {
    try {
        const login = String(req.body?.login || '').trim().toLowerCase();
        const senha = String(req.body?.senha || '');
        if (!login || !senha) {
            return res.status(400).json({ success: false, error: 'Login e senha são obrigatórios.' });
        }

        const { payload } = await carregarEnergiaPayload();
        const usuarios = Array.isArray(payload.usuarios) ? payload.usuarios : [];
        const usuario = usuarios.find(u => String(u.login || '').trim().toLowerCase() === login && u.ativo !== false);
        if (!usuario || (!usuario.senhaSegura && (!usuario.salt || !usuario.senhaHash))) {
            clearEnergiaSessionCookie(res);
            return res.status(401).json({ success: false, error: 'Login ou senha inválidos.' });
        }

        const senhaValida = await compararSenhaUsuarioEnergia(usuario, senha);
        if (!senhaValida) {
            clearEnergiaSessionCookie(res);
            return res.status(401).json({ success: false, error: 'Login ou senha inválidos.' });
        }

        if (!usuario.senhaSegura) {
            hashSenhaForte(senha)
                .then(senhaSegura => atualizarEnergiaDirecionado(payloadAtual => {
                    const usuariosAtuais = Array.isArray(payloadAtual.usuarios) ? payloadAtual.usuarios : [];
                    return {
                        ...payloadAtual,
                        usuarios: usuariosAtuais.map(item => item.id === usuario.id
                            ? { ...item, senhaSegura, salt: undefined, senhaHash: undefined }
                            : item)
                    };
                }))
                .catch(upgradeErr => console.warn('Falha ao atualizar senha legada do Energia:', upgradeErr.message));
        }

        const tipo = normalizarTipoEnergia(usuario);
        const token = gerarTokenSessao({ id: usuario.id, perfil: tipo });
        if (!token) {
            return res.status(500).json({ success: false, error: 'Servidor sem AUTH_TOKEN_SECRET configurado.' });
        }

        setEnergiaSessionCookie(res, token);
        clearLoginAttempts(req);
        return res.json({ success: true, usuario: usuarioEnergiaSeguro({ ...usuario, tipo }) });
    } catch (err) {
        console.error('Erro no login Energia:', err.message);
        return res.status(500).json({ success: false, error: 'Erro ao autenticar no CRM Energia.' });
    }
});

app.post('/api/energia-setup', rateLimitLogin, async (req, res) => {
    try {
        const nome = String(req.body?.nome || '').trim();
        const login = String(req.body?.login || '').trim().toLowerCase();
        const senha = String(req.body?.senha || '');

        if (!nome || !/^[a-z0-9._-]{3,}$/.test(login) || senha.length < 10) {
            return res.status(400).json({ success: false, error: 'Dados inválidos para criação do master.' });
        }

        const { payload } = await carregarEnergiaPayload();
        const usuarios = Array.isArray(payload.usuarios) ? payload.usuarios : [];
        if (usuarios.length > 0) {
            return res.status(409).json({ success: false, error: 'Configuração inicial já foi realizada.' });
        }

        const usuario = {
            id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${crypto.randomBytes(6).toString('hex')}`,
            nome,
            login,
            senhaSegura: await hashSenhaForte(senha),
            tipo: 'master',
            vendedorId: null,
            ativo: true,
            criadoEm: new Date().toISOString()
        };

        const nextPayload = {
            ...payload,
            clientes: Array.isArray(payload.clientes) ? payload.clientes : [],
            produtos: Array.isArray(payload.produtos) ? payload.produtos : [],
            vendas: Array.isArray(payload.vendas) ? payload.vendas : [],
            vendedores: Array.isArray(payload.vendedores) ? payload.vendedores : [],
            followups: Array.isArray(payload.followups) ? payload.followups : [],
            pagamentos: Array.isArray(payload.pagamentos) ? payload.pagamentos : [],
            metas: Array.isArray(payload.metas) ? payload.metas : [],
            oportunidades: Array.isArray(payload.oportunidades) ? payload.oportunidades : [],
            config: payload.config && typeof payload.config === 'object' ? payload.config : {},
            usuarios: [usuario]
        };

        substituirEnergiaPayloadAtomico(JSON.stringify(nextPayload), res, function(id) {
            criarBackupEnergiaArquivo(this.payload, 'setup');
            const token = gerarTokenSessao({ id: usuario.id, perfil: 'master' });
            if (token) setEnergiaSessionCookie(res, token);
            clearLoginAttempts(req);
            return { success: true, id, usuario: usuarioEnergiaSeguro(usuario) };
        }, {
            allowDangerousOverwrite: true
        });
    } catch (err) {
        console.error('Erro no setup Energia:', err.message);
        return res.status(500).json({ success: false, error: 'Erro ao configurar master.' });
    }
});

app.post('/api/energia-usuarios', requireEnergiaAuth, requireEnergiaMaster, async (req, res) => {
    try {
        const nome = String(req.body?.nome || '').trim();
        const login = String(req.body?.login || '').trim().toLowerCase();
        const senha = String(req.body?.senha || '');
        const tipo = req.body?.tipo === 'master' ? 'master' : 'vendedor';
        const vendedorId = tipo === 'vendedor' ? String(req.body?.vendedorId || '').trim() : null;
        const chatIdTelegram = String(req.body?.chatIdTelegram || '').trim() || null;
        const ativo = req.body?.ativo !== false;
        if (!nome || !/^[a-z0-9._-]{3,}$/.test(login) || senha.length < 10 || (tipo === 'vendedor' && !vendedorId)) {
            return res.status(400).json({ success: false, error: 'Dados de usuário inválidos. A senha deve ter ao menos 10 caracteres.' });
        }

        const usuario = {
            id: crypto.randomUUID(),
            nome,
            login,
            senhaSegura: await hashSenhaForte(senha),
            tipo,
            vendedorId,
            chatIdTelegram,
            ativo,
            criadoEm: new Date().toISOString()
        };
        const result = await atualizarEnergiaDirecionado(payloadAtual => {
            const usuarios = Array.isArray(payloadAtual.usuarios) ? payloadAtual.usuarios : [];
            if (usuarios.some(item => String(item.login || '').trim().toLowerCase() === login)) {
                const error = new Error('Login já está em uso.');
                error.statusCode = 409;
                throw error;
            }
            return { ...payloadAtual, usuarios: [...usuarios, usuario] };
        });
        return res.json({
            success: true,
            id: result.id,
            revision: revisaoEnergia(result.payload, 'master'),
            usuario: usuarioEnergiaSeguro(usuario)
        });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.statusCode ? err.message : 'Erro ao criar usuário.' });
    }
});

app.put('/api/energia-usuarios/:id', requireEnergiaAuth, requireEnergiaMaster, async (req, res) => {
    try {
        const id = String(req.params.id || '');
        const nome = String(req.body?.nome || '').trim();
        const login = String(req.body?.login || '').trim().toLowerCase();
        const senha = String(req.body?.senha || '');
        const tipo = req.body?.tipo === 'master' ? 'master' : 'vendedor';
        const vendedorId = tipo === 'vendedor' ? String(req.body?.vendedorId || '').trim() : null;
        const chatIdTelegram = String(req.body?.chatIdTelegram || '').trim() || null;
        const ativo = req.body?.ativo !== false;
        if (!id || !nome || !/^[a-z0-9._-]{3,}$/.test(login) || (senha && senha.length < 10) || (tipo === 'vendedor' && !vendedorId)) {
            return res.status(400).json({ success: false, error: 'Dados de usuário inválidos.' });
        }
        if (id === req.energiaAuth.userId && !ativo) {
            return res.status(400).json({ success: false, error: 'Você não pode desativar o próprio usuário.' });
        }

        const senhaSegura = senha ? await hashSenhaForte(senha) : null;
        let usuarioAtualizado = null;
        const result = await atualizarEnergiaDirecionado(payloadAtual => {
            const usuarios = Array.isArray(payloadAtual.usuarios) ? payloadAtual.usuarios : [];
            if (usuarios.some(item => item.id !== id && String(item.login || '').trim().toLowerCase() === login)) {
                const error = new Error('Login já está em uso.');
                error.statusCode = 409;
                throw error;
            }
            if (!usuarios.some(item => item.id === id)) {
                const error = new Error('Usuário não encontrado.');
                error.statusCode = 404;
                throw error;
            }
            return {
                ...payloadAtual,
                usuarios: usuarios.map(item => {
                    if (item.id !== id) return item;
                    usuarioAtualizado = {
                        ...item,
                        nome,
                        login,
                        tipo,
                        vendedorId,
                        chatIdTelegram,
                        ativo,
                        ...(senhaSegura ? { senhaSegura, salt: undefined, senhaHash: undefined } : {})
                    };
                    return usuarioAtualizado;
                })
            };
        });
        return res.json({
            success: true,
            id: result.id,
            revision: revisaoEnergia(result.payload, 'master'),
            usuario: usuarioEnergiaSeguro(usuarioAtualizado)
        });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.statusCode ? err.message : 'Erro ao atualizar usuário.' });
    }
});

app.delete('/api/energia-usuarios/:id', requireEnergiaAuth, requireEnergiaMaster, async (req, res) => {
    try {
        const id = String(req.params.id || '');
        if (!id || id === req.energiaAuth.userId) {
            return res.status(400).json({ success: false, error: 'Você não pode excluir o próprio usuário.' });
        }
        const result = await atualizarEnergiaDirecionado(payloadAtual => {
            const usuarios = Array.isArray(payloadAtual.usuarios) ? payloadAtual.usuarios : [];
            if (!usuarios.some(item => item.id === id)) {
                const error = new Error('Usuário não encontrado.');
                error.statusCode = 404;
                throw error;
            }
            return { ...payloadAtual, usuarios: usuarios.filter(item => item.id !== id) };
        });
        return res.json({
            success: true,
            id: result.id,
            revision: revisaoEnergia(result.payload, 'master')
        });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.statusCode ? err.message : 'Erro ao excluir usuário.' });
    }
});

app.patch('/api/energia-me/telegram', requireEnergiaAuth, async (req, res) => {
    try {
        const chatIdTelegram = String(req.body?.chatIdTelegram || '').trim() || null;
        const scope = req.energiaAuth.perfil === 'master' ? 'master' : 'seller';
        const sellerId = req.energiaAuth.usuario?.vendedorId || null;
        let usuarioAtualizado = null;
        const result = await atualizarEnergiaDirecionado(payloadAtual => ({
            ...payloadAtual,
            usuarios: (Array.isArray(payloadAtual.usuarios) ? payloadAtual.usuarios : []).map(item => {
                if (item.id !== req.energiaAuth.userId) return item;
                usuarioAtualizado = { ...item, chatIdTelegram };
                return usuarioAtualizado;
            })
        }), scope, sellerId);
        return res.json({
            success: true,
            revision: revisaoEnergia(result.payload, scope, sellerId),
            usuario: usuarioEnergiaSeguro(usuarioAtualizado)
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Erro ao salvar Telegram pessoal.' });
    }
});

app.get('/api/energia-session', async (req, res) => {
    try {
        const token = readCookies(req).energia_session;
        const session = validarTokenSessao(token);
        if (!session || !session.userId) {
            clearEnergiaSessionCookie(res);
            const { payload } = await carregarEnergiaPayload();
            const setupRequired = !Array.isArray(payload.usuarios) || payload.usuarios.length === 0;
            return res.status(401).json({ success: false, error: 'Sessão expirada.', setupRequired });
        }

        const { payload } = await carregarEnergiaPayload();
        const usuarios = Array.isArray(payload.usuarios) ? payload.usuarios : [];
        const usuario = usuarios.find(u => u.id === session.userId && u.ativo !== false);
        if (!usuario) {
            clearEnergiaSessionCookie(res);
            return res.status(401).json({ success: false, error: 'Usuário não encontrado.' });
        }

        const renewedToken = gerarTokenSessao({ id: usuario.id, perfil: normalizarTipoEnergia(usuario) });
        if (renewedToken) setEnergiaSessionCookie(res, renewedToken);
        return res.json({ success: true, usuario: usuarioEnergiaSeguro(usuario) });
    } catch (err) {
        console.error('Erro ao validar sessão Energia:', err.message);
        return res.status(500).json({ success: false, error: 'Erro ao validar sessão.' });
    }
});

app.post('/api/energia-logout', (req, res) => {
    clearEnergiaSessionCookie(res);
    res.json({ success: true });
});

/**
 * GET /api/energia-data
 * Carregar dados de energia do banco
 */
app.get('/api/energia-data', requireEnergiaAuth, (req, res) => {
    console.log('📡 [energia] GET /api/energia-data recebido');
    energiaDb.all(
        "SELECT id, payload FROM documents WHERE collection = 'energia-data' ORDER BY id ASC",
        [],
        (err, rows) => {
            if (err) {
                console.error('❌ Erro ao buscar dados de energia:', err.message);
                return res.status(500).json({ error: err.message });
            }

            const parsedRows = rows
                .map(row => {
                    try {
                        const payload = JSON.parse(row.payload);
                        return { id: row.id, payload };
                    } catch (e) {
                        console.warn('⚠️ Erro ao parsear payload:', e.message);
                        return null;
                    }
                })
                .filter(Boolean);

            const chunkRows = parsedRows.filter(row => row.payload && row.payload.chunked === true && typeof row.payload.chunkIndex === 'number' && typeof row.payload.data === 'string');
            if (chunkRows.length > 0) {
                const ordered = chunkRows.sort((a, b) => a.payload.chunkIndex - b.payload.chunkIndex);
                const fullString = ordered.map(r => r.payload.data).join('');
                try {
                    const parsed = JSON.parse(fullString);
                    return responderPayloadEnergia(res, parsed, ordered[0].id, req.energiaAuth);
                } catch (e) {
                    console.error('❌ Erro ao montar chunks de energia-data:', e.message);
                    const normalRowsFallback = parsedRows.filter(row => !row.payload || row.payload.chunked !== true);
                    const latestFallback = normalRowsFallback.sort((a, b) => b.id - a.id)[0];
                    if (latestFallback && latestFallback.payload && typeof latestFallback.payload === 'object' && !Array.isArray(latestFallback.payload)) {
                        return responderPayloadEnergia(res, latestFallback.payload, latestFallback.id, req.energiaAuth);
                    }
                    return res.json([]);
                }
            }

            const normalRows = parsedRows.filter(row => !row.payload || row.payload.chunked !== true);
            const latest = normalRows.sort((a, b) => b.id - a.id)[0];
            if (!latest) {
                return res.json([]);
            }

            return responderPayloadEnergia(res, latest.payload, latest.id, req.energiaAuth);
        }
    );
});

app.get('/api/energia-config', requireEnergiaAuth, async (req, res) => {
    try {
        const { payload } = await carregarEnergiaPayload();
        const config = payload?.config && typeof payload.config === 'object' && !Array.isArray(payload.config)
            ? payload.config
            : {};
        return res.json({
            success: true,
            config: configEnergiaSegura(config, req.energiaAuth.perfil === 'master')
        });
    } catch (err) {
        console.error('Erro ao carregar configurações do CRM Energia:', err.message);
        return res.status(500).json({ success: false, error: 'Erro ao carregar configurações.' });
    }
});

app.patch('/api/energia-config', requireEnergiaAuth, requireEnergiaMaster, (req, res) => {
    const patch = req.body?.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return res.status(400).json({ success: false, error: 'Configuração inválida.' });
    }

    const allowedKeys = new Set([
        'autoFollowups',
        'empresaNome',
        'diasBoasVindas',
        'diasAntesRenovacao',
        'diasInatividade',
        'slaMinutos',
        'aceleradores',
        'telegram'
    ]);
    const sanitizedPatch = Object.fromEntries(
        Object.entries(patch).filter(([key]) => allowedKeys.has(key))
    );

    if (Object.keys(sanitizedPatch).length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhuma configuração válida foi enviada.' });
    }

    substituirEnergiaPayloadAtomico(JSON.stringify(sanitizedPatch), res, function(id, payload) {
        return {
            success: true,
            id,
            revision: revisaoEnergia(payload, 'master'),
            config: configEnergiaSegura(payload.config, true)
        };
    }, {
        allowDangerousOverwrite: true,
        revisionScope: 'master',
        transformPayload(payloadAtual, configPatch) {
            const configAtual = payloadAtual?.config && typeof payloadAtual.config === 'object' && !Array.isArray(payloadAtual.config)
                ? payloadAtual.config
                : {};
            return {
                ...payloadAtual,
                config: {
                    ...configAtual,
                    ...configPatch
                }
            };
        }
    });
});

async function chamarTelegram(token, method, body) {
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(String(token || '').trim())) {
        const err = new Error('Token do Telegram inválido ou não configurado.');
        err.statusCode = 400;
        throw err;
    }
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
        const err = new Error(result?.description || `Telegram retornou ${response.status}.`);
        err.statusCode = 502;
        throw err;
    }
    return result;
}

app.post('/api/energia-telegram/testar', requireEnergiaAuth, limitarTelegram, async (req, res) => {
    try {
        const { payload } = await carregarEnergiaPayload();
        const telegram = payload?.config?.telegram || {};
        const destino = String(req.body?.destino || '');
        let chatId = '';

        if (destino === 'global') {
            if (req.energiaAuth.perfil !== 'master') {
                return res.status(403).json({ success: false, error: 'Acesso restrito ao perfil master.' });
            }
            chatId = String(telegram.chatId || '').trim();
        } else if (destino === 'pessoal') {
            chatId = String(req.body?.chatId || '').trim();
        }

        if (!/^-?\d{5,20}$/.test(chatId)) {
            return res.status(400).json({ success: false, error: 'Chat ID inválido.' });
        }

        await chamarTelegram(telegram.token, 'sendMessage', {
            chat_id: chatId,
            text: destino === 'global'
                ? 'Teste de conexão do CRM Energia concluído com sucesso.'
                : 'Seu Telegram pessoal está configurado no CRM Energia.',
            disable_web_page_preview: true
        });
        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao testar Telegram:', err.message);
        return res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Erro ao testar Telegram.' });
    }
});

app.post('/api/energia-telegram/detectar', requireEnergiaAuth, requireEnergiaMaster, limitarTelegram, async (req, res) => {
    try {
        const { payload } = await carregarEnergiaPayload();
        const telegram = payload?.config?.telegram || {};
        const result = await chamarTelegram(telegram.token, 'getUpdates');
        const updates = Array.isArray(result.result) ? result.result : [];
        const update = updates[updates.length - 1];
        const chatId = update?.message?.chat?.id
            || update?.edited_message?.chat?.id
            || update?.channel_post?.chat?.id
            || update?.my_chat_member?.chat?.id;
        if (!chatId) {
            return res.status(404).json({
                success: false,
                error: 'Envie uma mensagem ao bot e tente detectar novamente.'
            });
        }
        return res.json({ success: true, chatId: String(chatId) });
    } catch (err) {
        console.error('Erro ao detectar Chat ID do Telegram:', err.message);
        return res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Erro ao detectar Chat ID.' });
    }
});

app.post('/api/energia-telegram/notificar', requireEnergiaAuth, limitarTelegram, async (req, res) => {
    const evento = String(req.body?.evento || '').trim();
    const texto = String(req.body?.texto || '');
    const eventosPermitidos = new Set(['geral', 'pipeline', 'venda-nova', 'venda-status', 'venda-obs']);

    if (!eventosPermitidos.has(evento) || !texto || texto.length > 4000) {
        return res.status(400).json({ success: false, error: 'Notificação inválida.' });
    }

    try {
        const { payload } = await carregarEnergiaPayload();
        const telegram = payload?.config?.telegram;
        if (!telegram || telegram.ativo !== true) {
            return res.json({ success: true, sent: 0, blocked: 'telegram-inativo' });
        }

        const eventoAtivo = {
            geral: true,
            pipeline: telegram.eventos?.pipelineEtapa !== false,
            'venda-nova': telegram.eventos?.novaVenda !== false,
            'venda-status': telegram.eventos?.vendaStatus !== false,
            'venda-obs': telegram.eventos?.vendaObs !== false
        }[evento];

        if (!eventoAtivo) {
            return res.json({ success: true, sent: 0, blocked: 'evento-inativo' });
        }

        const token = String(telegram.token || '').trim();
        if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
            return res.status(400).json({ success: false, error: 'Token do Telegram inválido.' });
        }

        const usuarios = Array.isArray(payload.usuarios) ? payload.usuarios : [];
        let vendedorId = String(req.body?.vendedorId || '').trim();
        if (req.energiaAuth.perfil !== 'master') {
            vendedorId = String(req.energiaAuth.usuario?.vendedorId || '').trim();
        }

        const destinatarios = new Set();
        if (vendedorId) {
            usuarios
                .filter(u => String(u.vendedorId || '') === vendedorId && u.ativo !== false && u.chatIdTelegram)
                .forEach(u => destinatarios.add(String(u.chatIdTelegram)));
        }
        usuarios
            .filter(u => normalizarTipoEnergia(u) === 'master' && u.ativo !== false && u.chatIdTelegram)
            .forEach(u => destinatarios.add(String(u.chatIdTelegram)));
        if (telegram.chatId) destinatarios.add(String(telegram.chatId));

        let sent = 0;
        const errors = [];
        for (const chatId of destinatarios) {
            try {
                await chamarTelegram(token, 'sendMessage', {
                    chat_id: chatId,
                    text: texto,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });
                sent += 1;
            } catch (err) {
                errors.push(err.message || String(err));
            }
        }

        return res.json({
            success: errors.length === 0,
            sent,
            errors: errors.slice(0, 3)
        });
    } catch (err) {
        console.error('Erro ao processar notificação do Telegram:', err.message);
        return res.status(500).json({ success: false, error: 'Erro ao processar notificação.' });
    }
});

/**
 * POST /api/energia-data/chunks
 * Salva dados de energia em múltiplos pedaços menores para evitar limites de upload.
 */
app.post('/api/energia-data/chunks', requireEnergiaAuth, (req, res) => {
    const { uploadId, chunkIndex, totalChunks, data, clear } = req.body;

    if (!uploadId || typeof uploadId !== 'string' || typeof chunkIndex !== 'number' || typeof totalChunks !== 'number' || typeof data !== 'string') {
        return res.status(400).json({ error: 'uploadId, chunkIndex, totalChunks e data são obrigatórios.' });
    }
    if (chunkIndex < 0 || totalChunks <= 0 || chunkIndex >= totalChunks) {
        return res.status(400).json({ error: 'Índice de chunk inválido.' });
    }

    const tempCollection = `energia-data-tmp-${uploadId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    if (tempCollection === 'energia-data-tmp-') {
        return res.status(400).json({ error: 'uploadId inválido.' });
    }

    energiaDb.serialize(() => {
        if (clear) {
            energiaDb.run("DELETE FROM documents WHERE collection = ?", [tempCollection], (deleteErr) => {
                if (deleteErr) {
                    console.error('❌ Erro ao limpar chunks temporários:', deleteErr.message);
                    return res.status(500).json({ error: deleteErr.message });
                }
                insertChunk();
            });
        } else {
            insertChunk();
        }

        function insertChunk() {
            const payload = JSON.stringify({ chunked: true, uploadId, chunkIndex, totalChunks, data });
            energiaDb.run(
                "INSERT INTO documents (collection, payload) VALUES (?, ?)",
                [tempCollection, payload],
                function(err) {
                    if (err) {
                        console.error('❌ Erro ao salvar chunk temporário de energia-data:', err.message);
                        return res.status(500).json({ error: err.message });
                    }
                    finalizarSeCompleto();
                }
            );
        }

        function finalizarSeCompleto() {
            energiaDb.all(
                "SELECT id, payload FROM documents WHERE collection = ? ORDER BY id ASC",
                [tempCollection],
                (err, rows) => {
                    if (err) {
                        console.error('❌ Erro ao consultar chunks temporários:', err.message);
                        return res.status(500).json({ error: err.message });
                    }

                    if (!rows || rows.length < totalChunks) {
                        return res.json({ received: rows ? rows.length : 0, chunkIndex, complete: false });
                    }

                    const parsedRows = rows.map(row => {
                        try { return JSON.parse(row.payload); }
                        catch (e) { return null; }
                    }).filter(Boolean);

                    const indices = new Set(parsedRows.map(row => row.chunkIndex));
                    if (indices.size !== totalChunks) {
                        return res.status(400).json({ error: 'Chunks incompletos ou duplicados.' });
                    }

                    const fullString = parsedRows
                        .sort((a, b) => a.chunkIndex - b.chunkIndex)
                        .map(row => row.data)
                        .join('');

                    const allowDangerousOverwrite = String(req.headers['x-allow-data-reset'] || '').toLowerCase() === 'true';
                    if (allowDangerousOverwrite && req.energiaAuth?.perfil !== 'master') {
                        return res.status(403).json({ error: 'Apenas o perfil master pode substituir todos os dados.' });
                    }

                    substituirEnergiaPayloadAtomico(fullString, res, function(id) {
                        energiaDb.run("DELETE FROM documents WHERE collection = ?", [tempCollection], cleanupErr => {
                            if (cleanupErr) console.warn('⚠️ Falha ao limpar chunks temporários:', cleanupErr.message);
                        });
                        const scope = req.energiaAuth?.perfil === 'master' ? 'master' : 'seller';
                        return {
                            id,
                            complete: true,
                            totalChunks,
                            revision: revisaoEnergia(this.payload, scope, req.energiaAuth?.usuario?.vendedorId)
                        };
                    }, opcoesEscritaEnergia(req, allowDangerousOverwrite));
                }
            );
        }
    });
});

/**
 * POST /api/energia-data
 * Criar novo registro de dados de energia
 */
app.post('/api/energia-data', requireEnergiaAuth, (req, res) => {
    console.log('📡 [energia] POST /api/energia-data recebido');
    const payload = JSON.stringify(req.body);
    const allowDangerousOverwrite = String(req.headers['x-allow-data-reset'] || '').toLowerCase() === 'true';
    if (allowDangerousOverwrite && req.energiaAuth?.perfil !== 'master') {
        return res.status(403).json({ error: 'Apenas o perfil master pode substituir todos os dados.' });
    }
    substituirEnergiaPayloadAtomico(payload, res, function(id) {
        const scope = req.energiaAuth?.perfil === 'master' ? 'master' : 'seller';
        return {
            id,
            revision: revisaoEnergia(this.payload, scope, req.energiaAuth?.usuario?.vendedorId)
        };
    }, opcoesEscritaEnergia(req, allowDangerousOverwrite));
});

/**
 * PUT /api/energia-data/:id
 * Atualizar dados de energia existentes
 */
app.put('/api/energia-data/:id', requireEnergiaAuth, (req, res) => {
    console.log(`📡 [energia] PUT /api/energia-data/${req.params.id} recebido`);
    const payload = JSON.stringify(req.body);
    const allowDangerousOverwrite = String(req.headers['x-allow-data-reset'] || '').toLowerCase() === 'true';
    if (allowDangerousOverwrite && req.energiaAuth?.perfil !== 'master') {
        return res.status(403).json({ error: 'Apenas o perfil master pode substituir todos os dados.' });
    }
    substituirEnergiaPayloadAtomico(payload, res, function(id) {
        const scope = req.energiaAuth?.perfil === 'master' ? 'master' : 'seller';
        return {
            success: true,
            id,
            revision: revisaoEnergia(this.payload, scope, req.energiaAuth?.usuario?.vendedorId)
        };
    }, opcoesEscritaEnergia(req, allowDangerousOverwrite));
});

app.get('/api/energia-backup', requireEnergiaAuth, requireEnergiaMaster, async (req, res) => {
    try {
        const { payload } = await carregarEnergiaPayload();
        const filename = `crm-energia-backup-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(JSON.stringify(payload, null, 2));
    } catch (err) {
        console.error('Erro ao exportar backup do CRM Energia:', err.message);
        return res.status(500).json({ success: false, error: 'Erro ao exportar backup.' });
    }
});

app.get('/api/energia-backup-status', requireEnergiaAuth, requireEnergiaMaster, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        ensureBackupDirectory();
        const listar = (diretorio, filtro) => fs.readdirSync(diretorio)
            .filter(filtro)
            .map(nome => {
                const stat = fs.statSync(path.join(diretorio, nome));
                return { nome, tamanho: stat.size, criadoEm: stat.mtime.toISOString(), mtimeMs: stat.mtimeMs };
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);

        const jsonBackups = listar(ENERGIA_JSON_BACKUP_DIR, nome => nome.endsWith('.json'));
        const snapshots = listar(DB_BACKUP_DIR, nome => nome.startsWith('energia_') && nome.endsWith('.sqlite'));
        let jsonValido = false;
        if (jsonBackups[0]) {
            try {
                const conteudo = JSON.parse(fs.readFileSync(path.join(ENERGIA_JSON_BACKUP_DIR, jsonBackups[0].nome), 'utf8'));
                jsonValido = Boolean(conteudo?.payload && typeof conteudo.payload === 'object' && !Array.isArray(conteudo.payload));
            } catch (err) {
                jsonValido = false;
            }
        }

        const integridade = await new Promise((resolve, reject) => {
            energiaDb.get('PRAGMA quick_check', [], (err, row) => {
                if (err) return reject(err);
                resolve(String(row?.quick_check || '').toLowerCase());
            });
        });
        const intervaloMinutos = Math.round(ENERGIA_PERIODIC_BACKUP_MS / 60000);
        const saudavel = integridade === 'ok' && jsonValido && snapshots.length > 0;

        return res.json({
            success: true,
            saudavel,
            integridade: integridade === 'ok' ? 'ok' : integridade,
            automaticoAtivo: true,
            antesDeCadaEscrita: true,
            retencaoInterna: ENERGIA_INTERNAL_BACKUP_RETENTION,
            intervaloMinutos,
            json: {
                valido: jsonValido,
                quantidade: jsonBackups.length,
                ultimo: jsonBackups[0] ? { criadoEm: jsonBackups[0].criadoEm, tamanho: jsonBackups[0].tamanho } : null
            },
            sqlite: {
                quantidade: snapshots.length,
                ultimo: snapshots[0] ? { criadoEm: snapshots[0].criadoEm, tamanho: snapshots[0].tamanho } : null
            }
        });
    } catch (err) {
        console.error('Erro ao verificar backups do CRM Energia:', err.message);
        return res.status(500).json({ success: false, saudavel: false, error: 'Não foi possível validar os backups automáticos.' });
    }
});

app.post('/api/energia-reset', requireEnergiaAuth, requireEnergiaMaster, async (req, res) => {
    try {
        const confirmacao = String(req.body?.confirmacao || '').trim();
        const senha = String(req.body?.senha || '');
        if (confirmacao !== 'APAGAR TODOS OS DADOS') {
            return res.status(400).json({
                success: false,
                error: 'Digite exatamente APAGAR TODOS OS DADOS para confirmar.'
            });
        }
        if (!senha) {
            return res.status(400).json({ success: false, error: 'Informe sua senha atual.' });
        }

        const { payload } = await carregarEnergiaPayload();
        const usuarioMaster = (Array.isArray(payload.usuarios) ? payload.usuarios : [])
            .find(usuario => usuario.id === req.energiaAuth.userId
                && normalizarTipoEnergia(usuario) === 'master'
                && usuario.ativo !== false);
        if (!usuarioMaster || !(await compararSenhaUsuarioEnergia(usuarioMaster, senha))) {
            return res.status(401).json({ success: false, error: 'Senha atual incorreta.' });
        }

        const snapshot = await criarSnapshotSqlite(energiaDb, 'energia', 'before-reset');
        if (!snapshot) {
            throw new Error('Não foi possível criar o snapshot de segurança.');
        }

        const resultado = await atualizarEnergiaDirecionado(async payloadAtual => {
            const masterAtual = (Array.isArray(payloadAtual.usuarios) ? payloadAtual.usuarios : [])
                .find(usuario => usuario.id === req.energiaAuth.userId
                    && normalizarTipoEnergia(usuario) === 'master'
                    && usuario.ativo !== false);
            if (!masterAtual || !(await compararSenhaUsuarioEnergia(masterAtual, senha))) {
                throw new Error('O usuário master ou sua senha foram alterados durante a limpeza.');
            }

            return {
                clientes: [],
                produtos: [],
                vendas: [],
                vendedores: [],
                followups: [],
                pagamentos: [],
                metas: [],
                oportunidades: [],
                usuarios: [masterAtual],
                config: {}
            };
        }, 'master');

        return res.json({
            success: true,
            id: resultado.id,
            revision: revisaoEnergia(resultado.payload, 'master'),
            usuario: usuarioEnergiaSeguro(resultado.payload.usuarios[0])
        });
    } catch (err) {
        console.error('Erro ao limpar dados do CRM Energia:', err.message);
        return res.status(500).json({
            success: false,
            error: 'A limpeza foi cancelada porque não foi possível concluí-la com segurança.'
        });
    }
});

/**
 * POST /api/energia-import-backup
 * Importa backup do CRM Energia diretamente no banco energia_database.sqlite.
 * Este endpoint não exige autenticação, pois é usado pela interface local.
 */
app.post('/api/energia-import-backup', requireEnergiaAuth, requireEnergiaMaster, (req, res) => {
    const payload = normalizeImportBackupPayload(req.body);
    if (!isEnergiaBackupPayload(payload)) {
        return res.status(400).json({ success: false, error: 'Backup inválido para CRM Energia.' });
    }

    substituirEnergiaPayloadAtomico(JSON.stringify(payload), res, function(id) {
        return { success: true, id };
    }, {
        allowDangerousOverwrite: true
    });
});

app.get('/api/:collection', requireAuth, validarColecaoDados, (req, res) => {
    const collection = req.params.collection;
    const userId = req.auth.userId;
    const perfil = req.auth.perfil;

    // base da query
    let sql = "SELECT id, payload FROM documents WHERE collection = ?";
    const params = [collection];

    // para algumas coleções aplicamos filtro de vendedor
    if (isSellerScopedCollection(collection) && userId && perfil !== 'master') {
        // Aceita formato atual e legados de identificação de vendedor.
        sql += ` AND ${SELLER_ID_SQL_EXPR} = ?`;
        params.push(userId);
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Remonta o objeto exatamente como seu frontend espera sem derrubar a API em payload inválido.
        const data = rows
            .map(row => {
                const parsed = parsePayloadSeguro(row.payload, collection, row.id);
                return parsed ? { id: row.id, ...parsed } : null;
            })
            .filter(Boolean);
        res.json(data);
    });
});

// Healthcheck para PM2/Nginx monitorarem disponibilidade da API
app.get('/healthz', (req, res) => {
    res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
});

// ROTA: Adicionar um novo dado
app.post('/api/:collection', requireAuth, validarColecaoDados, autorizarEscritaColecao, (req, res) => {
    const collection = req.params.collection;
    const userId = req.auth.userId;
    const perfil = req.auth.perfil;

    let payloadBody = normalizarVendedorId({ ...req.body });

    if (isSellerScopedCollection(collection) && userId && perfil !== 'master') {
        // força o id do vendedor vindo do header, ignorando o que veio do cliente
        payloadBody.vendedor_id = parseInt(userId, 10);
    }

    const payload = JSON.stringify(payloadBody);
    db.run("INSERT INTO documents (collection, payload) VALUES (?, ?)", [collection, payload], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

// ROTA: Atualizar um dado existente
app.put('/api/:collection/:id', requireAuth, validarColecaoDados, autorizarEscritaColecao, (req, res) => {
    const collection = req.params.collection;
    const id = req.params.id;
    const userId = req.auth.userId;
    const perfil = req.auth.perfil;

    let payloadBody = normalizarVendedorId({ ...req.body });

    if (isSellerScopedCollection(collection) && userId && perfil !== 'master') {
        // não permitir que atualizem vendedor_id de outro
        payloadBody.vendedor_id = userId;
    }

    const payload = JSON.stringify(payloadBody);
    let sql = "UPDATE documents SET payload = ? WHERE collection = ? AND id = ?";
    const params = [payload, collection, id];
    if (isSellerScopedCollection(collection) && userId && perfil !== 'master') {
        sql += ` AND ${SELLER_ID_SQL_EXPR} = ?`;
        params.push(userId);
    }

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: 'Registro não encontrado ou sem permissão.' });
        }
        res.json({ success: true });
    });
});

// ROTA: Deletar um dado
app.delete('/api/:collection/:id', requireAuth, validarColecaoDados, autorizarEscritaColecao, (req, res) => {
    const collection = req.params.collection;
    const id = req.params.id;
    const userId = req.auth.userId;
    const perfil = req.auth.perfil;

    let sql = "DELETE FROM documents WHERE collection = ? AND id = ?";
    const params = [collection, id];

    if (isSellerScopedCollection(collection) && userId && perfil !== 'master') {
        // Garante que só exclui se pertence ao vendedor, inclusive dados legados.
        sql += ` AND ${SELLER_ID_SQL_EXPR} = ?`;
        params.push(userId);
    }

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: 'Registro não encontrado ou sem permissão.' });
        }
        res.json({ success: true });
    });
});

/**
function normalizeImportBackupPayload(body) {
    if (!body || typeof body !== 'object') return null;
    if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
        return body.data;
    }
    return body;
}

function isEnergiaBackupPayload(payload) {
    return payload && typeof payload === 'object' &&
        Array.isArray(payload.clientes) &&
        Array.isArray(payload.produtos) &&
        Array.isArray(payload.vendas);
}

/**
 * POST /api/import-backup
 * Importa um backup JSON enviado no corpo da requisição.
 * Protegido: requer token e perfil `master`.
 * Query param: ?clear=true  -> apaga coleções existentes antes de inserir
 */
app.post('/api/import-backup', requireAuth, requireMaster, async (req, res) => {
    try {
        const clear = String(req.query.clear || '').toLowerCase() === 'true';
        const payload = normalizeImportBackupPayload(req.body);

        if (!payload || typeof payload !== 'object') {
            return res.status(400).json({ success: false, error: 'Corpo inválido: JSON esperado.' });
        }

        if (isEnergiaBackupPayload(payload)) {
            console.log('📡 [energia] Importando backup do CRM Energia para energia_database.sqlite');
            substituirEnergiaPayloadAtomico(JSON.stringify(payload), res, function(id) {
                return { success: true, importedCollections: 1, id };
            }, {
                allowDangerousOverwrite: true
            });
            return;
        }

        // Proteção: limitar número de coleções e total aproximado de registros
        const collections = Object.keys(payload).filter(k => Array.isArray(payload[k]));
        if (collections.length === 0) return res.status(400).json({ success: false, error: 'Nenhuma coleção encontrada no JSON.' });

        let totalRows = 0;
        for (const c of collections) totalRows += (payload[c] || []).length;
        if (totalRows > 50000) return res.status(400).json({ success: false, error: 'Backup muito grande.' });

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const insertStmt = db.prepare('INSERT INTO documents (collection, payload) VALUES (?, ?)');

            for (const col of collections) {
                const rows = payload[col] || [];
                if (clear) db.run('DELETE FROM documents WHERE collection = ?', [col]);
                for (const item of rows) {
                    insertStmt.run(col, JSON.stringify(item));
                }
            }

            insertStmt.finalize();
            db.run('COMMIT');
        });

        return res.json({ success: true, importedCollections: Object.keys(payload).length });
    } catch (err) {
        try { db.run('ROLLBACK'); } catch (e) {}
        console.error('Erro import-backup:', err.message || err);
        return res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// ROTA: Buscar dados de CNPJ (contorna CORS)
app.get('/api-cnpj/buscar/:cnpj', requireAuth, async (req, res) => {
    const cnpj = req.params.cnpj.replace(/\D/g, '');
    
    console.log(`🔍 Backend: Buscando CNPJ ${cnpj}`);
    
    if (cnpj.length !== 14) {
        return res.status(400).json({ 
            success: false, 
            error: 'CNPJ deve ter 14 dígitos' 
        });
    }

    try {
        let data;
        // primeira tentativa com receitaws
        const url1 = `https://www.receitaws.com.br/v1/cnpj/${cnpj}`;
        console.log(`📡 Backend: Requisitando ${url1}`);
        try {
            const resp1 = await fetch(url1);
            data = await resp1.json();
            console.log(`✅ Backend: Receitaws respondeu`, data);
        } catch (err1) {
            console.warn('⚠️ Receitaws falhou:', err1.message);
        }

        // se a primeira não retornou dados válidos, tente brasilapi
        if (!data || data.status === '400' || data.status === 400 || data.message) {
            console.log('🔁 Tentando fallback para brasilapi');
            const url2 = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
            try {
                const resp2 = await fetch(url2);
                data = await resp2.json();
                console.log('✅ Backend: BrasilAPI respondeu', data);
            } catch (err2) {
                console.warn('⚠️ BrasilAPI falhou:', err2.message);
            }
        }

        // se mesmo assim não temos objeto útil ou há mensagem de erro, responder erro
        if (!data || data.status === '400' || data.status === 400 || data.message || data.error) {
            const msg = data && (data.message || data.error) ? (data.message || data.error) : 'CNPJ não encontrado ou serviço indisponível';
            return res.status(200).json({
                success: false,
                error: msg
            });
        }

        // Formata os dados (os campos podem variar entre APIs)
        const resultado = {
            success: true,
            razaoSocial: data.nome || data.razao_social || '',
            endereco: data.logradouro || data.estabelecimento?.logradouro || '',
            numero: data.numero || data.estabelecimento?.numero || '',
            complemento: data.complemento || data.estabelecimento?.complemento || '',
            bairro: data.bairro || data.estabelecimento?.bairro || '',
            cidade: data.municipio || data.estabelecimento?.municipio || '',
            uf: data.uf || data.estabelecimento?.uf || '',
            cep: data.cep || data.estabelecimento?.cep || '',
            telefone: data.telefone || data.telefone || '',
            email: data.email || data.email || ''
        };

        res.json(resultado);

    } catch (error) {
        console.error(`❌ Backend: Erro inesperado ao buscar CNPJ`, error.message);
        return res.status(200).json({
            success: false,
            error: error.message || 'falha interna'
        });
    }
});

// ============ CONFIGURAÇÃO DE EMAIL (NODEMAILER) ============

/**
 * Configurar transporter de email
 * Você pode usar:
 * - Gmail: https://myaccount.google.com/apppasswords
 * - Outlook/Hotmail
 * - SMTP customizado
 */
let emailTransporter = null;

// Função para configurar email
function configurarEmail() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseEnvInt(process.env.SMTP_PORT, 587);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
        emailTransporter = null;
        console.warn('⚠️  Email não configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no arquivo .env ou no ambiente.');
        return;
    }

    emailTransporter = nodemailer.createTransport({
        pool: true,
        maxConnections: parseEnvInt(process.env.SMTP_MAX_CONNECTIONS, 5),
        maxMessages: parseEnvInt(process.env.SMTP_MAX_MESSAGES, 100),
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
            user: smtpUser,
            pass: smtpPass
        },
        rateDelta: parseEnvInt(process.env.SMTP_RATE_DELTA_MS, 1000),
        rateLimit: parseEnvInt(process.env.SMTP_RATE_LIMIT, 20)
    });

    // Verificar conexão
    emailTransporter.verify((error, success) => {
        if (error) {
            console.warn('⚠️  Email não configurado corretamente:', error.message);
            console.log('ℹ️  Revise as variáveis: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
        } else {
            console.log('✅ Servidor de email configurado com sucesso');
        }
    });
}

// Configurar email ao iniciar
configurarEmail();

// ============ ENDPOINTS DE MARKETING ============

/**
 * POST /api/marketing/enviar-emails
 * Enviar emails de marketing para clientes
 */
app.post('/api/marketing/enviar-emails', requireAuth, async (req, res) => {
    const { assunto, corpo, clientes } = req.body;
    const usuario_id = req.auth.userId;

    const clientesValidos = Array.isArray(clientes)
        ? clientes.filter(cliente => cliente && typeof cliente.email === 'string' && cliente.email.includes('@'))
        : [];

    console.log(`📧 Preparando envio de ${clientesValidos.length} emails de marketing...`);

    // Validar entrada
    if (!assunto || !corpo || clientesValidos.length === 0) {
        return res.json({
            success: false,
            error: 'Assunto, corpo e ao menos um cliente com email válido são obrigatórios'
        });
    }

    if (!emailTransporter) {
        return res.json({
            success: false,
            error: 'Email não configurado no servidor. Contate o administrador.'
        });
    }

    try {
        const campanha = await dbRunAsync(
            'INSERT INTO email_campanhas (usuario_id, assunto, corpo, total_destinos, status) VALUES (?, ?, ?, ?, ?)',
            [usuario_id, assunto, corpo, clientesValidos.length, 'processando']
        );

        const campanhaId = campanha.lastID;
        const batchSize = parseEnvInt(process.env.EMAIL_BATCH_SIZE, 10);
        const batchDelayMs = parseEnvInt(process.env.EMAIL_BATCH_DELAY_MS, 250);
        const remetente = process.env.SMTP_FROM || process.env.SMTP_USER;
        let enviados = 0;
        let falhados = 0;

        for (let inicio = 0; inicio < clientesValidos.length; inicio += batchSize) {
            const lote = clientesValidos.slice(inicio, inicio + batchSize);

            await Promise.all(lote.map(async (cliente) => {
                const corpoPersonalizado = corpo.replace(/{{nome}}/g, cliente.nome || 'Cliente');
                const mailOptions = {
                    from: remetente,
                    to: cliente.email,
                    subject: assunto,
                    text: corpoPersonalizado,
                    html: montarHtmlEmailMarketing(corpoPersonalizado)
                };

                try {
                    await emailTransporter.sendMail(mailOptions);
                    enviados += 1;
                    await dbRunAsync(
                        'INSERT INTO email_logs (campanha_id, cliente_id, email_destinatario, nome_cliente, status) VALUES (?, ?, ?, ?, ?)',
                        [campanhaId, cliente.id || null, cliente.email, cliente.nome, 'enviado']
                    );
                    console.log(`✅ Email enviado para ${cliente.email}`);
                } catch (error) {
                    falhados += 1;
                    await dbRunAsync(
                        'INSERT INTO email_logs (campanha_id, cliente_id, email_destinatario, nome_cliente, status, erro_mensagem) VALUES (?, ?, ?, ?, ?, ?)',
                        [campanhaId, cliente.id || null, cliente.email, cliente.nome, 'erro', error.message]
                    );
                    console.warn(`❌ Erro ao enviar email para ${cliente.email}:`, error.message);
                }
            }));

            if (inicio + batchSize < clientesValidos.length) {
                await delay(batchDelayMs);
            }
        }

        const statusCampanha = falhados === 0 ? 'enviado' : enviados > 0 ? 'parcial' : 'erro';

        await dbRunAsync(
            'UPDATE email_campanhas SET total_enviados = ?, status = ? WHERE id = ?',
            [enviados, statusCampanha, campanhaId]
        );

        res.json({
            success: true,
            enviados,
            falhados,
            campanha_id: campanhaId,
            mensagem: `Envio concluído: ${enviados} enviado(s) e ${falhados} falha(s).`
        });
    } catch (err) {
        console.error('❌ Erro ao processar campanha de email:', err.message);
        res.json({
            success: false,
            error: 'Erro ao processar campanha de email'
        });
    }
});

/**
 * GET /api/marketing/historico
 * Obter histórico de campanhas de email
 */
app.get('/api/marketing/historico', requireAuth, (req, res) => {
    db.all(
        `SELECT * FROM email_campanhas 
         ORDER BY data_criacao DESC 
         LIMIT 50`,
        [],
        (err, rows) => {
            if (err) {
                console.error('❌ Erro ao buscar histórico:', err.message);
                return res.json({
                    success: false,
                    error: 'Erro ao buscar histórico'
                });
            }

            res.json({
                success: true,
                campanhas: rows || []
            });
        }
    );
});

/**
 * GET /api/marketing/campanha/:id
 * Obter detalhes de uma campanha específica
 */
app.get('/api/marketing/campanha/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    db.get(
        'SELECT * FROM email_campanhas WHERE id = ?',
        [id],
        (err, campanha) => {
            if (err || !campanha) {
                return res.json({
                    success: false,
                    error: 'Campanha não encontrada'
                });
            }

            // Buscar logs dessa campanha
            db.all(
                'SELECT * FROM email_logs WHERE campanha_id = ? ORDER BY data_envio DESC',
                [id],
                (err, logs) => {
                    res.json({
                        success: true,
                        campanha: campanha,
                        logs: logs || []
                    });
                }
            );
        }
    );
});


let server;

function startServer() {
    const PORT = Number(process.env.PORT) || 3000;
    server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 CRM Servidor rodando em http://localhost:${PORT}`);
        console.log(`📡 Acesse remotamente via: https://loconecta.com.br (com Nginx como proxy)`);
        console.log(`💡 Certifique-se de que Nginx está configurado apontando para localhost:${PORT}`);
        criarBackupEnergiaPeriodico('startup');
        criarSnapshotsPeriodicos('startup');
        setInterval(() => criarBackupEnergiaPeriodico('periodic'), ENERGIA_PERIODIC_BACKUP_MS).unref();
        setInterval(() => criarSnapshotsPeriodicos('periodic'), ENERGIA_PERIODIC_BACKUP_MS).unref();
    });
}

Promise.all([dbReady, energiaDbReady])
    .then(() => initializeMainDatabase())
    .then(() => migrateEnergiaDataFromLegacyDb())
    .then(() => {
        console.log('✅ Todos os bancos de dados foram inicializados e a migração foi concluída.');
        startServer();
    })
    .catch(async (err) => {
        console.error('❌ Não foi possível inicializar todos os bancos de dados ou concluir a migração:', err.message || err);
        console.error('⛔ Inicialização interrompida para evitar operar com banco indisponível ou corrompido.');
        await Promise.all([fecharBanco(db, 'CRM'), fecharBanco(energiaDb, 'Energia')]);
        process.exit(1);
    });

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    // Encerra para o PM2 reiniciar em estado limpo.
    setTimeout(() => process.exit(1), 500);
});

async function fecharBanco(dbInstance, label) {
    if (!dbInstance) return;
    await new Promise(resolve => {
        dbInstance.exec('PRAGMA wal_checkpoint(TRUNCATE)', checkpointErr => {
            if (checkpointErr) console.warn(`⚠️ Falha no checkpoint de ${label}:`, checkpointErr.message);
            dbInstance.close(closeErr => {
                if (closeErr) console.warn(`⚠️ Falha ao fechar ${label}:`, closeErr.message);
                resolve();
            });
        });
    });
}

function gracefulShutdown(signal) {
    console.log(`⚠️ Recebido ${signal}. Encerrando servidor...`);
    const finalizar = async () => {
        await Promise.all([fecharBanco(db, 'CRM'), fecharBanco(energiaDb, 'Energia')]);
        console.log('✅ Servidor e bancos encerrados com sucesso.');
        process.exit(0);
    };
    if (server) return server.close(finalizar);
    finalizar();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
