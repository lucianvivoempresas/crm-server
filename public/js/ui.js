// js/ui.js
function showModal(type, id=null) {
  hideModalError();
  const tpl = document.getElementById(`template-form-${type}`);
  if (!tpl) return;
  modalFormContent.innerHTML = tpl.innerHTML;
  modalTypeInput.value = type;
  editingIdInput.value = id || '';
  if (modalForm) modalForm.reset();

  if (type === 'cliente') {
    // Configura listener para buscar dados do CNPJ automaticamente
    setTimeout(() => {
      console.log('⏰ Ativando listener CNPJ para cliente...');
      setupCNPJListener('cliente-cpfCnpj', 'modal');
    }, 200);
  }

  if (type === 'venda') {
    updateDynamicSelects();
    setupVendaFormListeners();
    setupClienteAutocomplete('venda-clienteNome','venda-clienteId','venda-clienteNome-hint');
  }

  if (type === 'usuario') {
    // Preencher dados se for edição
    if (id) {
      const user = usuariosList?.find(u => u.id == id);
      if (user) {
        const nomeEl = document.getElementById('usuario-nome');
        const emailEl = document.getElementById('usuario-email');
        const ativoEl = document.getElementById('usuario-ativo');
        
        if (nomeEl) nomeEl.value = user.nome || '';
        if (emailEl) emailEl.value = user.email || '';
        if (ativoEl) ativoEl.checked = user.ativo ? true : false;
        
        // Alertar que senha é opcional quando editando
        const senhaEl = document.getElementById('usuario-senha');
        if (senhaEl) senhaEl.placeholder = 'Deixe em branco para não alterar';
      }
    }
  }

  if (id) {
    document.getElementById('btn-modal-save').textContent = 'Atualizar';
    const storeName = (type === 'comissao') ? 'comissoes' : `${type}s`;
    getAllData(storeName).then(arr => {
      const item = (arr || []).find(it => Number(it.id) === Number(id));
      if (item) {
        Object.keys(item).forEach(key => {
          const input = document.getElementById(`${type}-${key}`);
          if (input) input.value = item[key];
        });
        if (type === 'venda') {
          const st = document.getElementById('venda-status');
          if (st) st.dispatchEvent(new Event('change'));
          const val = document.getElementById('venda-valorVenda');
          if (val) val.dispatchEvent(new Event('input'));
        }
      }
    });
    const titles = { cliente:'Editar Cliente', venda:'Editar Venda', comissao:'Editar Regra de Comissão', meta:'Editar Meta' };
    modalTitle.textContent = titles[type] || 'Editar';
  } else {
    document.getElementById('btn-modal-save').textContent = 'Salvar';
    const titles = { cliente:'Novo Cliente', venda:'Nova Venda', comissao:'Nova Regra de Comissão', meta:'Nova Meta' };
    modalTitle.textContent = titles[type] || 'Novo';
    if (type === 'meta') {
      const anoEl = document.getElementById('meta-ano');
      if (anoEl) anoEl.value = new Date().getFullYear();
    }
  }

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function hideModal() {
  if (modal) modal.classList.add('hidden');
  if (modalForm) modalForm.reset();
  if (modalFormContent) modalFormContent.innerHTML = '';
  // Remove listener do CNPJ
  removeCNPJListener('cliente-cpfCnpj');
}

function showModalError(msg) {
  if (modalErrorMessage) {
    modalErrorMessage.textContent = msg;
    modalErrorMessage.classList.remove('hidden');
  }
}

function hideModalError() {
  if (modalErrorMessage) {
    modalErrorMessage.textContent = '';
    modalErrorMessage.classList.add('hidden');
  }
}

function showClientProfileModal(id) {
  const cliente = clientes.find(c => Number(c.id) === Number(id));
  if (!cliente) return;
  document.getElementById('client-profile-name').textContent = cliente.nome || '';
  document.getElementById('client-profile-cpfCnpj').textContent = cliente.cpfCnpj || '';
  document.getElementById('client-profile-telefone').textContent = cliente.telefone || '';
  document.getElementById('client-profile-email').textContent = cliente.email || 'N/A';
  document.getElementById('client-profile-dataNascimento').textContent = formatDate(cliente.dataNascimento);
  
  const end = cliente.endereco || {};
  const enderecoText = [end.logradouro, end.numero, end.complemento, end.bairro, end.cidade, end.uf, end.cep ? 'CEP '+end.cep : ''].filter(Boolean).join(' • ');
  document.getElementById('client-profile-endereco').textContent = enderecoText || 'N/A';
  document.getElementById('client-profile-contaContrato').textContent = cliente.contaContrato || 'N/A';

  const vendasCliente = vendas.filter(v => Number(v.clienteId) === Number(cliente.id));
  const tbody = document.getElementById('client-profile-vendas-body');
  const emptyEl = document.getElementById('client-profile-vendas-empty');

  if (!vendasCliente.length) {
    tbody.innerHTML = ''; emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
    tbody.innerHTML = vendasCliente.map(v => `
      <tr class="hover:bg-slate-700/30 ${v.observacao ? '' : 'border-b border-slate-700/50'}">
        <td class="px-4 py-3">${v.produto}</td>
        <td class="px-4 py-3">${formatCurrency(v.valorVenda)}</td>
        <td class="px-4 py-3 text-green-400">${formatCurrency(calcularComissao(v))}</td>
        <td class="px-4 py-3">${formatDate(v.dataConclusao || v.dataRegistro)}</td>
        <td class="px-4 py-3">${getStatusBadge(v.status)}</td>
      </tr>
      ${v.observacao ? `<tr><td colspan="5" class="px-4 py-2 text-xs text-slate-400 bg-slate-800/20 italic border-b border-slate-700/50">Obs: ${v.observacao}</td></tr>` : ''}
    `).join('');
  }
  clientProfileModal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function hideClientProfileModal() { clientProfileModal.classList.add('hidden'); }

function showConfirmModal(title, text) {
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-text').textContent = text;
  confirmModal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
  return new Promise(resolve => { deleteResolver = resolve; });
}

function hideConfirmModal() {
  confirmModal.classList.add('hidden');
  deleteResolver = null;
}

function showImportClientesModal() {
  if (importClientesError) { importClientesError.classList.add('hidden'); importClientesError.textContent = ''; }
  importClientesModal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function hideImportClientesModal() {
  importClientesModal.classList.add('hidden');
  importRowsCache = []; importHeadersCache = [];
  if (importPreviewBody) importPreviewBody.innerHTML = '';
  if (importPreviewCount) importPreviewCount.textContent = '0 linhas';
}

function showImportVendasModal() {
  if (importVendasError) { importVendasError.classList.add('hidden'); importVendasError.textContent = ''; }
  importVendasModal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function hideImportVendasModal() {
  importVendasModal.classList.add('hidden');
  importVendasRowsCache = []; importVendasHeadersCache = [];
  if (importVendasPreviewBody) importVendasPreviewBody.innerHTML = '';
  if (importVendasPreviewCount) importVendasPreviewCount.textContent = '0 linhas';
}

function showQuickMessage(message, isError=false) {
  const quickFormMessage = document.getElementById('quick-form-message');
  if (!quickFormMessage) return;
  quickFormMessage.textContent = message;
  quickFormMessage.className = 'rounded-lg p-3 text-sm mb-4';
  quickFormMessage.classList.toggle('bg-green-500/10', !isError);
  quickFormMessage.classList.toggle('border-green-500/30', !isError);
  quickFormMessage.classList.toggle('text-green-400', !isError);
  quickFormMessage.classList.toggle('bg-red-500/10', isError);
  quickFormMessage.classList.toggle('border-red-500/30', isError);
  quickFormMessage.classList.toggle('text-red-400', isError);
  quickFormMessage.classList.remove('hidden');
  setTimeout(() => { quickFormMessage.classList.add('hidden'); quickFormMessage.textContent = ''; }, 4000);
}

function resolveClienteIdFromName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  const c = clientes.find(x => String(x.nome || '').trim().toLowerCase() === n);
  return c ? Number(c.id) : null;
}

function setupClienteAutocomplete(inputId, selectId, hintId) {
  const inp = document.getElementById(inputId);
  const sel = document.getElementById(selectId);
  const hint = document.getElementById(hintId);
  if (!inp || !sel) return;

  const sync = () => {
    const id = resolveClienteIdFromName(inp.value);
    if (id) {
      sel.value = String(id);
      if (hint) { hint.textContent = 'Cliente encontrado ✔'; hint.className = 'text-xs text-green-400 mt-1'; }
    } else {
      sel.value = '';
      if (inp.value.trim().length >= 2) {
        if (hint) { hint.textContent = 'Cadastre o cliente antes de salvar.'; hint.className = 'text-xs text-orange-300 mt-1'; }
      } else {
        if (hint) { hint.textContent = 'Comece digitando para encontrar...'; hint.className = 'text-xs text-slate-400 mt-1'; }
      }
    }
  };
  inp.addEventListener('input', sync);
  inp.addEventListener('change', sync);
  sync();
}
