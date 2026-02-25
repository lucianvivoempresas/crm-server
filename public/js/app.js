// js/app.js
window.addEventListener('load', async () => {
  try {
    if (window.lucide) lucide.createIcons();
    await initDB();
    await renderAll();
    setupEventListeners();
  } catch (err) { 
    console.error('Erro de inicialização:', err); 
  }
});

function setupEventListeners() {
  // == ABAS E NAVEGAÇÃO ==
  const tabsContainer = document.getElementById('tabs-container');
  if (tabsContainer) {
    tabsContainer.onclick = (e) => {
      const btn = e.target.closest('button.tab-btn');
      if (!btn) return;
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('text-white','border-blue-500','bg-slate-700/50');
        b.classList.add('text-slate-400','hover:text-white','hover:bg-slate-700/30','border-transparent');
      });
      const targetTab = document.getElementById(`tab-${tabId}`);
      if (targetTab) targetTab.classList.remove('hidden');
      btn.classList.add('text-white','border-blue-500','bg-slate-700/50');
      btn.classList.remove('text-slate-400','hover:text-white','hover:bg-slate-700/30','border-transparent');
    };
  }

  // == FILTROS E PESQUISAS ==
  const elDashPeriod = document.getElementById('dashboard-period-filter');
  if (elDashPeriod) elDashPeriod.onchange = renderDashboard;

  const elSearchVendas = document.getElementById('search-vendas');
  if (elSearchVendas) elSearchVendas.oninput = renderVendasTable;

  const elFilterStatus = document.getElementById('filter-vendas-status');
  if (elFilterStatus) elFilterStatus.onchange = renderVendasTable;

  const elFilterMonth = document.getElementById('filter-vendas-month');
  if (elFilterMonth) elFilterMonth.onchange = renderVendasTable;

  // == EXPORTAÇÕES ==
  const elExportDash = document.getElementById('btn-export-vendas-dash');
  if (elExportDash) elExportDash.onclick = () => exportToCSV('vendas');
  
  const elExportVendas = document.getElementById('btn-export-vendas');
  if (elExportVendas) elExportVendas.onclick = () => exportToCSV('vendas');

  const elExportClientes = document.getElementById('btn-export-clientes');
  if (elExportClientes) elExportClientes.onclick = () => exportToCSV('clientes');

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
    const target = e.target.closest('.btn-edit, .btn-delete, .btn-view-profile, .btn-dismiss-lembrete');
    if (!target) return;
    
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

  // Inicializa a lógica complementar
  setupQuickFormListeners();
}

function setupVendaFormListeners() {
  const statusSelect = document.getElementById('venda-status');
  const dataConclusaoContainer = document.getElementById('venda-data-conclusao-container');
  const dataConclusaoInput = document.getElementById('venda-dataConclusao');
  const comissaoContainer = document.getElementById('venda-comissao-estimada');
  const comissaoValor = document.getElementById('venda-comissao-valor');

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
    });

    const inputs = ['venda-produto','venda-operadora','venda-tipoCliente','venda-valorVenda'].map(id => document.getElementById(id)).filter(Boolean);
    const updateEstimativa = () => {
      const vendaParcial = {
        produto: (document.getElementById('venda-produto')?.value) || '',
        operadora: (document.getElementById('venda-operadora')?.value) || '',
        tipoCliente: (document.getElementById('venda-tipoCliente')?.value) || '',
        valorVenda: (document.getElementById('venda-valorVenda')?.value) || 0
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
  }
}

function setupQuickFormListeners() {
  setupClienteAutocomplete('qf-venda-clienteNome','qf-venda-clienteId','qf-venda-clienteNome-hint');

  const qfCliente = document.getElementById('quick-form-cliente');
  if (qfCliente) {
    // Configura listener para buscar dados do CNPJ no formulário rápido
    setupCNPJListener('qf-cliente-cpfCnpj', 'quick');
    
    qfCliente.onsubmit = async (e) => {
      e.preventDefault();
      const cnpjInput = document.getElementById('qf-cliente-cpfCnpj');
      const data = { 
        nome: document.getElementById('qf-cliente-nome').value, 
        cpfCnpj: cnpjInput.value, 
        telefone: document.getElementById('qf-cliente-telefone').value, 
        email: document.getElementById('qf-cliente-email').value || '',
        dataNascimento: document.getElementById('qf-cliente-dataNascimento').value || '',
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
        await renderAll(); 
      } catch(err) { showQuickMessage('Erro', true); }
    };
  }

  const qfVenda = document.getElementById('quick-form-venda');
  if (qfVenda) {
    qfVenda.onsubmit = async (e) => {
      e.preventDefault();
      const data = { 
        clienteId: parseInt(document.getElementById('qf-venda-clienteId').value), 
        produto: document.getElementById('qf-venda-produto').value, 
        operadora: document.getElementById('qf-venda-operadora').value, 
        valorVenda: document.getElementById('qf-venda-valorVenda').value, 
        status: document.getElementById('qf-venda-status').value, 
        observacao: document.getElementById('qf-venda-observacao').value 
      };
      try { 
        await addData('vendas', data); 
        showQuickMessage('Venda Salva!'); 
        e.target.reset(); 
        await renderAll(); 
      } catch(err) { showQuickMessage('Erro', true); }
    };
  }
}

