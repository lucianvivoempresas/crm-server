// js/render.js
async function renderAll() {
  try {
    [clientes, vendas, comissoes, metas] = await Promise.all([
      getAllData('clientes'), getAllData('vendas'), getAllData('comissoes'), getAllData('metas')
    ]);
    renderDashboard();
    renderVendasTable();
    renderClientesGrid();
    renderPosVenda();
    renderComissoesTable();
    renderMetasGrid();
    updateDynamicSelects();
  } catch (err) { console.error(err); }
}

function renderDashboard() {
  const filterEl = document.getElementById('dashboard-period-filter');
  const filterValue = filterEl ? filterEl.value : 'this_month';
  const range = getDateRangeFromFilter(filterValue);

  // Filtrar vendas por vendedor se não for master
  const user = obterUsuarioLogado();
  let vendasUsuario = vendas;
  if (user && user.perfil === 'vendedor') {
    vendasUsuario = vendas.filter(v => v.vendedor_id === user.id);
  }

  const vendasPeriodo = filterVendasByDateRange(vendasUsuario, range);
  // Filtrar clientes também por vendedor se não for master
  let clientesUsuario = clientes;
  if (user && user.perfil === 'vendedor') {
    clientesUsuario = clientes.filter(c => c.vendedor_id === user.id);
  }
  const totalClientes = clientesUsuario.length;
  const totalVendasConcluidas = vendasPeriodo.reduce((acc, v) => acc + (Number(v.valorVenda) || 0), 0);
  const totalComissoesPeriodo = vendasPeriodo.reduce((acc, v) => acc + calcularComissao(v), 0);

  document.getElementById('metric-totalClientes').textContent = totalClientes;
  document.getElementById('metric-vendasPeriodo').textContent = vendasPeriodo.length;
  document.getElementById('metric-totalVendas').textContent = formatCurrency(totalVendasConcluidas);
  document.getElementById('metric-totalComissoes').textContent = formatCurrency(totalComissoesPeriodo);

  // Filtrar metas por período e por vendedor
  let metasPeriodo = metas.filter(m => Number(m.mes) === (range.start.getMonth() + 1) && Number(m.ano) === range.start.getFullYear());
  if (user && user.perfil === 'vendedor') {
    // Vendedor vê apenas suas metas + metas globais (sem vendedor_id)
    metasPeriodo = metasPeriodo.filter(m => !m.vendedor_id || Number(m.vendedor_id) === Number(user.id));
  }

  // Prioridade: vendedor -> meta específica dele; master -> meta global
  let metaPeriodo = null;
  if (user && user.perfil === 'vendedor') {
    metaPeriodo = metasPeriodo.find(m => Number(m.vendedor_id) === Number(user.id)) || metasPeriodo.find(m => !m.vendedor_id) || null;
  } else {
    metaPeriodo = metasPeriodo.find(m => !m.vendedor_id) || metasPeriodo[0] || null;
  }
  const container = document.getElementById('metas-progresso-content');
  const emptyEl = document.getElementById('metas-progresso-empty');

  if (metaPeriodo && container && emptyEl) {
    emptyEl.classList.add('hidden');
    let vendasParaMeta = vendasPeriodo;
    if (metaPeriodo.vendedor_id) {
      vendasParaMeta = vendasPeriodo.filter(v => Number(v.vendedor_id) === Number(metaPeriodo.vendedor_id));
    }

    const metaVendas = Number(metaPeriodo.valorMeta) || 0;
    const metaComissao = Number(metaPeriodo.comissaoMeta) || 0;
    const totalVendasMeta = vendasParaMeta.reduce((acc, v) => acc + (Number(v.valorVenda) || 0), 0);
    const totalComissoesMeta = vendasParaMeta.reduce((acc, v) => acc + calcularComissao(v), 0);
    const progressoVendas = metaVendas > 0 ? (totalVendasMeta / metaVendas) * 100 : 0;
    const progressoComissao = metaComissao > 0 ? (totalComissoesMeta / metaComissao) * 100 : 0;
    const vendedorMeta = metaPeriodo.vendedor_id ? (usuariosList?.find(u => Number(u.id) === Number(metaPeriodo.vendedor_id))?.nome || `Vendedor #${metaPeriodo.vendedor_id}`) : 'Global';

    container.innerHTML = `
      <div class="md:col-span-2 text-xs text-slate-400">Meta aplicada: ${vendedorMeta}</div>
      <div>
        <div class="flex justify-between mb-2"><span class="text-slate-400">Meta de Vendas (${formatCurrency(metaVendas)})</span><span class="text-white font-bold">${progressoVendas.toFixed(1)}%</span></div>
        <div class="w-full bg-slate-700 rounded-full h-3"><div class="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full" style="width: ${Math.min(progressoVendas,100)}%"></div></div>
      </div>
      <div>
        <div class="flex justify-between mb-2"><span class="text-slate-400">Meta de Comissão (${formatCurrency(metaComissao)})</span><span class="text-white font-bold">${progressoComissao.toFixed(1)}%</span></div>
        <div class="w-full bg-slate-700 rounded-full h-3"><div class="bg-gradient-to-r from-green-500 to-emerald-600 h-3 rounded-full" style="width: ${Math.min(progressoComissao,100)}%"></div></div>
      </div>
    `;
  } else if (container && emptyEl) {
    container.innerHTML = '';
    emptyEl.classList.remove('hidden');
  }
  renderDashboardCharts(vendasPeriodo);
  renderVendasRecentes();
  if (window.lucide) lucide.createIcons();
}

