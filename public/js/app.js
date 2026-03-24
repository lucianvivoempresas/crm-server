// js/app.js

// INICIALIZAÇÃO PRINCIPAL
window.addEventListener('load', async () => {
  try {
    if (window.lucide) lucide.createIcons();
    
    // Verificar se usuário está autenticado
    if (estaLogado()) {
      // Usuário logado - inicializar aplicação
      console.log('👤 Usuário autenticado. Inicializando aplicação...');
      await initDB();
      await renderAll();
      setupEventListeners();
      
      // Se é master, renderizar usuários
      if (ehMaster()) {
        await renderUsuarios();
        setupUsuariosListeners();
      }
      
      aplicarPermissoes();
      renderizarSaudacao();
      mostraInterfacePrincipal();
    } else {
      // Usuário não logado - mostrar tela de login
      console.log('🔐 Nenhum usuário autenticado. Mostrando tela de login...');
      setupLoginListeners();
      ocultaInterfacePrincipal();
    }
  } catch (err) { 
    console.error('Erro de inicialização:', err); 
  }
});

// ============ AUTENTICAÇÃO ============

async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const rememberMe = document.getElementById('login-remember')?.checked === true;
  const errorEl = document.getElementById('login-error');
  const form = document.getElementById('login-form');
  
  // Limpar erro anterior
  errorEl.classList.add('hidden');
  errorEl.textContent = '';
  
  // Desabilitar botão
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Entrando...';
  
  try {
    // Tentar login
    await login(email, senha, rememberMe);
    
    // Login bem-sucedido
    console.log('✅ Login realizado com sucesso!');
    
    // Esconder tela de login
    document.getElementById('login-container').classList.add('hidden');
    
    // Inicializar aplicação
    if (window.lucide) lucide.createIcons();
    await initDB();
    await renderAll();
    setupEventListeners();
    
    // Se é master, renderizar usuários
    if (ehMaster()) {
      await renderUsuarios();
      setupUsuariosListeners();
    }
    
    aplicarPermissoes();
    renderizarSaudacao();
    mostraInterfacePrincipal();
    
  } catch (err) {
    // Erro no login
    console.error('❌ Erro ao fazer login:', err.message);
    errorEl.textContent = err.message || 'Erro ao fazer login. Tente novamente.';
    errorEl.classList.remove('hidden');
  } finally {
    // Reabilitar botão
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

async function handleLogout() {
  if (!confirm('Tem certeza que deseja fazer logout?')) return;
  
  try {
    await logout();
    
    // Limpar dados da aplicação
    clientes = [];
    vendas = [];
    comissoes = [];
    metas = [];
    
    // Esconder interface
    ocultaInterfacePrincipal();
    
    // Mostrar tela de login
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('login-form').reset();
    
    // Recriar listeners de login
    setupLoginListeners();
    
  } catch (err) {
    console.error('Erro ao fazer logout:', err);
    alert('Erro ao fazer logout. Tente novamente.');
  }
}

function setupLoginListeners() {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.onsubmit = handleLogin;
  }
}

// ============ UI ESTADO ============

function mostraInterfacePrincipal() {
  const loginEl = document.getElementById('login-container');
  if (loginEl) {
    loginEl.classList.add('hidden');
    loginEl.style.display = 'none';
  }
  document.getElementById('app-header').classList.remove('hidden');
  document.getElementById('app-nav').classList.remove('hidden');
  document.getElementById('app-main').classList.remove('hidden');
}

function ocultaInterfacePrincipal() {
  const loginEl = document.getElementById('login-container');
  if (loginEl) {
    loginEl.classList.remove('hidden');
    loginEl.style.display = 'flex';
  }
  document.getElementById('app-header').classList.add('hidden');
  document.getElementById('app-nav').classList.add('hidden');
  document.getElementById('app-main').classList.add('hidden');
}

/* ---- helpers para vendedores ---- */

/**
 * Carrega lista de usuários de perfil "vendedor" do backend
 * Retorna Promise<array>
 */
function carregarVendedores() {
  return getAllData('usuarios').then(u => (u||[]).filter(x => x.perfil === 'vendedor' && x.ativo)).catch(err => { console.error(err); return []; });
}

let populateVendedoresSeq = 0;

/**
 * Preenche um <select> com as opções de vendedores
 */
function popularSelectVendedores(selectEl, includeEmpty = true) {
  if (!selectEl) return;
  const requestToken = String(++populateVendedoresSeq);
  selectEl.dataset.populateToken = requestToken;
  selectEl.innerHTML = includeEmpty ? '<option value="">(nenhum)</option>' : '';

  return carregarVendedores().then(lista => {
    // Evita duplicidade quando existem duas populações assíncronas concorrentes.
    if (selectEl.dataset.populateToken !== requestToken) return;

    selectEl.innerHTML = includeEmpty ? '<option value="">(nenhum)</option>' : '';

    const seen = new Set();
    lista.forEach(u => {
      const key = String(u.email || u.id || '').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.nome;
      selectEl.appendChild(opt);
    });
  });
}

function getThemePreference() {
  return localStorage.getItem('CRM_THEME') || 'blue';
}

function applyTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'blue';
  document.body.setAttribute('data-theme', normalized);
  localStorage.setItem('CRM_THEME', normalized);

  const btn = document.getElementById('btn-theme-toggle');
  const label = document.getElementById('label-theme-toggle');
  if (btn) {
    if (normalized === 'light') {
      btn.className = 'px-3 py-2 rounded-lg flex items-center gap-2 transition-all bg-slate-700 text-slate-100 hover:bg-slate-600';
    } else {
      btn.className = 'px-3 py-2 rounded-lg flex items-center gap-2 transition-all bg-white/10 text-white hover:bg-white/20';
    }
  }
  if (label) label.textContent = normalized === 'light' ? 'UI Azul' : 'UI Branca';
}

function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || getThemePreference();
  applyTheme(current === 'light' ? 'blue' : 'light');
}

/**
 * Exibe modal que permite ao master atribuir vendedores a um conjunto de clientes
 */
function showAssignVendorModal(clients) {
  const modal = document.getElementById('assign-vendor-modal');
  const container = document.getElementById('assign-vendor-list');
  if (!modal || !container) return;
  container.innerHTML = '';
  clients.forEach(c => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 mb-2';
    row.innerHTML = `
      <span class="flex-1 text-white truncate" title="${c.nome}">${c.nome}</span>
      <select data-client-id="${c.id}" class="assign-vendor-select w-1/3 px-2 py-1 bg-slate-700 text-white rounded">
        <option value="">(nenhum)</option>
      </select>
    `;
    container.appendChild(row);
    // preencher select individual
    const sel = row.querySelector('select');
    popularSelectVendedores(sel);
  });
  modal.classList.remove('hidden');
}

function hideAssignVendorModal() {
  const modal = document.getElementById('assign-vendor-modal');
  if (modal) modal.classList.add('hidden');
}

// vincular botões do modal
window.addEventListener('load', () => {
  const btnCancel = document.getElementById('assign-vendor-cancel');
  const btnSave = document.getElementById('assign-vendor-save');
  if (btnCancel) btnCancel.onclick = hideAssignVendorModal;
  if (btnSave) {
    btnSave.onclick = async () => {
      const selects = document.querySelectorAll('.assign-vendor-select');
      for (let sel of selects) {
        const vendId = sel.value;
        const clientId = sel.dataset.clientId;
        if (vendId && clientId) {
          const client = clientes.find(x => String(x.id) === String(clientId));
          if (client) {
            client.vendedor_id = parseInt(vendId, 10);
            await updateData('clientes', client);
          }
        }
      }
      await renderAll();
      hideAssignVendorModal();
    };
  }
});

async function deduplicateClients() {
  if (!confirm('Remover duplicados por CPF/CNPJ? Esta ação não pode ser desfeita.')) return;
  const seen = new Map();
  let removed = 0;
  const listCopy = [...clientes];
  for (const c of listCopy) {
    const key = normalizeDoc(c.cpfCnpj);
    if (!key) continue;
    if (seen.has(key)) {
      try {
        await deleteData('clientes', c.id);
        removed++;
      } catch(e) {
        console.error('Erro ao deletar duplicado', e);
      }
    } else {
      seen.set(key, c);
    }
  }
  if (removed) showQuickMessage(`${removed} duplicado(s) removido(s)`);
  await renderAll();
}

