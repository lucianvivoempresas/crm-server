// js/permissions.js
// Controle de acesso e visibilidade de elementos por perfil

/**
 * Aplicar permissões na interface (mostrar/esconder elementos)
 */
function aplicarPermissoes() {
    const user = obterUsuarioLogado();
    
    if (!user) {
        console.warn('⚠️ Nenhum usuário logado ao aplicar permissões');
        return;
    }
    
    console.log(`🔐 Aplicando permissões para: ${user.nome} (${user.perfil})`);
    
    // Aplicar permissões baseado no perfil
    if (user.perfil === 'master') {
        aplicarPermissoesMaster();
    } else if (user.perfil === 'vendedor') {
        aplicarPermissoesVendedor();
    }
    
    // Atualizar header com informações do usuário
    atualizarHeaderUsuario(user);
}

/**
 * Permissões para usuário Master (acesso total)
 */
function aplicarPermissoesMaster() {
    console.log('👑 Configurando permissões de MASTER');
    
    // Mostrar botões de comissões e metas
    const btnComissoes = document.querySelector('[data-tab="comissoes"]');
    const btnMetas = document.querySelector('[data-tab="metas"]');
    
    if (btnComissoes) btnComissoes.classList.remove('hidden');
    if (btnMetas) btnMetas.classList.remove('hidden');
    
    // Mostrar seções de comissões e metas
    document.querySelectorAll('[data-permission="master-only"]').forEach(el => {
        el.classList.remove('hidden');
    });
    
    // Mostrar botões de exportação
    document.querySelectorAll('[data-action="export"]').forEach(btn => {
        btn.classList.remove('hidden');
    });
    
    // Permitir edição de comissões
    document.querySelectorAll('[data-action="editar-comissao"]').forEach(el => {
        el.classList.remove('hidden');
    });
}

/**
 * Permissões para usuário Vendedor (acesso restrito)
 */
function aplicarPermissoesVendedor() {
    console.log('👤 Configurando permissões de VENDEDOR');
    
    // Esconder botões de comissões e metas na navegação
    const btnComissoes = document.querySelector('[data-tab="comissoes"]');
    const btnMetas = document.querySelector('[data-tab="metas"]');
    
    if (btnComissoes) btnComissoes.classList.add('hidden');
    if (btnMetas) btnMetas.classList.add('hidden');
    
    // Esconder seções de comissões e metas
    document.querySelectorAll('[data-permission="master-only"]').forEach(el => {
        el.classList.add('hidden');
    });
    
    // Esconder botões de edição de comissões
    document.querySelectorAll('[data-action="editar-comissao"]').forEach(el => {
        el.classList.add('hidden');
    });
}

/**
 * Atualizar header com informações do usuário
 */
function atualizarHeaderUsuario(user) {
    const headerUser = document.getElementById('header-usuario-nome');
    const headerPerfil = document.getElementById('header-usuario-perfil');
    const headerLogin = document.getElementById('header-usuario-email');
    const btnLogout = document.getElementById('btn-logout');
    
    if (headerUser) {
        headerUser.textContent = user.nome;
    }
    
    if (headerPerfil) {
        const perfilTexto = user.perfil === 'master' ? '👑 Administrador' : '👤 Vendedor';
        headerPerfil.textContent = perfilTexto;
        // Adicionar classe para colorir diferente
        if (user.perfil === 'master') {
            headerPerfil.classList.add('text-yellow-400');
        } else {
            headerPerfil.classList.add('text-blue-400');
        }
    }
    
    if (headerLogin) {
        headerLogin.textContent = user.email;
    }
    
    if (btnLogout) {
        btnLogout.onclick = handleLogout;
    }
}

/**
 * Verificar se elemento é acessível para o usuário
 */
function temPermissao(permissaoRequerida) {
    const user = obterUsuarioLogado();
    
    if (!user) return false;
    
    // Definir permissões por role
    const permissoes = {
        'vendedor': ['dashboard-vendedor', 'clientes', 'vendas-proprias', 'pos-venda'],
        'master': ['dashboard', 'clientes', 'vendas', 'vendas-proprias', 'comissoes', 'metas', 'pos-venda', 'usuarios', 'relatorios']
    };
    
    return permissoes[user.perfil]?.includes(permissaoRequerida) || false;
}

/**
 * Proteger uma função com permissão
 */
function protegerComPermissao(permissaoRequerida, funcao) {
    return function(...args) {
        if (temPermissao(permissaoRequerida)) {
            return funcao.apply(this, args);
        } else {
            console.warn(`❌ Acesso negado. Permissão necessária: ${permissaoRequerida}`);
            alert('Você não tem permissão para realizar esta ação!');
            return null;
        }
    };
}

/**
 * Renderizar saudação personalizada no dashboard
 */
function renderizarSaudacao() {
    const user = obterUsuarioLogado();
    const saudacaoEl = document.getElementById('dashboard-saudacao');
    
    if (!user || !saudacaoEl) return;
    
    const hora = new Date().getHours();
    let saudacao = 'Olá';
    
    if (hora < 12) saudacao = 'Bom dia';
    else if (hora < 18) saudacao = 'Boa tarde';
    else saudacao = 'Boa noite';
    
    const perfilEmoji = user.perfil === 'master' ? '👑' : '👤';
    saudacaoEl.innerHTML = `
        <h1 class="text-3xl font-bold text-white">
            ${saudacao}, ${perfilEmoji} ${user.nome}!
        </h1>
        <p class="text-slate-400 mt-2">
            Bem-vindo ao CRM Vendas Pro
        </p>
    `;
}

/**
 * Mostrar/esconder painel de vendedores (apenas para master)
 */
function controlarVisibilidadeVendedores() {
    const painelVendedores = document.getElementById('painel-vendedores-master');
    
    if (!painelVendedores) return;
    
    if (ehMaster()) {
        painelVendedores.classList.remove('hidden');
    } else {
        painelVendedores.classList.add('hidden');
    }
}

/**
 * Aplicar permissões em modais
 */
function aplicarPermissoesModais() {
    // Desabilitar criar novo vendedor se não for master
    if (!ehMaster()) {
        const btnNovoVendedor = document.querySelector('[data-action="novo-vendedor"]');
        if (btnNovoVendedor) {
            btnNovoVendedor.classList.add('hidden');
        }
    }
    
    // Desabilitar editar comissões se não for master
    if (!ehMaster()) {
        const botoesEditarComissoes = document.querySelectorAll('[data-action="editar-comissao"]');
        botoesEditarComissoes.forEach(btn => btn.classList.add('hidden'));
    }
}