function renderDashboardCharts(vendasFiltradas) {
  const lineEl = document.getElementById('line-chart');
  const pieEl = document.getElementById('pie-chart');
  if (!lineEl || !pieEl || typeof Chart === 'undefined') return;

  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const anoAtual = new Date().getFullYear();
  
  // Filtrar vendas por vendedor se não for master
  const user = obterUsuarioLogado();
  let vendasAnoFiltradas = vendas.filter(v => v.dataConclusao && v.status === 'Concluído' && new Date(v.dataConclusao).getFullYear() === anoAtual);
  if (user && user.perfil === 'vendedor') {
    vendasAnoFiltradas = vendasAnoFiltradas.filter(v => v.vendedor_id === user.id);
  }
  // Master vê todas

  const lineData = meses.map((m, idx) => {
    const vMes = vendasAnoFiltradas.filter(v => new Date(v.dataConclusao).getMonth() === idx);
    return { vendas: vMes.reduce((a, v) => a + (Number(v.valorVenda)||0), 0), comissoes: vMes.reduce((a, v) => a + calcularComissao(v), 0) };
  });

  if (lineChartInstance) lineChartInstance.destroy();
  lineChartInstance = new Chart(lineEl.getContext('2d'), {
    type: 'line',
    data: {
      labels: meses,
      datasets: [
        { label: 'Vendas', data: lineData.map(d=>d.vendas), borderColor: '#3b82f6', backgroundColor: '#3b82f630', tension: 0.3 },
        { label: 'Comissões', data: lineData.map(d=>d.comissoes), borderColor: '#8b5cf6', backgroundColor: '#8b5cf630', tension: 0.3 }
      ]
    },
    options: chartOptions(true)
  });

  const dist = {};
  vendasFiltradas.forEach(v => dist[v.produto] = (dist[v.produto] || 0) + 1);
  const pieColors = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4'];

  if (pieChartInstance) pieChartInstance.destroy();
  pieChartInstance = new Chart(pieEl.getContext('2d'), {
    type: 'pie',
    data: { labels: Object.keys(dist), datasets: [{ data: Object.values(dist), backgroundColor: pieColors }] },
    options: chartOptions(false)
  });
}

function chartOptions(isLineChart) {
  const opt = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } } };
  if (isLineChart) {
    opt.scales = { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } };
    opt.plugins.tooltip = { callbacks: { label: c => c.dataset.label + ': ' + formatCurrency(c.parsed.y) } };
  }
  return opt;
}

