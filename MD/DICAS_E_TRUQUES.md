# 💡 Dicas e Truques para Usar a Integração CNPJ

## ⚡ Atalhos do Teclado

### Dentro do campo CNPJ:
- `TAB` → Ativa busca automática (recomendado)
- `ENTER` → Confirma e vai para próximo campo
- `Ctrl+A` → Seleciona todo texto
- `Delete` → Limpa o campo para começar

### No Formulário:
- `Ctrl+Enter` → Salva o cliente (em alguns browsers)
- `Esc` → Fecha o modal/formulário

## 💾 Dicas de Salvamento

### Ordem Recomendada ao Preencher:
1. CNPJ (deixa sistema buscar)
2. Aguarde 2-3 segundos
3. Valide Nome, Telefone, Email
4. Adicione dados complementares
5. Clique Salvar

### Validação de Dados:
- ✅ Nome: Sempre aparece (razão social da empresa)
- ✅ Telefone: Pode estar vazio (complete manualmente)
- ✅ Email: Pode estar vazio (complete manualmente)
- ✅ Endereço: Geralmente completo

## 🔍 Como Validar se Funcionou

### Verificacionar no Console (F12 > Console):
```javascript
// Teste direto
await fetchCNPJData("11444777000161");

// Deve retornar objeto com success: true
```

### Verificar no Banco de Dados:
```javascript
// No console do navegador
db.all("SELECT * FROM documents WHERE collection='clientes'", (err, rows) => {
  console.log(rows);
  // Veja a coluna "payload" para dados salvos
});
```

## 🎨 Personalizações Possíveis

### Mudar Tempo de Busca
Em `/public/js/ui.js`, procure por:
```javascript
setTimeout(() => {
  setupCNPJListener('cliente-cpfCnpj', 'modal');
}, 100);  // Mude este número
```

Opções:
- `50` → Muito rápido (pode não funcionar)
- `100` → Normal ✅ (recomendado)
- `300` → Mais lento (para esperar animações)

### Mudar Tooltip
Em `/public/index.html`, procure por:
```html
<div class="text-xs text-slate-400 mt-1">
  💡 Dica: Digite o CNPJ e deixe o campo para carregar os dados automaticamente
</div>
```

Personalize a mensagem ou remova se desejar.

### Adicionar Validação Customizada
Em `/public/js/cnpj-api.js`, na função `fetchCNPJData`, pode adicionar:
```javascript
// Exemplos de validações extras
if (data.uf && !['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','TO'].includes(data.uf)) {
  console.warn('UF inválido:', data.uf);
}
```

## 🚀 Otimizações de Performance

### Cachear Resultados
Se quiser cachear uma busca já feita:
```javascript
let cachedCNPJs = {};

async function fetchCNPJDataWithCache(cnpj) {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cachedCNPJs[cleaned]) {
    return cachedCNPJs[cleaned];
  }
  const data = await fetchCNPJData(cnpj);
  cachedCNPJs[cleaned] = data;
  return data;
}
```

### Debounce na Busca (se usuário digita muito rápido)
```javascript
let debounceTimeout;
cnpjInput.addEventListener('blur', () => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    loadCNPJDataInForm(cnpjInput.value, formType);
  }, 500);
});
```

## 📱 Usar em Dispositivo Mobile

1. Abre no smartphone:
   - Pode usar IP da máquina: `http://192.168.1.XX:3000`
   - Substitua `XX` pelo último octeto do seu IP

2. O formulário rápido é mais prático em mobile

3. Digite o CNPJ via teclado virtual

## 🔗 Integração com Outras APIs

### Se quiser combinar com CPF (usando outra API):
```javascript
async function fetchCPFData(cpf) {
  const response = await fetch(`https://api-cpf.com/v1/cpf/${cpf}`);
  // ... processar
}

