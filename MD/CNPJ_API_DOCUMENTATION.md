# Integração API CNPJ Brasil - Documentação

## 📋 Visão Geral
Este projeto agora possui integração com a **API de CNPJ Brasil (Gratuita)**, que permite buscar automaticamente dados de empresas ao registrar um novo cliente.

## ✨ Funcionalidades Implementadas

### O que é carregado automaticamente?
Quando você digita um CNPJ válido e sai do campo de entrada (blur), o sistema busca e preenche automaticamente:

- ✅ **Razão Social** (Nome da empresa)
- ✅ **Endereço** (Logradouro, Número, Complemento, Bairro, Cidade, UF, CEP)
- ✅ **Telefone**
- ✅ **Email**

## 🚀 Como Usar

### Formulário Rápido (Painel Lateral)
1. Clique em **"Abrir Forms"** no header
2. Na seção "Novo Cliente":
   - Preencha o campo **CNPJ**
   - Clique fora do campo (ou pressione TAB)
   - Aguarde ~2 segundos para o sistema buscar os dados
   - Os campos de **Nome**, **Telefone**, **Email** e **Endereço** serão preenchidos automaticamente
   - Complete os campos obrigatórios que não foram preenchidos
   - Clique em **"Salvar Cliente"**

### Formulário Padrão (Modal)
1. Clique em **"Novo Cliente"** (aba Clientes ou botão no Dashboard)
2. Na seção "Novo Cliente":
   - Preencha o campo **CPF/CNPJ**
   - Clique fora do campo (ou pressione TAB)
   - Aguarde o preenchimento automático dos dados
   - Complete as informações necessárias
   - Clique em **"Salvar"**

## 🔌 Tecnologia Utilizada

### API Utilizada
- **ReceitaWS** (https://receitaws.com.br/)
  - API pública e gratuita
  - Sem autenticação necessária
  - Limite: 120 requisições por hora
  - Banco de dados atualizado regularmente

### Arquitetura
- **Arquivo Principal:** `/public/js/cnpj-api.js`
- **Integração com Forms:** `/public/js/app.js` e `/public/js/ui.js`
- **Chamadas Frontend:** Sem necessidade de modificação no backend

## 📝 Estrutura de Dados

### Resposta da API (Exemplo)
```json
{
  "cnpj": "11444777000161",
  "nome": "Empresa XYZ LTDA",
  "uf": "SP",
  "logradouro": "Avenida Paulista",
  "numero": "1000",
  "complemento": "Apto 1000",
  "bairro": "Bela Vista",
  "municipio": "São Paulo",
  "cep": "01310100",
  "telefone": "1133334444",
  "email": "contato@empresa.com.br"
}
```

### Formato Armazenado no CRM
```javascript
{
  nome: "Empresa XYZ LTDA",
  cpfCnpj: "11444777000161",
  telefone: "1133334444",
  email: "contato@empresa.com.br",
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

## ⚙️ Configuração Técnica

### Funções Disponíveis

#### `fetchCNPJData(cnpj)`
Busca dados de uma empresa pelo CNPJ
```javascript
const data = await fetchCNPJData("11444777000161");
if (data.success) {
  console.log(data.razaoSocial);
}
```

#### `loadCNPJDataInForm(cnpj, formType)`
Preenche o formulário com dados do CNPJ
```javascript
await loadCNPJDataInForm("11444777000161", "modal");
```
Parâmetros:
- `cnpj`: CNPJ com ou sem formatação
- `formType`: "modal" ou "quick" (tipo de formulário)

#### `setupCNPJListener(cnpjInputId, formType)`
Configura listener automático no campo CNPJ
```javascript
setupCNPJListener('cliente-cpfCnpj', 'modal');
```

#### `removeCNPJListener(cnpjInputId)`
Remove o listener do campo CNPJ
```javascript
removeCNPJListener('cliente-cpfCnpj');
```

## 🔍 Tratamento de Erros

### Cenários Cobertos
- ❌ CNPJ inválido (não tem 14 dígitos)
- ❌ CNPJ não encontrado no banco de dados
- ❌ Erro de conectividade com a API
- ❌ Timeout na requisição

### Comportamento
Quando ocorre um erro:
1. O campo CNPJ continua sem ser alterado
2. Nenhum campo é preenchido automaticamente
3. Um console.warn é registrado
4. O usuário pode continuar preenchendo manualmente

## 📱 Compatibilidade

### Navegadores Suportados
- ✅ Chrome/Chromium (Recomendado)
- ✅ Firefox
- ✅ Edge
- ✅ Safari
- ✅ Opera

### Requisitos
- Conexão com a Internet (necessária para buscar dados)
- CORS habilitado (a API permite requisições cross-origin)

## 🔐 Segurança

- ✅ Sem armazenamento de dados sensíveis localmente
- ✅ Requisições via HTTPS (API pública)
- ✅ Sem autenticação necessária
- ✅ Dados armazenados apenas no banco SQLite local
- ✅ Validação de CNPJ no cliente e servidor

## 📊 Limitações

- **Limite de Requisições:** 120 por hora (pela API ReceitaWS)
- **Tempo de Resposta:** ~1-3 segundos (depende da Internet)
- **Dados Disponíveis:** Apenas informações públicas de CNPJ
- **Atualização:** Dados atualizados periodicamente pela Receita Federal

## 🛠️ Troubleshooting

### "CNPJ não encontrado"
- Verifique se o CNPJ está correto (sem caracteres especiais)
- A empresa pode ser muito nova ou inativa
- Tente novamente em alguns minutos

### "Erro ao buscar CNPJ"
- Verifique sua conexão com a Internet
- Verifique se a API está disponível
- Tente novamente ou preencha manualmente

### "Campos não estão sendo preenchidos"
- Aguarde 2-3 segundos após deixar o campo CNPJ
- Verifique o console (F12) para mensagens de erro
- Tente com outro CNPJ válido

## 📚 Exemplos de Uso

### Exemplo 1: CNPJ com formatação
```
Entrada: 11.444.777/0001-61
Sistema detecta e limpa: 11444777000161
Busca na API: ✓
```

### Exemplo 2: CNPJ sem formatação
```
Entrada: 11444777000161
Busca na API: ✓
```

### Exemplo 3: CNPJ inválido
```
Entrada: 123
Resultado: Campo aceita mas não busca (< 11 dígitos)
```

## 🔄 Fluxo de Operação

```
Usuario digita CNPJ
         ↓
Usuario clica fora do campo
         ↓
Sistema verifica se tem >= 11 caracteres
         ↓
Requisição para API ReceitaWS
         ↓
API retorna dados da empresa ✓
         ↓
Campos do formulário são preenchidos
         ↓
Usuario edita se necessário
         ↓
Clica "Salvar Cliente"
         ↓
Dados salvos no banco com informações da API
```

## 💾 Persistência

Os dados buscados pela API são salvos **permanentemente** no banco de dados SQLite junto com o cliente, permitindo:
- ✅ Edições posteriores
- ✅ Histórico completo
- ✅ Uso offline (dados já carregados)
- ✅ Não precisa buscar novamente

## 📞 Suporte

Em caso de dúvidas ou problemas:
1. Verifique o console do navegador (F12)
2. Veja os logs em `console.warn()` e `console.error()`
3. Tente com outro CNPJ conhecidamente válido
4. Reinicie o aplicativo

---

**Versão:** 1.0.0  
**Data:** Fevereiro de 2026  
**Status:** ✅ Produção Pronta
