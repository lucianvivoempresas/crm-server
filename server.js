const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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

// Cria uma tabela universal (estilo NoSQL) para manter compatibilidade com o seu código anterior
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection TEXT,
        payload TEXT
    )`);
});

// ROTA: Buscar todos os dados de uma tabela (clientes, vendas, etc)
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