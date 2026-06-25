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
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || (IS_PROD ? '' : 'dev-only-local-secret');

if (IS_PROD && !TOKEN_SECRET) {
    console.warn('⚠️ AUTH_TOKEN_SECRET não configurado. Defina no ambiente para habilitar autenticação segura.');
}

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
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Origem não permitida pelo CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Perfil']
}));

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (IS_PROD) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
});

app.use(express.json({ limit: '50mb' })); 

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
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Landing page inicial e rota dedicada para o CRM
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/crm', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/energia', (req, res) => {
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

const DB_PATH = path.join(__dirname, 'crm_database.sqlite');
const ENERGIA_DB_PATH = path.join(__dirname, 'energia_database.sqlite');
const DB_BACKUP_DIR = path.join(__dirname, 'database-backups');

function ensureBackupDirectory() {
    try {
        fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') {
            console.warn('⚠️ Falha ao criar diretório de backups de banco de dados:', err.message);
        }
    }
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
        console.log(`ℹ️ O arquivo antigo será recriado para evitar incompatibilidade.`);
    } catch (copyErr) {
        console.warn(`⚠️ Falha ao criar backup do ${label}:`, copyErr.message);
    }
}

function openDatabaseWithRecovery(dbPath, label) {
    return new Promise((resolve, reject) => {
        let attemptedRecovery = false;

        const openAttempt = () => {
            const dbInstance = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    console.error(`❌ Erro ao abrir o banco ${label}:`, err.message);

                    if (!attemptedRecovery && fs.existsSync(dbPath)) {
                        attemptedRecovery = true;
                        backupDatabaseFile(dbPath, label, err.message);

                        try {
                            fs.unlinkSync(dbPath);
                            console.log(`ℹ️ Arquivo corrompido removido: ${dbPath}`);
                        } catch (removeErr) {
                            console.error(`❌ Falha ao remover arquivo corrompido ${dbPath}:`, removeErr.message);
                            return reject(err);
                        }

                        return openAttempt();
                    }

                    return reject(err);
                }

                dbInstance.get('PRAGMA quick_check', [], (checkErr, row) => {
                    const integrityOk = !checkErr && row && row.quick_check === 'ok';
                    if (!integrityOk) {
                        const reason = checkErr ? checkErr.message : `PRAGMA quick_check retornou ${String(row?.quick_check)}`;
                        console.warn(`⚠️ ${label} inválido ou corrompido: ${reason}`);

                        if (!attemptedRecovery && fs.existsSync(dbPath)) {
                            attemptedRecovery = true;
                            backupDatabaseFile(dbPath, label, reason);
                            return dbInstance.close(() => {
                                try {
                                    fs.unlinkSync(dbPath);
                                    console.log(`ℹ️ Arquivo inválido removido: ${dbPath}`);
                                } catch (removeErr) {
                                    console.error(`❌ Falha ao remover arquivo inválido ${dbPath}:`, removeErr.message);
                                    return reject(checkErr || new Error(reason));
                                }
                                openAttempt();
                            });
                        }

                        return reject(checkErr || new Error(reason));
                    }

                    console.log(`Conectado ao banco SQLite com sucesso: ${dbPath}`);
                    resolve(dbInstance);
                });
            });
        };

        openAttempt();
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

/**
 * Hash seguro de senha usando SHA-256
 */
function hashSenha(senha) {
    return crypto.createHash('sha256').update(senha).digest('hex');
}

/**
 * Comparar senha com hash
 */