function renderVendasRecentes() {
  const container = document.getElementById('vendas-recentes-container');
  const emptyEl = document.getElementById('vendas-recentes-empty');
  
  // Filtrar vendas por vendedor se não for master
  const user = obterUsuarioLogado();
  let vendasFiltradas = vendas;
  if (user && user.perfil === 'vendedor') {
    vendasFiltradas = vendas.filter(v => v.vendedor_id === user.id);
  }
  
  const recentes = [...vendasFiltradas].sort((a,b) => (new Date(b.dataConclusao||b.dataRegistro).getTime() || 0) - (new Date(a.dataConclusao||a.dataRegistro).getTime() || 0)).slice(0,5);

  if (!recentes.length) { container.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');
  container.innerHTML = recentes.map(v => {
    const cliente = clientes.find(c => c.id === v.clienteId);
    return `<div class="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
      <div><p class="text-white font-medium">${cliente?.nome || 'N/A'}</p><p class="text-sm text-slate-400">${v.produto} - ${v.operadora}</p></div>
      <div class="text-right"><p class="text-white font-bold">${formatCurrency(v.valorVenda)}</p>${getStatusBadge(v.status)}</div>
    </div>`;
  }).join('');
}

function renderVendasTable() {
  const searchTerm = (document.getElementById('search-vendas')?.value || '').toLowerCase();
  const filterStatus = document.getElementById('filter-vendas-status')?.value;
  const filterVendedor = document.getElementById('filter-vendas-vendedor')?.value;
  const filterMonth = document.getElementById('filter-vendas-month')?.value;

  const user = obterUsuarioLogado();
  const isMaster = user && user.perfil === 'master';

  const vendedorHeader = document.getElementById('vendas-col-vendedor');
  if (vendedorHeader) {
    vendedorHeader.classList.toggle('hidden', !isMaster);
  }
  
  let filtradas = vendas.filter(v => {
    const c = clientes.find(cl => cl.id === v.clienteId);
    // Se é vendedor, filtrar apenas suas vendas
    if (user && user.perfil === 'vendedor' && v.vendedor_id !== user.id) {
      return false;
    }
    return (!searchTerm || (c?.nome||'').toLowerCase().includes(searchTerm)) &&
           (!filterStatus || v.status === filterStatus) &&
          (!filterVendedor || String(v.vendedor_id) === String(filterVendedor)) &&
           (!filterMonth || (v.dataConclusao && v.dataConclusao.startsWith(filterMonth)));
  });

  const tbody = document.getElementById('vendas-table-body');
  const emptyEl = document.getElementById('vendas-table-empty');
  
  if (!filtradas.length) { tbody.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');
  
  tbody.innerHTML = filtradas.map(v => {
    const c = clientes.find(cl => cl.id === v.clienteId);
    const vendedorNome = usuariosList?.find(u => Number(u.id) === Number(v.vendedor_id))?.nome || 'N/A';
    const vendedorCell = isMaster ? `<td class="px-6 py-4 text-slate-300">${vendedorNome}</td>` : '';
    return `<tr class="hover:bg-slate-700/30">
      <td class="px-6 py-4 text-white">${c?.nome||'N/A'}</td><td class="px-6 py-4 text-slate-300">${v.produto}</td><td class="px-6 py-4 text-slate-300">${v.operadora}</td>${vendedorCell}
      <td class="px-6 py-4 text-white font-medium">${formatCurrency(v.valorVenda)}</td><td class="px-6 py-4 text-green-400 font-medium">${formatCurrency(calcularComissao(v))}</td>
      <td class="px-6 py-4">${getStatusBadge(v.status)}</td>
      <td class="px-6 py-4"><div class="flex gap-2">
        <button class="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors btn-edit" data-id="${v.id}" data-type="venda"><i data-lucide="edit-2" class="w-4 h-4 pointer-events-none"></i></button>
        <button class="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors btn-delete" data-id="${v.id}" data-type="venda"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
      </div></td>
    </tr>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function renderClientesGrid() {
  const container = document.getElementById('clientes-grid-container');
  const emptyEl = document.getElementById('clientes-grid-empty');
  const searchTerm = (document.getElementById('search-clientes')?.value || '').toLowerCase().trim();
  
  // Filtrar clientes baseado no perfil
  let clientesFiltrados = clientes;
  const user = obterUsuarioLogado();
  
  if (user && user.perfil === 'vendedor') {
    // Vendedor vê apenas seus clientes
    clientesFiltrados = clientes.filter(c => c.vendedor_id === user.id);
  }
  // Master vê todos

  if (searchTerm) {
    clientesFiltrados = clientesFiltrados.filter(c => (c.nome || '').toLowerCase().includes(searchTerm));
  }
  
  if (!clientesFiltrados.length) { container.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
  
  emptyEl.classList.add('hidden');
  container.innerHTML = clientesFiltrados.map(cliente => {
    const inicial = cliente.nome ? cliente.nome.charAt(0).toUpperCase() : '?';
    // para master, mostrar nome do vendedor responsável
    const user = obterUsuarioLogado();
    let vendorInfo = '';
    if (user && user.perfil === 'master') {
      const v = usuariosList?.find(u => Number(u.id) === Number(cliente.vendedor_id));
      if (v) vendorInfo = `<p class="text-xs text-slate-400">Vendedor: ${v.nome}</p>`;
    }
    return `
      <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700 hover:border-blue-500/50 transition-all">
        <div class="flex justify-between items-start mb-4">
          <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
            ${inicial}
          </div>
          <div class="flex gap-2">
            <button class="p-2 text-gray-400 hover:bg-gray-500/20 rounded-lg transition-colors btn-view-profile" data-id="${cliente.id}" title="Ver Perfil">
              <i data-lucide="eye" class="w-4 h-4 pointer-events-none"></i>
            </button>
            <button class="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors btn-edit" data-id="${cliente.id}" data-type="cliente" title="Editar">
              <i data-lucide="edit-2" class="w-4 h-4 pointer-events-none"></i>
            </button>
            <button class="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors btn-delete" data-id="${cliente.id}" data-type="cliente" title="Excluir">
              <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
            </button>
          </div>
        </div>
        <h3 class="text-lg font-bold text-white mb-2">${cliente.nome}</h3>
        <div class="space-y-1 text-sm text-slate-400">
          <p>CPF/CNPJ: ${cliente.cpfCnpj || 'N/A'}</p>
          <p>Tel: ${cliente.telefone || 'N/A'}</p>
          <p>Email: ${cliente.email || 'N/A'}</p>
          <p>Aniversário: ${formatDate(cliente.dataNascimento)}</p>
          ${vendorInfo}
        </div>
      </div>
    `;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function renderPosVenda() {
  const container = document.getElementById('posvenda-container');
  const emptyEl = document.getElementById('posvenda-empty');
  const lembretes = [];
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  
  // Filtrar vendas por vendedor se não for master
  const user = obterUsuarioLogado();
  let vendasFiltradas = vendas.filter(v => v.status === 'Concluído' && v.dataConclusao);
  if (user && user.perfil === 'vendedor') {
    vendasFiltradas = vendasFiltradas.filter(v => v.vendedor_id === user.id);
  }
  // Master vê todas
  
  vendasFiltradas.forEach(v => {
    const d = Math.round(Math.abs(hoje - new Date(v.dataConclusao+'T00:00:00')) / 86400000);
    const dis = v.posVendaDismissed || [];
    let tipo = null;
    if (d >= 510 && !dis.includes('RENOVACAO')) tipo = 'RENOVACAO';
    else if (d >= 90 && !dis.includes(90)) tipo = 90;
    else if (d >= 30 && !dis.includes(30)) tipo = 30;
    else if (d >= 7 && !dis.includes(7)) tipo = 7;
    
    if (tipo) lembretes.push({v, c: clientes.find(cl=>cl.id===v.clienteId), tipo, text: tipo==='RENOVACAO'?'Renovação (17+ meses)':`${tipo} dias`});
  });

  if (!lembretes.length) { container.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');
  container.innerHTML = lembretes.map(l => {
    const telRaw = (l.c?.telefone || '').replace(/\D/g, '');
    let tel = telRaw;
    if (tel && !tel.startsWith('55')) tel = '55' + tel;
    return `
      <div class="bg-gradient-to-r from-orange-500/10 to-red-500/10 border-l-4 border-orange-500 rounded-xl p-6 mb-4">
        <div class="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <i data-lucide="bell" class="w-5 h-5 text-orange-400"></i>
              <span class="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-sm font-medium">${l.text}</span>
            </div>
            <h3 class="text-lg font-bold text-white mb-2">${l.c?.nome || 'Cliente não encontrado'}</h3>
            <div class="space-y-1 text-sm text-slate-400">
              <p>Produto: ${l.v.produto} - ${l.v.operadora}</p>
              <p>Valor: ${formatCurrency(l.v.valorVenda)}</p>
              <p>Data da Venda: ${formatDate(l.v.dataConclusao)}</p>
              <p class="mt-2 text-orange-400 font-medium">${l.tipo === 'RENOVACAO' ? '⚡ Hora de renovar o contrato (17+ meses)!' : 'Entrar em contato para verificar satisfação!'}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <a href="[https://wa.me/$](https://wa.me/$){tel}" target="_blank" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium flex items-center gap-2">
              <i data-lucide="message-circle" class="w-4 h-4"></i> WhatsApp
            </a>
            <a href="mailto:${l.c?.email}" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium flex items-center gap-2">
              <i data-lucide="mail" class="w-4 h-4"></i> Email
            </a>
            <button class="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium flex items-center gap-2 btn-dismiss-lembrete" data-venda-id="${l.v.id}" data-tipo="${l.tipo}">
              <i data-lucide="check" class="w-4 h-4"></i> Dispensar
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  if(window.lucide) lucide.createIcons();
}

function renderComissoesTable() {
  const tbody = document.getElementById('comissoes-table-body');
  const emptyEl = document.getElementById('comissoes-table-empty');
  
  // Filtra comissões por vendedor - cada vendedor vê suas comissões + globais (sem vendedor_id)
  const user = obterUsuarioLogado();
  let comissoesVisíveis = comissoes;
  if (user && user.perfil === 'vendedor') {
    // Vendedor vê: comissões globais (sem vendedor_id) OU com seu ID específico
    comissoesVisíveis = comissoes.filter(c => !c.vendedor_id || c.vendedor_id === user.id);
  }
  // Master vê TODAS as comissoes (globais e específicas por vendedor)
  
  if (!comissoesVisíveis.length) { tbody.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
  
  emptyEl.classList.add('hidden');
  tbody.innerHTML = comissoesVisíveis.map(c => {
    // Obter nome do vendedor se houver vendedor_id
    let perfilText = 'Global';
    if (c.vendedor_id && usuariosList) {
      const vendedor = usuariosList.find(u => u.id === c.vendedor_id);
      perfilText = vendedor ? vendedor.nome : `Vendedor #${c.vendedor_id}`;
    }
    return `
    <tr class="hover:bg-slate-700/30 transition-colors">
      <td class="px-6 py-4 text-white font-medium">${c.produto}</td>
      <td class="px-6 py-4 text-slate-300">${c.tipoCliente}</td>
      <td class="px-6 py-4 text-slate-300">${c.operadora}</td>
      <td class="px-6 py-4 text-slate-300 text-sm">${perfilText}</td>
      <td class="px-6 py-4 text-green-400 font-bold">${c.comissao}%</td>
      <td class="px-6 py-4">
        <div class="flex gap-2">
          <button class="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors btn-edit" data-id="${c.id}" data-type="comissao">
            <i data-lucide="edit-2" class="w-4 h-4 pointer-events-none"></i>
          </button>
          <button class="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors btn-delete" data-id="${c.id}" data-type="comissao">
            <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
          </button>
        </div>
      </td>
    </tr>
    `;
  }).join('');
  if(window.lucide) lucide.createIcons();
}

function renderMetasGrid() {
  const container = document.getElementById('metas-grid-container');
  const emptyEl = document.getElementById('metas-grid-empty');
  
  // Filtrar metas por vendedor se não for master
  const user = obterUsuarioLogado();
  let metasFiltradas = metas;
  if (user && user.perfil === 'vendedor') {
    // Vendedor vê apenas metas globais (sem vendedor_id) ou suas metas específicas
    metasFiltradas = metas.filter(m => !m.vendedor_id || m.vendedor_id === user.id);
  }
  // Master vê todas as metas
  
  if (!metasFiltradas.length) { container.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
  
  emptyEl.classList.add('hidden');
  const metasOrdenadas = [...metasFiltradas].sort((a,b) => {
    if (Number(a.ano) !== Number(b.ano)) return Number(a.ano) - Number(b.ano);
    return Number(a.mes) - Number(b.mes);
  });

  container.innerHTML = metasOrdenadas.map(meta => {
    // Filtrar vendas da meta também por vendedor se aplicável
    const user = obterUsuarioLogado();
    let vendasParaMeta = (vendas || []).filter(v => {
      if (!v.dataConclusao || v.status !== 'Concluído') return false;
      const d = new Date(v.dataConclusao + 'T00:00:00');
      return d.getMonth() === Number(meta.mes) - 1 && d.getFullYear() === Number(meta.ano);
    });
    
    // Se é vendedor, filtrar apenas suas vendas
    if (user && user.perfil === 'vendedor') {
      vendasParaMeta = vendasParaMeta.filter(v => v.vendedor_id === user.id);
    }
    // Se meta é específica, sempre filtra para o vendedor daquela meta
    if (meta.vendedor_id) {
      vendasParaMeta = vendasParaMeta.filter(v => Number(v.vendedor_id) === Number(meta.vendedor_id));
    }
    
    const vendasMeta = vendasParaMeta;
    const totalVendas = vendasMeta.reduce((acc,v) => acc + (Number(v.valorVenda)||0),0);
    const totalComissoes = vendasMeta.reduce((acc,v) => acc + calcularComissao(v), 0);
    const metaVendas = Number(meta.valorMeta) || 0;
    const metaComissao = Number(meta.comissaoMeta) || 0;
    const progressoVendas = metaVendas > 0 ? (totalVendas / metaVendas) * 100 : 0;
    const progressoComissoes = metaComissao > 0 ? (totalComissoes / metaComissao) * 100 : 0;

    const perfilMeta = meta.vendedor_id
      ? (usuariosList?.find(u => Number(u.id) === Number(meta.vendedor_id))?.nome || `Vendedor #${meta.vendedor_id}`)
      : 'Global';

    return `
      <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700 hover:border-blue-500/50 transition-all">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-bold text-white">${String(meta.mes).padStart(2,'0')}/${meta.ano}</h3>
            <p class="text-sm text-slate-400">Meta Mensal • ${perfilMeta}</p>
          </div>
          <div class="flex gap-2">
            <button class="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors btn-edit" data-id="${meta.id}" data-type="meta">
              <i data-lucide="edit-2" class="w-4 h-4 pointer-events-none"></i>
            </button>
            <button class="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors btn-delete" data-id="${meta.id}" data-type="meta">
              <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
            </button>
          </div>
        </div>
        <div class="space-y-4">
          <div>
            <div class="flex justify-between mb-2">
              <span class="text-sm text-slate-400">Meta de Vendas</span>
              <span class="text-sm text-white font-bold">${progressoVendas.toFixed(1)}%</span>
            </div>
            <div class="w-full bg-slate-700 rounded-full h-2">
              <div class="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all" style="width:${Math.min(progressoVendas,100)}%"></div>
            </div>
            <p class="text-xs text-slate-400 mt-1">${formatCurrency(totalVendas)} / ${formatCurrency(metaVendas)}</p>
          </div>
          <div>
            <div class="flex justify-between mb-2">
              <span class="text-sm text-slate-400">Meta de Comissão</span>
              <span class="text-sm text-white font-bold">${progressoComissoes.toFixed(1)}%</span>
            </div>
            <div class="w-full bg-slate-700 rounded-full h-2">
              <div class="bg-gradient-to-r from-green-500 to-emerald-600 h-2 rounded-full transition-all" style="width:${Math.min(progressoComissoes,100)}%"></div>
            </div>
            <p class="text-xs text-slate-400 mt-1">${formatCurrency(totalComissoes)} / ${formatCurrency(metaComissao)}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
  if(window.lucide) lucide.createIcons();
}

function updateDynamicSelects() {
  const clOptions = '<option value="">Selecione</option>' + clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  document.querySelectorAll('select[id$="venda-clienteId"]').forEach(s => { const v = s.value; s.innerHTML = clOptions; s.value = v; });
  
  const dl = document.getElementById('lista-clientes-venda');
  if(dl) dl.innerHTML = clientes.map(c => `<option value="${c.nome}"></option>`).join('');

  const dlBuscaClientes = document.getElementById('lista-clientes-busca');
  if (dlBuscaClientes) {
    dlBuscaClientes.innerHTML = clientes.map(c => `<option value="${c.nome}"></option>`).join('');
  }

  const pOptions = '<option value="">Selecione</option>' + [...new Set(comissoes.map(c=>c.produto))].map(p=>`<option value="${p}">${p}</option>`).join('');
  document.querySelectorAll('select[id$="venda-produto"]').forEach(s => { const v=s.value; s.innerHTML = pOptions; s.value=v; });

  const oOptions = '<option value="">Selecione</option>' + [...new Set(comissoes.map(c=>c.operadora))].map(o=>`<option value="${o}">${o}</option>`).join('');
  document.querySelectorAll('select[id$="venda-operadora"]').forEach(s => { const v=s.value; s.innerHTML = oOptions; s.value=v; });

  const filtroVendedor = document.getElementById('filter-vendas-vendedor');
  const user = obterUsuarioLogado();
  if (filtroVendedor && user && user.perfil === 'master') {
    const valorAtual = filtroVendedor.value;
    popularSelectVendedores(filtroVendedor, true).then(() => {
      if (filtroVendedor.options[0]) filtroVendedor.options[0].text = 'Todos os Vendedores';
      filtroVendedor.value = valorAtual;
      filtroVendedor.disabled = false;
    });
  } else if (filtroVendedor && user) {
    filtroVendedor.innerHTML = `<option value="${user.id}">${user.nome}</option>`;
    filtroVendedor.value = String(user.id);
    filtroVendedor.disabled = true;
  }
}

function getStatusBadge(status) {
  const colors = {'Concluído':'bg-green-500/20 text-green-400', 'Cancelado':'bg-red-500/20 text-red-400', 'Negociando':'bg-yellow-500/20 text-yellow-400', 'Aguardando Aceite':'bg-blue-500/20 text-blue-400', 'Inputado':'bg-purple-500/20 text-purple-400', 'Aguardando fatura':'bg-indigo-500/20 text-indigo-300', 'Aguardando Distribuidora':'bg-cyan-500/20 text-cyan-300'};
  return `<span class="px-3 py-1 rounded-full text-xs font-medium ${colors[status]||'bg-slate-500/20 text-slate-400'}">${status}</span>`;
}

function updateImportPreview() {
  if (!importPreviewBody) return;
  importPreviewBody.innerHTML = '';
  for (let i=0; i<Math.min(8, importRowsCache.length); i++) {
    const row = importRowsCache[i];
    importPreviewBody.innerHTML += `<tr><td class="py-2 pr-3 whitespace-nowrap text-slate-300">${normalizeDoc(getMappedValue(row,'cpfCnpj'))||'-'}</td><td class="py-2 pr-3">${getMappedValue(row,'nome')||'-'}</td><td class="py-2 pr-3 whitespace-nowrap">${normalizePhone(getMappedValue(row,'telefone'))||'-'}</td><td class="py-2 pr-3">${getMappedValue(row,'email')||'-'}</td></tr>`;
  }
  if (importPreviewCount) importPreviewCount.textContent = `${importRowsCache.length} linhas`;
}

function updateImportVendasPreview() {
  if (!importVendasPreviewBody) return;
  importVendasPreviewBody.innerHTML = '';
  for (let i=0; i<Math.min(8, importVendasRowsCache.length); i++) {
    const row = importVendasRowsCache[i];
    const data = getMappedVendasValue(row,'data') || '-';
    const cliente = getMappedVendasValue(row,'cliente') || '-';
    const produto = getMappedVendasValue(row,'produto') || '-';
    const valor = getMappedVendasValue(row,'valor') || '-';
    const status = getMappedVendasValue(row,'status') || '-';
    importVendasPreviewBody.innerHTML += `<tr><td class="py-2 pr-3 whitespace-nowrap text-slate-300">${data}</td><td class="py-2 pr-3">${cliente}</td><td class="py-2 pr-3">${produto}</td><td class="py-2 pr-3 text-right pr-6">${valor}</td><td class="py-2 pr-3">${status}</td></tr>`;
  }
  if (importVendasPreviewCount) importVendasPreviewCount.textContent = `${importVendasRowsCache.length} linhas`;
}
