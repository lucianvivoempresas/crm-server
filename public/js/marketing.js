// js/marketing.js
// Funcionalidade de Marketing por Email

let marketingClientesSelecionados = [];
let marketingTemplates = {
  promocao: {
    assunto: '🎁 Promoção Especial Exclusiva para Você!',
    corpo: `Olá {{nome}},

Temos o prazer de lhe apresentar uma oferta especial e exclusiva!

📌 PROMOÇÃO IMPERDÍVEL:
- Desconto especial em todos os nossos produtos
- Válido por tempo limitado
- Apenas para clientes selecionados como você

Não perca essa oportunidade! Clique aqui para aproveitar agora.

Atenciosamente,
Equipe Commercial`
  },
  novoproduto: {
    assunto: '🆕 Confira o Nosso Novo Produto!',
    corpo: `Olá {{nome}},

Estamos entusiasmados em apresentar nosso novo produto que revolucionará sua experiência!

✨ NOVIDADES:
- Tecnologia de ponta
- Qualidade superior
- Preço competitivo

Somos a única empresa a oferecer isso no mercado. Qu eremos que você seja um dos primeiros a conhecer!

Saiba mais agora mesmo!

Atenciosamente,
Equipe Produtos`
  },
  acompanhamento: {
    assunto: '👋 Como Você Está? Vamos Nos Conectar?',
    corpo: `Olá {{nome}},

Esperamos que você esteja bem!

Gostaríamos de ouvir sobre sua experiência conosco e saber como podemos melhorar nossos serviços.

Estamos à disposição para:
✅ Responder dúvidas
✅ Fornecer suporte técnico
✅ Discutir novas oportunidades

Vamos bater um papo? Estamos aqui para você!

Atenciosamente,
Equipe Atendimento`
  },
  oferta: {
    assunto: '💰 OFERTA LIMITADA - Válida por Apenas 48 Horas!',
    corpo: `Olá {{nome}},

⏰ ATENÇÃO: Ofertas como essa não surgem todo dia!

🔥 OFERTA RELÂMPAGO:
- Desconto de até 40%
- Válido POR APENAS 48 HORAS
- Estoque limitado

Essa é sua chance! Not deixe passar!

CLIQUE AQUI AGORA para garantir seu desconto

LEMBRE-SE: A oferta expira em 48 horas!

Atenciosamente,
Equipe Vendas`
  }
};

/**
 * Inicializar Marketing
 */
function inicializarMarketing() {
  console.log('🚀 Inicializando módulo de Marketing');

  // Verificar se elementos existem antes de adicionar listeners
  const tabCompose = document.getElementById('marketing-tab-compose');
  const tabHistory = document.getElementById('marketing-tab-history');
  const tabTemplates = document.getElementById('marketing-tab-templates');

  if (!tabCompose) {
    console.warn('⚠️ Elemento marketing-tab-compose não encontrado');
    return;
  }

  // Event Listeners para abas
  tabCompose.addEventListener('click', () => {
    mostrarPainelMarketing('compose');
  });

  if (tabHistory) {
    tabHistory.addEventListener('click', () => {
      mostrarPainelMarketing('history');
      carregarHistoricoEmails();
    });
  }

  if (tabTemplates) {
    tabTemplates.addEventListener('click', () => {
      mostrarPainelMarketing('templates');
    });
  }

  // Filtro e busca de clientes
  const filterStatus = document.getElementById('marketing-filter-status');
  const searchCliente = document.getElementById('marketing-search-cliente');

  if (filterStatus) {
    filterStatus.addEventListener('change', atualizarListaClientesMarketing);
  }

  if (searchCliente) {
    searchCliente.addEventListener('input', atualizarListaClientesMarketing);
  }

  // Seleção de clientes
  const btnSelectAll = document.getElementById('marketing-btn-select-all');
  const btnDeselectAll = document.getElementById('marketing-btn-deselect-all');

  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', selecionarTodosClientesMarketing);
  }

  if (btnDeselectAll) {
    btnDeselectAll.addEventListener('click', deseleccionarTodosClientesMarketing);
  }

  // Template selector
  const templateSelect = document.getElementById('marketing-template-select');
  if (templateSelect) {
    templateSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        marketingCarregaTemplate(e.target.value);
      }
    });
  }

  // Corpo do email - atualizar preview
  const subject = document.getElementById('marketing-subject');
  const body = document.getElementById('marketing-body');

  if (subject) {
    subject.addEventListener('input', atualizarPreviewEmail);
  }

  if (body) {
    body.addEventListener('input', atualizarPreviewEmail);
  }

  // Botões de ação
  const btnEnviar = document.getElementById('marketing-btn-enviar');
  const btnPreview = document.getElementById('marketing-btn-preview');
  const btnRefreshHistory = document.getElementById('marketing-btn-refresh-history');

  if (btnEnviar) {
    btnEnviar.addEventListener('click', enviarEmailsMarketing);
  }

  if (btnPreview) {
    btnPreview.addEventListener('click', mostrarPreviewDetalhado);
  }

  if (btnRefreshHistory) {
    btnRefreshHistory.addEventListener('click', carregarHistoricoEmails);
  }

  // Carregar clientes inicialmente
  console.log('📋 Carregando lista de clientes...');
  atualizarListaClientesMarketing();
}

