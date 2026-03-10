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

    // mostra campo vendedor apenas para master
    const userLogado = obterUsuarioLogado();
    const field = document.getElementById('cliente-vendedor-field');
    const select = document.getElementById('cliente-vendedor_id');
    if (userLogado && userLogado.perfil === 'master') {
      if (field) field.classList.remove('hidden');
      if (select) {
        popularSelectVendedores(select, true);
      }
    } else {
      if (field) field.classList.add('hidden');
    }

    setupClienteEnergiaToggle('cliente');
  }

  if (type === 'venda') {
    updateDynamicSelects();
    setupVendaFormListeners();
    setupClienteAutocomplete('venda-clienteNome','venda-clienteId','venda-clienteNome-hint');

    const prefillId = window.__prefillVendaClienteId;
    const prefillNome = window.__prefillVendaClienteNome;
    if (prefillId) {
      const sel = document.getElementById('venda-clienteId');
      const inp = document.getElementById('venda-clienteNome');
      if (sel) sel.value = String(prefillId);
      if (inp) inp.value = prefillNome || '';
      const hint = document.getElementById('venda-clienteNome-hint');
      if (hint) {
        hint.textContent = 'Cliente selecionado ✔';
        hint.className = 'text-xs text-green-400 mt-1';
      }
      window.__prefillVendaClienteId = '';
      window.__prefillVendaClienteNome = '';
    }

    const userLogado = obterUsuarioLogado();
    const vendedorField = document.getElementById('venda-vendedor-field');
    const vendedorSelect = document.getElementById('venda-vendedor_id');
    if (userLogado && userLogado.perfil === 'master') {
      if (vendedorField) vendedorField.classList.remove('hidden');
      if (vendedorSelect) {
        popularSelectVendedores(vendedorSelect, false).then(() => {
          if (vendedorSelect.dataset.pendingValue) {
            vendedorSelect.value = vendedorSelect.dataset.pendingValue;
            delete vendedorSelect.dataset.pendingValue;
          }
        });
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Selecione um vendedor';
        vendedorSelect.insertBefore(placeholder, vendedorSelect.firstChild);
        vendedorSelect.value = '';
      }
    } else if (userLogado) {
      if (vendedorField) vendedorField.classList.add('hidden');
      if (vendedorSelect) {
        vendedorSelect.innerHTML = `<option value="${userLogado.id}">${userLogado.nome}</option>`;
        vendedorSelect.value = String(userLogado.id);
      }
    }
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
    // Mostrar/ocultar campo de perfil dependendo do usuário atual (apenas master pode ver/editar)
    try {
      const userLogado = obterUsuarioLogado();
      const perfilEl = document.getElementById('usuario-perfil');
      if (perfilEl) {
        if (userLogado && userLogado.perfil === 'master') {
          perfilEl.parentElement.classList.remove('hidden');
        } else {
          perfilEl.parentElement.classList.add('hidden');
        }
      }
    } catch (e) {
      console.warn('Erro ao aplicar controle de perfil no modal:', e);
    }
  }

  if (type === 'comissao') {
    // Popular select de vendedores (apenas para master)
    const userLogado = obterUsuarioLogado();
    const vendedorSelect = document.getElementById('comissao-vendedor_id');
    if (vendedorSelect && typeof usuariosList !== 'undefined' && usuariosList && userLogado && userLogado.perfil === 'master') {
      // Limpar e repopular com usuários vendedores
      vendedorSelect.innerHTML = '<option value="">Global (Todos)</option>';
      usuariosList.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.nome} (${u.email})`;
        vendedorSelect.appendChild(opt);
      });
      vendedorSelect.disabled = false;
    } else if (vendedorSelect && userLogado && userLogado.perfil === 'vendedor') {
      // Vendedor vê apenas sua comissão (desabilita select)
      vendedorSelect.disabled = true;
      vendedorSelect.innerHTML = `<option value="${userLogado.id}">${userLogado.nome}</option>`;
      vendedorSelect.value = userLogado.id;
    }
  }

  if (type === 'meta') {
    const userLogado = obterUsuarioLogado();
    const vendedorSelect = document.getElementById('meta-vendedor_id');
    if (vendedorSelect && userLogado && userLogado.perfil === 'master') {
      vendedorSelect.innerHTML = '<option value="">Global (Todos)</option>';
      (usuariosList || []).filter(u => u.perfil === 'vendedor' && u.ativo).forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.nome} (${u.email})`;
        vendedorSelect.appendChild(opt);
      });
      vendedorSelect.disabled = false;
    } else if (vendedorSelect && userLogado) {
      vendedorSelect.disabled = true;
      vendedorSelect.innerHTML = `<option value="${userLogado.id}">${userLogado.nome}</option>`;
      vendedorSelect.value = String(userLogado.id);
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
          const vendedorSel = document.getElementById('venda-vendedor_id');
          if (vendedorSel && item.vendedor_id) {
            const wanted = String(item.vendedor_id);
            vendedorSel.value = wanted;
            if (vendedorSel.value !== wanted) vendedorSel.dataset.pendingValue = wanted;
          }
        }
        if (type === 'cliente') {
          const sel = document.getElementById('cliente-vendedor_id');
          if (sel && item.vendedor_id) sel.value = item.vendedor_id;
          const coelbaEl = document.getElementById('cliente-coelba');
          const placaSolarEl = document.getElementById('cliente-placaSolar');
          const excedenteSimEl = document.getElementById('cliente-excedente-sim');
          const excedenteNaoEl = document.getElementById('cliente-excedente-nao');

          if (coelbaEl) coelbaEl.checked = !!item.coelba;
          if (placaSolarEl) placaSolarEl.checked = !!item.placaSolar;
          if (excedenteSimEl) excedenteSimEl.checked = item.excedente === 'Sim';
          if (excedenteNaoEl) excedenteNaoEl.checked = item.excedente === 'Nao';

          setupClienteEnergiaToggle('cliente');
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

  const vendedorNome = usuariosList?.find(u => Number(u.id) === Number(cliente.vendedor_id))?.nome || 'N/A';
  const mesesValue = Number.isFinite(Number(cliente.mesesDesdeUltimaVenda)) ? String(Number(cliente.mesesDesdeUltimaVenda)) : 'N/A';
  const fatorParts = [];
  if (cliente.coelba) fatorParts.push('Coelba');
  if (cliente.placaSolar) fatorParts.push('Placa Solar');
  const fatorValue = fatorParts.length ? fatorParts.join(' + ') : 'N/A';
  const excedenteValue = cliente.excedente === 'Sim' || cliente.excedente === 'Nao' ? cliente.excedente : 'N/A';

  document.getElementById('client-profile-vendedor').textContent = vendedorNome;
  document.getElementById('client-profile-meses').textContent = mesesValue;
  document.getElementById('client-profile-fator').textContent = fatorValue;
  document.getElementById('client-profile-excedente').textContent = excedenteValue;

  // Filtrar vendas do cliente por vendedor se não for master
  const user = obterUsuarioLogado();
  let vendasCliente = vendas.filter(v => Number(v.clienteId) === Number(cliente.id));
  
  // Se é vendedor, mostrar apenas suas vendas daquele cliente
  if (user && user.perfil === 'vendedor') {
    vendasCliente = vendasCliente.filter(v => v.vendedor_id === user.id);
  }
  // Se é master, mostra todas
  
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

  const timelineEl = document.getElementById('client-profile-timeline');
  if (timelineEl) {
    const eventos = [];
    if (cliente.importedAt) {
      eventos.push({ data: cliente.importedAt, titulo: 'Cadastro importado', detalhe: 'Cliente inserido via importação.' });
    }
    if (cliente.createdAt) {
      eventos.push({ data: cliente.createdAt, titulo: 'Cadastro inicial', detalhe: 'Cliente criado manualmente.' });
    }
    if (cliente.dataNascimento) {
      eventos.push({ data: cliente.dataNascimento, titulo: 'Contato', detalhe: `Data de nascimento registrada: ${formatDate(cliente.dataNascimento)}.` });
    }
    vendasCliente.forEach(v => {
      eventos.push({
        data: v.dataConclusao || v.dataRegistro,
        titulo: `Venda ${v.status || 'registrada'}`,
        detalhe: `${v.produto} • ${formatCurrency(v.valorVenda)}${v.observacao ? ` • Obs: ${v.observacao}` : ''}`
      });
    });
    if (cliente.mesesDesdeUltimaVenda) {
      eventos.push({ data: new Date().toISOString().split('T')[0], titulo: 'Pós-venda', detalhe: `${cliente.mesesDesdeUltimaVenda} meses desde a última venda.` });
    }
    const ordenados = eventos.filter(e => !!e.data).sort((a,b) => new Date(b.data) - new Date(a.data));
    timelineEl.innerHTML = ordenados.length
      ? ordenados.map(e => `
          <div class="border-l-2 border-slate-600 pl-3 py-1">
            <p class="text-xs text-slate-400">${formatDate(e.data)}</p>
            <p class="text-sm text-white font-medium">${e.titulo}</p>
            <p class="text-xs text-slate-400">${e.detalhe}</p>
          </div>
        `).join('')
      : '<p class="text-xs text-slate-400">Sem eventos para exibir.</p>';
  }

  const waBtn = document.getElementById('client-profile-action-whatsapp');
  if (waBtn) {
    waBtn.onclick = () => {
      const telRaw = String(cliente.telefone || '').replace(/\D/g, '');
      const tel = telRaw && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw;
      if (!tel) return;
      window.open(`https://wa.me/${tel}`, '_blank', 'noopener,noreferrer');
    };
  }

  const emailBtn = document.getElementById('client-profile-action-email');
  if (emailBtn) {
    emailBtn.onclick = () => {
      if (!cliente.email) return;
      window.location.href = `mailto:${cliente.email}`;
    };
  }

  const newSaleBtn = document.getElementById('client-profile-action-new-sale');
  if (newSaleBtn) {
    newSaleBtn.onclick = () => {
      window.__prefillVendaClienteId = String(cliente.id);
      window.__prefillVendaClienteNome = cliente.nome || '';
      hideClientProfileModal();
      showModal('venda');
    };
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

function setupClienteEnergiaToggle(prefix) {
  const placaSolarEl = document.getElementById(`${prefix}-placaSolar`);
  const excedenteWrapper = document.getElementById(`${prefix}-excedente-wrapper`);
  const excedenteSimEl = document.getElementById(`${prefix}-excedente-sim`);
  const excedenteNaoEl = document.getElementById(`${prefix}-excedente-nao`);
  if (!placaSolarEl || !excedenteWrapper) return;

  const updateVisibility = () => {
    const enabled = placaSolarEl.checked;
    excedenteWrapper.classList.toggle('hidden', !enabled);
    if (!enabled) {
      if (excedenteSimEl) excedenteSimEl.checked = false;
      if (excedenteNaoEl) excedenteNaoEl.checked = false;
    }
  };

  placaSolarEl.addEventListener('change', updateVisibility);
  updateVisibility();
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

  const listId = inp.getAttribute('list');
  const datalistEl = listId ? document.getElementById(listId) : null;

  const getClientesDisponiveis = (query = '') => {
    const user = obterUsuarioLogado();
    if (user && user.perfil === 'vendedor') {
      const meus = (clientes || []).filter(c => Number(c.vendedor_id) === Number(user.id));
      const q = String(query || '').trim().toLowerCase();
      if (!q) return meus;
      const temNoMeu = meus.some(c => String(c.nome || '').toLowerCase().includes(q));
      if (temNoMeu) return meus;
      // Fallback: se não houver correspondência na carteira, sugere no cadastro geral.
      return clientes || [];
    }
    return clientes || [];
  };

  const fillSuggestions = (query) => {
    if (!datalistEl) return;
    const q = String(query || '').trim().toLowerCase();
    const source = getClientesDisponiveis(q);
    let filtered;
    if (!q) {
      filtered = source.slice(0, 30);
    } else {
      const startsWith = [];
      const contains = [];
      source.forEach(c => {
        const nome = String(c.nome || '').toLowerCase();
        if (!nome.includes(q)) return;
        if (nome.startsWith(q)) startsWith.push(c);
        else contains.push(c);
      });
      filtered = [...startsWith, ...contains].slice(0, 30);
    }
    datalistEl.innerHTML = filtered.map(c => `<option value="${c.nome}"></option>`).join('');
  };

  const sync = () => {
    fillSuggestions(inp.value);
    const n = String(inp.value || '').trim().toLowerCase();
    const found = getClientesDisponiveis(inp.value).find(x => String(x.nome || '').trim().toLowerCase() === n);
    const id = found ? Number(found.id) : null;
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
  inp.addEventListener('focus', () => fillSuggestions(inp.value));
  sync();
}
