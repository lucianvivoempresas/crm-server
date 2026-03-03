// js/usuarios.js
// Gerenciamento de usuários (funcionalidade dedicada para Master)

let usuariosList = [];

/**
 * Renderizar tabela de usuários
 */
async function renderUsuarios() {
    try {
        // Buscar usuários do servidor
        const response = await fetch(`${API_URL.replace('/api', '')}/api/usuarios`);
        if (!response.ok) throw new Error('Erro ao buscar usuários');
        
        usuariosList = await response.json();
        
        const tbody = document.getElementById('usuarios-table-body');
        const empty = document.getElementById('usuarios-table-empty');
        
        if (!tbody) return;
        
        // Limpar tabela
        tbody.innerHTML = '';
        
        if (usuariosList.length === 0) {
            empty.classList.remove('hidden');
            return;
        } else {
            empty.classList.add('hidden');
        }
        
        // Renderizar linhas
        usuariosList.forEach(user => {
            const statusBadge = user.ativo 
                ? '<span class="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">Ativo</span>'
                : '<span class="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">Inativo</span>';
            
            const ultimoAcesso = user.ultimo_acesso 
                ? new Date(user.ultimo_acesso).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : 'Nunca';
            
            const perfilIcon = user.perfil === 'master' ? '👑' : '👤';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-6 py-4 text-sm text-white">${user.nome}</td>
                <td class="px-6 py-4 text-sm text-slate-400">${user.email}</td>
                <td class="px-6 py-4 text-sm">
                    <span class="inline-block px-3 py-1 bg-slate-700/50 text-slate-300 rounded-full text-xs font-medium">
                        ${perfilIcon} ${user.perfil === 'master' ? 'Administrador' : 'Vendedor'}
                    </span>
                </td>
                <td class="px-6 py-4 text-sm">${statusBadge}</td>
                <td class="px-6 py-4 text-sm text-slate-400">${ultimoAcesso}</td>
                <td class="px-6 py-4 text-sm">
                    <div class="flex gap-2">
                        <button class="btn-edit-usuario px-3 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 text-xs font-medium transition-colors" data-id="${user.id}" title="Editar usuário">
                            <i data-lucide="edit-2" class="w-4 h-4 inline"></i> Editar
                        </button>
                        ${user.perfil !== 'master' ? `
                        <button class="btn-delete-usuario px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 text-xs font-medium transition-colors" data-id="${user.id}" data-nome="${user.nome}" title="Deletar usuário">
                            <i data-lucide="trash-2" class="w-4 h-4 inline"></i> Deletar
                        </button>
                        ` : ''}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // Recrear ícones
        if (window.lucide) lucide.createIcons();
        
    } catch (err) {
        console.error('Erro ao renderizar usuários:', err);
    }
}

/**
 * Criar novo usuário (ou abrir modal para editar)
 */
function abrirModalUsuario(usuarioId = null) {
    // Limpar erro anterior
    const errorEl = document.getElementById('modal-error-message');
    if (errorEl) errorEl.classList.add('hidden');
    
    // Abrir modal do usuário
    showModal('usuario', usuarioId);
    
    // Aguardar o template ser renderizado
    setTimeout(() => {
        if (usuarioId) {
            // Edição - senha é opcional
            const senhaInput = document.getElementById('usuario-senha');
            const confirmInput = document.getElementById('usuario-confirmaSenha');
            
            if (senhaInput) {
                senhaInput.placeholder = 'Deixe em branco para não alterar a senha';
                senhaInput.removeAttribute('required');
            }
            if (confirmInput) confirmInput.removeAttribute('required');
        } else {
            // Novo - senha é obrigatória
            const senhaInput = document.getElementById('usuario-senha');
            const confirmInput = document.getElementById('usuario-confirmaSenha');
            
            if (senhaInput) {
                senhaInput.placeholder = '••••••••';
                senhaInput.setAttribute('required', '');
            }
            if (confirmInput) confirmInput.setAttribute('required', '');
        }
    }, 100);
}

/**
 * Handler para salvar usuário (novo ou editar)
 */
async function handleSalvarUsuario() {
    const nomeInput = document.getElementById('usuario-nome');
    const emailInput = document.getElementById('usuario-email');
    const senhaInput = document.getElementById('usuario-senha');
    const confirmInput = document.getElementById('usuario-confirmaSenha');
    const ativoCheckbox = document.getElementById('usuario-ativo');
    const editingIdInput = document.getElementById('modal-editing-id-input');
    const errorEl = document.getElementById('modal-error-message');
    
    const nome = nomeInput?.value?.trim();
    const email = emailInput?.value?.trim();
    const perfilSelect = document.getElementById('usuario-perfil');
    const perfilValue = perfilSelect ? perfilSelect.value : 'vendedor';
    const senha = senhaInput?.value?.trim();
    const confirma = confirmInput?.value?.trim();
    const ativo = ativoCheckbox?.checked !== false;
    const usuarioId = editingIdInput?.value;
    
    // Validações
    if (!nome) {
        mostrarErroModal('Nome é obrigatório');
        return;
    }
    if (!email) {
        mostrarErroModal('Email é obrigatório');
        return;
    }
    if (!email.includes('@')) {
        mostrarErroModal('Email inválido');
        return;
    }
    
    // Se é novo, senha é obrigatória
    if (!usuarioId && !senha) {
        mostrarErroModal('Senha é obrigatória para novo usuário');
        return;
    }
    
    // Se está alterando senha, deve confirmar
    if (senha && senha !== confirma) {
        mostrarErroModal('As senhas não coincidem');
        return;
    }
    
    try {
                const dados = { nome, email, ativo };
                if (senha) dados.senha = senha;
                // Somente master pode alterar o perfil dos usuários
                try {
                    const usuarioLogado = obterUsuarioLogado();
                    if (usuarioLogado && usuarioLogado.perfil === 'master') {
                        dados.perfil = perfilValue || 'vendedor';
                    }
                } catch(e) {
                    console.warn('Não foi possível checar perfil do usuário atual', e);
                }
        
        const url = usuarioId 
            ? `${API_URL.replace('/api', '')}/api/usuarios/${usuarioId}`
            : `${API_URL.replace('/api', '')}/api/usuarios`;
        
        const method = usuarioId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        
        const result = await response.json();
        
        if (!result.success) {
            mostrarErroModal(result.error || 'Erro ao salvar usuário');
            return;
        }
        
        console.log(`✅ Usuário ${usuarioId ? 'atualizado' : 'criado'} com sucesso`);
        
        // Fechar modal e recarregar
        hideModal();
        await renderUsuarios();
        
    } catch (err) {
        console.error('Erro ao salvar usuário:', err);
        mostrarErroModal('Erro ao salvar usuário. Tente novamente.');
    }
}

/**
 * Deletar usuário com confirmação
 */
async function handleDeletarUsuario(usuarioId, nomeUsuario) {
    if (!confirm(`Tem certeza que deseja deletar o usuário "${nomeUsuario}"? Esta ação é irreversível.`)) {
        return;
    }
    
    try {
        const response = await fetch(
            `${API_URL.replace('/api', '')}/api/usuarios/${usuarioId}`,
            { method: 'DELETE' }
        );
        
        const result = await response.json();
        
        if (!result.success) {
            alert(result.error || 'Erro ao deletar usuário');
            return;
        }
        
        console.log(`✅ Usuário ${usuarioId} deletado`);
        await renderUsuarios();
        
    } catch (err) {
        console.error('Erro ao deletar usuário:', err);
        alert('Erro ao deletar usuário. Tente novamente.');
    }
}

/**
 * Mostrar erro no modal
 */
function mostrarErroModal(mensagem) {
    const errorEl = document.getElementById('modal-form-error');
    if (errorEl) {
        errorEl.textContent = mensagem;
        errorEl.classList.remove('hidden');
    }
}

/**
 * Setup dos event listeners para usuários
 */
function setupUsuariosListeners() {
    // Botão novo usuário
    const btnNovoUsuario = document.getElementById('btn-novo-usuario');
    if (btnNovoUsuario) {
        btnNovoUsuario.onclick = () => abrirModalUsuario();
    }
    
    // Buttons dinâmicos na tabela
    document.addEventListener('click', (e) => {
        if (e.target.closest('.btn-edit-usuario')) {
            const btn = e.target.closest('.btn-edit-usuario');
            abrirModalUsuario(btn.dataset.id);
        }
        
        if (e.target.closest('.btn-delete-usuario')) {
            const btn = e.target.closest('.btn-delete-usuario');
            handleDeletarUsuario(btn.dataset.id, btn.dataset.nome);
        }
    });
}
