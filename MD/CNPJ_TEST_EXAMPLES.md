# 📝 CNPJs para Teste da API

## CNPJs Públicos Válidos para Teste

Abaixo estão alguns CNPJs públicos que retornam dados válidos e podem ser usados para testar a funcionalidade:

### 1. **Empresa Pública - Exemplo Padrão** ✅
```
CNPJ: 11.444.777/0001-61
ou: 11444777000161
```
- Status: Ativo
- Útil para: Primeiros testes
- Tipo: Empresa

### 2. **Banco do Brasil** ✅
```
CNPJ: 00.000.000/0001-91
ou: 00000000000191
```
- Status: Ativo
- Útil: Grande empresa conhecida

### 3. **Caixa Econômica Federal** ✅
```
CNPJ: 00.000.000/0001-04
ou: 00000000000104
```
- Status: Ativo
- Útil: Banco estatal

## ⚠️ Importante

### Dados que serão retornados:
- Nome/Razão Social
- Endereço completo (Rua, Número, Complemento)
- Bairro e Cidade
- Estado (UF) e CEP
- Telefone (se registrado)
- Email (se registrado)

### O que NÃO é retornado:
- CPF de sócios
- Dados financeiros
- Patrimônio
- Dados confidenciais

## 🔄 Como Testar

### Passo 1: Abrir Formulário
1. Clique em **"Abrir Forms"** (header superior direito)
2. Procure por "Novo Cliente"

### Passo 2: Inserir CNPJ
```
Digite: 11444777000161
(ou com máscara: 11.444.777/0001-61)
```

### Passo 3: Acionar Busca
- Clique fora do campo CNPJ ou pressione TAB
- Aguarde 1-3 segundos

### Passo 4: Verificar Preenchimento
Os seguintes campos devem ser preenchidos automaticamente:
- ✅ Nome completo
- ✅ Telefone
- ✅ Email
- ✅ Endereço completo

### Passo 5: Confirmar
- Edite se necessário
- Clique em "Salvar Cliente"

## 📱 Teste no Console do Navegador

Se quiser testar diretamente no console (F12 > Console):

```javascript
// Teste a função diretamente
await fetchCNPJData("11444777000161");

// Resultado esperado (JSON completo com dados da empresa)
```

## 🆘 Casos de Teste

### Teste 1: CNPJ Válido ✅
```
Entrada: 11444777000161
Resultado esperado: Dados da empresa preenchidos
```

### Teste 2: CNPJ com Formatação ✅
```
Entrada: 11.444.777/0001-61
Resultado esperado: Sistema limpa e busca normalmente
```

### Teste 3: CNPJ Inválido ❌
```
Entrada: 12345678901234
Resultado esperado: "CNPJ não encontrado"
```

### Teste 4: CNPJ Incompleto
```
Entrada: 123
Resultado esperado: Campo aceita mas não busca (< 11 dígitos)
```

### Teste 5: Conexão Offline
```
Desconecte internet, tente buscar
Resultado esperado: Erro de conexão no console
```

## 🔍 Checklist de Funcionalidades

- [ ] Campo CNPJ aceita entrada com formatação (11.444.777/0001-61)
- [ ] Campo CNPJ aceita entrada sem formatação (11444777000161)
- [ ] Ao sair do campo, dados são buscados automaticamente
- [ ] Campo Nome é preenchido com razão social
- [ ] Campo Telefone é preenchido
- [ ] Campo Email é preenchido
- [ ] Campos de endereço são preenchidos
- [ ] Erro é tratado se CNPJ não existir
- [ ] Usuário pode editar dados manualmente após busca
- [ ] Dados são salvos corretamente no banco
- [ ] Preenchimento funciona em formulário rápido
- [ ] Preenchimento funciona em formulário modal

## 📊 Resposta da API (Exemplo)

Quando você insere o CNPJ `11444777000161`, a API retorna:

```json
{
  "cnpj": "11444777000161",
  "nome": "EMPRESA TESTE LTDA",
  "uf": "SP",
  "logradouro": "RUA EXEMPLO",
  "numero": "123",
  "complemento": "SALA 400",
  "bairro": "CENTRO",
  "municipio": "SAO PAULO",
  "cep": "01000000",
  "telefone": "1133334444",
  "email": "contato@empresa.com.br",
  "status": "ATIVA"
}
```

## 🚀 Performance

- Tempo de requisição: 1-3 segundos
- Variação depende de: Internet, Localização, API
- Timeout: Após 5 segundos retorna erro

## 💡 Dicas

1. **Primeira Execução:** Pode levar um pouco mais
2. **Reuso:** Se buscar mesmo CNPJ, browser pode cachear
3. **Validação:** Sistema valida CNPJ antes de buscar
4. **Offline:** Se Internet cair, mostra erro no console
5. **Retry:** Usuário pode tentar novamente a qualquer momento

## 🔗 Fonte da API

**ReceitaWS - API Pública Gratuita**
- Site: https://receitaws.com.br/
- Limite: 120 requisições por hora
- Dados: Receita Federal do Brasil
- Atualização: Periódica

## 📞 Se Não Funcionar

1. Abra o Developer Console (Tecla F12)
2. Procure por mensagens de erro
3. Tente com outro CNPJ da lista
4. Verifique sua conexão de Internet
5. Feche e reabra a página

---

**Nota:** Estes são CNPJs públicos reais. Qualquer dado retornado está disponível publicamente.