// Depois montar seletor:
if (isCNPJ(input)) {
  await loadCNPJDataInForm(input);
} else if (isCPF(input)) {
  await fetchCPFData(input);
}
```

### Se quiser adicionar busca de CEP:
```javascript
async function fetchCEPData(cep) {
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  const data = await response.json();
  // Preenche endereço
}
```

## 🛠️ Debugging

### Ver Todos os Logs
Em Dev Console abra:
```javascript
// Veja o que está sendo buscado
localStorage.setItem('debug', 'cnpj-api');
console.log('Debug ativado');
```

### Monitorar Requisições
1. Abra F12
2. Vá em "Network"
3. Digite um CNPJ
4. Veja a requisição para `receitaws.com.br`

### Testar Offline
1. F12 > Network
2. Marque "Offline"
3. Tente buscar novo CNPJ
4. Vai dar erro (como esperado)

## 📊 Análise de Dados

### Ver Todos os Clientes Salvos com Dados de API:
```javascript
getAllData('clientes').then(clientes => {
  clientes.forEach(c => {
    console.log(c.nome, c.entereco);
  });
});
```

### Filtrar Clientes com Endereço Completo:
```javascript
getAllData('clientes').then(clientes => {
  const completos = clientes.filter(c => 
    c.endereco && c.endereco.cep && c.endereco.logradouro
  );
  console.log(`${completos.length} clientes com endereço completo`);
});
```

## 🎓 Exemplos de Uso Avançado

### Buscar CNPJ Programaticamente:
```javascript
// No console, execute:
const data = await fetchCNPJData("11444777000161");
console.log(data);
```

### Preencher Formulário Manualmente:
```javascript
await loadCNPJDataInForm("11444777000161", "modal");
```

### Remover Listener (se por algum motivo quiser):
```javascript
removeCNPJListener('cliente-cpfCnpj');
```

## ⚙️ Configuração do Servidor

### Se quiser adicionar suporte a CNPJ no Backend:
Em `server.js`, pode adicionar:
```javascript
app.get('/api/cnpj/:cnpj', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  try {
    const response = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

## 🔄 Atualizar Dados de Cliente Existente

Se tiver um cliente com CNPJ incompleto:
1. Abra em "Editar Cliente"
2. Digite o CNPJ novamente
3. Sistema busca dados mais recentes
4. Valide e salve

## 📋 Checklist de Operação

Antes de usar em produção:
- [ ] Testei com 5+ CNPJs diferentes
- [ ] Verifiquei dados no banco de dados
- [ ] Testei em Chrome, Firefox e Safari
- [ ] Validei segurança (F12 > Network)
- [ ] Treinei a equipe
- [ ] Documentei processos internos
- [ ] Fiz backup do código
- [ ] Preparei plano de rollback (se necessário)

## 🆘 Erros Comuns e Soluções

### Erro: "TypeError: fetchCNPJData is not defined"
**Causa:** Script cnpj-api.js não foi carregado
**Solução:** Verifique se `<script src="js/cnpj-api.js"></script>` existe em index.html

### Erro: "Cannot read property 'value' of null"
**Causa:** Campo com ID errado não existe
**Solução:** Verifique se o HTML foi atualizado corretamente

### Erro: "CORS error"
**Causa:** API bloqueada (improvável com ReceitaWS)
**Solução:** Tente de novo em alguns minutos

### Dados não salvam
**Causa:** Erro no banco de dados
**Solução:** Verifique console e permissões de arquivo

## 📚 Recursos Externos

- API ReceitaWS: https://receitaws.com.br
- Documentação Fetch API: https://developer.mozilla.org/pt-BR/docs/Web/API/fetch
- SQLite Docs: https://www.sqlite.org
- Express.js: https://expressjs.com/pt-br/

## 💬 Feedback

Se encontrar algo que possa melhorar:
1. Documente o problema
2. Veja o console (F12)
3. Tente reproduzir
4. Teste solução
5. Se gostar, use! 🎉

---

**Lembre-se:** O código está pronto, documentado e seguro. Use com confiança! 🚀
