const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function splitCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      return resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      return resolve(row);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);

  const sourcePath = args.source || '.\\receita federal\\cnpj.db';
  const outputPath = args.output || '.\\receita federal\\leads_snapshot.db';
  const ufList = splitCsv(args.uf).map(v => v.toUpperCase());
  const cityList = splitCsv(args.cities).map(v => v.toUpperCase());
  const cnaePrefixList = splitCsv(args.cnaePrefix);
  const requireContact = String(args.requireContact || 'true').toLowerCase() !== 'false';
  const maxRows = Number(args.limit || 0);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Arquivo de origem nao encontrado: ${sourcePath}`);
  }

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const db = new sqlite3.Database(outputPath);

  try {
    console.log('Iniciando recorte de leads...');
    console.log(`Origem: ${sourcePath}`);
    console.log(`Destino: ${outputPath}`);

    await run(db, "PRAGMA journal_mode = WAL");
    await run(db, "PRAGMA synchronous = NORMAL");
    await run(db, "ATTACH DATABASE ? AS src", [sourcePath]);

    await run(
      db,
      `CREATE TABLE leads_empresas (
        cnpj_basico TEXT,
        cnpj TEXT,
        razao_social TEXT,
        nome_fantasia TEXT,
        uf TEXT,
        cidade_codigo TEXT,
        cidade TEXT,
        bairro TEXT,
        cnae_principal TEXT,
        cnae_descricao TEXT,
        ddd1 TEXT,
        telefone1 TEXT,
        email TEXT,
        situacao_cadastral TEXT,
        porte_empresa TEXT,
        capital_social REAL
      )`
    );

    await run(
      db,
      `CREATE TABLE leads_socios (
        cnpj_basico TEXT,
        nome_socio TEXT,
        documento_socio TEXT,
        qualificacao_socio TEXT
      )`
    );

    const whereParts = ["est.situacao_cadastral = '02'"];
    const params = [];

    if (requireContact) {
      whereParts.push("(TRIM(COALESCE(est.telefone1, '')) <> '' OR TRIM(COALESCE(est.correio_eletronico, '')) <> '')");
    }

    if (ufList.length) {
      whereParts.push(`est.uf IN (${ufList.map(() => '?').join(',')})`);
      params.push(...ufList);
    }

    if (cityList.length) {
      whereParts.push(`UPPER(COALESCE(m.descricao, '')) IN (${cityList.map(() => '?').join(',')})`);
      params.push(...cityList);
    }

    if (cnaePrefixList.length) {
      const cnaeParts = cnaePrefixList.map(() => 'est.cnae_fiscal LIKE ?');
      whereParts.push(`(${cnaeParts.join(' OR ')})`);
      params.push(...cnaePrefixList.map(v => `${v}%`));
    }

    const limitClause = maxRows > 0 ? ` LIMIT ${maxRows}` : '';

    const insertEmpresasSql = `
      INSERT INTO leads_empresas (
        cnpj_basico, cnpj, razao_social, nome_fantasia, uf, cidade_codigo, cidade,
        bairro, cnae_principal, cnae_descricao, ddd1, telefone1, email,
        situacao_cadastral, porte_empresa, capital_social
      )
      SELECT
        est.cnpj_basico,
        est.cnpj,
        emp.razao_social,
        est.nome_fantasia,
        est.uf,
        est.municipio,
        m.descricao,
        est.bairro,
        est.cnae_fiscal,
        c.descricao,
        est.ddd1,
        est.telefone1,
        est.correio_eletronico,
        est.situacao_cadastral,
        emp.porte_empresa,
        emp.capital_social
      FROM src.estabelecimento est
      JOIN src.empresas emp ON emp.cnpj_basico = est.cnpj_basico
      LEFT JOIN src.municipio m ON m.codigo = est.municipio
      LEFT JOIN src.cnae c ON c.codigo = est.cnae_fiscal
      WHERE ${whereParts.join(' AND ')}
      ${limitClause}
    `;

    const t0 = Date.now();
    await run(db, insertEmpresasSql, params);
    const t1 = Date.now();

    await run(
      db,
      `INSERT INTO leads_socios (cnpj_basico, nome_socio, documento_socio, qualificacao_socio)
       SELECT
         s.cnpj_basico,
         s.nome_socio,
         s.cnpj_cpf_socio,
         q.descricao
       FROM src.socios s
       LEFT JOIN src.qualificacao_socio q ON q.codigo = s.qualificacao_socio
       WHERE s.cnpj_basico IN (SELECT DISTINCT cnpj_basico FROM leads_empresas)`
    );
    const t2 = Date.now();

    await run(db, 'CREATE INDEX idx_leads_empresas_cnpj_basico ON leads_empresas(cnpj_basico)');
    await run(db, 'CREATE INDEX idx_leads_empresas_uf_cidade ON leads_empresas(uf, cidade)');
    await run(db, 'CREATE INDEX idx_leads_empresas_bairro ON leads_empresas(bairro)');
    await run(db, 'CREATE INDEX idx_leads_empresas_cnae ON leads_empresas(cnae_principal)');
    await run(db, 'CREATE INDEX idx_leads_socios_doc ON leads_socios(documento_socio)');
    await run(db, 'CREATE INDEX idx_leads_socios_cnpj ON leads_socios(cnpj_basico)');
    await run(db, 'ANALYZE');

    const empresasCount = (await get(db, 'SELECT COUNT(1) AS total FROM leads_empresas')).total;
    const sociosCount = (await get(db, 'SELECT COUNT(1) AS total FROM leads_socios')).total;

    await run(db, 'DETACH DATABASE src');
    db.close();

    const sizeBytes = fs.statSync(outputPath).size;
    const sizeGb = (sizeBytes / (1024 ** 3)).toFixed(2);

    console.log('Recorte concluido com sucesso.');
    console.log(`Empresas: ${empresasCount}`);
    console.log(`Socios: ${sociosCount}`);
    console.log(`Tempo empresas: ${((t1 - t0) / 1000).toFixed(1)}s`);
    console.log(`Tempo socios: ${((t2 - t1) / 1000).toFixed(1)}s`);
    console.log(`Tamanho final: ${sizeGb} GB`);
  } catch (err) {
    db.close();
    throw err;
  }
}

main().catch(err => {
  console.error('Falha ao gerar snapshot de leads:', err.message);
  process.exit(1);
});
