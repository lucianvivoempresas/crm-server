const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crm_database.sqlite', (err) => {
  if (err) {
    console.error('Erro ao abrir DB:', err.message);
    process.exit(1);
  }
  db.get("SELECT id,payload FROM documents WHERE collection = 'energia-data' ORDER BY id DESC LIMIT 1", [], (err, row) => {
    if (err) {
      console.error('Erro na query:', err.message);
      process.exit(1);
    }
    if (!row) {
      console.log('Nenhum registro energia-data encontrado');
      process.exit(0);
    }
    const payload = JSON.parse(row.payload);
    console.log('id', row.id);
    console.log('usuarios count', Array.isArray(payload.usuarios) ? payload.usuarios.length : 'no array');
    console.log('usuarios', payload.usuarios ? payload.usuarios.map(u => ({ id: u.id, nome: u.nome, login: u.login, tipo: u.tipo, ativo: u.ativo })).slice(0, 10) : null);
    console.log('clientes count', Array.isArray(payload.clientes) ? payload.clientes.length : 'no array');
    console.log('vendas count', Array.isArray(payload.vendas) ? payload.vendas.length : 'no array');
    db.close();
  });
});