/**
 * Mostrar painéis de Marketing
 */
function mostrarPainelMarketing(painel) {
  const paneisId = {
    compose: 'marketing-compose-panel',
    history: 'marketing-history-panel',
    templates: 'marketing-templates-panel'
  };

  // Esconder todos
  document.getElementById('marketing-compose-panel').classList.add('hidden');
  document.getElementById('marketing-history-panel').classList.add('hidden');
  document.getElementById('marketing-templates-panel').classList.add('hidden');

  // Mostrar selecionado
  if (paneisId[painel]) {
    document.getElementById(paneisId[painel]).classList.remove('hidden');
  }

  // Atualizar abas
  document.getElementById('marketing-tab-compose').classList.toggle('border-blue-500 text-white', painel === 'compose');
  document.getElementById('marketing-tab-compose').classList.toggle('border-transparent text-slate-400', painel !== 'compose');

  document.getElementById('marketing-tab-history').classList.toggle('border-blue-500 text-white', painel === 'history');
  document.getElementById('marketing-tab-history').classList.toggle('border-transparent text-slate-400', painel !== 'history');

  document.getElementById('marketing-tab-templates').classList.toggle('border-blue-500 text-white', painel === 'templates');
  document.getElementById('marketing-tab-templates').classList.toggle('border-transparent text-slate-400', painel !== 'templates');
}

/**
 * Atualizar lista de clientes com filtros
 */
function atualizarListaClientesMarketing() {
  try {
    const filtroStatus = document.getElementById('marketing-filter-status')?.value || '';
    const buscaTexto = (document.getElementById('marketing-search-cliente')?.value || '').toLowerCase();

    // Buscar clientes do banco
    getAllData('clientes').then(clientes => {
      console.log(`📊 Total de clientes carregados: ${clientes.length}`);
      
      let clientesFiltrados = clientes;

      // Se for vendedor, limitar também no front-end (redundância segura)
      const user = obterUsuarioLogado();
      if (user && user.perfil === 'vendedor') {
        clientesFiltrados = clientesFiltrados.filter(c => c.vendedor_id === user.id);
      }

      // Filtrar por status
      if (filtroStatus) {
        clientesFiltrados = clientesFiltrados.filter(c => {
          return true; // Por enquanto, mostrar todos com email
        });
      }

      // Filtrar por busca
      if (buscaTexto) {
        console.log(`🔍 Filtrando por: "${buscaTexto}"`);
        clientesFiltrados = clientesFiltrados.filter(c => {
          const nome = (c.nome || '').toLowerCase();
          const email = (c.email || '').toLowerCase();
          return nome.includes(buscaTexto) || email.includes(buscaTexto);
        });
        console.log(`🔍 Encontrados ${clientesFiltrados.length} clientes`);
      }

      // Filtrar apenas clientes com email
      clientesFiltrados = clientesFiltrados.filter(c => c.email && c.email.includes('@'));
      
      console.log(`📧 Clientes com email válido: ${clientesFiltrados.length}`);

      renderizarListaClientesMarketing(clientesFiltrados);
    }).catch(error => {
      console.error('❌ Erro ao carregar clientes:', error);
      document.getElementById('marketing-clientes-empty').classList.remove('hidden');
    });
  } catch (error) {
    console.error('❌ Erro em atualizarListaClientesMarketing:', error);
  }
}

