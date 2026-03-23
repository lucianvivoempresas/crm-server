// js/db.js

// Pega a URL atual do servidor (funciona para localhost ou IP da rede local)
const API_URL = `${window.location.protocol}//${window.location.host}/api`;

// Mantemos o nome da função igual para não quebrar o app.js
async function initDB() {
  await checkAndLoadDefaultComissoes();
  return Promise.resolve();
}

async function checkAndLoadDefaultComissoes() {
  try {
    const comissoes = await getAllData('comissoes');
    if (comissoes.length === 0) {
      // tabelaComissoesDefault está definida no seu globals.js
      const promises = tabelaComissoesDefault.map(item => addData('comissoes', item));
      await Promise.all(promises);
    }
  } catch (err) {
    console.error('Erro ao carregar comissões padrão:', err);
  }
}

async function getAllData(storeName) {
  try {
    // envia informações do usuário para que o backend possa aplicar filtros
    const userId = obterIdUsuario();
    const perfil = obterUsuarioLogado()?.perfil;
    const token = (typeof obterAuthToken === 'function') ? obterAuthToken() : (sessionStorage.getItem('CRM_AUTH_TOKEN') || localStorage.getItem('CRM_AUTH_TOKEN'));

    if (perfil === 'vendedor' && !userId) {
      console.warn('getAllData: perfil vendedor sem userId - sessão possivelmente perdida');
    }

    // constrói URL com query params para compatibilidade
    let url = new URL(`${API_URL}/${storeName}`, window.location.href);
    if (userId) {
      url.searchParams.append('user_id', userId);
      url.searchParams.append('perfil', perfil);
    }

    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (userId) {
      headers['X-User-Id'] = userId;
      headers['X-User-Perfil'] = perfil;
    }

    const res = await fetch(url.toString(), { headers });

    // Token expirado ou inválido → limpar sessão e voltar para login
    if (res.status === 401) {
      ['CRM_AUTH_TOKEN', 'CRM_USER_SESSION'].forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
      if (typeof ocultaInterfacePrincipal === 'function') ocultaInterfacePrincipal();
      if (typeof setupLoginListeners === 'function') setupLoginListeners();
      console.warn('⚠️ Sessão expirada. Por favor, faça login novamente.');
      return [];
    }

    if (!res.ok) throw new Error('Falha ao buscar dados');
    const raw = await res.json();
    return normalizeStoreData(storeName, raw);
  } catch (err) {
    console.error(err);
    return [];
  }
}

function normalizeStoreData(storeName, rows) {
  if (!Array.isArray(rows)) return [];

  return rows.map(item => {
    if (!item || typeof item !== 'object') return item;

    const out = { ...item };
    const legacySeller = out.vendedor_id ?? out.vendedorId ?? out.usuario_id ?? out.userId;

    if (legacySeller !== undefined && legacySeller !== null && legacySeller !== '') {
      const sellerId = parseInt(legacySeller, 10);
      if (!Number.isNaN(sellerId)) out.vendedor_id = sellerId;
    }

    if (storeName === 'vendas' && out.clienteId !== undefined && out.clienteId !== null && out.clienteId !== '') {
      const clienteId = parseInt(out.clienteId, 10);
      if (!Number.isNaN(clienteId)) out.clienteId = clienteId;
    }

    return out;
  });
}

async function addData(storeName, data) {
  try {
    const copy = { ...data };
    delete copy.id; // Remove o ID para o SQLite gerar um novo automaticamente

    const userId = obterIdUsuario();
    const perfil = obterUsuarioLogado()?.perfil;
    const headers = { 'Content-Type': 'application/json' };
    const token = (typeof obterAuthToken === 'function') ? obterAuthToken() : (sessionStorage.getItem('CRM_AUTH_TOKEN') || localStorage.getItem('CRM_AUTH_TOKEN'));
    if (token) headers.Authorization = `Bearer ${token}`;
    if (userId) {
      headers['X-User-Id'] = userId;
      headers['X-User-Perfil'] = perfil;
    } else if (perfil === 'vendedor') {
      console.warn('addData: vendedor sem userId tentando criar', storeName);
    }

    const res = await fetch(`${API_URL}/${storeName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(copy)
    });
    const result = await res.json();
    return result.id;
  } catch (err) {
    console.error('Erro ao adicionar dado:', err);
    throw err;
  }
}

async function updateData(storeName, data) {
  try {
    const copy = { ...data };
    const id = copy.id;
    delete copy.id; // O ID vai na URL da API

    const userId = obterIdUsuario();
    const perfil = obterUsuarioLogado()?.perfil;
    const headers = { 'Content-Type': 'application/json' };
    const token = (typeof obterAuthToken === 'function') ? obterAuthToken() : (sessionStorage.getItem('CRM_AUTH_TOKEN') || localStorage.getItem('CRM_AUTH_TOKEN'));
    if (token) headers.Authorization = `Bearer ${token}`;
    if (userId) {
      headers['X-User-Id'] = userId;
      headers['X-User-Perfil'] = perfil;
    }

    const res = await fetch(`${API_URL}/${storeName}/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(copy)
    });
    return await res.json();
  } catch (err) {
    console.error('Erro ao atualizar dado:', err);
    throw err;
  }
}

async function deleteData(storeName, id) {
  try {
    const userId = obterIdUsuario();
    const perfil = obterUsuarioLogado()?.perfil;
    const headers = {};
    const token = (typeof obterAuthToken === 'function') ? obterAuthToken() : (sessionStorage.getItem('CRM_AUTH_TOKEN') || localStorage.getItem('CRM_AUTH_TOKEN'));
    if (token) headers.Authorization = `Bearer ${token}`;
    if (userId) {
      headers['X-User-Id'] = userId;
      headers['X-User-Perfil'] = perfil;
    }

    const res = await fetch(`${API_URL}/${storeName}/${id}`, {
      method: 'DELETE',
      headers
    });
    return await res.json();
  } catch (err) {
    console.error('Erro ao deletar dado:', err);
    throw err;
  }
}

async function bulkUpsertClientes(createRows = [], updateRows = []) {
  try {
    const userId = obterIdUsuario();
    const perfil = obterUsuarioLogado()?.perfil;
    const headers = { 'Content-Type': 'application/json' };
    const token = (typeof obterAuthToken === 'function')
      ? obterAuthToken()
      : (sessionStorage.getItem('CRM_AUTH_TOKEN') || localStorage.getItem('CRM_AUTH_TOKEN'));

    if (token) headers.Authorization = `Bearer ${token}`;
    if (userId) {
      headers['X-User-Id'] = userId;
      headers['X-User-Perfil'] = perfil;
    }

    const res = await fetch(`${API_URL}/clientes/bulk-upsert`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ create: createRows, update: updateRows })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `Falha no bulk-upsert (${res.status})`);
    }

    return await res.json();
  } catch (err) {
    console.error('Erro no bulkUpsertClientes:', err);
    throw err;
  }
}