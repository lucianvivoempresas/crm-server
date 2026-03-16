const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./crm_database.sqlite');

db.all(
  "SELECT id, collection, payload FROM documents WHERE collection IN ('clientes','vendas')",
  [],
  (err, rows) => {
    if (err) {
      console.error('ERRO_SELECT', err.message);
      db.close();
      process.exit(1);
      return;
    }

    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    let pending = 0;

    const done = () => {
      console.log(JSON.stringify({ updated, unchanged, failed, total: rows.length }));
      db.close();
    };

    if (!rows || rows.length === 0) {
      done();
      return;
    }

    rows.forEach((row) => {
      let obj;
      try {
        obj = JSON.parse(row.payload);
      } catch (e) {
        unchanged++;
        return;
      }

      const original = JSON.stringify(obj);
      const sellerCandidate = obj.vendedor_id ?? obj.vendedorId ?? obj.usuario_id ?? obj.userId;
      if (sellerCandidate !== undefined && sellerCandidate !== null && sellerCandidate !== '') {
        const sid = parseInt(sellerCandidate, 10);
        if (!Number.isNaN(sid)) {
          obj.vendedor_id = sid;
        }
      }

      delete obj.vendedorId;
      delete obj.usuario_id;
      delete obj.userId;

      if (row.collection === 'vendas') {
        const clienteCandidate = obj.clienteId ?? obj.cliente_id;
        if (clienteCandidate !== undefined && clienteCandidate !== null && clienteCandidate !== '') {
          const cid = parseInt(clienteCandidate, 10);
          if (!Number.isNaN(cid)) {
            obj.clienteId = cid;
          }
        }
        if (obj.cliente_id !== undefined) {
          delete obj.cliente_id;
        }
      }

      const next = JSON.stringify(obj);
      if (next === original) {
        unchanged++;
        return;
      }

      pending++;
      db.run(
        'UPDATE documents SET payload = ? WHERE id = ? AND collection = ?',
        [next, row.id, row.collection],
        (updateErr) => {
          if (updateErr) {
            failed++;
          } else {
            updated++;
          }

          pending--;
          if (pending === 0) {
            done();
          }
        }
      );
    });

    if (pending === 0) {
      done();
    }
  }
);