/**
 * Renderizar lista de clientes
 */
function renderizarListaClientesMarketing(clientes) {
  const container = document.getElementById('marketing-clientes-list');
  const emptyDiv = document.getElementById('marketing-clientes-empty');

  if (!container) {
    console.error('❌ Elemento marketing-clientes-list não encontrado');
    return;
  }

  container.innerHTML = '';

  if (!clientes || clientes.length === 0) {
    console.log('📭 Nenhum cliente para mostrar');
    if (emptyDiv) {
      emptyDiv.classList.remove('hidden');
    }
    return;
  }

  if (emptyDiv) {
    emptyDiv.classList.add('hidden');
  }

  console.log(`🎯 Renderizando ${clientes.length} cliente(s)`);

  clientes.forEach(cliente => {
    const checkboxDiv = document.createElement('div');
    checkboxDiv.className = 'flex items-center gap-2 p-2 rounded hover:bg-slate-800 cursor-pointer transition-colors';
    
    const nomeCliente = cliente.nome || 'Sem Nome';
    const emailCliente = cliente.email || 'sem-email';
    
    checkboxDiv.innerHTML = `
      <input type="checkbox" class="marketing-cliente-checkbox" data-id="${cliente.id || ''}" data-nome="${nomeCliente}" data-email="${emailCliente}" />
      <div class="flex-1 min-w-0">
        <p class="text-white text-sm font-medium truncate">${nomeCliente}</p>
        <p class="text-slate-400 text-xs truncate">${emailCliente}</p>
      </div>
    `;

    // Event listener para checkbox
    const checkboxInput = checkboxDiv.querySelector('input[type="checkbox"]');
    if (checkboxInput) {
      checkboxInput.addEventListener('change', atualizarClientesSelecionadosMarketing);

      // Se já estava selecionado, marcar
      if (marketingClientesSelecionados.some(c => c.id === cliente.id)) {
        checkboxInput.checked = true;
      }
    }

    container.appendChild(checkboxDiv);
  });

  atualizarPreviewEmail();
  console.log('✅ Lista de clientes renderizada');
}

/**
 * Atualizar clientes selecionados
 */
function atualizarClientesSelecionadosMarketing() {
  const checkboxes = document.querySelectorAll('.marketing-cliente-checkbox:checked');
  marketingClientesSelecionados = Array.from(checkboxes).map(cb => ({
    id: cb.dataset.id,
    nome: cb.dataset.nome,
    email: cb.dataset.email
  }));

  console.log(`✅ ${marketingClientesSelecionados.length} cliente(s) selecionado(s)`, marketingClientesSelecionados);

  // Atualizar contador
  const counterEl = document.getElementById('marketing-selected-count');
  if (counterEl) {
    counterEl.textContent = marketingClientesSelecionados.length;
  }

  // Habilitar/desabilitar botão
  const btnEnviar = document.getElementById('marketing-btn-enviar');
  const subject = document.getElementById('marketing-subject');
  const body = document.getElementById('marketing-body');

  if (btnEnviar) {
    const subjetValue = subject?.value.trim() || '';
    const bodyValue = body?.value.trim() || '';
    btnEnviar.disabled = marketingClientesSelecionados.length === 0 || !subjetValue || !bodyValue;
  }

  // Atualizar preview
  atualizarPreviewEmail();
}

/**
 * Selecionar todos os clientes
 */
function selecionarTodosClientesMarketing() {
  document.querySelectorAll('.marketing-cliente-checkbox').forEach(cb => {
    cb.checked = true;
  });
  atualizarClientesSelecionadosMarketing();
}

/**
 * Desselecionar todos
 */
function deseleccionarTodosClientesMarketing() {
  document.querySelectorAll('.marketing-cliente-checkbox').forEach(cb => {
    cb.checked = false;
  });
  atualizarClientesSelecionadosMarketing();
}

/**
 * Carregar template
 */
