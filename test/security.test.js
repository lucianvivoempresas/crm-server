const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-security-'));
const port = 39000 + Math.floor(Math.random() * 1000);
let child;
let output = '';
let masterCookie = '';

function cookieFrom(response) {
    return response.headers.getSetCookie()
        .map(value => value.split(';', 1)[0])
        .join('; ');
}

async function request(route, options = {}) {
    return fetch(`http://127.0.0.1:${port}${route}`, options);
}

async function waitForServer() {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            const response = await request('/healthz');
            if (response.ok) return;
        } catch (err) {}
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Servidor de teste não iniciou.\n${output}`);
}

test.before(async () => {
    fs.copyFileSync(path.join(root, 'server.js'), path.join(runtime, 'server.js'));
    fs.cpSync(path.join(root, 'public'), path.join(runtime, 'public'), { recursive: true });
    child = spawn(process.execPath, ['server.js'], {
        cwd: runtime,
        env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: String(port),
            AUTH_TOKEN_SECRET: 'test-only-secret-with-at-least-32-characters',
            ALLOW_DEFAULT_USERS: 'false',
            NODE_PATH: path.join(root, 'node_modules')
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    await waitForServer();
});

test.after(async () => {
    if (child && child.exitCode === null) {
        child.kill('SIGTERM');
        await Promise.race([
            new Promise(resolve => child.once('exit', resolve)),
            new Promise(resolve => setTimeout(resolve, 5000))
        ]);
    }
    fs.rmSync(runtime, { recursive: true, force: true });
});

test('protege cabeçalhos e não exibe o login antes de validar a sessão', async () => {
    const response = await request('/energiavolt');
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(html, /id="boot-screen"/);
    assert.match(html, /id="login-screen"[^>]*style="[^"]*display:\s*none/);
    assert.match(html, /Pipeline\.exportarPlanilha\(\)/);
    assert.match(html, /Status atual/);
});

test('recusa dados e backup sem autenticação', async () => {
    assert.equal((await request('/api/energia-data')).status, 401);
    assert.equal((await request('/api/energia-backup')).status, 401);
    const session = await request('/api/energia-session');
    assert.equal(session.status, 401);
    assert.equal((await session.json()).setupRequired, true);
});

test('mantém sessão HttpOnly após F5 sem expor segredos', async () => {
    const setup = await request('/api/energia-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nome: 'Administrador Teste',
            login: 'admin-test',
            senha: 'senha-teste-forte-123'
        })
    });
    assert.equal(setup.status, 200, await setup.text());
    const cookie = cookieFrom(setup);
    masterCookie = cookie;
    const setCookie = setup.headers.getSetCookie().join('; ');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);

    const beforeRefresh = await request('/api/energia-session', { headers: { Cookie: cookie } });
    assert.equal(beforeRefresh.status, 200);

    assert.equal((await request('/energiavolt', { headers: { Cookie: cookie } })).status, 200);
    const afterRefresh = await request('/api/energia-session', { headers: { Cookie: cookie } });
    assert.equal(afterRefresh.status, 200);

    const dataResponse = await request('/api/energia-data', { headers: { Cookie: cookie } });
    const documents = await dataResponse.json();
    const data = documents[0];
    assert.equal(dataResponse.status, 200);
    assert.equal(data.usuarios[0].senhaSegura, undefined);
    assert.equal(data.usuarios[0].senhaHash, undefined);
    assert.equal(data.config.telegram?.token || '', '');

    const backup = await request('/api/energia-backup', { headers: { Cookie: cookie } });
    assert.equal(backup.status, 200);
    assert.match(backup.headers.get('content-disposition'), /attachment/);
});

test('isola dados do vendedor e bloqueia ações de master', async () => {
    const currentResponse = await request('/api/energia-data', { headers: { Cookie: masterCookie } });
    const current = (await currentResponse.json())[0];
    current.vendedores.push({ id: 'seller-1', nome: 'Vendedor Teste', ativo: true });

    const save = await request('/api/energia-data', {
        method: 'POST',
        headers: { Cookie: masterCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(current)
    });
    assert.equal(save.status, 200, await save.text());

    const createUser = await request('/api/energia-usuarios', {
        method: 'POST',
        headers: { Cookie: masterCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nome: 'Usuário Vendedor',
            login: 'seller-test',
            senha: 'senha-vendedor-123',
            tipo: 'vendedor',
            vendedorId: 'seller-1',
            ativo: true
        })
    });
    assert.equal(createUser.status, 200, await createUser.text());

    const login = await request('/api/energia-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: 'seller-test', senha: 'senha-vendedor-123' })
    });
    assert.equal(login.status, 200, await login.text());
    const sellerCookie = cookieFrom(login);

    assert.equal((await request('/api/energia-backup', { headers: { Cookie: sellerCookie } })).status, 403);
    assert.equal((await request('/api/energia-config', { headers: { Cookie: sellerCookie } })).status, 200);

    const sellerDataResponse = await request('/api/energia-data', { headers: { Cookie: sellerCookie } });
    const sellerData = (await sellerDataResponse.json())[0];
    assert.equal(sellerData.usuarios.length, 1);
    assert.equal(sellerData.config.telegram?.token || '', '');

    sellerData.clientes.push({
        id: 'client-seller-1',
        nome: 'Cliente do vendedor',
        vendedorId: 'seller-other'
    });
    const sellerSave = await request('/api/energia-data', {
        method: 'POST',
        headers: { Cookie: sellerCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(sellerData)
    });
    assert.equal(sellerSave.status, 200, await sellerSave.text());

    const masterData = (await (await request('/api/energia-data', {
        headers: { Cookie: masterCookie }
    })).json())[0];
    assert.equal(
        masterData.clientes.find(item => item.id === 'client-seller-1').vendedorId,
        'seller-1'
    );
});
