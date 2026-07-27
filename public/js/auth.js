// js/auth.js
// Gerenciamento de autenticação e sessão do usuário

// Estado da autenticação
let usuarioLogado = null;

/**
 * Fazer login do usuário
 * @param {string} email 
 * @param {string} senha 
 * @param {boolean} lembrarSessao
 * @returns {Promise}
 */
async function login(email, senha, lembrarSessao = false) {
    try {
        console.log('🔐 Iniciando login para:', email);
        
        // Chamar backend para validar credenciais
        const response = await fetch(`${API_URL.replace('/api', '')}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha, lembrarSessao })
        });
        
        const result = await response.json();
        
        if (!result.success || !result.usuario) {
            console.error('❌ Login falhou:', result.error);
            throw new Error(result.error || 'Email ou senha incorretos');
        }
        
        console.log('✅ Login bem-sucedido:', result.usuario.nome);
        
        // A sessão fica em cookie HttpOnly; nenhum token é exposto ao JavaScript.
        usuarioLogado = result.usuario;
        
        return true;
    } catch (err) {
        console.error('Erro ao fazer login:', err.message);
        throw err;
    }
}

/**
 * Fazer logout do usuário
 */
async function logout() {
    try {
        console.log('👋 Fazendo logout para:', usuarioLogado?.email);
        
        // Invalidar o cookie HttpOnly no servidor.
        try {
            await fetch(`${API_URL.replace('/api', '')}/auth/logout`, {
                method: 'POST',
                headers: buildAuthHeaders()
            });
        } catch (e) {
            // Não falha se o backend não responder
        }
        usuarioLogado = null;
        
        console.log('✅ Logout bem-sucedido');
        return true;
    } catch (err) {
        console.error('Erro ao fazer logout:', err.message);
        throw err;
    }
}

/**
 * Recuperar usuário da sessão salva
 */
async function recuperarSessao() {
    try {
        const response = await fetch(`${API_URL.replace('/api', '')}/auth/me`, { cache: 'no-store' });
        if (!response.ok) return null;
        const result = await response.json();
        usuarioLogado = result?.success ? result.usuario : null;
        return usuarioLogado;
    } catch (err) {
        console.error('Erro ao recuperar sessão:', err);
        return null;
    }
}

/**
 * Verificar se usuário está logado
 */
async function estaLogado() {
    return usuarioLogado !== null || await recuperarSessao() !== null;
}

/**
 * Obter usuário atualmente logado
 */
function obterUsuarioLogado() {
    return usuarioLogado;
}

/**
 * Verificar se é master
 */
function ehMaster() {
    const user = obterUsuarioLogado();
    return user && user.perfil === 'master';
}

/**
 * Verificar se é vendedor
 */
function ehVendedor() {
    const user = obterUsuarioLogado();
    return user && user.perfil === 'vendedor';
}

/**
 * Obter ID do usuário
 */
function obterIdUsuario() {
    const user = obterUsuarioLogado();
    return user ? user.id : null;
}

/**
 * Obter nome do usuário
 */
function obterNomeUsuario() {
    const user = obterUsuarioLogado();
    return user ? user.nome : 'Anônimo';
}

/**
 * Compatibilidade: a autenticação agora usa cookie HttpOnly.
 */
function obterAuthToken() {
    return null;
}

/**
 * Monta headers padrão para chamadas autenticadas
 */
function buildAuthHeaders(extraHeaders = {}) {
    const token = obterAuthToken();
    const headers = { ...extraHeaders };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}