function setupEventListeners() {
  let globalSearchActiveIndex = -1;
  let globalSearchExpanded = false;

  const getGlobalSearchButtons = () => {
    const resultsEl = document.getElementById('global-search-results');
    if (!resultsEl) return [];
    return Array.from(resultsEl.querySelectorAll('[data-global-result]'));
  };

  const paintGlobalSearchActive = () => {
    const buttons = getGlobalSearchButtons();
    buttons.forEach((btn, idx) => {
      btn.classList.toggle('bg-slate-700/50', idx === globalSearchActiveIndex);
    });
    if (buttons[globalSearchActiveIndex]) {
      buttons[globalSearchActiveIndex].scrollIntoView({ block: 'nearest' });
    }
  };

  const runGlobalSearchSelection = (index) => {
    const buttons = getGlobalSearchButtons();
    if (!buttons.length) return;
    const idx = Math.max(0, Math.min(index, buttons.length - 1));
    const btn = buttons[idx];
    if (btn) btn.click();
  };

  const activateTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('text-white','border-blue-500','bg-slate-700/50');
      b.classList.add('text-slate-400','hover:text-white','hover:bg-slate-700/30','border-transparent');
    });
    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) targetTab.classList.remove('hidden');
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (targetBtn) {
      targetBtn.classList.add('text-white','border-blue-500','bg-slate-700/50');
      targetBtn.classList.remove('text-slate-400','hover:text-white','hover:bg-slate-700/30','border-transparent');
    }
  };

  const normalizarChaveOfertaCampanha = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const embaralharArray = (array) => {
    const out = [...array];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const clientesCampanhaModal = document.getElementById('clientes-campanha-modal');
  const clientesCampanhaOferta = document.getElementById('clientes-campanha-oferta');
  const clientesCampanhaVendedor = document.getElementById('clientes-campanha-vendedor');
  const clientesCampanhaQuantidade = document.getElementById('clientes-campanha-quantidade');
  const clientesCampanhaDestinoTipo = document.getElementById('clientes-campanha-destino-tipo');
  const clientesCampanhaNomeWrap = document.getElementById('clientes-campanha-nome-wrap');
  const clientesCampanhaNome = document.getElementById('clientes-campanha-nome');
  const clientesCampanhaSelectWrap = document.getElementById('clientes-campanha-select-wrap');
  const clientesCampanhaDestinoId = document.getElementById('clientes-campanha-destino-id');
  const clientesCampanhaTotalFiltrados = document.getElementById('clientes-campanha-total-filtrados');
  const clientesCampanhaTotalElegiveis = document.getElementById('clientes-campanha-total-elegiveis');
  const clientesCampanhaRelatorio = document.getElementById('clientes-campanha-relatorio');
  const btnClientesCampanhaExportCsv = document.getElementById('btn-clientes-campanha-export-csv');
  const btnClientesCampanhaUnlockVendedor = document.getElementById('btn-clientes-campanha-unlock-vendedor');
  const btnClientesCampanhaUnlockOferta = document.getElementById('btn-clientes-campanha-unlock-oferta');

  let distribuicaoHistoricoCache = [];
  let distribuicaoCampanhasCache = [];

  const obterSnapshotDistribuicao = () => {
    const snapshot = window.__clientesCampanhaSnapshot || null;
    if (!snapshot) return null;
    const clientesFiltrados = Array.isArray(snapshot.clientesFiltrados) ? snapshot.clientesFiltrados : [];
    return {
      ...snapshot,
      filtroOfertaNormalizado: normalizarChaveOfertaCampanha(snapshot.filtroOfertaNormalizado || snapshot.filtroOfertaRaw || ''),
      clientesFiltrados
    };
  };

  const filtrarCampanhasDestino = () => {
    if (!clientesCampanhaDestinoId) return;
    const vendedorId = parseNumericId(clientesCampanhaVendedor?.value);
    const user = obterUsuarioLogado();
    const campanhas = (distribuicaoCampanhasCache || []).filter(c => {
      if (!vendedorId) return true;
      return Number(c.vendedor_id) === Number(vendedorId);
    });
    const atual = clientesCampanhaDestinoId.value;
    clientesCampanhaDestinoId.innerHTML = '<option value="">Selecione</option>';
    campanhas.forEach(c => {
      const opt = document.createElement('option');
      opt.value = String(c.id);
      const vendedorNome = usuariosList?.find(u => Number(u.id) === Number(c.vendedor_id))?.nome || `#${c.vendedor_id || 'N/A'}`;
      opt.textContent = user?.perfil === 'master' ? `${c.nome || `Campanha #${c.id}`} (${vendedorNome})` : (c.nome || `Campanha #${c.id}`);
      clientesCampanhaDestinoId.appendChild(opt);
    });
    if (atual && campanhas.some(c => String(c.id) === String(atual))) {
      clientesCampanhaDestinoId.value = atual;
    }
  };

  const obterElegiveisSemRepeticao = (snapshot, vendedorId) => {
    if (!snapshot || !vendedorId) return [];
    const ofertaChave = normalizarChaveOfertaCampanha(snapshot.filtroOfertaNormalizado);
    const enviados = new Set(
      (distribuicaoHistoricoCache || [])
        .filter(h => Number(h.vendedor_id) === Number(vendedorId) && normalizarChaveOfertaCampanha(h.oferta_chave) === ofertaChave)
        .map(h => Number(h.cliente_id))
    );
    return snapshot.clientesFiltrados.filter(c => !enviados.has(Number(c.id)));
  };

  const obterHistoricoDaOferta = (snapshot) => {
    if (!snapshot) return [];
    const ofertaChave = normalizarChaveOfertaCampanha(snapshot.filtroOfertaNormalizado);
    return (distribuicaoHistoricoCache || []).filter(h => {
      return normalizarChaveOfertaCampanha(h.oferta_chave) === ofertaChave;
    });
  };

  const renderRelatorioDistribuicao = (snapshot) => {
    if (!clientesCampanhaRelatorio) return;
    if (!snapshot) {
      clientesCampanhaRelatorio.innerHTML = '<p class="text-slate-400">Sem dados de filtro para montar relatório.</p>';
      return;
    }

    const historicoOferta = obterHistoricoDaOferta(snapshot);
    const vendedorSelecionado = parseNumericId(clientesCampanhaVendedor?.value);
    const enviadosUnicos = new Set(historicoOferta.map(h => Number(h.cliente_id))).size;
    const vendedoresUnicos = new Set(historicoOferta.map(h => Number(h.vendedor_id))).size;
    const totalRegistros = historicoOferta.length;
    const elegiveisAtual = obterElegiveisSemRepeticao(snapshot, vendedorSelecionado).length;

    const porVendedor = new Map();
    historicoOferta.forEach((row) => {
      const vendedorId = Number(row.vendedor_id);
      const current = porVendedor.get(vendedorId) || { vendedorId, total: 0, clientes: new Set(), ultimoEnvio: '' };
      current.total += 1;
      current.clientes.add(Number(row.cliente_id));
      if (!current.ultimoEnvio || String(row.enviado_em || '') > current.ultimoEnvio) {
        current.ultimoEnvio = String(row.enviado_em || '');
      }
      porVendedor.set(vendedorId, current);
    });

    const ranking = Array.from(porVendedor.values())
      .sort((a, b) => b.clientes.size - a.clientes.size)
      .slice(0, 5);

    const rankingHtml = ranking.length
      ? `<div class="mt-2 space-y-1">${ranking.map((item) => {
          const vendedorNome = usuariosList?.find(u => Number(u.id) === Number(item.vendedorId))?.nome || `Vendedor #${item.vendedorId}`;
          const ultimo = item.ultimoEnvio ? new Date(item.ultimoEnvio).toLocaleString('pt-BR') : 'N/A';
          return `<p class="text-xs text-slate-300">${vendedorNome}: <span class="text-white">${item.clientes.size}</span> cliente(s) únicos • último envio ${ultimo}</p>`;
        }).join('')}</div>`
      : '<p class="text-xs text-slate-400 mt-2">Nenhum envio registrado ainda para esta observação.</p>';

    clientesCampanhaRelatorio.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div class="rounded border border-slate-700 bg-slate-800/60 p-2"><p class="text-[11px] text-slate-400">Registros</p><p class="text-white font-semibold">${totalRegistros}</p></div>
        <div class="rounded border border-slate-700 bg-slate-800/60 p-2"><p class="text-[11px] text-slate-400">Clientes Únicos</p><p class="text-white font-semibold">${enviadosUnicos}</p></div>
        <div class="rounded border border-slate-700 bg-slate-800/60 p-2"><p class="text-[11px] text-slate-400">Vendedores</p><p class="text-white font-semibold">${vendedoresUnicos}</p></div>
        <div class="rounded border border-slate-700 bg-slate-800/60 p-2"><p class="text-[11px] text-slate-400">Elegíveis Agora</p><p class="text-emerald-300 font-semibold">${vendedorSelecionado ? elegiveisAtual : '-'}</p></div>
      </div>
      ${rankingHtml}
    `;
  };

  const atualizarEstadoDestinoDistribuicao = () => {
    const destino = clientesCampanhaDestinoTipo?.value || 'nova';
    if (clientesCampanhaNomeWrap) clientesCampanhaNomeWrap.classList.toggle('hidden', destino !== 'nova');
    if (clientesCampanhaSelectWrap) clientesCampanhaSelectWrap.classList.toggle('hidden', destino !== 'existente');
  };

  const atualizarResumoDistribuicao = () => {
    const snapshot = obterSnapshotDistribuicao();
    const vendedorId = parseNumericId(clientesCampanhaVendedor?.value);
    const elegiveis = obterElegiveisSemRepeticao(snapshot, vendedorId);
    if (clientesCampanhaTotalFiltrados) {
      clientesCampanhaTotalFiltrados.textContent = String(snapshot?.clientesFiltrados?.length || 0);
    }
    if (clientesCampanhaTotalElegiveis) {
      clientesCampanhaTotalElegiveis.textContent = String(elegiveis.length);
    }
    if (btnClientesCampanhaUnlockVendedor) {
      btnClientesCampanhaUnlockVendedor.disabled = !vendedorId;
      btnClientesCampanhaUnlockVendedor.classList.toggle('opacity-50', !vendedorId);
      btnClientesCampanhaUnlockVendedor.classList.toggle('cursor-not-allowed', !vendedorId);
    }
    filtrarCampanhasDestino();
    renderRelatorioDistribuicao(snapshot);
  };

  const desbloquearHistoricoDistribuicao = async (modo = 'vendedor') => {
    const snapshot = obterSnapshotDistribuicao();
    if (!snapshot) throw new Error('Sem contexto de filtro para desbloquear.');

    const ofertaChave = normalizarChaveOfertaCampanha(snapshot.filtroOfertaNormalizado);
    const vendedorId = parseNumericId(clientesCampanhaVendedor?.value);

    if (modo === 'vendedor' && !vendedorId) {
      throw new Error('Selecione um vendedor para desbloquear.');
    }

    const registros = obterHistoricoDaOferta(snapshot).filter((row) => {
      if (modo === 'oferta') return true;
      return Number(row.vendedor_id) === Number(vendedorId);
    });

    if (!registros.length) {
      throw new Error('Nenhum registro encontrado para desbloqueio com esse critério.');
    }

    const alvo = modo === 'oferta' ? 'todos os vendedores dessa observação' : 'o vendedor selecionado';
    const ok = confirm(`Desbloquear ${registros.length} registro(s) para ${alvo}?`);
    if (!ok) return;

    for (const row of registros) {
      await deleteData('campanha_distribuicao_historico', row.id);
    }

    distribuicaoHistoricoCache = (distribuicaoHistoricoCache || []).filter((row) => {
      if (normalizarChaveOfertaCampanha(row.oferta_chave) !== ofertaChave) return true;
      if (modo === 'oferta') return false;
      return Number(row.vendedor_id) !== Number(vendedorId);
    });

    atualizarResumoDistribuicao();
    if (typeof showQuickMessage === 'function') {
      showQuickMessage(`Desbloqueio concluído: ${registros.length} registro(s) removido(s).`);
    }
  };

  const csvCellDistribuicao = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const exportarRelatorioDistribuicaoCsv = () => {
    const snapshot = obterSnapshotDistribuicao();
    if (!snapshot) {
      alert('Sem contexto de filtro para exportar relatório.');
      return;
    }

    const historicoOferta = obterHistoricoDaOferta(snapshot);
    if (!historicoOferta.length) {
      alert('Nenhum registro para exportar nesta observação.');
      return;
    }

    const headers = [
      'Oferta',
      'Oferta Chave',
      'Data Envio',
      'Vendedor ID',
      'Vendedor Nome',
      'Campanha ID',
      'Campanha Nome',
      'Cliente ID',
      'Cliente Nome',
      'Cliente CPF/CNPJ',
      'Cliente Telefone',
      'Cliente Email',
      'Enviado Por',
      'Origem'
    ];

    const rows = historicoOferta
      .slice()
      .sort((a, b) => String(b.enviado_em || '').localeCompare(String(a.enviado_em || '')))
      .map((row) => {
        const vendedorId = Number(row.vendedor_id);
        const clienteId = Number(row.cliente_id);
        const campanhaId = Number(row.campanha_id);

        const vendedorNome = usuariosList?.find(u => Number(u.id) === vendedorId)?.nome || '';
        const campanhaNome = (distribuicaoCampanhasCache || []).find(c => Number(c.id) === campanhaId)?.nome || '';
        const cliente = (clientes || []).find(c => Number(c.id) === clienteId) || {};

        return [
          row.oferta_label || snapshot.filtroOfertaRaw || '',
          row.oferta_chave || snapshot.filtroOfertaNormalizado || '',
          row.enviado_em || '',
          vendedorId || '',
          vendedorNome,
          campanhaId || '',
          campanhaNome,
          clienteId || '',
          cliente.nome || '',
          cliente.cpfCnpj || '',
          cliente.telefone || '',
          cliente.email || '',
          row.enviado_por || '',
          row.origem || ''
        ];
      });

    const csv = [
      headers.map(csvCellDistribuicao).join(','),
      ...rows.map(r => r.map(csvCellDistribuicao).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const nomeBase = String(snapshot.filtroOfertaRaw || 'relatorio_distribuicao')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'relatorio_distribuicao';
    const dataRef = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = `${nomeBase}_${dataRef}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fecharModalDistribuicaoClientes = () => {
    if (clientesCampanhaModal) clientesCampanhaModal.classList.add('hidden');
  };

  const abrirModalDistribuicaoClientes = async () => {
    const user = obterUsuarioLogado();
    const snapshot = obterSnapshotDistribuicao();
    const ofertaRaw = String(document.getElementById('filter-clientes-oferta')?.value || '').trim();
    const ofertaNormalizada = normalizarChaveOfertaCampanha(snapshot?.filtroOfertaNormalizado || ofertaRaw);

    if (!ofertaNormalizada) {
      alert('Use primeiro o filtro de observação para definir a oferta da distribuição.');
      return;
    }

    if (!snapshot || !Array.isArray(snapshot.clientesFiltrados) || snapshot.clientesFiltrados.length === 0) {
      alert('Nenhum cliente filtrado encontrado para enviar.');
      return;
    }

    const [historicoRows, campanhasRows] = await Promise.all([
      getAllData('campanha_distribuicao_historico'),
      getAllData('campanhas')
    ]);

    distribuicaoHistoricoCache = Array.isArray(historicoRows) ? historicoRows : [];
    distribuicaoCampanhasCache = Array.isArray(campanhasRows) ? campanhasRows : [];

    if (clientesCampanhaOferta) {
      clientesCampanhaOferta.value = snapshot.filtroOfertaRaw || ofertaRaw;
    }

    if (clientesCampanhaQuantidade) {
      const sugestao = Math.min(10, snapshot.clientesFiltrados.length || 10);
      clientesCampanhaQuantidade.value = String(Math.max(1, sugestao));
    }

    if (clientesCampanhaDestinoTipo) {
      clientesCampanhaDestinoTipo.value = 'nova';
    }

    atualizarEstadoDestinoDistribuicao();

    if (clientesCampanhaNome) {
      const base = snapshot.filtroOfertaRaw || 'Distribuicao';
      clientesCampanhaNome.value = `${base} - ${new Date().toLocaleDateString('pt-BR')}`;
    }

    if (clientesCampanhaVendedor) {
      if (user && user.perfil === 'master') {
        await popularSelectVendedores(clientesCampanhaVendedor, true);
        if (clientesCampanhaVendedor.options[0]) clientesCampanhaVendedor.options[0].text = 'Selecione';
        clientesCampanhaVendedor.disabled = false;
      } else if (user) {
        clientesCampanhaVendedor.innerHTML = `<option value="${user.id}">${user.nome}</option>`;
        clientesCampanhaVendedor.value = String(user.id);
        clientesCampanhaVendedor.disabled = true;
      }
    }

    atualizarResumoDistribuicao();

    if (clientesCampanhaModal) clientesCampanhaModal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  };

  const distribuirClientesParaCampanha = async () => {
    const user = obterUsuarioLogado();
    const snapshot = obterSnapshotDistribuicao();
    if (!snapshot) throw new Error('Nao foi possivel obter a lista filtrada de clientes.');

    const vendedorId = parseNumericId(clientesCampanhaVendedor?.value);
    if (!vendedorId) throw new Error('Selecione um vendedor destino.');

    const ofertaChave = normalizarChaveOfertaCampanha(snapshot.filtroOfertaNormalizado);
    if (!ofertaChave) throw new Error('Informe um filtro de observacao para distribuir.');

    const quantidade = Math.max(1, parseInt(String(clientesCampanhaQuantidade?.value || '1'), 10) || 1);
    const elegiveis = obterElegiveisSemRepeticao(snapshot, vendedorId);
    if (!elegiveis.length) {
      throw new Error('Nao ha clientes disponiveis sem repeticao para este vendedor nessa observacao.');
    }

    const selecionados = embaralharArray(elegiveis).slice(0, quantidade);
    const destino = clientesCampanhaDestinoTipo?.value || 'nova';
    let campanhaId = parseNumericId(clientesCampanhaDestinoId?.value);

    if (destino === 'nova') {
      const nomeCampanha = String(clientesCampanhaNome?.value || '').trim() || `${snapshot.filtroOfertaRaw || 'Distribuicao'} - ${new Date().toLocaleDateString('pt-BR')}`;
      campanhaId = await addData('campanhas', {
        nome: nomeCampanha,
        produto: snapshot.filtroOfertaRaw || 'Oferta CRM',
        vendedor_id: vendedorId,
        criado_por: Number(user?.id || 0),
        criado_em: new Date().toISOString(),
        total_leads: selecionados.length
      });
    }

    if (!campanhaId) {
      throw new Error('Selecione uma campanha de destino ou crie uma nova.');
    }

    for (const cliente of selecionados) {
      await addData('campanha_leads', {
        campanha_id: Number(campanhaId),
        vendedor_id: vendedorId,
        empresa: cliente.nome || `Cliente #${cliente.id}`,
        telefone: cliente.telefone || '',
        email: cliente.email || '',
        cnpj: cliente.cpfCnpj || '',
        socio: cliente.nomeContatoSFA || '',
        produto_ofertado: snapshot.filtroOfertaRaw || 'Oferta CRM',
        status_funil: 'Novo',
        objecao_principal: '',
        retorno: '',
        proxima_acao: 'Primeiro contato comercial',
        data_proximo_contato: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        criado_em: new Date().toISOString()
      });

      await addData('campanha_distribuicao_historico', {
        cliente_id: Number(cliente.id),
        vendedor_id: vendedorId,
        campanha_id: Number(campanhaId),
        oferta_chave: ofertaChave,
        oferta_label: snapshot.filtroOfertaRaw || '',
        enviado_por: Number(user?.id || 0),
        enviado_em: new Date().toISOString(),
        origem: 'clientes_filtro'
      });
    }

    if (typeof renderCampanhasTab === 'function') {
      await renderCampanhasTab();
    }

    fecharModalDistribuicaoClientes();
    activateTab('campanhas');

    const campanhaFilter = document.getElementById('campanhas-filter-campanha');
    if (campanhaFilter) {
      campanhaFilter.value = String(campanhaId);
      campanhaFilter.dispatchEvent(new Event('change'));
    }

    if (typeof showQuickMessage === 'function') {
      showQuickMessage(`Distribuicao concluida: ${selecionados.length} cliente(s) enviado(s) para campanha.`);
    }
  };

  const renderGlobalSearch = (query) => {
    const resultsEl = document.getElementById('global-search-results');
    if (!resultsEl) return;
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) {
      resultsEl.classList.add('hidden');
      resultsEl.innerHTML = '';
      globalSearchActiveIndex = -1;
      return;
    }

    const clienteMatches = [];
    (clientes || []).forEach(c => {
      const nome = String(c.nome || '').toLowerCase();
      const doc = String(c.cpfCnpj || '').toLowerCase();
      const tel = String(c.telefone || '').toLowerCase();
      const conta = String(c.contaContrato || '').toLowerCase();
      if (nome.includes(q) || doc.includes(q) || tel.includes(q) || conta.includes(q)) {
        clienteMatches.push({
          type: 'cliente',
          id: c.id,
          title: c.nome || 'Cliente sem nome',
          subtitle: `CPF/CNPJ: ${c.cpfCnpj || 'N/A'} • Tel: ${c.telefone || 'N/A'}`
        });
      }
    });

    const vendaMatches = [];
    (vendas || []).forEach(v => {
      const cliente = clientes.find(c => Number(c.id) === Number(v.clienteId));
      const base = `${cliente?.nome || ''} ${v.produto || ''} ${v.operadora || ''} ${v.status || ''}`.toLowerCase();
      if (base.includes(q)) {
        vendaMatches.push({
          type: 'venda',
          id: v.id,
          clienteId: v.clienteId,
          title: `${cliente?.nome || 'Cliente'} • ${v.produto || 'Venda'}`,
          subtitle: `${v.operadora || 'N/A'} • ${v.status || 'N/A'} • ${formatCurrency(v.valorVenda)}`
        });
      }
    });

    const clienteLimit = globalSearchExpanded ? 12 : 3;
    const vendaLimit = globalSearchExpanded ? 12 : 3;
    const outClientes = clienteMatches.slice(0, clienteLimit);
    const outVendas = vendaMatches.slice(0, vendaLimit);
    const out = [...outClientes, ...outVendas];
    const totalMatches = clienteMatches.length + vendaMatches.length;
    if (!out.length) {
      resultsEl.innerHTML = '<div class="px-4 py-3 text-sm text-slate-400">Nenhum resultado encontrado.</div>';
      resultsEl.classList.remove('hidden');
      globalSearchActiveIndex = -1;
      return;
    }

    resultsEl.innerHTML = out.map((r, idx) => {
      const icon = r.type === 'cliente' ? 'users' : 'trending-up';
      const badge = r.type === 'cliente' ? 'Cliente' : 'Venda';
      const badgeColor = r.type === 'cliente' ? 'text-cyan-300' : 'text-emerald-300';
      return `
        <button class="w-full text-left px-4 py-3 hover:bg-slate-700/50 border-b border-slate-700 last:border-b-0" data-global-result="${idx}">
          <div class="flex items-start gap-3">
            <i data-lucide="${icon}" class="w-4 h-4 mt-0.5 text-slate-400"></i>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm text-white font-medium truncate">${r.title}</p>
                <span class="text-[10px] uppercase tracking-widest ${badgeColor}">${badge}</span>
              </div>
              <p class="text-xs text-slate-400 truncate">${r.subtitle}</p>
            </div>
          </div>
        </button>
      `;
    }).join('');
    if (!globalSearchExpanded && totalMatches > out.length) {
      resultsEl.innerHTML += `<button type="button" class="w-full text-center px-4 py-3 text-sm text-cyan-300 hover:bg-slate-700/40 border-t border-slate-700" id="global-search-more">Ver mais resultados (${totalMatches - out.length})</button>`;
    }
    resultsEl.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    globalSearchActiveIndex = -1;
    paintGlobalSearchActive();

    resultsEl.querySelectorAll('[data-global-result]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = out[Number(btn.dataset.globalResult)];
        if (!item) return;
        if (item.type === 'cliente') {
          activateTab('clientes');
          const input = document.getElementById('search-clientes');
          if (input) input.value = item.title;
          renderClientesGrid();
          try { showClientProfileModal(item.id); } catch (_) {}
        } else {
          activateTab('vendas');
          const input = document.getElementById('search-vendas');
          if (input) input.value = item.title.split(' • ')[0] || '';
          renderVendasTable();
        }
        resultsEl.classList.add('hidden');
        globalSearchActiveIndex = -1;
      });
    });

    const moreBtn = document.getElementById('global-search-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        globalSearchExpanded = true;
        renderGlobalSearch(query);
      });
    }
  };

  // == ABAS E NAVEGAÇÃO ==
  const tabsContainer = document.getElementById('tabs-container');
  if (tabsContainer) {
    tabsContainer.onclick = (e) => {
      const btn = e.target.closest('button.tab-btn');
      if (!btn) return;
      activateTab(btn.dataset.tab);
    };
  }

  const globalSearch = document.getElementById('global-search');
  if (globalSearch) {
    globalSearch.addEventListener('input', () => {
      globalSearchExpanded = false;
      renderGlobalSearch(globalSearch.value);
    });
    globalSearch.addEventListener('focus', () => {
      globalSearchExpanded = false;
      renderGlobalSearch(globalSearch.value);
    });
    globalSearch.addEventListener('keydown', (e) => {
      const resultsEl = document.getElementById('global-search-results');
      if (!resultsEl) return;
      const isOpen = !resultsEl.classList.contains('hidden');
      const buttons = getGlobalSearchButtons();

      if (e.key === 'Escape') {
        resultsEl.classList.add('hidden');
        globalSearchActiveIndex = -1;
        return;
      }

      if (!isOpen || !buttons.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        globalSearchActiveIndex = (globalSearchActiveIndex + 1) % buttons.length;
        paintGlobalSearchActive();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        globalSearchActiveIndex = (globalSearchActiveIndex - 1 + buttons.length) % buttons.length;
        paintGlobalSearchActive();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (globalSearchActiveIndex >= 0) {
          runGlobalSearchSelection(globalSearchActiveIndex);
        } else {
          runGlobalSearchSelection(0);
        }
      }
    });
    document.addEventListener('keydown', (e) => {
      const isCtrlK = (e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k';
      if (!isCtrlK) return;
      e.preventDefault();
      globalSearch.focus();
      globalSearch.select();
    });
    document.addEventListener('click', (e) => {
      const resultsEl = document.getElementById('global-search-results');
      if (!resultsEl) return;
      const within = e.target.closest('#global-search, #global-search-results');
      if (!within) resultsEl.classList.add('hidden');
    });
  }

  // == FILTROS E PESQUISAS ==
  const elDashPeriod = document.getElementById('dashboard-period-filter');
  if (elDashPeriod) elDashPeriod.onchange = renderDashboard;

  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  if (btnThemeToggle) {
    applyTheme(getThemePreference());
    btnThemeToggle.onclick = toggleTheme;
  }

  const elDashVendedor = document.getElementById('dashboard-vendedor-filter');
  if (elDashVendedor) {
    elDashVendedor.onchange = renderDashboard;
    const user = obterUsuarioLogado();
    if (user && user.perfil === 'master') {
      popularSelectVendedores(elDashVendedor, true);
      elDashVendedor.options[0].text = 'Todos os Vendedores';
      elDashVendedor.disabled = false;
    } else if (user) {
      elDashVendedor.innerHTML = `<option value="${user.id}">${user.nome}</option>`;
      elDashVendedor.value = String(user.id);
      elDashVendedor.disabled = true;
    }
  }

  const elSearchVendas = document.getElementById('search-vendas');
  if (elSearchVendas) elSearchVendas.oninput = renderVendasTable;

  const elFilterStatus = document.getElementById('filter-vendas-status');
  if (elFilterStatus) elFilterStatus.onchange = renderVendasTable;

  const elFilterVendedor = document.getElementById('filter-vendas-vendedor');
  if (elFilterVendedor) {
    elFilterVendedor.onchange = renderVendasTable;
    const user = obterUsuarioLogado();
    if (user && user.perfil === 'master') {
      popularSelectVendedores(elFilterVendedor, true);
      elFilterVendedor.options[0].text = 'Todos os Vendedores';
      elFilterVendedor.disabled = false;
    } else if (user) {
      elFilterVendedor.innerHTML = `<option value="${user.id}">${user.nome}</option>`;
      elFilterVendedor.value = String(user.id);
      elFilterVendedor.disabled = true;
    }
  }

  const elFilterMonth = document.getElementById('filter-vendas-month');
  if (elFilterMonth) elFilterMonth.onchange = renderVendasTable;

  const debounce = (fn, wait = 180) => {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  const debouncedRenderClientes = debounce(renderClientesGrid, 180);

  const elSearchClientes = document.getElementById('search-clientes');
  if (elSearchClientes) elSearchClientes.oninput = debouncedRenderClientes;

  const elFilterClientesOferta = document.getElementById('filter-clientes-oferta');
  if (elFilterClientesOferta) {
    elFilterClientesOferta.oninput = debouncedRenderClientes;
    elFilterClientesOferta.onfocus = renderClientesGrid;
  }

  const btnClearClientesFilters = document.getElementById('btn-clear-clientes-filters');
  if (btnClearClientesFilters) {
    btnClearClientesFilters.onclick = () => {
      const elSearch = document.getElementById('search-clientes');
      const elOferta = document.getElementById('filter-clientes-oferta');
      if (elSearch) elSearch.value = '';
      if (elOferta) elOferta.value = '';
      window.__clientesGridPage = 1;
      window.__clientesGridLastSearch = '';
      renderClientesGrid();
    };
  }

  const btnClientesEnviarCampanha = document.getElementById('btn-clientes-enviar-campanha');
  const btnClientesCampanhaClose = document.getElementById('btn-clientes-campanha-close');
  const btnClientesCampanhaCancel = document.getElementById('btn-clientes-campanha-cancel');
  const btnClientesCampanhaEnviar = document.getElementById('btn-clientes-campanha-enviar');

  if (btnClientesEnviarCampanha) {
    btnClientesEnviarCampanha.onclick = () => {
      abrirModalDistribuicaoClientes().catch(err => {
        console.error('Erro ao abrir modal de distribuicao:', err);
        alert(err.message || 'Nao foi possivel abrir o modal de distribuicao.');
      });
    };
  }

  if (btnClientesCampanhaClose) btnClientesCampanhaClose.onclick = fecharModalDistribuicaoClientes;
  if (btnClientesCampanhaCancel) btnClientesCampanhaCancel.onclick = fecharModalDistribuicaoClientes;

  if (clientesCampanhaDestinoTipo) {
    clientesCampanhaDestinoTipo.onchange = () => {
      atualizarEstadoDestinoDistribuicao();
    };
  }

  if (clientesCampanhaVendedor) {
    clientesCampanhaVendedor.onchange = () => {
      atualizarResumoDistribuicao();
    };
  }

  if (btnClientesCampanhaUnlockVendedor) {
    btnClientesCampanhaUnlockVendedor.onclick = async () => {
      try {
        await desbloquearHistoricoDistribuicao('vendedor');
      } catch (err) {
        console.error('Erro ao desbloquear vendedor:', err);
        alert(err.message || 'Não foi possível desbloquear para o vendedor selecionado.');
      }
    };
  }

  if (btnClientesCampanhaUnlockOferta) {
    btnClientesCampanhaUnlockOferta.onclick = async () => {
      try {
        await desbloquearHistoricoDistribuicao('oferta');
      } catch (err) {
        console.error('Erro ao desbloquear observação:', err);
        alert(err.message || 'Não foi possível desbloquear esta observação.');
      }
    };
  }

  if (btnClientesCampanhaExportCsv) {
    btnClientesCampanhaExportCsv.onclick = () => {
      try {
        exportarRelatorioDistribuicaoCsv();
      } catch (err) {
        console.error('Erro ao exportar CSV da distribuicao:', err);
        alert(err.message || 'Nao foi possivel exportar o CSV.');
      }
    };
  }

  if (btnClientesCampanhaEnviar) {
    btnClientesCampanhaEnviar.onclick = async () => {
      const textoOriginal = btnClientesCampanhaEnviar.textContent;
      btnClientesCampanhaEnviar.disabled = true;
      btnClientesCampanhaEnviar.textContent = 'Distribuindo...';
      try {
        await distribuirClientesParaCampanha();
      } catch (err) {
        console.error('Erro ao distribuir clientes para campanha:', err);
        alert(err.message || 'Nao foi possivel distribuir os clientes.');
      } finally {
        btnClientesCampanhaEnviar.disabled = false;
        btnClientesCampanhaEnviar.textContent = textoOriginal;
      }
    };
  }

  const btnLeadsQuentes = document.getElementById('btn-card-leads-quentes');
  if (btnLeadsQuentes) {
    btnLeadsQuentes.onclick = () => {
      window.__vendasQuickFilter = 'leads_quentes';
      activateTab('vendas');
      renderVendasTable();
    };
  }

  const btnAcoesHoje = document.getElementById('btn-card-acoes-hoje');
  if (btnAcoesHoje) {
    btnAcoesHoje.onclick = () => {
      window.__vendasQuickFilter = 'acoes_hoje';
      activateTab('vendas');
      renderVendasTable();
    };
  }

  // == EXPORTAÇÕES ==
  const elExportDash = document.getElementById('btn-export-vendas-dash');
  if (elExportDash) elExportDash.onclick = () => exportToCSV('vendas');
  
  const elExportVendas = document.getElementById('btn-export-vendas');
  if (elExportVendas) elExportVendas.onclick = () => exportToCSV('vendas');

  const elExportClientes = document.getElementById('btn-export-clientes');
  if (elExportClientes) elExportClientes.onclick = () => exportToCSV('clientes');
  const elDedupe = document.getElementById('btn-dedupe-clientes');
  if (elDedupe) {
    const user = obterUsuarioLogado();
    if (user && user.perfil !== 'master') {
      elDedupe.style.display = 'none';
    } else {
      elDedupe.onclick = () => deduplicateClients();
    }
  }

  // == BOTÕES DE NOVO (MODAIS) ==
  const btnNovaVenda = document.getElementById('btn-nova-venda');
  if (btnNovaVenda) btnNovaVenda.onclick = () => showModal('venda');

  const btnNovoCliente = document.getElementById('btn-novo-cliente');
  if (btnNovoCliente) btnNovoCliente.onclick = () => showModal('cliente');

  const btnNovaComissao = document.getElementById('btn-nova-comissao');
  if (btnNovaComissao) btnNovaComissao.onclick = () => showModal('comissao');

  const btnNovaMeta = document.getElementById('btn-nova-meta');
  if (btnNovaMeta) btnNovaMeta.onclick = () => showModal('meta');

  // == HEADER: FORMS RÁPIDOS E NOTIFICAÇÕES ==
  const btnOpenForms = document.getElementById('btn-open-quick-forms');
  if (btnOpenForms) {
    btnOpenForms.onclick = () => {
      const panel = document.getElementById('quick-forms-panel');
      if (panel) panel.classList.remove('translate-x-full');
      if (window.lucide) lucide.createIcons();
    };
  }

  const btnCloseForms = document.getElementById('btn-close-quick-forms');
  if (btnCloseForms) {
    btnCloseForms.onclick = () => {
      const panel = document.getElementById('quick-forms-panel');
      if (panel) panel.classList.add('translate-x-full');
    };
  }

  const btnNotificacoes = document.getElementById('btn-notificacoes');
  if (btnNotificacoes) {
    btnNotificacoes.onclick = requestNotificationPermission;
  }

  // == EVENTOS DINÂMICOS (TABELAS E CARDS) ==
  document.body.addEventListener('click', async (e) => {
    const target = e.target.closest('.btn-edit, .btn-delete, .btn-view-profile, .btn-dismiss-lembrete, .btn-toggle-observacao, .btn-clientes-page, .btn-cadencia-touch');
    if (!target) return;

    if (target.classList.contains('btn-cadencia-touch')) {
      await registrarContatoRapido(target.dataset.id);
      return;
    }

    if (target.classList.contains('btn-clientes-page')) {
      const nextPage = Number(target.dataset.page || 1);
      if (!Number.isFinite(nextPage) || nextPage < 1) return;
      window.__clientesGridPage = nextPage;
      renderClientesGrid();
      return;
    }

    if (target.classList.contains('btn-toggle-observacao')) {
      const targetId = target.dataset.target;
      const expanded = target.dataset.expanded === 'true';
      const textEl = targetId ? document.getElementById(targetId) : null;
      if (!textEl) return;

      if (expanded) {
        textEl.style.display = '-webkit-box';
        textEl.style.webkitLineClamp = '3';
        textEl.style.webkitBoxOrient = 'vertical';
        textEl.style.overflow = 'hidden';
        target.dataset.expanded = 'false';
        target.textContent = 'Ver mais';
      } else {
        textEl.style.display = 'block';
        textEl.style.webkitLineClamp = '';
        textEl.style.webkitBoxOrient = '';
        textEl.style.overflow = 'visible';
        target.dataset.expanded = 'true';
        target.textContent = 'Ver menos';
      }
      return;
    }
    
    if (target.classList.contains('btn-edit')) {
      showModal(target.dataset.type, target.dataset.id);
    }
    if (target.classList.contains('btn-view-profile')) {
      showClientProfileModal(target.dataset.id);
    }
    if (target.classList.contains('btn-delete')) {
      const confirmed = await showConfirmModal('Excluir', 'Você realmente deseja excluir este item? Esta ação não pode ser desfeita.');
      if (confirmed) {
        await deleteData(target.dataset.type === 'comissao' ? 'comissoes' : `${target.dataset.type}s`, target.dataset.id);
        await renderAll();
      }
    }
    if (target.classList.contains('btn-dismiss-lembrete')) {
      const v = vendas.find(x => x.id == target.dataset.vendaId);
      if (v) {
        v.posVendaDismissed = v.posVendaDismissed || [];
        v.posVendaDismissed.push(parseInt(target.dataset.tipo, 10) || target.dataset.tipo);
        await updateData('vendas', v);
        await renderAll();
      }
    }
  });

  // == AÇÕES DE MODAIS ==
  const btnModalClose = document.getElementById('btn-modal-close');
  if (btnModalClose) btnModalClose.onclick = hideModal;

  const btnModalCancel = document.getElementById('btn-modal-cancel');
  if (btnModalCancel) btnModalCancel.onclick = hideModal;

  const modalForm = document.getElementById('modal-form');
  if (modalForm) modalForm.onsubmit = handleModalSave;

  const btnClientProfileClose = document.getElementById('btn-client-profile-close');
  if (btnClientProfileClose) btnClientProfileClose.onclick = hideClientProfileModal;

  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
  if (btnConfirmCancel) btnConfirmCancel.onclick = () => { if(deleteResolver) deleteResolver(false); hideConfirmModal(); };

  const btnConfirmDelete = document.getElementById('btn-confirm-delete');
  if (btnConfirmDelete) btnConfirmDelete.onclick = () => { if(deleteResolver) deleteResolver(true); hideConfirmModal(); };

  // == IMPORTAÇÃO DE CLIENTES ==
  const inputImport = document.querySelectorAll('input[id="input-import-clientes"]')[0];
  const btnsImportClientes = document.querySelectorAll('#btn-import-clientes');
  
  btnsImportClientes.forEach(btn => {
    btn.onclick = () => { if (inputImport) inputImport.click(); };
  });

  if (inputImport) {
    inputImport.onchange = async (e) => {
      if (e.target.files[0]) await handleImportClientesFile(e.target.files[0]);
      e.target.value = '';
    };
  }
  
  const btnImportCancel = document.getElementById('btn-import-clientes-cancel');
  if (btnImportCancel) btnImportCancel.onclick = hideImportClientesModal;

  const btnImportRun = document.getElementById('btn-import-clientes-run');
  if (btnImportRun) btnImportRun.onclick = runImportClientes;

  // == IMPORTAÇÃO DE VENDAS ==
  const inputImportVendas = document.getElementById('input-import-vendas');
  const btnImportVendas = document.getElementById('btn-import-vendas');
  
  if (btnImportVendas) {
    btnImportVendas.onclick = () => { if (inputImportVendas) inputImportVendas.click(); };
  }

  if (inputImportVendas) {
    inputImportVendas.onchange = async (e) => {
      if (e.target.files[0]) await handleImportVendasFile(e.target.files[0]);
      e.target.value = '';
    };
  }

  const btnImportVendasCancel = document.getElementById('btn-import-vendas-cancel');
  if (btnImportVendasCancel) btnImportVendasCancel.onclick = hideImportVendasModal;

  const btnImportVendasRun = document.getElementById('btn-import-vendas-run');
  if (btnImportVendasRun) btnImportVendasRun.onclick = runImportVendas;

  // == IMPORTAÇÃO DE CLIENTES (A PARTIR DA TAB VENDAS) ==
  const inputImportClientesVendas = document.getElementById('input-import-clientes-vendas');
  const btnImportClientesVendas = document.getElementById('btn-import-clientes-vendas');
  
  if (btnImportClientesVendas) {
    btnImportClientesVendas.onclick = () => { if (inputImportClientesVendas) inputImportClientesVendas.click(); };
  }

  if (inputImportClientesVendas) {
    inputImportClientesVendas.onchange = async (e) => {
      if (e.target.files[0]) await handleImportClientesFile(e.target.files[0]);
      e.target.value = '';
    };
  }

  // Esconder opções de importação para perfis que não são master
  try {
    const user = obterUsuarioLogado();
    const isMasterUser = user && user.perfil === 'master';
    if (!isMasterUser) {
      // esconder botões que disparam a importação
      btnsImportClientes.forEach(b => b.style.display = 'none');
      if (btnImportClientesVendas) btnImportClientesVendas.style.display = 'none';
      if (btnImportVendas) btnImportVendas.style.display = 'none';
    }
  } catch (e) {
    console.warn('Falha ao checar perfil para esconder import:', e);
  }

  // Inicializa a lógica complementar
  setupQuickFormListeners();
  if (typeof initCampanhasModule === 'function') {
    initCampanhasModule();
  }
}

function setupVendaFormListeners() {
  const statusSelect = document.getElementById('venda-status');
  const dataConclusaoContainer = document.getElementById('venda-data-conclusao-container');
  const dataConclusaoInput = document.getElementById('venda-dataConclusao');
  const motivoPerdaContainer = document.getElementById('venda-motivo-perda-container');
  const motivoPerdaInput = document.getElementById('venda-motivoPerda');
  const proximaAcaoInput = document.getElementById('venda-proximaAcao');
  const dataProximoContatoInput = document.getElementById('venda-dataProximoContato');
  const comissaoContainer = document.getElementById('venda-comissao-estimada');
  const comissaoValor = document.getElementById('venda-comissao-valor');
  const cadenciaResumo = document.getElementById('venda-cadencia-resumo');
  const scriptSugestao = document.getElementById('venda-scriptSugestao');
  const btnAplicarCadencia = document.getElementById('venda-aplicar-cadencia');
  const btnCopiarScript = document.getElementById('venda-script-copiar');

  const getCadenciaPorStatus = (status) => {
    const mapa = {
      'Negociando': { dias: 1, acao: 'Retornar com proposta resumida e validar principal objecao' },
      'Aguardando Aceite': { dias: 1, acao: 'Fazer follow-up do aceite e reforcar prazo da condicao' },
      'Inputado': { dias: 2, acao: 'Confirmar documentos enviados e alinhar proximo marco' },
      'Aguardando fatura': { dias: 3, acao: 'Validar recebimento da fatura e confirmar pagamento' },
      'Aguardando Distribuidora': { dias: 3, acao: 'Atualizar cliente sobre prazo da distribuidora' }
    };
    return mapa[status] || { dias: 2, acao: 'Realizar follow-up comercial' };
  };

  const addDaysIso = (days) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (Number(days) || 0));
    return d.toISOString().split('T')[0];
  };

  const buildScriptSugestao = () => {
    const clienteNome = (document.getElementById('venda-clienteNome')?.value || 'cliente').trim();
    const produto = (document.getElementById('venda-produto')?.value || 'proposta').trim();
    const operadora = (document.getElementById('venda-operadora')?.value || '').trim();
    const status = statusSelect.value;
    const cfg = getCadenciaPorStatus(status);
    const sufixo = operadora ? ` / ${operadora}` : '';
    return `Oi ${clienteNome}, tudo bem? Passando para ${cfg.acao.toLowerCase()}.\nSobre ${produto}${sufixo}, posso te enviar um resumo objetivo agora e alinharmos hoje?`;
  };

  const atualizarAssistenteCadencia = (forcarAplicacao = false) => {
    const status = statusSelect.value;
    const statusFinal = ['Concluído', 'Cancelado'].includes(status);
    const cfg = getCadenciaPorStatus(status);

    if (cadenciaResumo) {
      cadenciaResumo.textContent = statusFinal
        ? 'Venda em status final. Cadencia automatica nao e necessaria.'
        : `Sugestao: ${cfg.acao} • proximo contato em ${cfg.dias} dia(s).`;
    }

    if (scriptSugestao) {
      scriptSugestao.value = statusFinal
        ? 'Sem script sugerido para status finalizado.'
        : buildScriptSugestao();
    }

    if (btnAplicarCadencia) {
      btnAplicarCadencia.disabled = statusFinal;
      btnAplicarCadencia.classList.toggle('opacity-60', statusFinal);
    }

    if (!statusFinal && (forcarAplicacao || !proximaAcaoInput?.value.trim())) {
      if (proximaAcaoInput) proximaAcaoInput.value = cfg.acao;
    }
    if (!statusFinal && (forcarAplicacao || !dataProximoContatoInput?.value)) {
      if (dataProximoContatoInput) dataProximoContatoInput.value = addDaysIso(cfg.dias);
    }
  };

  if (!statusSelect) return;
  if (!statusSelect.dataset.listenersAttached) {
    statusSelect.dataset.listenersAttached = '1';

    statusSelect.addEventListener('change', () => {
      if (statusSelect.value === 'Concluído') {
        if (dataConclusaoContainer) dataConclusaoContainer.classList.remove('hidden');
        if (dataConclusaoInput && !dataConclusaoInput.value) dataConclusaoInput.value = new Date().toISOString().split('T')[0];
      } else {
        if (dataConclusaoContainer) dataConclusaoContainer.classList.add('hidden');
        if (dataConclusaoInput) dataConclusaoInput.value = '';
      }

      if (statusSelect.value === 'Cancelado') {
        if (motivoPerdaContainer) motivoPerdaContainer.classList.remove('hidden');
      } else {
        if (motivoPerdaContainer) motivoPerdaContainer.classList.add('hidden');
        if (motivoPerdaInput) motivoPerdaInput.value = '';
      }

      const statusFinal = ['Concluído', 'Cancelado'].includes(statusSelect.value);
      if (proximaAcaoInput) proximaAcaoInput.required = !statusFinal;
      if (dataProximoContatoInput) dataProximoContatoInput.required = !statusFinal;
      atualizarAssistenteCadencia(false);
    });

    const inputs = ['venda-produto','venda-operadora','venda-tipoCliente','venda-valorVenda','venda-vendedor_id'].map(id => document.getElementById(id)).filter(Boolean);
    const updateEstimativa = () => {
      const vendedorSelecionado = document.getElementById('venda-vendedor_id')?.value;
      const user = obterUsuarioLogado();
      const vendedorEstimado = vendedorSelecionado
        ? parseInt(vendedorSelecionado, 10)
        : (user && user.perfil === 'vendedor' ? Number(user.id) : null);

      const vendaParcial = {
        produto: (document.getElementById('venda-produto')?.value) || '',
        operadora: (document.getElementById('venda-operadora')?.value) || '',
        tipoCliente: (document.getElementById('venda-tipoCliente')?.value) || '',
        valorVenda: (document.getElementById('venda-valorVenda')?.value) || 0,
        vendedor_id: Number.isNaN(vendedorEstimado) ? null : vendedorEstimado
      };
      if (vendaParcial.produto && vendaParcial.operadora && vendaParcial.tipoCliente && Number(vendaParcial.valorVenda) > 0) {
        const com = calcularComissao(vendaParcial);
        if (comissaoValor) comissaoValor.textContent = formatCurrency(com);
        if (comissaoContainer) comissaoContainer.classList.remove('hidden');
      } else {
        if (comissaoContainer) comissaoContainer.classList.add('hidden');
      }
    };
    
    inputs.forEach(inp => inp.addEventListener('input', updateEstimativa));
    inputs.forEach(inp => inp.addEventListener('change', updateEstimativa));

    if (btnAplicarCadencia) {
      btnAplicarCadencia.addEventListener('click', () => {
        atualizarAssistenteCadencia(true);
        showQuickMessage('Cadencia aplicada para esta etapa.');
      });
    }

    if (btnCopiarScript) {
      btnCopiarScript.addEventListener('click', async () => {
        try {
          const content = (scriptSugestao?.value || '').trim();
          if (!content) return;
          await navigator.clipboard.writeText(content);
          showQuickMessage('Script de abordagem copiado.');
        } catch (err) {
          console.error('Falha ao copiar script de venda:', err);
          showQuickMessage('Nao foi possivel copiar o script.', true);
        }
      });
    }

    ['venda-clienteNome', 'venda-produto', 'venda-operadora'].forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (!field) return;
      field.addEventListener('input', () => atualizarAssistenteCadencia(false));
      field.addEventListener('change', () => atualizarAssistenteCadencia(false));
    });

    statusSelect.dispatchEvent(new Event('change'));
  }
}

