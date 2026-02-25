# 📊 CRM Vendas Pro - Sistema de Gestão de Vendas e Comissões

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-14%2B-green.svg)
![SQLite](https://img.shields.io/badge/database-SQLite-blue.svg)

Um sistema completo de CRM (Customer Relationship Management) desenvolvido com Express.js, SQLite e TailwindCSS. Gerenciador inteligente de clientes, vendas, comissões e metas com interface moderna e responsiva.

## ✨ Recursos Principais

### 🎯 Gestão de Clientes
- Cadastro rápido e completo de clientes
- **Integração com API CNPJ Brasil** - Preenchimento automático de dados
- Importação/Exportação via Excel
- Busca e filtros avançados
- Perfil detalhado do cliente com histórico de vendas

### 💰 Gestão de Vendas
- Registro de vendas com múltiplos produtos e operadoras
- Acompanhamento de status (Negociando, Aguardando Aceite, Inputado, etc)
- Cálculo automático de comissões
- Importação em lote de vendas
- Dashboard com estatísticas

### 📈 Comissões e Metas
- Regras de comissão configuráveis por produto, operadora e tipo de cliente
- Sistema de metas mensal/trimestral
- Acompanhamento de progresso
- Relatórios de comissões

### 📱 Pós-Venda
- Sistema de lembretes automáticos
- Notificações de desktop
- Histórico de interações

### 🎨 Interface
- Design moderno com Tailwind CSS
- Modo escuro/claro
- Totalmente responsivo (mobile, tablet, desktop)
- Gráficos com Chart.js

## 🚀 Como Começar

### Pré-requisitos
- Node.js 14+
- npm ou yarn

### Instalação

1. **Clone o repositório**
```bash
git clone https://github.com/seu-usuario/crm-vendas-pro.git
cd crm-vendas-pro
```

2. **Instale as dependências**
```bash
npm install
```

3. **Inicie o servidor**
```bash
node server.js
```

4. **Acesse no navegador**
```
http://localhost:3000
```

## 📦 Dependências

```json
{
  "express": "^5.2.1",
  "cors": "^2.8.6",
  "sqlite3": "^5.1.7"
}
```

### Dependências do Frontend
- **Tailwind CSS** - Estilização
- **Chart.js** - Gráficos
- **XLSX** - Importação/Exportação de Excel
- **Lucide** - Ícones

## 🗂️ Estrutura do Projeto

```
crm-vendas-pro/
├── server.js                          # Servidor Express
├── package.json                       # Dependências
├── .gitignore
├── README.md
│
├── public/                            # Frontend
│   ├── index.html                     # Interface principal
│   ├── css/
│   │   └── style.css                  # Estilos customizados
│   └── js/
│       ├── app.js                     # Lógica principal
│       ├── ui.js                      # Controle de UI/Modais
│       ├── db.js                      # Operações de banco
│       ├── render.js                  # Renderização de templates
│       ├── utils.js                   # Funções utilitárias
│       ├── globals.js                 # Variáveis globais
│       └── cnpj-api.js                # Integração CNPJ Brasil ⭐
│
└── crm_database.sqlite               # Banco de dados (gerado)
```

## 🔌 API REST

### Clientes
```bash
GET    /api/clientes              # Lista todos os clientes
POST   /api/clientes              # Cria novo cliente
PUT    /api/clientes/:id          # Atualiza cliente
DELETE /api/clientes/:id          # Deleta cliente
```

### Vendas
```bash
GET    /api/vendas                # Lista todas as vendas
POST   /api/vendas                # Cria nova venda
PUT    /api/vendas/:id            # Atualiza venda
DELETE /api/vendas/:id            # Deleta venda
```

### Comissões
```bash
GET    /api/comissoes             # Lista regras de comissão
POST   /api/comissoes             # Cria nova regra
PUT    /api/comissoes/:id         # Atualiza regra
DELETE /api/comissoes/:id         # Deleta regra
```

### Metas
```bash
GET    /api/metas                 # Lista todas as metas
POST   /api/metas                 # Cria nova meta
PUT    /api/metas/:id             # Atualiza meta
DELETE /api/metas/:id             # Deleta meta
```

### CNPJ (Novo! ⭐)
```bash
GET    /api-cnpj/buscar/:cnpj     # Busca dados de CNPJ
```

**Exemplo:**
```bash
GET /api-cnpj/buscar/11444777000161

Response:
{
  "success": true,
  "razaoSocial": "EMPRESA XYZ LTDA",
  "telefone": "(11) 3333-4444",
  "email": "contato@empresa.com.br",
  "endereco": "Rua ABC",
  "numero": "123",
  "complemento": "Sala 400",
  "bairro": "Centro",
  "cidade": "São Paulo",
  "uf": "SP",
  "cep": "01310100"
}
```

## ⭐ Integração CNPJ Brasil

O projeto inclui integração com a API pública de CNPJ Brasil (ReceitaWS) completamente **gratuita**.

### Funcionalidade
Ao cadastrar um novo cliente, digite o CNPJ e o sistema busca automaticamente:
- Razão Social
- Telefone
- Email
- Endereço Completo

### Como Funciona
1. Digite um CNPJ no formulário de cliente
2. Clique fora do campo ou pressione TAB
3. Sistema busca dados da API ReceitaWS (via backend)
4. Campos são preenchidos automaticamente em 2-3 segundos

### Exemplo
- **CNPJ para teste:** `11.444.777/0001-61` ou `11444777000161`

[Ver documentação completa](./CNPJ_API_DOCUMENTATION.md)

## 💾 Banco de Dados

O projeto usa **SQLite3** com uma estrutura universal (NoSQL-like):

```sql
CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection TEXT,       -- 'clientes', 'vendas', 'comissoes', 'metas'
    payload TEXT           -- JSON com os dados
);
```

### Estrutura de Dados

**Cliente:**
```javascript
{
  id: 1,
  nome: "Empresa XYZ LTDA",
  cpfCnpj: "11.444.777/0001-61",
  telefone: "(11) 3333-4444",
  email: "contato@empresa.com.br",
  dataNascimento: "1990-05-15",
  contaContrato: "ACC123456",
  endereco: {
    cep: "01310100",
    logradouro: "Avenida Paulista",
    numero: "1000",
    complemento: "Apto 1000",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP"
  }
}
```

**Venda:**
```javascript
{
  id: 1,
  clienteId: 1,
  produto: "Telefonia Móvel",
  operadora: "Vivo",
  valorVenda: 5000.00,
  tipoCliente: "Novo",
  status: "Concluído",
  dataConclusao: "2026-02-25",
  dataRegistro: "2026-02-20",
  observacao: "Cliente satisfeito"
}
```

## 🧪 Teste a API

### Com curl
```bash
# Listar clientes
curl http://localhost:3000/api/clientes

# Buscar CNPJ
curl http://localhost:3000/api-cnpj/buscar/11444777000161
```

### Com Postman
Importe as requisições para testar todos os endpoints.

## 📊 Recursos Avançados

### Importação de Excel
- Importe listas de clientes/vendas do Excel
- Mapeamento automático de colunas
- Validação em tempo real
- Prévia antes de confirmar

### Exportação de CSV
- Exporte dados para planilha
- Formatação automática
- Compatível com Excel

### Notificações
- Notificações de desktop para lembretes
- Acompanhamento de pós-venda
- Alertas de metas

### Dashboard
- Visão geral de vendas por período
- Gráficos interativos
- Métricas principais
- Filtros por período

## 🔐 Segurança

- ✅ CORS configurado
- ✅ Validação de entrada no backend
- ✅ SQL Injection prevenido (Prepared Statements)
- ✅ Suporta HTTPs (configure em ambiente)
- ✅ No-storing de senhas (considerar adicionar autenticação)

## 📝 Documentação

Incluída no repositório:
- `CNPJ_API_DOCUMENTATION.md` - Detalhes da integração CNPJ
- `GETTING_STARTED.md` - Guia de início rápido
- `DEBUG_GUIA.md` - Como debugar problemas
- `SOLUCAO_CORS.md` - Explicação da solução CORS
- [Mais documentação](./README_INDEX.md)

## 🛠️ Desenvolvimento

### Modificar Estilos
- Frontend: `public/css/style.css`
- Tailwind configurado via CDN

### Adicionar Novos Endpoints
Edite `server.js`:
```javascript
app.get('/api/novo-endpoint', (req, res) => {
  // sua lógica aqui
  res.json({ data: 'resposta' });
});
```

### Scripts Úteis
```bash
# Iniciar servidor
npm start
# ou
node server.js

# Resetar banco de dados
# Delete crm_database.sqlite e reinicie
```

## 🐛 Troubleshooting

### Erro CORS
**Problema:** "Access to fetch blocked by CORS"
**Solução:** O projeto usa um endpoint backend para contornar CORS. Certifique-se que o servidor está rodando.

### Banco de dados vazio
**Problema:** Sem dados ao iniciar
**Solução:** Normal! O banco começa vazio. Adicione clientes via interface.

### Integração CNPJ não funciona
**Problema:** "Failed to fetch CNPJ"
**Solução:** Verifique conexão com Internet. CNPJ deve ter 14 dígitos.

[Ver mais troubleshooting](./GETTING_STARTED.md#troubleshooting)

## 🤝 Contribuição

Contribuições são bem-vindas! 

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está licenciado sob a MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 👤 Autor

Desenvolvido com ❤️ como um sistema completo de CRM.

## 📧 Suporte

Para dúvidas ou problemas:
1. Verifique a [documentação](./README_INDEX.md)
2. Abra uma issue no GitHub
3. Consulte [DEBUG_GUIA.md](./DEBUG_GUIA.md)

## 🔄 Roadmap

- [ ] Autenticação de usuários
- [ ] Múltiplos usuários/equipes
- [ ] Relatórios mais complexos
- [ ] API GraphQL
- [ ] Aplicativo Mobile
- [ ] Integração com WhatsApp
- [ ] Machine Learning para previsão de vendas

## ⭐ Agradecimentos

- ReceitaWS - API CNPJ Brasil gratuita
- Express.js - Framework web
- SQLite3 - Banco de dados leve
- TailwindCSS - Framework CSS
- ChartJS - Gráficos
- Lucide - Ícones

---

**Made with ❤️ and JavaScript**

Se este projeto foi útil, dê uma ⭐!
