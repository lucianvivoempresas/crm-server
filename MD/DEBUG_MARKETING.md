🔧 DEBUG GUIDE - ABA DE MARKETING
=================================

Se a lista de clientes não aparecer, siga este guia!


📋 PASSO 1: Verificar Console do Navegador
===========================================

1. Abra seu CRM (F12 no Google Chrome)
2. Clique em "Console"
3. Procure por mensagens de erro

Você deve ver algo assim quando carrega a aba Marketing:

✅ Esperado:
   🚀 Inicializando módulo de Marketing
   📋 Carregando lista de clientes...
   📊 Total de clientes carregados: X
   🎯 Renderizando X cliente(s)
   ✅ Lista de clientes renderizada

❌ Se ver erros:
   ❌ Elemento marketing-clientes-list não encontrado
   ❌ Erro ao carregar clientes: ...


🔍 PASSO 2: Verificar se há Clientes no Banco
==============================================

1. Vá para aba "Clientes"
2. Verifique se existem clientes cadastrados
3. Se não houver, crie um cliente teste:
   - Nome: "Cliente Teste"
   - Email: "teste@email.com"

⚠️ IMPORTANTE: Os clientes precisam ter:
   ✓ Nome preenchido
   ✓ Email válido (contém @)


🌐 PASSO 3: Verificar Network/API
=================================

1. Abra Console (F12)
2. Clique em "Network"
3. Acesse a aba Marketing
4. Procure por requisição: /api/clientes

Você deve ver:
✅ Request: GET /api/clientes
✅ Status: 200
✅ Response: [ {...}, {...} ]

Se não vir, o problema é na API.


📄 PASSO 4: Verificar HTML
==========================

1. Na aba Marketing, clique direito "Inspecionar"
2. Procure pelo elemento:
   
   <div id="marketing-clientes-list"></div>

Se não existir, o HTML não foi carregado corretamente.

Você pode também procurar por:
   - id="marketing-filter-status"
   - id="marketing-search-cliente"  
   - id="marketing-btn-select-all"


💻 PASSO 5: Teste Rápido em JavaScript
======================================

Na console do navegador, execute:

// 1. Verificar se getAllData existe
typeof getAllData
// Resposta esperada: "function"

// 2. Carregar clientes manualmente
getAllData('clientes').then(c => console.log(c))
// Resposta esperada: Array de clientes

// 3. Verificar se função de marketing existe
typeof atualizarListaClientesMarketing
// Resposta esperada: "function"

// 4. Forçar carregamento
atualizarListaClientesMarketing()
// Resposta esperada: Log com clientes


🎯 CENÁRIOS DE ERRO
===================

ERRO 1: "getAllData is not defined"
────────────────────────────────────
Causa: Arquivo db.js não carregou
Solução: 
  - Verifique se <script src="js/db.js"></script> está em index.html
  - Certifique que db.js existe em public/js/

ERRO 2: "Elemento marketing-clientes-list não encontrado"
─────────────────────────────────────────────────────────
Causa: HTML da aba marketing não carregou
Solução:
  - Verifique se HTML foi adicionado corretamente em index.html
  - Procure por <div id="tab-marketing" ...>
  - Reinicie o servidor (npm start)

ERRO 3: "Total de clientes carregados: 0"
──────────────────────────────────────────
Causa: Nenhum cliente no banco
Solução:
  - Vá para aba "Clientes"
  - Crie pelo menos 1 cliente
  - Certifique que tem email válido
  - Volta para Marketing

ERRO 4: API /api/clientes retorna vazio
───────────────────────────────────────
Causa: Endpoint do servidor não retorna dados
Solução:
  - Verificar se server.js tem endpoint GET /api/clientes
  - Reiniciar npm start
  - Verifique se banco SQLite tem dados


🛠️ COMANDOS ÚTEIS DE TESTE
===========================

