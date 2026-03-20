// js/campanhas.js
// Campanhas comerciais por vendedor com importacao de planilha e funil em cards.

let campanhasCache = [];
let campanhaLeadsCache = [];
let campanhasInitialized = false;

const CAMPANHAS_STATUS = ['Novo', 'Contato', 'Proposta', 'Fechado', 'Perdido'];

const PLAYBOOK_OBJECOES = [
  {
    titulo: 'Sem tempo agora',
    resposta: 'Perfeito, eu respeito seu tempo. Em 40 segundos te explico o ganho principal e, se fizer sentido, marcamos uma conversa de 10 minutos ainda hoje.'
  },
  {
    titulo: 'Ja tenho fornecedor',
    resposta: 'Excelente, isso mostra que voce ja entende o valor da solucao. Minha proposta e comparar sem compromisso para identificar onde voce pode reduzir custo ou ganhar previsibilidade.'
  },
  {
    titulo: 'Ta caro',
    resposta: 'Faz sentido. Posso te mostrar o custo total atual versus o custo otimizado e o prazo de retorno. Assim voce decide com base em numero real e nao apenas no preco inicial.'
  },
  {
    titulo: 'Preciso falar com o socio',
    resposta: 'Perfeito. Se quiser, eu te envio um resumo executivo em linguagem simples para voce apresentar ao socio e ja agendamos uma call curta com os dois.'
  },
  {
    titulo: 'Me chama depois',
    resposta: 'Combinado. Qual melhor dia e horario para eu retornar? Assim eu ja trago uma proposta adaptada ao seu perfil e aproveitamos melhor o proximo contato.'
  }
];

function setupCampanhasPlaybook() {
  const list = document.getElementById('campanhas-playbook-list');
  const txt = document.getElementById('campanhas-playbook-text');
  const btnCopy = document.getElementById('campanhas-copy-script');
  if (!list || !txt || !btnCopy) return;

  list.innerHTML = PLAYBOOK_OBJECOES.map((item, idx) => `
    <button type="button" data-playbook-index="${idx}" class="w-full text-left px-3 py-2 rounded-lg border border-slate-600 bg-slate-900/40 hover:bg-slate-700/60 transition-colors text-slate-200 text-sm">
      ${item.titulo}
    </button>
  `).join('');

  list.querySelectorAll('[data-playbook-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.playbookIndex);
      const selected = PLAYBOOK_OBJECOES[idx];
      if (!selected) return;
      txt.value = selected.resposta;
    });
  });

  btnCopy.onclick = async () => {
    const content = txt.value.trim();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      if (typeof showQuickMessage === 'function') showQuickMessage('Script copiado para area de transferencia.');
    } catch (err) {
      console.error('Falha ao copiar script:', err);
      alert('Nao foi possivel copiar o script.');
    }
  };
}

function mapRowValue(row, keys) {
  const key = Object.keys(row || {}).find(k => keys.includes(String(k || '').trim().toLowerCase()));
  return key ? row[key] : '';
}

function parseRowsFromFile(file) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!window.XLSX) throw new Error('Biblioteca XLSX nao carregou.');
      const ext = String(file.name || '').toLowerCase();
      let rows = [];
      if (ext.endsWith('.csv')) {
        const text = await file.text();
        const wb = XLSX.read(text, { type: 'string' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      }
      resolve(rows || []);
    } catch (err) {
      reject(err);
    }
  });
}

function getCampanhasFilteredLeads() {
  const campanhaFilter = document.getElementById('campanhas-filter-campanha')?.value || '';
  const vendedorFilter = document.getElementById('campanhas-filter-vendedor')?.value || '';
  const search = (document.getElementById('campanhas-search')?.value || '').trim().toLowerCase();

  let filtered = [...campanhaLeadsCache];

  if (campanhaFilter) {
    filtered = filtered.filter(l => String(l.campanha_id || '') === String(campanhaFilter));
  }

  if (vendedorFilter) {
    filtered = filtered.filter(l => String(l.vendedor_id || '') === String(vendedorFilter));
  }

  if (search) {
    filtered = filtered.filter(l => {
      const blob = `${l.empresa || ''} ${l.telefone || ''} ${l.socio || ''} ${l.produto_ofertado || ''}`.toLowerCase();
      return blob.includes(search);
    });
  }

  return filtered;
}