async function registrarContatoRapido(vendaId) {
  const idNum = Number(vendaId);
  const venda = (vendas || []).find(v => Number(v.id) === idNum);
  if (!venda) return;

  const mapa = {
    'Negociando': { dias: 1, acao: 'Retornar com proposta resumida e validar principal objecao' },
    'Aguardando Aceite': { dias: 1, acao: 'Fazer follow-up do aceite e reforcar prazo da condicao' },
    'Inputado': { dias: 2, acao: 'Confirmar documentos enviados e alinhar proximo marco' },
    'Aguardando fatura': { dias: 3, acao: 'Validar recebimento da fatura e confirmar pagamento' },
    'Aguardando Distribuidora': { dias: 3, acao: 'Atualizar cliente sobre prazo da distribuidora' }
  };
  const cfg = mapa[venda.status] || { dias: 2, acao: 'Realizar follow-up comercial' };

  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const hoje = d.toISOString().split('T')[0];
  d.setDate(d.getDate() + cfg.dias);
  const proximaData = d.toISOString().split('T')[0];

  await updateData('vendas', {
    ...venda,
    proximaAcao: venda.proximaAcao || cfg.acao,
    dataProximoContato: proximaData,
    ultimaInteracao: hoje
  });

  await renderAll();
  showQuickMessage('Contato registrado e proximo follow-up reagendado.');
}

