const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('Usage: node import-backup.js <backup.json> [--clear]');
  process.exit(1);
}

const backupPath = argv[0];
const clearFlag = argv.includes('--clear');

if (!fs.existsSync(backupPath)) {
  console.error('Backup file not found:', backupPath);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(backupPath, 'utf8');
} catch (e) {
  console.error('Failed to read file:', e.message);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('Invalid JSON:', e.message);
  process.exit(1);
}

const payload = data && typeof data === 'object' && data.data && typeof data.data === 'object' ? data.data : data;
const isEnergiaBackup = payload && typeof payload === 'object' && Array.isArray(payload.clientes) && Array.isArray(payload.produtos) && Array.isArray(payload.vendas);
const dbFileName = isEnergiaBackup ? 'energia_database.sqlite' : 'crm_database.sqlite';
const dbPath = path.resolve(__dirname, '..', dbFileName);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening DB:', err.message);
    process.exit(1);
  }
});

if (isEnergiaBackup) {
  console.log('Detected Energia backup. Importing into energia_database.sqlite');
}


function runAsync(sql, params=[]) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err) {
    if (err) return reject(err);
    resolve(this);
  }));
}

function allAsync(sql, params=[]) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows);
  }));
}

(async () => {
  try {
    if (isEnergiaBackup) {
      console.log('Importing Energia backup into energia_database.sqlite');
      await runAsync('BEGIN');
      await runAsync('DELETE FROM documents WHERE collection = ?', ['energia-data']);
      await runAsync('INSERT INTO documents (collection, payload) VALUES (?, ?)', ['energia-data', JSON.stringify(payload)]);
      await runAsync('COMMIT');
      console.log('Energia backup imported successfully.');
    } else {
      const collections = Object.keys(payload).filter(k => Array.isArray(payload[k]));
      if (collections.length === 0) {
        console.error('No top-level arrays found in backup JSON. Found keys:', Object.keys(payload));
        process.exit(1);
      }

      console.log('Collections to import:', collections.join(', '));

      await runAsync('BEGIN');

      for (const col of collections) {
        const rows = payload[col];
        if (!Array.isArray(rows)) continue;

        if (clearFlag) {
          console.log(`Clearing existing rows for collection '${col}'`);
          await runAsync('DELETE FROM documents WHERE collection = ?', [col]);
        }

        console.log(`Inserting ${rows.length} rows into '${col}'`);
        for (const item of rows) {
          // store original object as payload; keep original id inside payload if present
          const itemPayload = JSON.stringify(item);
          await runAsync('INSERT INTO documents (collection, payload) VALUES (?, ?)', [col, itemPayload]);
        }
      }

      await runAsync('COMMIT');
    }

    await runAsync('COMMIT');

    // report counts
    for (const col of collections) {
      const r = await allAsync('SELECT COUNT(*) as c FROM documents WHERE collection = ?', [col]);
      console.log(`Collection '${col}' now has ${r[0].c} rows`);
    }

    console.log('Import completed successfully.');
    db.close();
  } catch (err) {
    console.error('Import failed:', err.message);
    try { await runAsync('ROLLBACK'); } catch (e) {}
    db.close();
    process.exit(1);
  }
})();