function renderCampanhasMetrics(leads) {
  const total = leads.length;
  const emContato = leads.filter(l => l.status_funil === 'Contato').length;
  const propostas = leads.filter(l => l.status_funil === 'Proposta').length;
  const ganhos = leads.filter(l => l.status_funil === 'Fechado').length;

  const elTotal = document.getElementById('campanhas-total-leads');
  const elContato = document.getElementById('campanhas-em-contato');
  const elPropostas = document.getElementById('campanhas-propostas');
  const elGanhos = document.getElementById('campanhas-ganhos');

  if (elTotal) elTotal.textContent = String(total);
  if (elContato) elContato.textContent = String(emContato);
  if (elPropostas) elPropostas.textContent = String(propostas);
  if (elGanhos) elGanhos.textContent = String(ganhos);
}

function renderCampanhasFilters() {
  const campanhaSel = document.getElementById('campanhas-filter-campanha');
  if (campanhaSel) {
    const current = campanhaSel.value;
    campanhaSel.innerHTML = '<option value="">Todas</option>';
    campanhasCache.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome || `Campanha #${c.id}`;
      campanhaSel.appendChild(opt);
    });
    campanhaSel.value = current;
  }
}

function buildLeadCard(lead) {
  const campanha = campanhasCache.find(c => Number(c.id) === Number(lead.campanha_id));
  const campanhaNome = campanha?.nome || `Campanha #${lead.campanha_id || 'N/A'}`;

  return `
    <div class="bg-slate-800/70 border border-slate-700 rounded-xl p-3 space-y-2" data-campanha-lead-id="${lead.id}">
      <div class="flex items-start justify-between gap-2">
        <p class="text-sm font-semibold text-white leading-tight">${lead.empresa || 'Empresa sem nome'}</p>
        <span class="text-[10px] uppercase tracking-wider text-slate-400">${campanhaNome}</span>
      </div>
      <p class="text-xs text-slate-400">Tel: ${lead.telefone || 'N/A'}</p>
      <p class="text-xs text-slate-400">Socio: ${lead.socio || 'N/A'}</p>
      <p class="text-xs text-slate-400">Produto: ${lead.produto_ofertado || 'N/A'}</p>
      <div>
        <label class="block text-[11px] text-slate-400 mb-1">Status</label>
        <select class="campanha-lead-status w-full px-2 py-1 bg-slate-900/60 border border-slate-600 rounded text-xs text-white">
          ${CAMPANHAS_STATUS.map(st => `<option value="${st}" ${lead.status_funil === st ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-[11px] text-slate-400 mb-1">Retorno</label>
        <textarea class="campanha-lead-retorno w-full px-2 py-1 bg-slate-900/60 border border-slate-600 rounded text-xs text-slate-200" rows="2" placeholder="Resumo da conversa...">${lead.retorno || ''}</textarea>
      </div>
      <div>
        <label class="block text-[11px] text-slate-400 mb-1">Proxima Acao</label>
        <input class="campanha-lead-proxima w-full px-2 py-1 bg-slate-900/60 border border-slate-600 rounded text-xs text-slate-200" value="${lead.proxima_acao || ''}" placeholder="Ex: ligar quarta 10h" />
      </div>
      <button type="button" class="btn-campanha-lead-save w-full px-3 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs hover:bg-cyan-500/30" data-id="${lead.id}">Salvar Retorno</button>
    </div>
  `;
}

function renderCampanhasKanban(leads) {
  const container = document.getElementById('campanhas-kanban');
  if (!container) return;

  const grouped = {};
  CAMPANHAS_STATUS.forEach(st => { grouped[st] = []; });

  leads.forEach(lead => {
    const status = CAMPANHAS_STATUS.includes(lead.status_funil) ? lead.status_funil : 'Novo';
    grouped[status].push(lead);
  });

  container.innerHTML = CAMPANHAS_STATUS.map(status => `
    <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-white">${status}</h4>
        <span class="text-xs text-slate-400">${grouped[status].length}</span>
      </div>
      <div class="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        ${grouped[status].length ? grouped[status].map(buildLeadCard).join('') : '<p class="text-xs text-slate-500">Sem leads nesta etapa.</p>'}
      </div>
    </div>
  `).join('');
}

async function carregarCampanhasData() {
  try {
    const [campanhas, leads] = await Promise.all([
      getAllData('campanhas'),
      getAllData('campanha_leads')
    ]);

    campanhasCache = Array.isArray(campanhas) ? campanhas.map(c => ({
      ...c,
      id: Number(c.id),
      vendedor_id: parseNumericId(c.vendedor_id)
    })) : [];

    campanhaLeadsCache = Array.isArray(leads) ? leads.map(l => ({
      ...l,
      id: Number(l.id),
      campanha_id: parseNumericId(l.campanha_id),
      vendedor_id: parseNumericId(l.vendedor_id),
      status_funil: l.status_funil || 'Novo'
    })) : [];
  } catch (err) {
    console.error('Erro ao carregar campanhas:', err);
    campanhasCache = [];
    campanhaLeadsCache = [];
  }
}

async function salvarLeadCampanha(leadId, cardEl) {
  const lead = campanhaLeadsCache.find(l => Number(l.id) === Number(leadId));
  if (!lead || !cardEl) return;

  const status = cardEl.querySelector('.campanha-lead-status')?.value || lead.status_funil || 'Novo';
  const retorno = cardEl.querySelector('.campanha-lead-retorno')?.value || '';
  const proxima = cardEl.querySelector('.campanha-lead-proxima')?.value || '';

  const payload = {
    ...lead,
    status_funil: status,
    retorno,
    proxima_acao: proxima,
    atualizado_em: new Date().toISOString()
  };

  await updateData('campanha_leads', payload);

  const idx = campanhaLeadsCache.findIndex(l => Number(l.id) === Number(payload.id));
  if (idx >= 0) campanhaLeadsCache[idx] = payload;

  const filtered = getCampanhasFilteredLeads();
  renderCampanhasMetrics(filtered);
  renderCampanhasKanban(filtered);

  if (typeof showQuickMessage === 'function') {
    showQuickMessage('Retorno atualizado no funil.');
  }
}

async function importarCampanhaPorArquivo(file) {
  const user = obterUsuarioLogado();
  if (!user) throw new Error('Sessao expirada.');

  const rows = await parseRowsFromFile(file);
  if (!rows.length) throw new Error('Planilha sem linhas.');

  const campanhaNomeInput = document.getElementById('campanha-nome');
  const campanhaProdutoInput = document.getElementById('campanha-produto');
  const campanhaVendedorSel = document.getElementById('campanha-vendedor-create');

  const nomeCampanha = (campanhaNomeInput?.value || '').trim() || `Campanha ${new Date().toLocaleDateString('pt-BR')}`;
  const produtoCampanha = (campanhaProdutoInput?.value || '').trim() || 'Produto nao informado';

  let vendedorId = parseNumericId(campanhaVendedorSel?.value);
  if (user.perfil !== 'master') vendedorId = Number(user.id);
  if (!vendedorId) throw new Error('Selecione um vendedor para importar a campanha.');

  const campanhaPayload = {
    nome: nomeCampanha,
    produto: produtoCampanha,
    vendedor_id: vendedorId,
    criado_por: Number(user.id),
    criado_em: new Date().toISOString(),
    total_leads: rows.length
  };

  const campanhaId = await addData('campanhas', campanhaPayload);

  let inseridos = 0;
  for (const row of rows) {
    const empresa = String(mapRowValue(row, ['empresa', 'razao social', 'razão social', 'nome', 'cliente']) || '').trim();
    const telefone = normalizePhone(mapRowValue(row, ['telefone', 'celular', 'whatsapp', 'fone']));
    const socio = String(mapRowValue(row, ['socio', 'sócio', 'nome socio', 'nome sócio']) || '').trim();
    const cnpj = normalizeDoc(mapRowValue(row, ['cnpj', 'cpf/cnpj', 'cpf cnpj', 'documento']));
    const produtoLead = String(mapRowValue(row, ['produto', 'oferta', 'produto ofertado']) || produtoCampanha).trim();

    if (!empresa && !telefone && !socio) continue;

    await addData('campanha_leads', {
      campanha_id: Number(campanhaId),
      vendedor_id: vendedorId,
      empresa,
      telefone,
      cnpj,
      socio,
      produto_ofertado: produtoLead,
      status_funil: 'Novo',
      retorno: '',
      proxima_acao: '',
      criado_em: new Date().toISOString()
    });

    inseridos++;
  }

  if (campanhaNomeInput) campanhaNomeInput.value = '';
  if (campanhaProdutoInput) campanhaProdutoInput.value = '';

  await renderCampanhasTab();
  if (typeof showQuickMessage === 'function') {
    showQuickMessage(`Campanha criada com ${inseridos} lead(s).`);
  }
}

async function renderCampanhasTab() {
  await carregarCampanhasData();
  renderCampanhasFilters();

  const filteredLeads = getCampanhasFilteredLeads();
  renderCampanhasMetrics(filteredLeads);
  renderCampanhasKanban(filteredLeads);

  if (window.lucide) lucide.createIcons();
}

function configureCampanhasByPerfil() {
  const user = obterUsuarioLogado();
  const masterControls = document.getElementById('campanhas-master-controls');
  const vendedorFilter = document.getElementById('campanhas-filter-vendedor');
  const vendedorCreate = document.getElementById('campanha-vendedor-create');

  if (!user) return;

  if (user.perfil === 'master') {
    if (masterControls) masterControls.classList.remove('hidden');
    if (vendedorCreate) {
      popularSelectVendedores(vendedorCreate, true).then(() => {
        if (vendedorCreate.options[0]) vendedorCreate.options[0].text = 'Selecione';
      });
    }
    if (vendedorFilter) {
      popularSelectVendedores(vendedorFilter, true).then(() => {
        if (vendedorFilter.options[0]) vendedorFilter.options[0].text = 'Todos';
      });
    }
  } else {
    if (masterControls) masterControls.classList.add('hidden');
    if (vendedorFilter) {
      vendedorFilter.innerHTML = `<option value="${user.id}">${user.nome}</option>`;
      vendedorFilter.value = String(user.id);
      vendedorFilter.disabled = true;
    }
  }
}

function initCampanhasModule() {
  if (campanhasInitialized) return;

  const btnImport = document.getElementById('btn-campanhas-import');
  const inputImport = document.getElementById('input-import-campanhas');
  const btnRefresh = document.getElementById('btn-campanhas-refresh');
  const campanhaFilter = document.getElementById('campanhas-filter-campanha');
  const vendedorFilter = document.getElementById('campanhas-filter-vendedor');
  const searchInput = document.getElementById('campanhas-search');

  setupCampanhasPlaybook();
  configureCampanhasByPerfil();

  if (btnImport && inputImport) {
    btnImport.onclick = () => inputImport.click();
    inputImport.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await importarCampanhaPorArquivo(file);
      } catch (err) {
        console.error(err);
        alert(err.message || 'Erro ao importar campanha.');
      } finally {
        inputImport.value = '';
      }
    };
  }

  if (btnRefresh) {
    btnRefresh.onclick = () => renderCampanhasTab();
  }

  if (campanhaFilter) campanhaFilter.onchange = () => {
    const leads = getCampanhasFilteredLeads();
    renderCampanhasMetrics(leads);
    renderCampanhasKanban(leads);
  };

  if (vendedorFilter) vendedorFilter.onchange = () => {
    const leads = getCampanhasFilteredLeads();
    renderCampanhasMetrics(leads);
    renderCampanhasKanban(leads);
  };

  if (searchInput) searchInput.oninput = () => {
    const leads = getCampanhasFilteredLeads();
    renderCampanhasMetrics(leads);
    renderCampanhasKanban(leads);
  };

  document.body.addEventListener('click', async (e) => {
    const saveBtn = e.target.closest('.btn-campanha-lead-save');
    if (!saveBtn) return;
    const cardEl = e.target.closest('[data-campanha-lead-id]');
    if (!cardEl) return;

    try {
      await salvarLeadCampanha(Number(saveBtn.dataset.id), cardEl);
    } catch (err) {
      console.error('Erro ao salvar lead da campanha:', err);
      alert('Nao foi possivel salvar o retorno deste lead.');
    }
  });

  campanhasInitialized = true;
}

window.initCampanhasModule = initCampanhasModule;
window.renderCampanhasTab = renderCampanhasTab;
