const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./crm_database.sqlite', (err) => {
  if (err) {
    console.error('Erro ao abrir banco:', err.message);
    process.exit(1);
  }
  console.log('✅ Conectado ao banco de dados');
});

db.all("SELECT id, collection, LENGTH(payload) as payload_size FROM documents WHERE collection='energia-data' ORDER BY id DESC LIMIT 5", [], (err, rows) => {
  if (err) {
    console.error('Erro ao buscar dados:', err.message);
  } else if (rows.length === 0) {
    console.log('ℹ️ Nenhum registro de energia-data encontrado');
  } else {
    console.log('\n📊 Registros de energia-data no banco:');
    rows.forEach((row, i) => {
      console.log(`\n${i+1}. ID: ${row.id}, Tamanho payload: ${row.payload_size} bytes`);
    });
  }
  
  db.close((err) => {
    if (err) console.error('Erro ao fechar banco:', err.message);
    console.log('\n✅ Verificação concluída');
  });
});