Teste de getAllData:
─────────────────────
getAllData('clientes')
  .then(c => {
    console.log('Total:', c.length);
    console.log('Primeiro:', c[0]);
    console.table(c);
  })
  .catch(e => console.error('Erro:', e));


Teste de renderização:
─────────────────────
// Mock de clientes
const mockClientes = [
  {id: 1, nome: 'João Silva', email: 'joao@email.com'},
  {id: 2, nome: 'Maria Santos', email: 'maria@email.com'}
];

// Renderizar
renderizarListaClientesMarketing(mockClientes);

// Deve aparecer a lista com 2 clientes


Teste de seleção:
──────────────────
// Selecionar todos
selecionarTodosClientesMarketing();

// Verificar selecionados
console.log(marketingClientesSelecionados);

// Deve mostrar array com clientes


📊 ESTRUTURA ESPERADA DE CLIENTE
================================

Um cliente válido deve ter esta estrutura:

{
  "id": 1,
  "nome": "João Silva",
  "email": "joao@email.com",
  "telefone": "11999999999",  // opcional
  "cpf": "12345678900",        // opcional
  "cidade": "São Paulo",       // opcional
  ...
}

IMPORTANTE:
✓ id deve existir
✓ nome deve ser string
✓ email deve ter @
✓ email não pode ser vazio


🔗 VERIFICAR INTEGRAÇÃO
========================

Verifique ordem de carregamento em index.html:

1. <script src="js/db.js"></script>          ← PRIMEIRO
2. <script src="js/utils.js"></script>
3. <script src="js/cnpj-api.js"></script>
4. <script src="js/auth.js"></script>
5. <script src="js/permissions.js"></script>
6. <script src="js/usuarios.js"></script>
7. <script src="js/ui.js"></script>
8. <script src="js/render.js"></script>
9. <script src="js/marketing.js"></script>    ← DEPOIS (depende de db.js)
10. <script src="js/app.js"></script>        ← ULTIMO


✅ CHECKLIST DE RESOLUÇÃO
==========================

□ Verificou console.log (F12)
□ Confirmou que tem clientes com email na aba "Clientes"
□ Testou comando "getAllData('clientes')" na console
□ Viu requisição GET /api/clientes retornar dados
□ Viu HTML com id="marketing-clientes-list" na página
□ Reiniciou npm start
□ Carregou a página novamente (Ctrl+F5)
□ Clicou na aba "Marketing" novamente
□ Viu os logs de inicialização


🚀 PRÓXIMOS PASSOS SE AINDA NÃO FUNCIONAR
===========================================

1. Copie TODOS os logs do console (F12 → Console → Copiar texto)
2. Envie os logs junto com:
   - Versão do navegador (Chrome, Firefox, etc)
   - Quantos clientes você tem
   - Se aparecem erros na console


📞 SUPORTE RÁPIDO
=================

Erro mais comum: Nenhum cliente no banco
Solução: Vá em Clientes → Crie um cliente com email

Erro segundo mais comum: Arquivo não carregou
Solução: Ctrl+F5 para refresh completo do navegador

Erro terceiro: getAllData não existe
Solução: Reinicie npm start (servidor precisa recarregar)


═══════════════════════════════════════════════════════════════════════════════

Se nada funcionar, PASSE POR ESTE CHECKLIST:

1. ✅ Tem clientes no CRM? 
   → Aba Clientes → Ver lista

2. ✅ Clientes têm email?
   → Clientes devem ter formato email válido

3. ✅ Servidor está rodando?
   → npm start deve estar ativo

4. ✅ HTML foi adicionado?
   → Procure por id="marketing-clientes-list"

5. ✅ JavaScript foi carregado?
   → Console mostra "Inicializando módulo de Marketing"?

6. ✅ getAllData() funciona?
   → Na console: getAllData('clientes')

Se TODOS os pontos falharem, há um problema maior no setup.

═══════════════════════════════════════════════════════════════════════════════

Bom debug! 🔍