function setupQuickFormListeners() {
  setupClienteAutocomplete('qf-venda-clienteNome','qf-venda-clienteId','qf-venda-clienteNome-hint');

  const qfCliente = document.getElementById('quick-form-cliente');
  if (qfCliente) {
    // Configura listener para buscar dados do CNPJ no formulário rápido
    setupCNPJListener('qf-cliente-cpfCnpj', 'quick');
    setupClienteEnergiaToggle('qf-cliente');
    
    qfCliente.onsubmit = async (e) => {
      e.preventDefault();
      const cnpjInput = document.getElementById('qf-cliente-cpfCnpj');
      const data = { 
        nome: document.getElementById('qf-cliente-nome').value, 
        cpfCnpj: cnpjInput.value, 
        telefone: document.getElementById('qf-cliente-telefone').value, 
        email: document.getElementById('qf-cliente-email').value || '',
        dataNascimento: document.getElementById('qf-cliente-dataNascimento').value || '',
        coelba: document.getElementById('qf-cliente-coelba')?.checked === true,
        placaSolar: document.getElementById('qf-cliente-placaSolar')?.checked === true,
        excedente: document.getElementById('qf-cliente-excedente-sim')?.checked ? 'Sim' : (document.getElementById('qf-cliente-excedente-nao')?.checked ? 'Nao' : ''),
        vendedor_id: obterIdUsuario(),
        endereco: {
          cep: document.getElementById('qf-cliente-cep')?.value || '',
          logradouro: document.getElementById('qf-cliente-logradouro')?.value || '',
          numero: document.getElementById('qf-cliente-numero')?.value || '',
          complemento: document.getElementById('qf-cliente-complemento')?.value || '',
          bairro: document.getElementById('qf-cliente-bairro')?.value || '',
          cidade: document.getElementById('qf-cliente-cidade')?.value || '',
          uf: document.getElementById('qf-cliente-uf')?.value || ''
        }
      };
      try { 
        await addData('clientes', data); 
        showQuickMessage('Cliente Salvo!'); 
        e.target.reset(); 
        document.getElementById('qf-cliente-placaSolar')?.dispatchEvent(new Event('change'));
        await renderAll(); 
      } catch(err) { showQuickMessage('Erro', true); }
    };
  }

  const qfVenda = document.getElementById('quick-form-venda');
  if (qfVenda) {
    const qfStatus = document.getElementById('qf-venda-status');
    const qfDataConclusao = document.getElementById('qf-venda-dataConclusao');
    const qfMotivoWrap = document.getElementById('qf-venda-motivoPerda-wrap');
    const qfMotivo = document.getElementById('qf-venda-motivoPerda');
    const qfProximaAcao = document.getElementById('qf-venda-proximaAcao');
    const qfProximoContato = document.getElementById('qf-venda-dataProximoContato');

    if (qfStatus && !qfStatus.dataset.listenersAttached) {
      qfStatus.dataset.listenersAttached = '1';
      qfStatus.addEventListener('change', () => {
        const status = qfStatus.value;
        if (qfDataConclusao) {
          qfDataConclusao.classList.toggle('hidden', status !== 'Concluído');
          if (status === 'Concluído' && !qfDataConclusao.value) {
            qfDataConclusao.value = new Date().toISOString().split('T')[0];
          }
          if (status !== 'Concluído') {
            qfDataConclusao.value = '';
          }
        }
        if (qfMotivoWrap) qfMotivoWrap.classList.toggle('hidden', status !== 'Cancelado');
        if (status !== 'Cancelado' && qfMotivo) qfMotivo.value = '';

        const statusFinal = ['Concluído', 'Cancelado'].includes(status);
        if (qfProximaAcao) qfProximaAcao.required = !statusFinal;
        if (qfProximoContato) qfProximoContato.required = !statusFinal;
      });
      qfStatus.dispatchEvent(new Event('change'));
    }

    qfVenda.onsubmit = async (e) => {
      e.preventDefault();
      const status = document.getElementById('qf-venda-status').value;
      const proximaAcao = document.getElementById('qf-venda-proximaAcao').value.trim();
      const dataProximoContato = document.getElementById('qf-venda-dataProximoContato').value;
      const motivoPerda = document.getElementById('qf-venda-motivoPerda').value;
      const dataConclusao = document.getElementById('qf-venda-dataConclusao').value;

      if (!['Concluído', 'Cancelado'].includes(status) && (!proximaAcao || !dataProximoContato)) {
        showQuickMessage('Informe proxima acao e data do proximo contato.', true);
        return;
      }
      if (status === 'Cancelado' && !motivoPerda) {
        showQuickMessage('Selecione o motivo da perda para vendas canceladas.', true);
        return;
      }
      if (status === 'Concluído' && !dataConclusao) {
        showQuickMessage('Informe a data de conclusao para vendas concluidas.', true);
        return;
      }

      const hoje = new Date().toISOString().split('T')[0];
      const data = { 
        vendedor_id: obterIdUsuario(),
        clienteId: parseInt(document.getElementById('qf-venda-clienteId').value), 
        produto: document.getElementById('qf-venda-produto').value, 
        operadora: document.getElementById('qf-venda-operadora').value, 
        valorVenda: document.getElementById('qf-venda-valorVenda').value, 
        tipoCliente: document.getElementById('qf-venda-tipoCliente').value,
        status,
        dataConclusao,
        proximaAcao,
        dataProximoContato,
        motivoPerda: status === 'Cancelado' ? motivoPerda : '',
        observacao: document.getElementById('qf-venda-observacao').value,
        dataRegistro: hoje,
        dataMudancaStatus: hoje,
        ultimaInteracao: hoje
      };
      try { 
        await addData('vendas', data); 
        showQuickMessage('Venda Salva!'); 
        e.target.reset(); 
        if (qfStatus) qfStatus.dispatchEvent(new Event('change'));
        await renderAll(); 
      } catch(err) { showQuickMessage('Erro', true); }
    };
  }
}