function marketingCarregaTemplate(templateKey) {
  const template = marketingTemplates[templateKey];
  if (template) {
    document.getElementById('marketing-subject').value = template.assunto;
    document.getElementById('marketing-body').value = template.corpo;
    document.getElementById('marketing-template-select').value = '';
    atualizarPreviewEmail();
    mostrarPainelMarketing('compose');
    console.log('✅ Template carregado:', templateKey);
  }
}

/**
 * Atualizar preview do email
 */
function atualizarPreviewEmail() {
  try {
    const subjectEl = document.getElementById('marketing-subject');
    const bodyEl = document.getElementById('marketing-body');
    const previewEl = document.getElementById('marketing-preview');

    if (!previewEl) {
      console.warn('⚠️ Elemento marketing-preview não encontrado');
      return;
    }

    const assunto = subjectEl?.value || '';
    const corpo = bodyEl?.value || '';

    if (marketingClientesSelecionados.length === 0) {
      previewEl.textContent = 'Selecione clientes para ver preview...';
      return;
    }

    const primeiroCliente = marketingClientesSelecionados[0];
    const corpoPersonalizado = corpo.replace(/{{nome}}/g, primeiroCliente.nome || 'Cliente');

    const preview = `ASSUNTO: ${assunto}\n\n${corpoPersonalizado}`;
    previewEl.textContent = preview;
    console.log('👁️ Preview atualizado');
  } catch (error) {
    console.error('❌ Erro ao atualizar preview:', error);
  }
}

/**
 * Mostrar preview detalhado
 */
function mostrarPreviewDetalhado() {
  if (marketingClientesSelecionados.length === 0) {
    mostrarAviso('⚠️ Selecione pelo menos um cliente para ver o preview');
    return;
  }

  const assunto = document.getElementById('marketing-subject').value;
  const corpo = document.getElementById('marketing-body').value;

  if (!assunto.trim() || !corpo.trim()) {
    mostrarAviso('⚠️ Preencha o assunto e o corpo do email');
    return;
  }

  // Criar uma lista de previews
  let html = '<div class="space-y-4 text-sm">';
  marketingClientesSelecionados.forEach((cliente, idx) => {
    const corpoPersonalizado = corpo.replace(/{{nome}}/g, cliente.nome || 'Cliente');
    html += `
      <div class="border border-slate-600 rounded-lg p-4 bg-slate-900/50">
        <p class="text-gray-400 mb-2"><strong>Para:</strong> ${cliente.email}</p>
        <p class="text-white mb-2"><strong>Assunto:</strong> ${assunto}</p>
        <p class="text-slate-300 whitespace-pre-wrap">${corpoPersonalizado}</p>
      </div>
    `;
  });
  html += '</div>';

  // Mostrar em alert
  const confirmar = confirm(`Preview de ${marketingClientesSelecionados.length} email(s):\n\nDeseja continuar para enviar?`);
  if (confirmar) {
    enviarEmailsMarketing();
  }
}

/**
 * Enviar emails de marketing
 */