async function handleModalSave(e) {
  e.preventDefault();
  const type = modalTypeInput.value;
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
  } else if (type === 'venda') {
    const existing = id ? vendas.find(v => Number(v.id) === Number(id)) : null;
    data = { 
      clienteId: parseInt(document.getElementById('venda-clienteId').value), 
      produto: document.getElementById('venda-produto').value, 
      operadora: document.getElementById('venda-operadora').value, 
      valorVenda: document.getElementById('venda-valorVenda').value, 
      status: document.getElementById('venda-status').value, 
      tipoCliente: document.getElementById('venda-tipoCliente').value, 
      dataConclusao: document.getElementById('venda-dataConclusao').value, 
      observacao: document.getElementById('venda-observacao').value,
      dataRegistro: existing ? existing.dataRegistro : new Date().toISOString().split('T')[0],
      posVendaDismissed: existing ? (existing.posVendaDismissed || []) : [] 
    };
  } else if (type === 'comissao') {
    data = { produto: document.getElementById('comissao-produto').value, operadora: document.getElementById('comissao-operadora').value, comissao: document.getElementById('comissao-comissao').value, tipoCliente: document.getElementById('comissao-tipoCliente').value };
  } else if (type === 'meta') {
    data = { mes: document.getElementById('meta-mes').value, ano: document.getElementById('meta-ano').value, valorMeta: document.getElementById('meta-valorMeta').value, comissaoMeta: document.getElementById('meta-comissaoMeta').value };
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
  if (type === 'vendas') {
    headers = ['Data','Cliente','Produto','Operadora','Tipo Cliente','Valor','Comissão','Status'];
    dataExport = vendas.map(v => {
      const cliente = clientes.find(c => c.id === v.clienteId);
      return [v.dataConclusao || v.dataRegistro, cliente?.nome || 'N/A', v.produto, v.operadora, v.tipoCliente, v.valorVenda, (calcularComissao(v)||0).toFixed(2), v.status];
    });
    filename = 'vendas.csv';
  } else if (type === 'clientes') {
    headers = ['CPF/CNPJ','Nome','Telefone','Email','Aniversário'];
    dataExport = clientes.map(c => [c.cpfCnpj||'', c.nome||'', c.telefone||'', c.email||'', c.dataNascimento||'']);
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
    if (!importRowsCache.length) throw new Error('Nenhuma linha carregada. Selecione um arquivo.');
    if (!importMappings.cpfCnpj.value) throw new Error('Mapeie a coluna de CPF/CNPJ (obrigatório).');

    const byDoc = new Map();
    clientes.forEach(c => {
      const d = normalizeDoc(c.cpfCnpj);
      if (d) byDoc.set(d, c);
    });

    let created = 0, updated = 0;
    for (const row of importRowsCache) {
      const doc = normalizeDoc(getMappedValue(row,'cpfCnpj'));
      if (!doc) continue;

      const clientePayload = {
        cpfCnpj: doc,
        nome: String(getMappedValue(row,'nome') || doc).trim(),
        telefone: normalizePhone(getMappedValue(row,'telefone')),
        email: String(getMappedValue(row,'email') || '').trim(),
        dataNascimento: excelDateToISO(getMappedValue(row,'dataNascimento')),
        contaContrato: String(getMappedValue(row,'contaContrato') || '').trim(),
        endereco: {
          cep: String(getMappedValue(row,'cep') || '').trim(),
          logradouro: String(getMappedValue(row,'logradouro') || '').trim(),
          numero: String(getMappedValue(row,'numero') || '').trim(),
          complemento: String(getMappedValue(row,'complemento') || '').trim(),
          bairro: String(getMappedValue(row,'bairro') || '').trim(),
          cidade: String(getMappedValue(row,'cidade') || '').trim(),
          uf: String(getMappedValue(row,'uf') || '').trim(),
        },
        importedAt: new Date().toISOString()
      };

      const existing = byDoc.get(doc);
      if (!existing) {
        const newId = await addData('clientes', clientePayload);
        clientePayload.id = newId;
        clientes.push(clientePayload);
        byDoc.set(doc, clientePayload);
        created++;
      } else {
        const merged = JSON.parse(JSON.stringify(existing));
        merged.nome = merged.nome || clientePayload.nome;
        merged.telefone = merged.telefone || clientePayload.telefone;
        merged.email = merged.email || clientePayload.email;
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

        await updateData('clientes', merged);
        const idx = clientes.findIndex(c => Number(c.id) === Number(merged.id));
        if (idx >= 0) clientes[idx] = merged;
        byDoc.set(doc, merged);
        updated++;
      }
    }

    await renderAll();
    hideImportClientesModal();
    showQuickMessage(`Importação concluída: ${created} novos, ${updated} atualizados.`, 'success');
  } catch (err) {
    console.error(err);
    if (importClientesError) { importClientesError.textContent = err.message || String(err); importClientesError.classList.remove('hidden'); }
    else alert('Erro: ' + (err.message || err));
  }
}

// == FUNÇÕES DE IMPORTAÇÃO DE VENDAS ==
async function handleImportVendasFile(file) {
  try {
    if (!window.XLSX) throw new Error('Biblioteca XLSX não carregou. Verifique sua internet.');
    const ext = (file.name || '').toLowerCase();
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
          clienteId = await addData('clientes', { nome: clienteNome, cpfCnpj: '', telefone: '' });
          cliente = { id: clienteId, nome: clienteNome };
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