async function handleModalSave(e) {
  e.preventDefault();
  const type = modalTypeInput.value;
  
  // Se é usuário, usar handler especial
  if (type === 'usuario') {
    await handleSalvarUsuario();
    return;
  }
  
  const id = editingIdInput.value;
  const store = type === 'comissao' ? 'comissoes' : `${type}s`;
  let data = {};

  if (type === 'cliente') {
    data = { 
      nome: document.getElementById('cliente-nome').value, 
      cpfCnpj: document.getElementById('cliente-cpfCnpj').value, 
      telefone: document.getElementById('cliente-telefone').value,
      email: document.getElementById('cliente-email').value,
      dataNascimento: document.getElementById('cliente-dataNascimento').value,
      contaContrato: document.getElementById('cliente-contaContrato').value,
      coelba: document.getElementById('cliente-coelba')?.checked === true,
      placaSolar: document.getElementById('cliente-placaSolar')?.checked === true,
      excedente: document.getElementById('cliente-excedente-sim')?.checked ? 'Sim' : (document.getElementById('cliente-excedente-nao')?.checked ? 'Nao' : ''),
      endereco: {
        cep: document.getElementById('cliente-cep').value,
        logradouro: document.getElementById('cliente-logradouro').value,
        numero: document.getElementById('cliente-numero').value,
        complemento: document.getElementById('cliente-complemento').value,
        bairro: document.getElementById('cliente-bairro').value,
        cidade: document.getElementById('cliente-cidade').value,
        uf: document.getElementById('cliente-uf').value
      }
    };
    // novo campo: meses desde a última venda
    const mesesEl = document.getElementById('cliente-mesesDesdeUltimaVenda');
    if (mesesEl && mesesEl.value !== '') {
      data.mesesDesdeUltimaVenda = parseInt(mesesEl.value, 10) || 0;
    }
    // se campo de vendedor estiver disponível (master), pegar valor
    const vendedorEl = document.getElementById('cliente-vendedor_id');
    if (vendedorEl && vendedorEl.value) {
      data.vendedor_id = parseInt(vendedorEl.value, 10);
    }
    // Se é novo cliente e não foi definido pelo master, adicionar vendedor_id
    if (!id && data.vendedor_id == null) {
      const uid = obterIdUsuario();
      if (uid) data.vendedor_id = parseInt(uid, 10);
    }
  } else if (type === 'venda') {
    const existing = id ? vendas.find(v => Number(v.id) === Number(id)) : null;
    const user = obterUsuarioLogado();
    const vendedorEl = document.getElementById('venda-vendedor_id');
    const vendedorSelecionado = vendedorEl && vendedorEl.value ? parseInt(vendedorEl.value, 10) : null;
    const statusVenda = document.getElementById('venda-status').value;
    const proximaAcao = document.getElementById('venda-proximaAcao').value.trim();
    const dataProximoContato = document.getElementById('venda-dataProximoContato').value;
    const motivoPerda = document.getElementById('venda-motivoPerda').value;
    const dataConclusao = document.getElementById('venda-dataConclusao').value;
    const hoje = new Date().toISOString().split('T')[0];

    if (user && user.perfil === 'master' && !vendedorSelecionado) {
      showModalError('Selecione o vendedor da venda.');
      return;
    }

    if (!['Concluído', 'Cancelado'].includes(statusVenda) && (!proximaAcao || !dataProximoContato)) {
      showModalError('Informe a proxima acao e a data do proximo contato para vendas em andamento.');
      return;
    }

    if (statusVenda === 'Cancelado' && !motivoPerda) {
      showModalError('Selecione um motivo de perda para status Cancelado.');
      return;
    }

    if (statusVenda === 'Concluído' && !dataConclusao) {
      showModalError('Preencha a data de conclusao para vendas concluidas.');
      return;
    }

    data = { 
      clienteId: parseInt(document.getElementById('venda-clienteId').value), 
      produto: document.getElementById('venda-produto').value, 
      operadora: document.getElementById('venda-operadora').value, 
      valorVenda: document.getElementById('venda-valorVenda').value, 
      status: statusVenda,
      tipoCliente: document.getElementById('venda-tipoCliente').value, 
      dataConclusao,
      proximaAcao,
      dataProximoContato,
      motivoPerda: statusVenda === 'Cancelado' ? motivoPerda : '',
      observacao: document.getElementById('venda-observacao').value,
      dataRegistro: existing ? existing.dataRegistro : hoje,
      dataMudancaStatus: (!existing || existing.status !== statusVenda) ? hoje : (existing.dataMudancaStatus || existing.dataRegistro || hoje),
      ultimaInteracao: hoje,
      posVendaDismissed: existing ? (existing.posVendaDismissed || []) : []
    };

    if (vendedorSelecionado) {
      data.vendedor_id = vendedorSelecionado;
    } else if (!id) {
      data.vendedor_id = obterIdUsuario();
    } else if (existing) {
      data.vendedor_id = existing.vendedor_id;
    }
  } else if (type === 'comissao') {
    const vendedorIdEl = document.getElementById('comissao-vendedor_id');
    const vendedorIdValue = vendedorIdEl ? vendedorIdEl.value : '';
    // Se master seleciona um vendedor específico, usa esse; senão deixa em branco (global)
    // Se vendedor, não pode selecionar (será preenchido automaticamente com seu ID)
    const user = obterUsuarioLogado();
    data = { 
      produto: document.getElementById('comissao-produto').value, 
      operadora: document.getElementById('comissao-operadora').value, 
      comissao: document.getElementById('comissao-comissao').value, 
      tipoCliente: document.getElementById('comissao-tipoCliente').value
    };
    // Se é vendedor, atribui sua comissão ao seu perfil
    if (user && user.perfil === 'vendedor') {
      data.vendedor_id = user.id;
    } else if (vendedorIdValue) {
      // Se é master e selecionou um vendedor, atribui a ele
      data.vendedor_id = parseInt(vendedorIdValue);
    }
    // Se master não selecionou vendedor, deixa sem vendedor_id (global)
  } else if (type === 'meta') {
    const user = obterUsuarioLogado();
    const vendedorIdEl = document.getElementById('meta-vendedor_id');
    const vendedorIdValue = vendedorIdEl ? vendedorIdEl.value : '';
    data = {
      mes: document.getElementById('meta-mes').value,
      ano: document.getElementById('meta-ano').value,
      valorMeta: document.getElementById('meta-valorMeta').value,
      comissaoMeta: document.getElementById('meta-comissaoMeta').value
    };

    if (user && user.perfil === 'vendedor') {
      data.vendedor_id = user.id;
    } else if (vendedorIdValue) {
      data.vendedor_id = parseInt(vendedorIdValue, 10);
    }
  }

  if (id) { 
      data.id = parseInt(id); 
      // Se for edição de cliente, preserva outros dados
      if (type === 'cliente') {
          const old = clientes.find(c => c.id === data.id) || {};
          data.importedAt = old.importedAt;
      }
      await updateData(store, data); 
  } else {
      await addData(store, data);
  }
  
  hideModal();
  await renderAll();
}

