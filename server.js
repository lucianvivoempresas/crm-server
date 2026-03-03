const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();

// Permite requisições de outras origens e aumenta limite de tamanho para a importação de Excel
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// Serve os arquivos do seu CRM (HTML, CSS, JS) automaticamente
app.use(express.static(path.join(__dirname, 'public')));

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
            
            // Criar usuários padrão se não existirem
            criarUsuariosPadroes();
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
            
            // Retornar dados do usuário (sem a senha)
            res.json({
                success: true,
                usuario: {
                    id: user.id,
                    nome: user.nome,
                    email: user.email,
                    perfil: user.perfil
                },
                // Gerar um token simples (em produção, usar JWT)
                token: `token_${user.id}_${Date.now()}`
            });
        }
    );
});

/**
 * POST /auth/logout
 * Faz logout do usuário (opcional, apenas para logs)
 */
app.post('/auth/logout', (req, res) => {
    console.log(`👋 Logout realizado`);
    res.json({ success: true });
});

/**
 * GET /auth/me
 * Retorna dados do usuário atual (validando token, se implementado)
 */
app.get('/auth/me', (req, res) => {
    // Versão simplificada - em produção, validar o token
    res.json({ success: false, error: 'Não autenticado' });
});

// ============ ENDPOINTS DE GERENCIAMENTO DE USUÁRIOS ============

/**
 * GET /api/usuarios
 * Lista todos os usuários (sem senhas)
 */
app.get('/api/usuarios', (req, res) => {
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
app.post('/api/usuarios', (req, res) => {
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
app.put('/api/usuarios/:id', (req, res) => {
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
app.delete('/api/usuarios/:id', (req, res) => {
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
app.get('/api/:collection', (req, res) => {
    const collection = req.params.collection;

    // extrair informações do usuário (passadas como headers ou query params)
    const userId = req.get('X-User-Id') || req.query.user_id;
    const perfil = req.get('X-User-Perfil') || req.query.perfil;

    // base da query
    let sql = "SELECT id, payload FROM documents WHERE collection = ?";
    const params = [collection];

    // para algumas coleções aplicamos filtro de vendedor
    if ((collection === 'clientes' || collection === 'vendas') && userId && perfil !== 'master') {
        // somente retorna itens cadastrados pelo próprio vendedor
        sql += " AND json_extract(payload, '$.vendedor_id') = ?";
        params.push(userId);
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Remonta o objeto exatamente como seu frontend espera
        const data = rows.map(row => ({ id: row.id, ...JSON.parse(row.payload) }));
        res.json(data);
    });
});

// ROTA: Adicionar um novo dado
app.post('/api/:collection', (req, res) => {
    const collection = req.params.collection;

    // pegar user info para garantir vendedor_id correto
    const userId = req.get('X-User-Id') || req.body.vendedor_id;
    const perfil = req.get('X-User-Perfil') || req.body.perfil;

    let payloadBody = { ...req.body };

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
app.put('/api/:collection/:id', (req, res) => {
    const collection = req.params.collection;
    const id = req.params.id;

    // pegar user info para validar edição
    const userId = req.get('X-User-Id');
    const perfil = req.get('X-User-Perfil');

    let payloadBody = { ...req.body };

    if ((collection === 'clientes' || collection === 'vendas') && userId && perfil !== 'master') {
        // não permitir que atualizem vendedor_id de outro
        payloadBody.vendedor_id = parseInt(userId, 10);
    }

    const payload = JSON.stringify(payloadBody);
    db.run("UPDATE documents SET payload = ? WHERE collection = ? AND id = ?", [payload, collection, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ROTA: Deletar um dado
app.delete('/api/:collection/:id', (req, res) => {
    const collection = req.params.collection;
    const id = req.params.id;

    const userId = req.get('X-User-Id');
    const perfil = req.get('X-User-Perfil');

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
app.get('/api-cnpj/buscar/:cnpj', async (req, res) => {
    const cnpj = req.params.cnpj.replace(/\D/g, '');
    
    console.log(`🔍 Backend: Buscando CNPJ ${cnpj}`);
    
    if (cnpj.length !== 14) {
        return res.status(400).json({ 
            success: false, 
            error: 'CNPJ deve ter 14 dígitos' 
        });
    }

    try {
        const url = `https://www.receitaws.com.br/v1/cnpj/${cnpj}`;
        console.log(`📡 Backend: Requisitando ${url}`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log(`✅ Backend: Resposta recebida`, data);

        if (data.status === '400' || data.status === 400 || data.message) {
            return res.status(200).json({
                success: false,
                error: data.message || 'CNPJ não encontrado'
            });
        }

        // Formata os dados
        const resultado = {
            success: true,
            razaoSocial: data.nome || '',
            endereco: data.logradouro || '',
            numero: data.numero || '',
            complemento: data.complemento || '',
            bairro: data.bairro || '',
            cidade: data.municipio || '',
            uf: data.uf || '',
            cep: data.cep || '',
            telefone: data.telefone || '',
            email: data.email || ''
        };

        res.json(resultado);

    } catch (error) {
        console.error(`❌ Backend: Erro ao buscar CNPJ`, error.message);
        return res.status(200).json({
            success: false,
            error: error.message
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
app.post('/api/marketing/enviar-emails', (req, res) => {
    const { assunto, corpo, clientes, usuario_id } = req.body;

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
app.get('/api/marketing/historico', (req, res) => {
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
app.get('/api/marketing/campanha/:id', (req, res) => {
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


const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CRM Servidor rodando! Acesse: http://localhost:${PORT}`);
});