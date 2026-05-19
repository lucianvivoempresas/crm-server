const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crm_database.sqlite', (err) => {
  if (err) {
    console.error('Erro ao abrir DB:', err.message);
    process.exit(1);
  }

  db.all('SELECT id,nome,email,perfil FROM usuarios', [], (err, rows) => {
    if (err) {
      console.error('Erro ao listar usuarios:', err.message);
      process.exit(1);
    }
    console.log('Usuarios antes:');
    console.table(rows);

    db.run('DELETE FROM usuarios WHERE nome = ? OR email = ?', ['João Silva', 'felipe@empresa.com'], function(delErr) {
      if (delErr) {
        console.error('Erro ao deletar:', delErr.message);
        process.exit(1);
      }
      console.log('Removidos:', this.changes);

      db.all('SELECT id,nome,email,perfil FROM usuarios', [], (err2, rows2) => {
        if (err2) {
          console.error('Erro ao listar usuarios depois:', err2.message);
          process.exit(1);
        }
        console.log('Usuarios depois:');
        console.table(rows2);
        db.close();
      });
    });
  });
});
