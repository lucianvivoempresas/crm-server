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
    const res = await fetch(`${API_URL}/${storeName}`);
    if (!res.ok) throw new Error('Falha ao buscar dados');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function addData(storeName, data) {
  try {
    const copy = { ...data };
    delete copy.id; // Remove o ID para o SQLite gerar um novo automaticamente
    
    const res = await fetch(`${API_URL}/${storeName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    
    const res = await fetch(`${API_URL}/${storeName}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${API_URL}/${storeName}/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  } catch (err) {
    console.error('Erro ao deletar dado:', err);
    throw err;
  }
}