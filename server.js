const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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

app.get('/politica-de-privacidade', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'politica-de-privacidade.html'));
});

app.get('/termos-de-uso', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'termos-de-uso.html'));
});

app.get('/contato', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contato.html'));
});

// Inicializa o banco SQLite (criará um arquivo crm_database.sqlite na mesma pasta)
const db = new sqlite3.Database('./crm_database.sqlite', (err) => {
    if (err) console.error('Erro ao abrir o banco de dados', err.message);
    else console.log('Conectado ao banco SQLite com sucesso!');
});

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
    });
});

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
    
    usuarios.forEach(user => {
        db.get(
            'SELECT id FROM usuarios WHERE email = ?',
            [user.email],
            (err, row) => {
                if (!row) {
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
                }
            }
        );
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
app.get('/api/:collection', requireAuth, (req, res) => {
    const collection = req.params.collection;
    const userId = req.auth.userId;
    const perfil = req.auth.perfil;

    // base da query
    let sql = "SELECT id, payload FROM documents WHERE collection = ?";
    const params = [collection];

    // para algumas coleções aplicamos filtro de vendedor
    if ((collection === 'clientes' || collection === 'vendas') && userId && perfil !== 'master') {
        // somente retorna itens cadastrados pelo próprio vendedor (inteiro)
        sql += " AND json_extract(payload, '$.vendedor_id') = ?";
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

    let payloadBody = { ...req.body };

    // garantir que vendedor_id seja número sempre que fornecido
    if (payloadBody.vendedor_id != null) {
        payloadBody.vendedor_id = parseInt(payloadBody.vendedor_id, 10);
    }

    if ((collection === 'clientes' || collection === 'vendas') && userId && perfil !== 'master') {
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

    let payloadBody = { ...req.body };

    // normalizar vendedor_id caso venha como string
    if (payloadBody.vendedor_id != null) {
        payloadBody.vendedor_id = parseInt(payloadBody.vendedor_id, 10);
    }

    if ((collection === 'clientes' || collection === 'vendas') && userId && perfil !== 'master') {
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

    if ((collection === 'clientes' || collection === 'vendas') && userId && perfil !== 'master') {
        // garante que só exclui se pertence ao vendedor
        sql += " AND json_extract(payload,'$.vendedor_id') = ?";
        params.push(userId);
    }

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
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
    // IMPORTANTE: Configure com suas credenciais reais!
    // Para desenvolvimento, você pode usar uma conta Gmail com "Senha de App"
    
    emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER || 'seu-email@gmail.com',
            pass: process.env.SMTP_PASS || 'sua-senha-app-google'
        }
    });

    // Verificar conexão
    emailTransporter.verify((error, success) => {
        if (error) {
            console.warn('⚠️  Email não configurado corretamente:', error.message);
            console.log('ℹ️  Configure as variáveis: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
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
app.post('/api/marketing/enviar-emails', requireAuth, (req, res) => {
    const { assunto, corpo, clientes } = req.body;
    const usuario_id = req.auth.userId;

    console.log(`📧 Enviando ${clientes.length} emails de marketing...`);

    // Validar entrada
    if (!assunto || !corpo || !clientes || clientes.length === 0) {
        return res.json({
            success: false,
            error: 'Assunto, corpo e clientes são obrigatórios'
        });
    }

    if (!emailTransporter) {
        return res.json({
            success: false,
            error: 'Email não configurado no servidor. Contate o administrador.'
        });
    }

    // Registrar campanha no banco
    db.run(
        'INSERT INTO email_campanhas (usuario_id, assunto, corpo, total_destinos, status) VALUES (?, ?, ?, ?, ?)',
        [usuario_id, assunto, corpo, clientes.length, 'enviado'],
        function(err) {
            if (err) {
                console.error('❌ Erro ao registrar campanha:', err.message);
                return res.json({
                    success: false,
                    error: 'Erro ao registrar campanha'
                });
            }

            const campanhaId = this.lastID;
            let enviados = 0;
            let falhados = 0;

            // Enviar emails
            clientes.forEach(cliente => {
                const corpoPersonalizado = corpo.replace(/{{nome}}/g, cliente.nome || 'Cliente');

                const mailOptions = {
                    from: process.env.SMTP_USER || 'seu-email@gmail.com',
                    to: cliente.email,
                    subject: assunto,
                    text: corpoPersonalizado,
                    html: `
                        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                            <p>${corpoPersonalizado.replace(/\n/g, '<br>')}</p>
                            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                            <p style="color: #999; font-size: 12px;">Este é um email de marketing. Não responda este email.</p>
                        </div>
                    `
                };

                // Enviar email de forma assíncrona
                emailTransporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.warn(`❌ Erro ao enviar email para ${cliente.email}:`, error.message);
                        falhados++;
                        
                        // Registrar falha no log
                        db.run(
                            'INSERT INTO email_logs (campanha_id, cliente_id, email_destinatario, nome_cliente, status, erro_mensagem) VALUES (?, ?, ?, ?, ?, ?)',
                            [campanhaId, cliente.id || null, cliente.email, cliente.nome, 'erro', error.message]
                        );
                    } else {
                        console.log(`✅ Email enviado para ${cliente.email}`);
                        enviados++;
                        
                        // Registrar sucesso no log
                        db.run(
                            'INSERT INTO email_logs (campanha_id, cliente_id, email_destinatario, nome_cliente, status) VALUES (?, ?, ?, ?, ?)',
                            [campanhaId, cliente.id || null, cliente.email, cliente.nome, 'enviado']
                        );
                    }
                });
            });

            // Atualizar total de enviados
            setTimeout(() => {
                db.run(
                    'UPDATE email_campanhas SET total_enviados = ? WHERE id = ?',
                    [enviados, campanhaId]
                );
            }, 1000);

            res.json({
                success: true,
                enviados: clientes.length,
                campanha_id: campanhaId,
                mensagem: `Iniciado envio de ${clientes.length} email(s). Você receberá uma confirmação em breve.`
            });
        }
    );
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


const PORT = Number(process.env.PORT) || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CRM Servidor rodando em http://localhost:${PORT}`);
    console.log(`📡 Acesse remotamente via: https://loconecta.com.br (com Nginx como proxy)`);
    console.log(`💡 Certifique-se de que Nginx está configurado apontando para localhost:${PORT}`);
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
    server.close(() => {
        console.log('✅ Servidor encerrado com sucesso.');
        process.exit(0);
    });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));