async function requestNotificationPermission() {
  const btnNotificacoes = document.getElementById('btn-notificacoes');
  const labelNotificacoes = document.getElementById('label-notificacoes');
  
  if (!('Notification' in window)) { 
    alert('Este navegador não suporta notificações de desktop'); 
    return; 
  }
  
  if (Notification.permission === 'granted') {
    new Notification('Notificações já ativadas!', { body: 'Você já está recebendo lembretes.', icon: '🔔' });
    if (btnNotificacoes) btnNotificacoes.classList.add('bg-green-500/20','text-green-400','border','border-green-500/30');
    if (labelNotificacoes) labelNotificacoes.textContent = 'Notificações Ativas';
  } else if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('Notificações Ativadas!', { body: 'Você receberá lembretes de pós-venda.', icon: '🔔' });
      if (btnNotificacoes) btnNotificacoes.classList.add('bg-green-500/20','text-green-400','border','border-green-500/30');
      if (labelNotificacoes) labelNotificacoes.textContent = 'Notificações Ativas';
    }
  }
}

function exportToCSV(type) { 
  let dataExport = [], headers = [], filename = 'export.csv';

  // sempre aplicar filtro local adicional para vendedores (redundância de segurança)
  const user = obterUsuarioLogado();
  let clientesBase = clientes;
  let vendasBase = vendas;
  if (user && user.perfil === 'vendedor') {
    if (!user.id) {
      console.warn('exportToCSV: usuário sem ID (sessão possivelmente expirada)');
    }
    clientesBase = clientes.filter(c => c.vendedor_id === user.id);
    vendasBase = vendas.filter(v => v.vendedor_id === user.id);
  }

  if (type === 'vendas') {
    headers = ['Data','Cliente','Produto','Operadora','Tipo Cliente','Valor','Comissão','Status'];
    dataExport = vendasBase.map(v => {
      const cliente = clientesBase.find(c => c.id === v.clienteId);
      return [v.dataConclusao || v.dataRegistro, cliente?.nome || 'N/A', v.produto, v.operadora, v.tipoCliente, v.valorVenda, (calcularComissao(v)||0).toFixed(2), v.status];
    });
    filename = 'vendas.csv';
  } else if (type === 'clientes') {
    headers = ['CPF/CNPJ','Nome','Telefone','Email','Aniversário'];
    dataExport = clientesBase.map(c => [c.cpfCnpj||'', c.nome||'', c.telefone||'', c.email||'', c.dataNascimento||'']);
    filename = 'clientes.csv';
  }

  const csvContent = [headers.join(','), ...dataExport.map(row => row.map(cell => `"${String(cell||'').replace(/"/g,'""')}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

async function handleImportClientesFile(file) {
  try {
    if (!window.XLSX) throw new Error('Biblioteca XLSX não carregou. Verifique sua internet.');
    const ext = (file.name || '').toLowerCase();
    let rows = [];

    const decodeCsvTextSmart = async (inputFile) => {
      const buffer = await inputFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const win1252 = new TextDecoder('windows-1252', { fatal: false }).decode(bytes);

      const score = (text) => {
        const replacementCount = (text.match(/�/g) || []).length;
        const length = Math.max(text.length, 1);
        return replacementCount / length;
      };

      // Se UTF-8 vier com muitos caracteres de substituição, prefere Windows-1252.
      return score(win1252) < score(utf8) ? win1252 : utf8;
    };

    if (ext.endsWith('.csv')) {
      const text = await decodeCsvTextSmart(file);
      const wb = XLSX.read(text, { type: 'string' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }
    if (!rows || !rows.length) throw new Error('Arquivo sem dados (0 linhas).');
    importRowsCache = rows;
    importHeadersCache = Object.keys(rows[0] || {});
    if (!importHeadersCache.length) throw new Error('Não foi possível ler o cabeçalho da planilha.');

    const defaults = autoMapHeaders(importHeadersCache);
    Object.keys(importMappings).forEach(key => fillSelectOptions(importMappings[key], importHeadersCache, defaults[key]));

    Object.values(importMappings).forEach(sel => { if (sel) sel.onchange = () => updateImportPreview(); });
    updateImportPreview();
    showImportClientesModal();
  } catch (err) {
    console.error(err);
    alert('Erro ao importar: ' + (err.message || err));
  }
}

async function runImportClientes() {
  try {
    importClientesRunning = true;
    const btnRun = document.getElementById('btn-import-clientes-run');
    const btnCancel = document.getElementById('btn-import-clientes-cancel');
    const btnClose = document.getElementById('btn-import-clientes-close');
    const originalRunText = btnRun ? btnRun.textContent : 'Importar';
    if (btnRun) { btnRun.disabled = true; btnRun.textContent = 'Importando...'; }
    if (btnCancel) btnCancel.disabled = true;
    if (btnClose) btnClose.disabled = true;

    const userId = obterIdUsuario();
    if (!userId) throw new Error('Sessão expirada ou usuário não identificado. Faça login novamente.');

    if (!importRowsCache.length) throw new Error('Nenhuma linha carregada. Selecione um arquivo.');
    if (!importMappings.cpfCnpj.value) throw new Error('Mapeie a coluna de CPF/CNPJ (obrigatório).');

    const byDoc = new Map();
    clientes.forEach(c => {
      const d = normalizeDoc(c.cpfCnpj);
      if (d) byDoc.set(d, c);
    });

    let created = 0, updated = 0, duplicated = 0;

    const cleanCellValue = (value) => repairTextArtifacts(String(value ?? '').replace(/\u0000/g, '')).trim();
    const firstNonEmpty = (row, aliases = []) => {
      for (const key of aliases) {
        if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
        const val = cleanCellValue(row[key]);
        if (val) return val;
      }
      return '';
    };
    const mappedOrAlias = (row, mapKey, aliases = []) => {
      const mapped = cleanCellValue(getMappedValue(row, mapKey));
      if (mapped) return mapped;
      return firstNonEmpty(row, aliases);
    };
    const toIntSafe = (value) => {
      const v = cleanCellValue(value);
      if (!v) return 0;
      const n = parseInt(v.replace(/[^\d-]/g, ''), 10);
      return Number.isFinite(n) ? n : 0;
    };

    const processedDocs = new Set();
    const createBatch = [];
    const updateBatch = [];

    for (const row of importRowsCache) {
      const doc = normalizeDoc(mappedOrAlias(row, 'cpfCnpj', ['NR_CNPJ', 'CNPJ', 'CPF/CNPJ', 'CPF']));
      if (!doc) continue;
      if (processedDocs.has(doc)) {
        duplicated++;
        continue;
      }
      processedDocs.add(doc);

      const tipoProduto = mappedOrAlias(row, 'tipoProduto', ['TP_PRODUTO', 'TIPO_PRODUTO', 'TIPO PRODUTO']);
      const qtMovelDireto = mappedOrAlias(row, 'qtMovel', ['QT_MOVEL', 'QTD_MOVEL', 'QNT_MOVEL']);
      const qtMovel = qtMovelDireto
        ? toIntSafe(qtMovelDireto)
        : (
            toIntSafe(firstNonEmpty(row, ['QT_MOVEL_TERM'])) +
            toIntSafe(firstNonEmpty(row, ['QT_MOVEL_PEN'])) +
            toIntSafe(firstNonEmpty(row, ['QT_MOVEL_M2M'])) +
            toIntSafe(firstNonEmpty(row, ['QT_MOVEL_FWT']))
          );
      const quantidadeBasicaBL = toIntSafe(mappedOrAlias(row, 'quantidadeBasicaBL', ['QT_BASICA_BL', 'QNT_BASICA_BL', 'QTD_BASICA_BL']));
      const nomeContatoSFA = firstNonEmpty(row, ['NM_CONTATO_SFA', 'NOME_CONTATO_SFA', 'NOME CONTATO SFA']);
      const observacaoImportada = firstNonEmpty(row, ['RECOMENDACAO', 'OBSERVACAO', 'OBS', 'BQ']);

      const clientePayload = {
        cpfCnpj: doc,
        nome: cleanCellValue(mappedOrAlias(row, 'nome', ['NM_CLIENTE', 'NOME_CLIENTE', 'RAZAO SOCIAL'])) || doc,
        telefone: normalizePhone(mappedOrAlias(row, 'telefone', ['CELULAR_CONTATO_PRINCIPAL_SFA', 'TLFN_1', 'TEL_CELULAR_SIEBEL', 'TEL_COMERCIAL_SIEBEL'])),
        email: cleanCellValue(mappedOrAlias(row, 'email', ['EMAIL_CONTATO_PRINCIPAL_SFA', 'EMAIL_SIEBEL', 'EMAIL'])),
        dataNascimento: excelDateToISO(getMappedValue(row,'dataNascimento')),
        contaContrato: String(getMappedValue(row,'contaContrato') || '').trim(),
        nomeContatoSFA,
        tipoProduto,
        qtMovel,
        quantidadeBasicaBL,
        observacao: observacaoImportada,
        endereco: {
          cep: cleanCellValue(mappedOrAlias(row, 'cep', ['NR_CEP', 'CEP'])),
          logradouro: cleanCellValue(mappedOrAlias(row, 'logradouro', ['DS_ENDERECO', 'ENDERECO', 'ENDEREÇO'])),
          numero: cleanCellValue(mappedOrAlias(row, 'numero', ['NUMERO', 'NR_NUMERO'])),
          complemento: String(getMappedValue(row,'complemento') || '').trim(),
          bairro: String(getMappedValue(row,'bairro') || '').trim(),
          cidade: cleanCellValue(mappedOrAlias(row, 'cidade', ['DS_CIDADE', 'CIDADE'])),
          uf: String(getMappedValue(row,'uf') || '').trim(),
        },
        importedAt: new Date().toISOString()
      };

      const existing = byDoc.get(doc);
      if (!existing) {
          const uid = obterIdUsuario();
          if (uid) clientePayload.vendedor_id = parseInt(uid, 10);
        createBatch.push(clientePayload);
        byDoc.set(doc, { ...clientePayload, id: -1 });
        created++;
      } else if (existing && existing.id) {
        // Cliente já existe - atualizar dados sem duplicar
        const merged = JSON.parse(JSON.stringify(existing));
        merged.nome = merged.nome || clientePayload.nome;
        merged.telefone = merged.telefone || clientePayload.telefone;
        merged.email = merged.email || clientePayload.email;
        merged.nomeContatoSFA = merged.nomeContatoSFA || clientePayload.nomeContatoSFA;
        merged.tipoProduto = merged.tipoProduto || clientePayload.tipoProduto;
        merged.qtMovel = Number(merged.qtMovel || 0) || Number(clientePayload.qtMovel || 0);
        merged.quantidadeBasicaBL = Number(merged.quantidadeBasicaBL || 0) || Number(clientePayload.quantidadeBasicaBL || 0);
        merged.observacao = merged.observacao || clientePayload.observacao;
        merged.dataNascimento = merged.dataNascimento || clientePayload.dataNascimento;
        merged.contaContrato = merged.contaContrato || clientePayload.contaContrato;
        merged.endereco = merged.endereco || {};
        const end = merged.endereco;
        end.cep = end.cep || clientePayload.endereco.cep;
        end.logradouro = end.logradouro || clientePayload.endereco.logradouro;
        end.numero = end.numero || clientePayload.endereco.numero;
        end.complemento = end.complemento || clientePayload.endereco.complemento;
        end.bairro = end.bairro || clientePayload.endereco.bairro;
        end.cidade = end.cidade || clientePayload.endereco.cidade;
        end.uf = end.uf || clientePayload.endereco.uf;
        merged.importedAt = clientePayload.importedAt;

        // Preserva vendedor existente; apenas atualiza campos de dados.
        updateBatch.push({ id: merged.id, payload: merged });
        byDoc.set(doc, merged);
        updated++;
      }
    }

    // Envia em blocos para evitar milhares de requisições individuais.
    const chunkSize = 300;
    let createOffset = 0;
    let updateOffset = 0;
    const totalToSend = createBatch.length + updateBatch.length;
    let sentSoFar = 0;
    setImportClientesProgress(2, `Preparando ${totalToSend} registro(s) para envio...`);

    while (createOffset < createBatch.length || updateOffset < updateBatch.length) {
      const createChunk = createBatch.slice(createOffset, createOffset + chunkSize);
      const updateChunk = updateBatch.slice(updateOffset, updateOffset + chunkSize);
      await bulkUpsertClientes(createChunk, updateChunk);
      createOffset += createChunk.length;
      updateOffset += updateChunk.length;
      sentSoFar += createChunk.length + updateChunk.length;

      const percent = totalToSend > 0
        ? Math.min(98, Math.round((sentSoFar / totalToSend) * 100))
        : 98;
      setImportClientesProgress(percent, `Processados ${sentSoFar} de ${totalToSend} registro(s)...`);

      // Mantém a UI responsiva entre lotes grandes.
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    setImportClientesProgress(100, 'Importação finalizada com sucesso. Atualizando tela...');
    await renderAll();
    hideImportClientesModal(true);
    showQuickMessage(`Importação: ${created} novo(s), ${updated} atualizado(s), ${duplicated} duplicado(s) ignorado(s).`);

    if (btnRun) { btnRun.disabled = false; btnRun.textContent = originalRunText; }
    if (btnCancel) btnCancel.disabled = false;
    if (btnClose) btnClose.disabled = false;
    importClientesRunning = false;
  } catch (err) {
    console.error(err);
    setImportClientesProgress(0, 'Falha na importação.');
    if (importClientesError) { importClientesError.textContent = err.message || String(err); importClientesError.classList.remove('hidden'); }
    else alert('Erro: ' + (err.message || err));

    const btnRun = document.getElementById('btn-import-clientes-run');
    const btnCancel = document.getElementById('btn-import-clientes-cancel');
    const btnClose = document.getElementById('btn-import-clientes-close');
    if (btnRun) { btnRun.disabled = false; btnRun.textContent = 'Importar'; }
    if (btnCancel) btnCancel.disabled = false;
    if (btnClose) btnClose.disabled = false;
    importClientesRunning = false;
  }
}

// == FUNÇÕES DE IMPORTAÇÃO DE VENDAS ==
async function handleImportVendasFile(file) {
  try {
    if (!window.XLSX) throw new Error('Biblioteca XLSX não carregou. Verifique sua internet.');
    const ext = (file.name || '').toLowerCase();
    let rows = [];

    const decodeCsvTextSmart = async (inputFile) => {
      const buffer = await inputFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const win1252 = new TextDecoder('windows-1252', { fatal: false }).decode(bytes);

      const score = (text) => {
        const replacementCount = (text.match(/�/g) || []).length;
        const length = Math.max(text.length, 1);
        return replacementCount / length;
      };

      return score(win1252) < score(utf8) ? win1252 : utf8;
    };

    if (ext.endsWith('.csv')) {
      const text = await decodeCsvTextSmart(file);
      const wb = XLSX.read(text, { type: 'string' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }
    if (!rows || !rows.length) throw new Error('Arquivo sem dados (0 linhas).');
    importVendasRowsCache = rows;
    importVendasHeadersCache = Object.keys(rows[0] || {});
    if (!importVendasHeadersCache.length) throw new Error('Não foi possível ler o cabeçalho da planilha.');

    const defaults = autoMapHeadersVendas(importVendasHeadersCache);
    Object.keys(importVendasMappings).forEach(key => fillSelectOptions(importVendasMappings[key], importVendasHeadersCache, defaults[key]));

    Object.values(importVendasMappings).forEach(sel => { if (sel) sel.onchange = () => updateImportVendasPreview(); });
    updateImportVendasPreview();
    showImportVendasModal();
  } catch (err) {
    console.error(err);
    alert('Erro ao importar: ' + (err.message || err));
  }
}

async function runImportVendas() {
  try {
    const userId = obterIdUsuario();
    if (!userId) throw new Error('Sessão expirada ou usuário não identificado. Faça login novamente.');

    if (!importVendasRowsCache.length) throw new Error('Nenhuma linha carregada. Selecione um arquivo.');
    if (!importVendasMappings.data.value) throw new Error('Mapeie a coluna de Data (obrigatório).');
    if (!importVendasMappings.cliente.value) throw new Error('Mapeie a coluna de Cliente (obrigatório).');
    if (!importVendasMappings.produto.value) throw new Error('Mapeie a coluna de Produto (obrigatório).');
    if (!importVendasMappings.operadora.value) throw new Error('Mapeie a coluna de Operadora (obrigatório).');
    if (!importVendasMappings.tipoCliente.value) throw new Error('Mapeie a coluna de Tipo Cliente (obrigatório).');
    if (!importVendasMappings.valor.value) throw new Error('Mapeie a coluna de Valor (obrigatório).');
    if (!importVendasMappings.status.value) throw new Error('Mapeie a coluna de Status (obrigatório).');

    let created = 0, updated = 0, skipped = 0;
    for (const row of importVendasRowsCache) {
      try {
        const clienteNome = String(getMappedVendasValue(row, 'cliente') || '').trim();
        if (!clienteNome) { skipped++; continue; }

        // Buscar ou criar cliente
        let cliente = clientes.find(c => c.nome?.toLowerCase() === clienteNome.toLowerCase());
        let clienteId;
        
        if (!cliente) {
          // Ao criar cliente automaticamente durante importação de vendas,
          // atribuir o vendedor atual como dono para que ele veja o cliente.
          const clienteObj = { nome: clienteNome, cpfCnpj: '', telefone: '', vendedor_id: obterIdUsuario() };
          clienteId = await addData('clientes', clienteObj);
          cliente = { id: clienteId, nome: clienteNome, vendedor_id: clienteObj.vendedor_id };
          clientes.push(cliente);
        } else {
          clienteId = cliente.id;
        }

        const vendaPayload = {
          clienteId: clienteId,
          data: getMappedVendasValue(row, 'data') || new Date().toISOString().split('T')[0],
          produto: String(getMappedVendasValue(row, 'produto') || '').trim(),
          operadora: String(getMappedVendasValue(row, 'operadora') || '').trim(),
          tipoCliente: String(getMappedVendasValue(row, 'tipoCliente') || 'Base').trim(),
          valorVenda: parseFloat(getMappedVendasValue(row, 'valor')) || 0,
          status: String(getMappedVendasValue(row, 'status') || 'Concluído').trim(),
          dataRegistro: getMappedVendasValue(row, 'data') || new Date().toISOString().split('T')[0],
          dataConclusao: getMappedVendasValue(row, 'data') || new Date().toISOString().split('T')[0],
          observacao: '',
          posVendaDismissed: []
        };

        // Atribui a venda ao usuário que está fazendo a importação
        vendaPayload.vendedor_id = obterIdUsuario();

        // Não verificar duplicatas exatas - apenas adicionar
        const newId = await addData('vendas', vendaPayload);
        vendaPayload.id = newId;
        vendas.push(vendaPayload);
        created++;
      } catch (rowErr) {
        console.error('Erro ao processar linha:', rowErr);
        skipped++;
      }
    }

    await renderAll();
    hideImportVendasModal();
    showQuickMessage(`Importação concluída: ${created} vendas adicionadas, ${skipped} linhas descartadas.`, 'success');
  } catch (err) {
    console.error(err);
    if (importVendasError) { importVendasError.textContent = err.message || String(err); importVendasError.classList.remove('hidden'); }
    else alert('Erro: ' + (err.message || err));
  }
}