async function enviarEmailsMarketing() {
  const assunto = document.getElementById('marketing-subject')?.value.trim() || '';
  const corpo = document.getElementById('marketing-body')?.value.trim() || '';

  console.log('📧 Iniciando envio de emails...');
  console.log(`   Assunto: ${assunto}`);
  console.log(`   Corpo: ${corpo.substring(0, 50)}...`);
  console.log(`   Clientes: ${marketingClientesSelecionados.length}`);

  // Validação
  if (!assunto) {
    mostrarErroMarketing('Por favor, preencha o assunto');
    console.warn('⚠️ Assunto vazio');
    return;
  }

  if (!corpo) {
    mostrarErroMarketing('Por favor, preencha o corpo do email');
    console.warn('⚠️ Corpo vazio');
    return;
  }

  if (marketingClientesSelecionados.length === 0) {
    mostrarErroMarketing('Por favor, selecione pelo menos um cliente');
    console.warn('⚠️ Nenhum cliente selecionado');
    return;
  }

  // Mostrar loading
  const btnEnviar = document.getElementById('marketing-btn-enviar');
  if (!btnEnviar) {
    console.error('❌ Botão não encontrado');
    return;
  }

  const textoOriginal = btnEnviar.innerHTML;
  btnEnviar.disabled = true;
  btnEnviar.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> Enviando...';

  try {
    const usuario = obterUsuarioLogado();
    console.log(`👤 Usuário: ${usuario?.email}`);

    const payload = {
      assunto: assunto,
      corpo: corpo,
      clientes: marketingClientesSelecionados,
      usuario_id: usuario?.id
    };

    console.log('📤 Enviando payload:', payload);

    const response = await fetch('/api/marketing/enviar-emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('📥 Resposta do servidor:', data);

    if (data.success) {
      mostrarSucessoMarketing(`✅ ${data.enviados || 0} email(s) enviado(s) com sucesso!`);
      
      // Limpar formulário
      document.getElementById('marketing-subject').value = '';
      document.getElementById('marketing-body').value = '';
      const templateSelect = document.getElementById('marketing-template-select');
      if (templateSelect) {
        templateSelect.value = '';
      }
      deseleccionarTodosClientesMarketing();

      // Atualizar histórico
      setTimeout(() => {
        carregarHistoricoEmails();
      }, 1000);
    } else {
      mostrarErroMarketing(data.error || 'Erro ao enviar emails');
    }
  } catch (error) {
    console.error('❌ Erro ao enviar emails:', error);
    mostrarErroMarketing('Erro ao enviar emails. Tente novamente.');
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.innerHTML = textoOriginal;
  }
}

/**
 * Carregar histórico de emails
 */
async function carregarHistoricoEmails() {
  try {
    const response = await fetch('/api/marketing/historico');
    const data = await response.json();

    if (data.success && data.campanhas) {
      renderizarHistoricoEmails(data.campanhas);
    } else {
      document.getElementById('marketing-history-body').innerHTML = '';
      document.getElementById('marketing-history-empty').classList.remove('hidden');
    }
  } catch (error) {
    console.error('❌ Erro ao carregar histórico:', error);
  }
}

/**
 * Renderizar histórico de emails
 */
function renderizarHistoricoEmails(campanhas) {
  const tbody = document.getElementById('marketing-history-body');
  const emptyDiv = document.getElementById('marketing-history-empty');

  if (campanhas.length === 0) {
    tbody.innerHTML = '';
    emptyDiv.classList.remove('hidden');
    return;
  }

  emptyDiv.classList.add('hidden');
  tbody.innerHTML = '';

  campanhas.forEach(campanha => {
    const data = new Date(campanha.data_criacao).toLocaleDateString('pt-BR');
    const statusColor = campanha.status === 'enviado' ? 'text-green-400' : 'text-yellow-400';

    const tr = document.createElement('tr');
    tr.classList.add('hover:bg-slate-700/30', 'transition-colors');
    tr.innerHTML = `
      <td class="px-4 py-3 text-slate-300">${data}</td>
      <td class="px-4 py-3 text-white">${campanha.assunto}</td>
      <td class="px-4 py-3 text-slate-400">${campanha.total_destinos || 0}</td>
      <td class="px-4 py-3 text-slate-400">${campanha.total_enviados || 0}</td>
      <td class="px-4 py-3 ${statusColor} font-medium capitalize">${campanha.status}</td>
      <td class="px-4 py-3">
        <button class="text-blue-400 hover:text-blue-300 text-sm" onclick="verDetalhesEmailCampanha('${campanha.id}')">
          Detalhes
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Ver detalhes da campanha
 */
function verDetalhesEmailCampanha(campanhaId) {
  console.log('Ver detalhes da campanha:', campanhaId);
  // Implementar em futuras versões
  alert('Detalhes da campanha ' + campanhaId);
}

/**
 * Mostrar erro
 */
function mostrarErroMarketing(mensagem) {
  const div = document.getElementById('marketing-error');
  div.textContent = mensagem;
  div.classList.remove('hidden');
  setTimeout(() => {
    div.classList.add('hidden');
  }, 5000);
}

/**
 * Mostrar sucesso
 */
function mostrarSucessoMarketing(mensagem) {
  const div = document.getElementById('marketing-success');
  div.textContent = mensagem;
  div.classList.remove('hidden');
  setTimeout(() => {
    div.classList.add('hidden');
  }, 5000);
}

/**
 * Mostrar aviso
 */
function mostrarAviso(mensagem) {
  alert(mensagem);
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarMarketing);
} else {
  inicializarMarketing();
}