function compararSenha(senha, hash) {
    return hashSenha(senha) === hash;
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
    return ['clientes', 'vendas', 'campanhas', 'campanha_leads'].includes(collection);
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

function extractBearerToken(req) {
    const authorization = req.get('Authorization') || '';
    if (!authorization.toLowerCase().startsWith('bearer ')) return null;
    return authorization.slice(7).trim();
}

function requireAuth(req, res, next) {
    const token = extractBearerToken(req);
    const auth = validarTokenSessao(token);
    if (!auth || !auth.userId) {
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
app.post('/auth/login', (req, res) => {
    const { email, senha } = req.body;
    
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
        (err, user) => {
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
            if (!compararSenha(senha, user.senha)) {
                console.warn(`❌ Senha incorreta para: ${email}`);
                return res.json({ 
                    success: false, 
                    error: 'Email ou senha incorretos' 
                });
            }
            
            // Login bem-sucedido
            console.log(`✅ Login bem-sucedido: ${email} (${user.perfil})`);
            
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

            // Retornar dados do usuário (sem a senha)
            res.json({
                success: true,
                usuario: {
                    id: user.id,
                    nome: user.nome,
                    email: user.email,
                    perfil: user.perfil
                },
                token
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
app.post('/api/usuarios', requireAuth, requireMaster, (req, res) => {
    const { nome, email, senha, perfil = 'vendedor', ativo = 1 } = req.body;
    
    // Validações
    if (!nome || !email || !senha) {
        return res.json({ 
            success: false, 
            error: 'Nome, email e senha são obrigatórios' 
        });
    }
    
    if (!email.includes('@')) {
        return res.json({ 
            success: false, 
            error: 'Email inválido' 
        });
    }
    
    console.log(`➕ Criando novo usuário: ${email} (${perfil})`);
    
    const senhaHash = hashSenha(senha);
    
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
app.put('/api/usuarios/:id', requireAuth, requireMaster, (req, res) => {
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
        campos.push('senha = ?');
        valores.push(hashSenha(senha));
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

/**
 * GET /api/energia-data
 * Carregar dados de energia do banco
 */
app.get('/api/energia-data', (req, res) => {
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
                    return res.json([{ id: ordered[0].id, ...parsed }]);
                } catch (e) {
                    console.error('❌ Erro ao montar chunks de energia-data:', e.message);
                    return res.status(500).json({ error: 'Erro ao montar chunks de energia-data.' });
                }
            }

            const normalRows = parsedRows.filter(row => !row.payload || row.payload.chunked !== true);
            const latest = normalRows.sort((a, b) => b.id - a.id)[0];
            if (!latest) {
                return res.json([]);
            }

            return res.json([{ id: latest.id, ...latest.payload }]);
        }
    );
});

/**
 * POST /api/energia-data/chunks
 * Salva dados de energia em múltiplos pedaços menores para evitar limites de upload.
 */
app.post('/api/energia-data/chunks', (req, res) => {
    const { chunkIndex, data, clear } = req.body;

    if (typeof chunkIndex !== 'number' || typeof data !== 'string') {
        return res.status(400).json({ error: 'chunkIndex e data são obrigatórios.' });
    }

    energiaDb.serialize(() => {
        if (clear) {
            energiaDb.run("DELETE FROM documents WHERE collection = 'energia-data'", (deleteErr) => {
                if (deleteErr) {
                    console.error('❌ Erro ao limpar energia-data antes de salvar chunks:', deleteErr.message);
                    return res.status(500).json({ error: deleteErr.message });
                }
                insertChunk();
            });
        } else {
            insertChunk();
        }

        function insertChunk() {
            const payload = JSON.stringify({ chunked: true, chunkIndex, data });
            energiaDb.run(
                "INSERT INTO documents (collection, payload) VALUES (?, ?)",
                ['energia-data', payload],
                function(err) {
                    if (err) {
                        console.error('❌ Erro ao salvar chunk de energia-data:', err.message);
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ id: this.lastID, chunkIndex });
                }
            );
        }
    });
});

/**
 * POST /api/energia-data
 * Criar novo registro de dados de energia
 */
app.post('/api/energia-data', (req, res) => {
    console.log('📡 [energia] POST /api/energia-data recebido — headers:', JSON.stringify(req.headers));
    const payload = JSON.stringify(req.body);
    energiaDb.serialize(() => {
        energiaDb.run(
            "DELETE FROM documents WHERE collection = 'energia-data'",
            (deleteErr) => {
                if (deleteErr) {
                    console.error('❌ Erro ao limpar energia-data antes de salvar:', deleteErr.message);
                    return res.status(500).json({ error: deleteErr.message });
                }

                energiaDb.run(
                    "INSERT INTO documents (collection, payload) VALUES (?, ?)",
                    ['energia-data', payload],
                    function(err) {
                        if (err) {
                            console.error('❌ Erro ao salvar dados de energia:', err.message);
                            return res.status(500).json({ error: err.message });
                        }
                        res.json({ id: this.lastID });
                    }
                );
            }
        );
    });
});

/**
 * PUT /api/energia-data/:id
 * Atualizar dados de energia existentes
 */
app.put('/api/energia-data/:id', (req, res) => {
    console.log(`📡 [energia] PUT /api/energia-data/${req.params.id} recebido — headers:`, JSON.stringify(req.headers));
    const id = req.params.id;
    const payload = JSON.stringify(req.body);
    energiaDb.serialize(() => {
        energiaDb.run(
            "DELETE FROM documents WHERE collection = 'energia-data' AND payload LIKE '%\"chunked\":true%'",
            (deleteErr) => {
                if (deleteErr) {
                    console.error('❌ Erro ao limpar chunks antigos antes de atualizar energia-data:', deleteErr.message);
                    return res.status(500).json({ error: deleteErr.message });
                }

                energiaDb.run(
                    "UPDATE documents SET payload = ? WHERE collection = 'energia-data' AND id = ?",
                    [payload, id],
                    function(err) {
                        if (err) {
                            console.error('❌ Erro ao atualizar dados de energia:', err.message);
                            return res.status(500).json({ error: err.message });
                        }

                        if (this.changes === 0) {
                            console.log('ℹ️ Registro de energia não encontrado para update; criando novo registro.');
                            energiaDb.run(
                                "DELETE FROM documents WHERE collection = 'energia-data'",
                                (clearErr) => {
                                    if (clearErr) {
                                        console.error('❌ Erro ao limpar energia-data antes de recrear:', clearErr.message);
                                        return res.status(500).json({ error: clearErr.message });
                                    }
                                    energiaDb.run(
                                        "INSERT INTO documents (collection, payload) VALUES (?, ?)",
                                        ['energia-data', payload],
                                        function(insertErr) {
                                            if (insertErr) {
                                                console.error('❌ Erro ao recriar dados de energia:', insertErr.message);
                                                return res.status(500).json({ error: insertErr.message });
                                            }
                                            res.json({ success: true, id: this.lastID });
                                        }
                                    );
                                }
                            );
                            return;
                        }

                        res.json({ success: true });
                    }
                );
            }
        );
    });
});

/**
 * DELETE /api/energia-data/:id
 * Deletar dados de energia
 */
app.delete('/api/energia-data/:id', (req, res) => {
    const id = req.params.id;
    energiaDb.run(
        "DELETE FROM documents WHERE collection = 'energia-data' AND id = ?",
        [id],
        function(err) {
            if (err) {
                console.error('❌ Erro ao deletar dados de energia:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
        }
    );
});

/**
 * POST /api/energia-import-backup
 * Importa backup do CRM Energia diretamente no banco energia_database.sqlite.
 * Este endpoint não exige autenticação, pois é usado pela interface local.
 */
app.post('/api/energia-import-backup', (req, res) => {
    const payload = normalizeImportBackupPayload(req.body);
    if (!isEnergiaBackupPayload(payload)) {
        return res.status(400).json({ success: false, error: 'Backup inválido para CRM Energia.' });
    }

    energiaDb.serialize(() => {
        energiaDb.run('BEGIN TRANSACTION');
        energiaDb.run('DELETE FROM documents WHERE collection = ?', ['energia-data'], (deleteErr) => {
            if (deleteErr) {
                energiaDb.run('ROLLBACK');
                console.error('❌ Erro ao limpar energia-data antes de importação:', deleteErr.message);
                return res.status(500).json({ success: false, error: deleteErr.message });
            }

            energiaDb.run(
                'INSERT INTO documents (collection, payload) VALUES (?, ?)',
                ['energia-data', JSON.stringify(payload)],
                function(insertErr) {
                    if (insertErr) {
                        energiaDb.run('ROLLBACK');
                        console.error('❌ Erro ao salvar energia-data durante importação:', insertErr.message);
                        return res.status(500).json({ success: false, error: insertErr.message });
                    }

                    energiaDb.run('COMMIT');
                    return res.json({ success: true, id: this.lastID });
                }
            );
        });
    });
});

app.get('/api/:collection', requireAuth, (req, res) => {
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
app.post('/api/:collection', requireAuth, (req, res) => {
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
app.put('/api/:collection/:id', requireAuth, (req, res) => {
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
    db.run("UPDATE documents SET payload = ? WHERE collection = ? AND id = ?", [payload, collection, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ROTA: Deletar um dado
app.delete('/api/:collection/:id', requireAuth, (req, res) => {
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
            energiaDb.serialize(() => {
                energiaDb.run('BEGIN TRANSACTION');
                energiaDb.run('DELETE FROM documents WHERE collection = ?', ['energia-data'], (deleteErr) => {
                    if (deleteErr) {
                        energiaDb.run('ROLLBACK');
                        console.error('❌ Erro ao limpar energia-data antes de importar backup:', deleteErr.message);
                        return res.status(500).json({ success: false, error: deleteErr.message });
                    }

                    energiaDb.run(
                        'INSERT INTO documents (collection, payload) VALUES (?, ?)',
                        ['energia-data', JSON.stringify(payload)],
                        function(insertErr) {
                            if (insertErr) {
                                energiaDb.run('ROLLBACK');
                                console.error('❌ Erro ao inserir energia-data durante importação:', insertErr.message);
                                return res.status(500).json({ success: false, error: insertErr.message });
                            }

                            energiaDb.run('COMMIT');
                            return res.json({ success: true, importedCollections: 1, id: this.lastID });
                        }
                    );
                });
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
    });
}

Promise.all([dbReady, energiaDbReady])
    .then(() => initializeMainDatabase())
    .then(() => migrateEnergiaDataFromLegacyDb())
    .then(() => {
        console.log('✅ Todos os bancos de dados foram inicializados e a migração foi concluída.');
        startServer();
    })
    .catch((err) => {
        console.error('❌ Não foi possível inicializar todos os bancos de dados ou concluir a migração:', err.message || err);
        console.error('⚠️ O servidor ainda será iniciado, mas algumas funcionalidades podem não funcionar corretamente.');
        startServer();
    });

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    // Encerra para o PM2 reiniciar em estado limpo.
    setTimeout(() => process.exit(1), 500);
});

function gracefulShutdown(signal) {
    console.log(`⚠️ Recebido ${signal}. Encerrando servidor...`);
    if (server) {
        server.close(() => {
            console.log('✅ Servidor encerrado com sucesso.');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
