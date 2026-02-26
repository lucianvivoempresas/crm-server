const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

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
    db.all("SELECT id, payload FROM documents WHERE collection = ?", [collection], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Remonta o objeto exatamente como seu frontend espera
        const data = rows.map(row => ({ id: row.id, ...JSON.parse(row.payload) }));
        res.json(data);
    });
});

// ROTA: Adicionar um novo dado
app.post('/api/:collection', (req, res) => {
    const collection = req.params.collection;
    const payload = JSON.stringify(req.body);
    db.run("INSERT INTO documents (collection, payload) VALUES (?, ?)", [collection, payload], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

// ROTA: Atualizar um dado existente
app.put('/api/:collection/:id', (req, res) => {
    const collection = req.params.collection;
    const id = req.params.id;
    const payload = JSON.stringify(req.body);
    db.run("UPDATE documents SET payload = ? WHERE collection = ? AND id = ?", [payload, collection, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ROTA: Deletar um dado
app.delete('/api/:collection/:id', (req, res) => {
    const collection = req.params.collection;
    const id = req.params.id;
    db.run("DELETE FROM documents WHERE collection = ? AND id = ?", [collection, id], function(err) {
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

// Inicia o servidor
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CRM Servidor rodando! Acesse: http://localhost:${PORT}`);
});