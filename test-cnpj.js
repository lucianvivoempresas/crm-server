// Teste rápido da API de CNPJ
// Execute com: node test-cnpj.js

async function testarCNPJ() {
  try {
    console.log('🧪 Testando API de CNPJ...\n');

    // Teste 1: Verificar se o servidor está respondendo
    console.log('1️⃣ Testando conexão com servidor local...');
    const response1 = await fetch('http://localhost:3000/api-cnpj/buscar/11444777000161');
    console.log(`   Status: ${response1.status}`);
    
    if (response1.ok) {
      const data1 = await response1.json();
      console.log('   ✅ Resposta recebida:');
      console.log('   ', JSON.stringify(data1, null, 2));
    } else {
      console.log(`   ❌ Erro HTTP: ${response1.status} ${response1.statusText}`);
      const text = await response1.text();
      console.log('   Resposta:', text);
    }

    // Teste 2: Verificar a API externa diretamente
    console.log('\n2️⃣ Testando ReceitaWS diretamente...');
    const response2 = await fetch('https://www.receitaws.com.br/v1/cnpj/11444777000161');
    console.log(`   Status: ${response2.status}`);
    
    if (response2.ok) {
      const data2 = await response2.json();
      console.log('   ✅ Resposta recebida:');
      console.log('   ', JSON.stringify(data2, null, 2));
    } else {
      console.log(`   ❌ Erro HTTP: ${response2.status} ${response2.statusText}`);
      const text = await response2.text();
      console.log('   Resposta:', text);
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

testarCNPJ();
