// js/campanhas.js
// Campanhas comerciais por vendedor em lista com popup de lead, relatorio e agenda automatica.

let campanhasCache = [];
let campanhaLeadsCache = [];
let campanhasInitialized = false;
let campanhasOnlyOverdue = false;
const COLD_AUTOMATION_DAYS = 7;

const CAMPANHAS_STATUS = ['Novo', 'Contato', 'Proposta', 'Fechado', 'Perdido'];

const PLAYBOOK_OBJECOES = [
  {
    titulo: 'Abertura de 40 segundos',
    resposta: 'Oi, [Nome], aqui e [Seu Nome] da [Empresa]. Falo rapido: identifiquei um ponto onde sua empresa pode reduzir custo e ganhar previsibilidade no proximo ciclo. Se eu te mostrar em 3 minutos com numero real, faz sentido para voce agora?'
  },
  {
    titulo: 'Objecao: sem tempo',
    resposta: 'Perfeito, respeito seu tempo. Entao so me confirma uma coisa: hoje voce esta 100% satisfeito com custo, prazo e atendimento? Se tiver qualquer ponto a melhorar, eu te provo em 2 minutos onde esta o ganho.'
  },
  {
    titulo: 'Objecao: ja tenho fornecedor',
    resposta: 'Excelente, isso facilita. Nao quero trocar por trocar; quero te mostrar comparativo com criterio objetivo: economia, risco e prazo. Se nao gerar ganho claro, voce mantem o atual sem custo.'
  },
  {
    titulo: 'Objecao: ta caro',
    resposta: 'Entendo. Quando o cliente diz caro, normalmente falta visao do retorno completo. Vamos validar juntos: quanto isso representa por mes e quanto voce recupera no trimestre? Se o ROI nao fechar, eu mesmo recomendo nao seguir.'
  },
  {
    titulo: 'Fechamento imediato',
    resposta: 'Pelo que voce me falou, o proximo passo mais seguro e validar sua proposta hoje e travar condicao comercial. Se eu te enviar agora, conseguimos aprovar ainda hoje e iniciar sem perder janela de ganho?'
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

function normalizeHeaderKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function mapRowValue(row, keys) {
  const normalizedMap = Object.keys(row || {}).reduce((acc, original) => {
    acc[normalizeHeaderKey(original)] = original;
    return acc;
  }, {});

  for (const key of keys) {
    const match = normalizedMap[normalizeHeaderKey(key)];
    if (match) return row[match];
  }
  return '';
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

function getTodayISO() {
  return new Date().toISOString().split('T')[0];
}

function getDateAfterDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function setHeaderFollowupAlert(overdueCount) {
  const container = document.getElementById('header-followup-alert');
  const text = document.getElementById('header-followup-alert-text');
  if (!container || !text) return;

  if (!overdueCount) {
    container.classList.add('hidden');
    return;
  }

  text.textContent = `${overdueCount} follow-up(s) vencido(s) precisam de acao agora.`;
  container.classList.remove('hidden');
}

function getCampanhasFilteredLeads() {
  const campanhaFilter = document.getElementById('campanhas-filter-campanha')?.value || '';
  const vendedorFilter = document.getElementById('campanhas-filter-vendedor')?.value || '';
  const statusFilter = document.getElementById('campanhas-filter-status')?.value || '';
  const overdueMode = document.getElementById('campanhas-filter-overdue-mode')?.value || '';
  const overdueDays = Math.max(1, Number(document.getElementById('campanhas-filter-overdue-days')?.value || 3));
  const search = (document.getElementById('campanhas-search')?.value || '').trim().toLowerCase();

  let filtered = [...campanhaLeadsCache];

  if (campanhaFilter) filtered = filtered.filter(l => String(l.campanha_id) === String(campanhaFilter));
  if (vendedorFilter) filtered = filtered.filter(l => String(l.vendedor_id) === String(vendedorFilter));
  if (statusFilter) filtered = filtered.filter(l => String(l.status_funil) === String(statusFilter));

  if (search) {
    filtered = filtered.filter(l => {
      const blob = `${l.empresa || ''} ${l.telefone || ''} ${l.email || ''} ${l.socio || ''} ${l.produto_ofertado || ''}`.toLowerCase();
      return blob.includes(search);
    });
  }

  if (campanhasOnlyOverdue) {
    const today = getTodayISO();
    filtered = filtered.filter(l => {
      if (!l.data_proximo_contato) return false;
      if (l.status_funil === 'Fechado' || l.status_funil === 'Perdido') return false;
      return l.data_proximo_contato < today;
    });
  }

  if (overdueMode) {
    const today = new Date(getTodayISO() + 'T00:00:00').getTime();
    filtered = filtered.filter(l => {
      if (!l.data_proximo_contato) return false;
      if (l.status_funil === 'Fechado' || l.status_funil === 'Perdido') return false;
      const due = new Date(l.data_proximo_contato + 'T00:00:00').getTime();
      const diff = Math.floor((today - due) / 86400000);
      if (overdueMode === 'today') return diff === 0;
      if (overdueMode === 'gt') return diff > overdueDays;
      return true;
    });
  }

  return filtered;
}

function getCampanhaById(campanhaId) {
  return campanhasCache.find(c => Number(c.id) === Number(campanhaId)) || null;
}

function getStatusBadge(status) {
  const colors = {
    Novo: 'bg-slate-500/20 text-slate-300',
    Contato: 'bg-cyan-500/20 text-cyan-300',
    Proposta: 'bg-amber-500/20 text-amber-300',
    Fechado: 'bg-emerald-500/20 text-emerald-300',
    Perdido: 'bg-red-500/20 text-red-300'
  };
  return `<span class="px-2 py-1 rounded-full text-xs ${colors[status] || 'bg-slate-500/20 text-slate-300'}">${status || 'Novo'}</span>`;
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
  if (!campanhaSel) return;

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

function renderCampanhasTable(leads) {
  const tbody = document.getElementById('campanhas-leads-table-body');
  const empty = document.getElementById('campanhas-leads-empty');
  if (!tbody || !empty) return;

  if (!leads.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  tbody.innerHTML = leads.map(lead => {
    const agenda = lead.data_proximo_contato ? formatDate(lead.data_proximo_contato) : 'Sem data';
    return `
      <tr class="hover:bg-slate-700/30">
        <td class="px-4 py-3 text-white font-medium">${lead.empresa || 'N/A'}</td>
        <td class="px-4 py-3 text-slate-300">${lead.telefone || 'N/A'}</td>
        <td class="px-4 py-3 text-slate-300">${lead.email || 'N/A'}</td>
        <td class="px-4 py-3 text-slate-300">${lead.socio || 'N/A'}</td>
        <td class="px-4 py-3 text-slate-300">${lead.produto_ofertado || 'N/A'}</td>
        <td class="px-4 py-3">${getStatusBadge(lead.status_funil)}</td>
        <td class="px-4 py-3 text-slate-300">${agenda}</td>
        <td class="px-4 py-3">
          <button class="btn-open-campanha-lead px-3 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-lg hover:bg-cyan-500/30 text-xs" data-id="${lead.id}">Abrir Lead</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderCampanhaReport(leads) {
  const el = document.getElementById('campanhas-report-summary');
  if (!el) return;

  const total = leads.length;
  const ganhos = leads.filter(l => l.status_funil === 'Fechado').length;
  const perdidos = leads.filter(l => l.status_funil === 'Perdido').length;
  const propostas = leads.filter(l => l.status_funil === 'Proposta').length;
  const conversao = total ? (ganhos / total) * 100 : 0;
  const perda = total ? (perdidos / total) * 100 : 0;

  const objecoes = {};
  leads.forEach(l => {
    const key = (l.objecao_principal || '').trim();
    if (!key) return;
    objecoes[key] = (objecoes[key] || 0) + 1;
  });
  const topObjeções = Object.entries(objecoes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count})`)
    .join(' • ') || 'Sem objecoes mapeadas';

  const today = new Date(getTodayISO() + 'T00:00:00').getTime();
  const classifyHeat = (lead) => {
    if (lead.temperatura_auto === 'frio') return 'frio';
    if (lead.status_funil === 'Fechado') return 'quente';
    if (lead.status_funil === 'Proposta') return 'quente';
    if (lead.status_funil === 'Contato') {
      if (!lead.data_proximo_contato) return 'morno';
      const due = new Date(lead.data_proximo_contato + 'T00:00:00').getTime();
      const diff = Math.floor((today - due) / 86400000);
      return diff <= 1 ? 'quente' : 'morno';
    }
    if (lead.status_funil === 'Perdido') return 'frio';
    if (!lead.data_proximo_contato) return 'morno';
    const due = new Date(lead.data_proximo_contato + 'T00:00:00').getTime();
    const diff = Math.floor((today - due) / 86400000);
    if (diff > 5) return 'frio';
    if (diff > 1) return 'morno';
    return 'quente';
  };

  const heat = { quente: 0, morno: 0, frio: 0 };
  leads.forEach(l => {
    const k = classifyHeat(l);
    heat[k] = (heat[k] || 0) + 1;
  });

  el.innerHTML = `
    <div class="bg-slate-900/40 border border-slate-700 rounded-lg p-3">
      <p>Total: <strong class="text-white">${total}</strong></p>
      <p>Fechados: <strong class="text-emerald-300">${ganhos}</strong></p>
      <p>Em proposta: <strong class="text-amber-300">${propostas}</strong></p>
      <p>Perdidos: <strong class="text-red-300">${perdidos}</strong></p>
      <p>Conversao: <strong class="text-cyan-300">${conversao.toFixed(1)}%</strong></p>
      <p>Taxa de perda: <strong class="text-red-300">${perda.toFixed(1)}%</strong></p>
      <p class="mt-2">Leads quentes: <strong class="text-emerald-300">${heat.quente}</strong></p>
      <p>Leads mornos: <strong class="text-amber-300">${heat.morno}</strong></p>
      <p>Leads frios: <strong class="text-slate-300">${heat.frio}</strong></p>
      <p class="mt-2 text-xs text-slate-400">Top objecoes: ${topObjeções}</p>
    </div>
  `;
}

async function applyColdLeadAutomation() {
  const todayIso = getTodayISO();
  const today = new Date(`${todayIso}T00:00:00`).getTime();
  const updates = [];

  for (const lead of campanhaLeadsCache) {
    if (!lead || lead.status_funil === 'Fechado' || lead.status_funil === 'Perdido') continue;

    const history = Array.isArray(lead.interaction_history) ? lead.interaction_history : [];
    const lastInteractionIso = history.length
      ? history[history.length - 1].data
      : (lead.atualizado_em || lead.criado_em || '');

    const lastInteractionTime = lastInteractionIso ? new Date(lastInteractionIso).getTime() : today;
    const daysWithoutInteraction = Math.floor((today - lastInteractionTime) / 86400000);
    const due = lead.data_proximo_contato ? new Date(`${lead.data_proximo_contato}T00:00:00`).getTime() : null;
    const overdue = due !== null && due < today;

    const shouldBeCold = daysWithoutInteraction >= COLD_AUTOMATION_DAYS && (overdue || !lead.data_proximo_contato);
    const nextTemp = shouldBeCold ? 'frio' : '';
    const currentTemp = lead.temperatura_auto || '';

    if (nextTemp !== currentTemp) {
      const payload = {
        ...lead,
        temperatura_auto: nextTemp,
        atualizado_em: new Date().toISOString()
      };
      updates.push(payload);
    }
  }

  for (const payload of updates) {
    await updateData('campanha_leads', payload);
    const idx = campanhaLeadsCache.findIndex(l => Number(l.id) === Number(payload.id));
    if (idx >= 0) campanhaLeadsCache[idx] = payload;
  }
}

function renderCampanhasAgenda(leads) {
  const list = document.getElementById('campanhas-agenda-list');
  const empty = document.getElementById('campanhas-agenda-empty');
  if (!list || !empty) return;

  const hoje = new Date(getTodayISO() + 'T00:00:00').getTime();
  const agenda = leads
    .filter(l => l.data_proximo_contato && l.status_funil !== 'Fechado' && l.status_funil !== 'Perdido')
    .map(l => {
      const when = new Date(l.data_proximo_contato + 'T00:00:00').getTime();
      const diff = Math.floor((when - hoje) / 86400000);
      return { ...l, diff };
    })
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 8);

  if (!agenda.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = agenda.map(item => {
    const badge = item.diff < 0
      ? `<span class="text-red-300 text-xs">Atrasado ${Math.abs(item.diff)}d</span>`
      : item.diff === 0
        ? '<span class="text-amber-300 text-xs">Hoje</span>'
        : `<span class="text-cyan-300 text-xs">Em ${item.diff}d</span>`;

    return `
      <button class="btn-open-campanha-lead w-full text-left bg-slate-900/40 border border-slate-700 rounded-lg px-3 py-2 hover:bg-slate-700/50" data-id="${item.id}">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm text-white truncate">${item.empresa || 'Lead sem nome'}</p>
          ${badge}
        </div>
        <p class="text-xs text-slate-400">${item.proxima_acao || 'Sem proxima acao'}</p>
      </button>
    `;
  }).join('');
}

function renderLeadTimeline(lead) {
  const timeline = document.getElementById('campanha-lead-timeline');
  if (!timeline) return;

  const history = Array.isArray(lead?.interaction_history) ? [...lead.interaction_history] : [];
  if (!history.length) {
    timeline.innerHTML = '<p class="text-xs text-slate-500">Sem interacoes registradas.</p>';
    return;
  }

  history.sort((a, b) => new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime());
  const badgeClassByType = {
    ligacao: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    whatsapp: 'bg-green-500/20 text-green-300 border-green-500/40',
    proposta: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    fechamento: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    outro: 'bg-slate-500/20 text-slate-300 border-slate-500/40'
  };

  timeline.innerHTML = history.map(item => {
    const tipo = item.tipo || 'outro';
    const badgeClass = badgeClassByType[tipo] || badgeClassByType.outro;
    const tipoLabel = tipo.charAt(0).toUpperCase() + tipo.slice(1);
    return `
    <div class="border-l-2 border-slate-600 pl-3 py-1">
      <div class="flex items-center gap-2 mb-1">
        <p class="text-xs text-slate-400">${formatDate((item.data || '').split('T')[0] || '')} ${String(item.data || '').split('T')[1]?.slice(0,5) || ''}</p>
        <span class="px-2 py-0.5 rounded-full text-[10px] border ${badgeClass}">${tipoLabel}</span>
      </div>
      <p class="text-xs text-slate-300">Status: ${item.status || 'N/A'}</p>
      <p class="text-xs text-slate-400">${item.resumo || 'Interacao sem resumo.'}</p>
    </div>
  `;
  }).join('');
}

async function carregarCampanhasData() {
  try {
    const [campanhas, leads] = await Promise.all([
      getAllData('campanhas'),
      getAllData('campanha_leads')
    ]);

    campanhasCache = Array.isArray(campanhas)
      ? campanhas.map(c => ({ ...c, id: Number(c.id), vendedor_id: parseNumericId(c.vendedor_id) }))
      : [];

    campanhaLeadsCache = Array.isArray(leads)
      ? leads.map(l => ({
          ...l,
          id: Number(l.id),
          campanha_id: parseNumericId(l.campanha_id),
          vendedor_id: parseNumericId(l.vendedor_id),
          status_funil: l.status_funil || 'Novo'
        }))
      : [];
  } catch (err) {
    console.error('Erro ao carregar campanhas:', err);
    campanhasCache = [];
    campanhaLeadsCache = [];
  }
}

function openLeadModal(leadId) {
  const lead = campanhaLeadsCache.find(l => Number(l.id) === Number(leadId));
  const modal = document.getElementById('campanha-lead-modal');
  if (!lead || !modal) return;

  document.getElementById('campanha-lead-id').value = String(lead.id);
  document.getElementById('campanha-lead-empresa').value = lead.empresa || '';
  document.getElementById('campanha-lead-cnpj').value = lead.cnpj || '';
  document.getElementById('campanha-lead-telefone').value = lead.telefone || '';
  document.getElementById('campanha-lead-email').value = lead.email || '';
  document.getElementById('campanha-lead-socio').value = lead.socio || '';
  document.getElementById('campanha-lead-produto').value = lead.produto_ofertado || '';
  document.getElementById('campanha-lead-status').value = lead.status_funil || 'Novo';
  document.getElementById('campanha-lead-data-proxima').value = lead.data_proximo_contato || '';
  document.getElementById('campanha-lead-objecao').value = lead.objecao_principal || '';
  document.getElementById('campanha-lead-interacao-tipo').value = 'ligacao';
  document.getElementById('campanha-lead-retorno').value = lead.retorno || '';
  document.getElementById('campanha-lead-proxima-acao').value = lead.proxima_acao || '';
  renderLeadTimeline(lead);

  const waBtn = document.getElementById('btn-campanha-lead-whatsapp');
  if (waBtn) {
    waBtn.onclick = () => {
      const telRaw = String(document.getElementById('campanha-lead-telefone')?.value || '').replace(/\D/g, '');
      const tel = telRaw && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw;
      if (!tel) return;
      window.open(`https://wa.me/${tel}`, '_blank', 'noopener,noreferrer');
    };
  }

  const emailBtn = document.getElementById('btn-campanha-lead-email');
  if (emailBtn) {
    emailBtn.onclick = () => {
      const email = String(document.getElementById('campanha-lead-email')?.value || '').trim();
      if (!email) return;
      window.location.href = `mailto:${email}`;
    };
  }

  modal.classList.remove('hidden');
}

function closeLeadModal() {
  const modal = document.getElementById('campanha-lead-modal');
  if (modal) modal.classList.add('hidden');
}

function openCreateCampanhaModal() {
  const modal = document.getElementById('campanha-create-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeCreateCampanhaModal() {
  const modal = document.getElementById('campanha-create-modal');
  if (modal) modal.classList.add('hidden');
}

function openDeleteCampanhaModal() {
  const modal = document.getElementById('campanha-delete-modal');
  if (!modal) return;
  populateDeleteCampanhaOptions();
  modal.classList.remove('hidden');
}

function closeDeleteCampanhaModal() {
  const modal = document.getElementById('campanha-delete-modal');
  if (modal) modal.classList.add('hidden');
}

function populateDeleteCampanhaOptions() {
  const select = document.getElementById('campanha-delete-select');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Selecione</option>';
  campanhasCache.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nome || `Campanha #${c.id}`;
    select.appendChild(opt);
  });
  if (current && campanhasCache.some(c => String(c.id) === String(current))) {
    select.value = current;
  }
}

async function createCampanhaOnly() {
  const user = obterUsuarioLogado();
  if (!user) throw new Error('Sessao expirada.');

  const campanhaNomeInput = document.getElementById('campanha-nome');
  const campanhaProdutoInput = document.getElementById('campanha-produto');
  const campanhaVendedorSel = document.getElementById('campanha-vendedor-create');

  const nomeCampanha = (campanhaNomeInput?.value || '').trim();
  const produtoCampanha = (campanhaProdutoInput?.value || '').trim() || 'Produto nao informado';

  if (!nomeCampanha) throw new Error('Informe o nome da campanha.');

  let vendedorId = parseNumericId(campanhaVendedorSel?.value);
  if (user.perfil !== 'master') vendedorId = Number(user.id);
  if (!vendedorId) throw new Error('Selecione um vendedor para criar a campanha.');

  const campanhaId = await addData('campanhas', {
    nome: nomeCampanha,
    produto: produtoCampanha,
    vendedor_id: vendedorId,
    criado_por: Number(user.id),
    criado_em: new Date().toISOString(),
    total_leads: 0
  });

  if (campanhaNomeInput) campanhaNomeInput.value = '';
  if (campanhaProdutoInput) campanhaProdutoInput.value = '';

  closeCreateCampanhaModal();
  await renderCampanhasTab();

  const filterSelect = document.getElementById('campanhas-filter-campanha');
  if (filterSelect) filterSelect.value = String(campanhaId);
  if (typeof showQuickMessage === 'function') showQuickMessage('Campanha criada. Agora voce pode importar os leads.');
}

function suggestNextFollowup(status, currentDate) {
  if (currentDate) return currentDate;
  if (status === 'Contato') return getDateAfterDaysISO(1);
  if (status === 'Proposta') return getDateAfterDaysISO(2);
  if (status === 'Novo') return getDateAfterDaysISO(1);
  return '';
}

async function saveLeadFromModal() {
  const leadId = Number(document.getElementById('campanha-lead-id').value || 0);
  const lead = campanhaLeadsCache.find(l => Number(l.id) === leadId);
  if (!lead) return;

  const status = document.getElementById('campanha-lead-status').value;
  const dataProximaRaw = document.getElementById('campanha-lead-data-proxima').value;
  const dataProxima = suggestNextFollowup(status, dataProximaRaw);
  const interactionType = document.getElementById('campanha-lead-interacao-tipo').value || 'outro';

  const retorno = document.getElementById('campanha-lead-retorno').value.trim();
  const proximaAcao = document.getElementById('campanha-lead-proxima-acao').value.trim();
  const objecao = document.getElementById('campanha-lead-objecao').value.trim();
  const history = Array.isArray(lead.interaction_history) ? [...lead.interaction_history] : [];

  const resumo = retorno || proximaAcao || objecao || 'Atualizacao do lead';
  const last = history[history.length - 1];
  const shouldAppendHistory = !last || last.resumo !== resumo || last.status !== status;
  if (shouldAppendHistory) {
    history.push({
      data: new Date().toISOString(),
      tipo: interactionType,
      status,
      resumo
    });
  }

  const payload = {
    ...lead,
    empresa: document.getElementById('campanha-lead-empresa').value.trim(),
    cnpj: normalizeDoc(document.getElementById('campanha-lead-cnpj').value),
    telefone: normalizePhone(document.getElementById('campanha-lead-telefone').value),
    email: document.getElementById('campanha-lead-email').value.trim(),
    socio: document.getElementById('campanha-lead-socio').value.trim(),
    produto_ofertado: document.getElementById('campanha-lead-produto').value.trim(),
    status_funil: status,
    data_proximo_contato: dataProxima,
    objecao_principal: objecao,
    retorno,
    proxima_acao: proximaAcao,
    interaction_history: history,
    atualizado_em: new Date().toISOString()
  };

  await updateData('campanha_leads', payload);

  const idx = campanhaLeadsCache.findIndex(l => Number(l.id) === Number(payload.id));
  if (idx >= 0) campanhaLeadsCache[idx] = payload;

  closeLeadModal();
  const filtered = getCampanhasFilteredLeads();
  renderCampanhasMetrics(filtered);
  renderCampanhasTable(filtered);
  renderCampanhaReport(filtered);
  renderCampanhasAgenda(filtered);

  if (typeof showQuickMessage === 'function') showQuickMessage('Lead atualizado com sucesso.');
}

function exportCurrentCampaignCsv() {
  const campanhaFilter = document.getElementById('campanhas-filter-campanha')?.value || '';
  const leads = getCampanhasFilteredLeads();
  if (!leads.length) {
    alert('Nenhum lead para exportar nos filtros atuais.');
    return;
  }

  const campanha = campanhaFilter ? getCampanhaById(campanhaFilter) : null;
  const nomeBase = (campanha?.nome || 'campanhas').replace(/[^a-zA-Z0-9_-]+/g, '_');

  const headers = [
    'Campanha', 'Vendedor', 'Empresa', 'Telefone', 'Email', 'Socio', 'Produto', 'Status',
    'Objecao', 'Retorno', 'Proxima Acao', 'Data Proximo Contato', 'Ultima Atualizacao'
  ];

  const csvRows = [headers.map(csvCell).join(',')];
  leads.forEach(lead => {
    const campanhaLead = getCampanhaById(lead.campanha_id);
    const vendedorNome = (typeof usuariosList !== 'undefined' && Array.isArray(usuariosList))
      ? (usuariosList.find(u => Number(u.id) === Number(lead.vendedor_id))?.nome || `Vendedor #${lead.vendedor_id || 'N/A'}`)
      : `Vendedor #${lead.vendedor_id || 'N/A'}`;
    const row = [
      campanhaLead?.nome || '',
      vendedorNome,
      lead.empresa || '',
      lead.telefone || '',
      lead.email || '',
      lead.socio || '',
      lead.produto_ofertado || '',
      lead.status_funil || '',
      lead.objecao_principal || '',
      lead.retorno || '',
      lead.proxima_acao || '',
      lead.data_proximo_contato || '',
      lead.atualizado_em || lead.criado_em || ''
    ];
    csvRows.push(row.map(csvCell).join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nomeBase}_relatorio.csv`;
  a.click();
}

function renderOverdueFilterIndicator() {
  const indicator = document.getElementById('campanhas-overdue-indicator');
  if (!indicator) return;
  indicator.classList.toggle('hidden', !campanhasOnlyOverdue);
}

async function deleteCurrentCampaign(campanhaIdParam) {
  const user = obterUsuarioLogado();
  if (!user || user.perfil !== 'master') {
    alert('Apenas master pode apagar campanha.');
    return;
  }

  const campanhaId = campanhaIdParam || document.getElementById('campanhas-filter-campanha')?.value;
  if (!campanhaId) {
    alert('Selecione uma campanha para apagar.');
    return;
  }

  const campanha = getCampanhaById(campanhaId);
  const nome = campanha?.nome || `#${campanhaId}`;
  const ok = confirm(`Apagar campanha ${nome} e todos os leads vinculados?`);
  if (!ok) return;

  const leadsToDelete = campanhaLeadsCache.filter(l => Number(l.campanha_id) === Number(campanhaId));
  for (const lead of leadsToDelete) {
    await deleteData('campanha_leads', lead.id);
  }
  await deleteData('campanhas', campanhaId);

  if (typeof showQuickMessage === 'function') showQuickMessage('Campanha apagada com sucesso.');
  closeDeleteCampanhaModal();
  await renderCampanhasTab();
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
    const empresa = String(mapRowValue(row, ['empresa', 'razao social', 'nome empresa', 'cliente', 'nome']) || '').trim();
    const telefone = normalizePhone(mapRowValue(row, ['telefone', 'celular', 'whatsapp', 'fone', 'telefone1', 'telefone comercial']));
    const email = String(mapRowValue(row, ['email', 'e-mail', 'mail']) || '').trim();
    const socio = String(mapRowValue(row, ['socio', 'nome socio', 'responsavel', 'contato']) || '').trim();
    const cnpj = normalizeDoc(mapRowValue(row, ['cnpj', 'cpf/cnpj', 'documento']));
    const produtoLead = String(mapRowValue(row, ['produto', 'oferta', 'produto ofertado']) || produtoCampanha).trim();

    if (!empresa && !telefone && !email && !socio) continue;

    await addData('campanha_leads', {
      campanha_id: Number(campanhaId),
      vendedor_id: vendedorId,
      empresa,
      telefone,
      email,
      cnpj,
      socio,
      produto_ofertado: produtoLead,
      status_funil: 'Novo',
      objecao_principal: '',
      retorno: '',
      proxima_acao: 'Primeiro contato comercial',
      data_proximo_contato: getDateAfterDaysISO(1),
      criado_em: new Date().toISOString()
    });
    inseridos++;
  }

  if (campanhaNomeInput) campanhaNomeInput.value = '';
  if (campanhaProdutoInput) campanhaProdutoInput.value = '';
  closeCreateCampanhaModal();

  await renderCampanhasTab();
  if (typeof showQuickMessage === 'function') showQuickMessage(`Campanha criada com ${inseridos} lead(s).`);
}

async function renderCampanhasTab() {
  await carregarCampanhasData();
  await applyColdLeadAutomation();
  renderCampanhasFilters();
  populateDeleteCampanhaOptions();

  const filtered = getCampanhasFilteredLeads();
  renderCampanhasMetrics(filtered);
  renderCampanhasTable(filtered);
  renderCampanhaReport(filtered);
  renderCampanhasAgenda(filtered);
  renderOverdueFilterIndicator();

  const overdueCount = campanhaLeadsCache.filter(l => {
    if (!l.data_proximo_contato) return false;
    if (l.status_funil === 'Fechado' || l.status_funil === 'Perdido') return false;
    return l.data_proximo_contato < getTodayISO();
  }).length;
  setHeaderFollowupAlert(overdueCount);

  if (window.lucide) lucide.createIcons();
}

function configureCampanhasByPerfil() {
  const user = obterUsuarioLogado();
  const masterControls = document.getElementById('campanhas-master-controls');
  const btnDelete = document.getElementById('btn-campanhas-delete');
  const vendedorFilter = document.getElementById('campanhas-filter-vendedor');
  const vendedorCreate = document.getElementById('campanha-vendedor-create');

  if (!user) return;

  if (user.perfil === 'master') {
    if (masterControls) masterControls.classList.remove('hidden');
    if (btnDelete) btnDelete.classList.remove('hidden');

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
    if (btnDelete) btnDelete.classList.add('hidden');

    if (vendedorFilter) {
      vendedorFilter.innerHTML = `<option value="${user.id}">${user.nome}</option>`;
      vendedorFilter.value = String(user.id);
      vendedorFilter.disabled = true;
    }
  }
}

function initCampanhasModule() {
  if (campanhasInitialized) return;

  const btnOpenCreate = document.getElementById('btn-campanhas-open-create');
  const btnCreateClose = document.getElementById('btn-campanha-create-close');
  const btnCreateCancel = document.getElementById('btn-campanha-create-cancel');
  const btnCreateSave = document.getElementById('btn-campanha-create-save');
  const btnCreateImport = document.getElementById('btn-campanha-create-import');
  const inputCreateImport = document.getElementById('input-import-campanhas-create');
  const btnRefresh = document.getElementById('btn-campanhas-refresh');
  const btnExport = document.getElementById('btn-campanhas-export');
  const btnDelete = document.getElementById('btn-campanhas-delete');
  const btnDeleteClose = document.getElementById('btn-campanha-delete-close');
  const btnDeleteCancel = document.getElementById('btn-campanha-delete-cancel');
  const btnDeleteConfirm = document.getElementById('btn-campanha-delete-confirm');
  const deleteSelect = document.getElementById('campanha-delete-select');
  const btnHeaderAlertOpen = document.getElementById('btn-header-followup-open');
  const btnClearOverdue = document.getElementById('btn-campanhas-overdue-clear');
  const campanhaFilter = document.getElementById('campanhas-filter-campanha');
  const vendedorFilter = document.getElementById('campanhas-filter-vendedor');
  const statusFilter = document.getElementById('campanhas-filter-status');
  const overdueModeFilter = document.getElementById('campanhas-filter-overdue-mode');
  const overdueDaysFilter = document.getElementById('campanhas-filter-overdue-days');
  const btnResetFilters = document.getElementById('btn-campanhas-reset-filters');
  const searchInput = document.getElementById('campanhas-search');
  const btnCloseModal = document.getElementById('btn-campanha-lead-close');
  const btnCancelModal = document.getElementById('btn-campanha-lead-cancel');
  const btnSaveModal = document.getElementById('btn-campanha-lead-save');

  setupCampanhasPlaybook();
  configureCampanhasByPerfil();

  if (btnOpenCreate) btnOpenCreate.onclick = openCreateCampanhaModal;
  if (btnCreateClose) btnCreateClose.onclick = closeCreateCampanhaModal;
  if (btnCreateCancel) btnCreateCancel.onclick = closeCreateCampanhaModal;
  if (btnCreateSave) {
    btnCreateSave.onclick = async () => {
      try {
        await createCampanhaOnly();
      } catch (err) {
        alert(err.message || 'Erro ao criar campanha.');
      }
    };
  }

  if (btnCreateImport && inputCreateImport) {
    btnCreateImport.onclick = () => inputCreateImport.click();
    inputCreateImport.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await importarCampanhaPorArquivo(file);
      } catch (err) {
        console.error(err);
        alert(err.message || 'Erro ao importar campanha.');
      } finally {
        inputCreateImport.value = '';
      }
    };
  }

  if (btnRefresh) btnRefresh.onclick = () => renderCampanhasTab();
  if (btnExport) btnExport.onclick = () => exportCurrentCampaignCsv();
  if (btnDelete) btnDelete.onclick = () => openDeleteCampanhaModal();
  if (btnDeleteClose) btnDeleteClose.onclick = () => closeDeleteCampanhaModal();
  if (btnDeleteCancel) btnDeleteCancel.onclick = () => closeDeleteCampanhaModal();
  if (btnDeleteConfirm) {
    btnDeleteConfirm.onclick = async () => {
      try {
        const campanhaId = deleteSelect?.value || '';
        await deleteCurrentCampaign(campanhaId);
      } catch (err) {
        console.error(err);
        alert(err.message || 'Erro ao apagar campanha.');
      }
    };
  }
  if (btnHeaderAlertOpen) {
    btnHeaderAlertOpen.onclick = () => {
      campanhasOnlyOverdue = true;
      const tabBtn = document.querySelector('.tab-btn[data-tab="campanhas"]');
      if (tabBtn) tabBtn.click();
      renderCampanhasTab();
    };
  }

  if (btnClearOverdue) {
    btnClearOverdue.onclick = () => {
      campanhasOnlyOverdue = false;
      renderCampanhasTab();
    };
  }

  if (btnResetFilters) {
    btnResetFilters.onclick = () => {
      campanhasOnlyOverdue = false;
      if (campanhaFilter) campanhaFilter.value = '';
      if (statusFilter) statusFilter.value = '';
      if (searchInput) searchInput.value = '';
      if (overdueModeFilter) overdueModeFilter.value = '';
      if (overdueDaysFilter) overdueDaysFilter.value = '3';
      const user = obterUsuarioLogado();
      if (vendedorFilter && (!user || user.perfil === 'master')) vendedorFilter.value = '';
      renderCampanhasTab();
    };
  }

  const rerenderFiltered = () => {
    const filtered = getCampanhasFilteredLeads();
    renderCampanhasMetrics(filtered);
    renderCampanhasTable(filtered);
    renderCampanhaReport(filtered);
    renderCampanhasAgenda(filtered);
    renderOverdueFilterIndicator();
    const overdueCount = campanhaLeadsCache.filter(l => {
      if (!l.data_proximo_contato) return false;
      if (l.status_funil === 'Fechado' || l.status_funil === 'Perdido') return false;
      return l.data_proximo_contato < getTodayISO();
    }).length;
    setHeaderFollowupAlert(overdueCount);
  };

  if (campanhaFilter) campanhaFilter.onchange = rerenderFiltered;
  if (vendedorFilter) vendedorFilter.onchange = rerenderFiltered;
  if (statusFilter) statusFilter.onchange = rerenderFiltered;
  if (overdueModeFilter) overdueModeFilter.onchange = rerenderFiltered;
  if (overdueDaysFilter) overdueDaysFilter.oninput = rerenderFiltered;
  if (searchInput) searchInput.oninput = rerenderFiltered;

  if (btnCloseModal) btnCloseModal.onclick = closeLeadModal;
  if (btnCancelModal) btnCancelModal.onclick = closeLeadModal;
  if (btnSaveModal) btnSaveModal.onclick = async () => {
    try {
      await saveLeadFromModal();
    } catch (err) {
      console.error('Erro ao salvar lead:', err);
      alert('Nao foi possivel salvar o lead.');
    }
  };

  document.body.addEventListener('click', (e) => {
    const openBtn = e.target.closest('.btn-open-campanha-lead');
    if (openBtn) {
      openLeadModal(Number(openBtn.dataset.id));
    }
  });

  campanhasInitialized = true;
}

window.initCampanhasModule = initCampanhasModule;
window.renderCampanhasTab = renderCampanhasTab;
