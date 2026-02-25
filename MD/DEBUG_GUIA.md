# 🔧 Guia de Debug - Integração CNPJ

## ✅ Passos para Debugar o Problema

### Passo 1: Abrir o Console do Navegador
1. Pressione **F12** no navegador
2. Clique na aba **"Console"**
3. Limpe o console com `Ctrl+Shift+K`

### Passo 2: Verifique se o Script Carregou
Você deve ver uma mensagem assim no console:
```
✅ Script cnpj-api.js carregado com sucesso!
```

Se não vir, o script não está sendo carregado. 

**Solução:** Verifique se em `/public/index.html` existe a linha:
```html
<script src="js/cnpj-api.js"></script>
```

### Passo 3: Abra o Formulário
1. Clique em **"Novo Cliente"** (formulário modal) ou
2. Clique em **"Abrir Forms"** (formulário rápido)

No console você deve ver:
```
⏰ Ativando listener CNPJ para cliente...
✅ Listener CNPJ configurado para: cliente-cpfCnpj (modal)
```

Se não aparecer, há um problema com o listener.

### Passo 4: Digite o CNPJ
Digite: `11444777000161` e deixe o campo de CNPJ.

Você deve ver no console:
```
🔍 CNPJ digitado: 11444777000161
⏳ Iniciando busca na API...
🔍 Iniciando busca de CNPJ: 11444777000161
🧹 CNPJ limpo: 11444777000161
📡 Requisitando: https://www.receitaws.com.br/v1/cnpj/11444777000161
```

### Passo 5: Aguarde a Resposta
Você deve ver:
```
📥 Resposta recebida - Status: 200
📦 JSON recebido: {objeto com dados}
✅ Dados formatados: {objeto formatado}
📋 Iniciando preenchimento do formulário (modal)
✅ Preenchido: cliente-nome = "EMPRESA XYZ"
✅ Preenchido: cliente-telefone = "(11) 3333-4444"
📊 Total de campos preenchidos: X/10
✅ Dados preenchidos com sucesso!
```

## ❌ Se Aparecer Erro

### Erro: "Campo client-cpfCnpj não encontrado"
- **Causa:** O formulário não foi carregado
- **Solução:** Certifique-se que está no formulário certo (modal ou quick)

### Erro: "CNPJ inválido"
- **Causa:** CNPJ digitado não tem 14 dígitos
- **Solução:** Digite: `11444777000161` sem pontos/barras

### Erro: "HTTP 400"
- **Causa:** CNPJ não existe
- **Solução:** Tente outro CNPJ ou preencha manualmente

### Erro: "Erro de conexão"
- **Causa:** Internet desconectada
- **Solução:** Verifique sua conexão

### Erro: "Erro de CORS"
- **Causa:** Navegador bloqueando requisição
- **Solução:** Tente em outro navegador

## 🧪 Teste no Console

Se quiser testar manualmente, abra o console (F12) e execute:

```javascript
// Teste a função de busca
await fetchCNPJData("11444777000161");
```

Você verá o resultado no console.

Ou teste preencher um formulário:

```javascript
// Preencho o formulário
await loadCNPJDataInForm("11444777000161", "modal");
```

## 📊 O que Cada Mensagem Significa

| Emoji | Significado |
|-------|------------|
| ✅ | Sucesso |
| ❌ | Erro |
| 🔍 | Procurando |
| 📡 | Enviando requisição |
| 📥 | Recebendo dados |
| 📦 | Processando dados |
| 🔧 | Configurando |
| ⏰ | Esperando |
| ⏳ | Processando |
| 📋 | Ação em formulário |
| 📊 | Resumo/Estatísticas |
| ⚠️ | Aviso |

## 🎯 Checklist de Debug

- [ ] Script carregou? (Veja mensagem inicial)
- [ ] Listener ativado? (Veja "Listener CNPJ configurado")
- [ ] CNPJ digitado? (Digite: 11444777000161)
- [ ] Clicou fora do campo? (Pressione TAB)
- [ ] Viu "Iniciando busca na API"?
- [ ] Recebeu resposta 200?
- [ ] Viu "Dados preenchidos com sucesso"?
- [ ] Campos foram preenchidos?

## 🔄 Se Nada Funcionar

1. **Recarregue a página** (F5)
2. **Limpe o cache** (Ctrl+Shift+Delete)
3. **Feche o navegador** e abra de novo
4. **Tente outro navegador** (Chrome, Firefox, Edge)
5. **Reinicie o servidor** (node server.js)

## 📸 Capturas de Tela do Console Esperado

### Console Correto (Sucesso)
```
✅ Script cnpj-api.js carregado com sucesso!
⏰ Ativando listener CNPJ para cliente...
✅ Listener CNPJ configurado para: cliente-cpfCnpj (modal)
🔍 CNPJ digitado: 11444777000161
⏳ Iniciando busca na API...
✅ Dados preenchidos com sucesso!
```

### Console com Problema (Erro)
```
❌ Script cnpj-api.js carregado com sucesso!
(Não vê "Listener CNPJ configurado")
(Não vê "CNPJ digitado")
```

## 🚀 Teste Rápido Passo-a-Passo

1. Abra F12
2. Vá em Console
3. Limpe (Ctrl+Shift+K)
4. Clique "Novo Cliente"
5. Veja aparecer mensagens
6. Digite: 11444777000161
7. TAB
8. Veja preenchimento!

## 💡 Dica

Se não gostar de todos esses logs, você pode removê-los depois. Por enquanto vamos usar para debugar!

---

**Se ainda não funcionar após seguir tudo, avise-me e vamos investigar mais fundo!** 🔧
