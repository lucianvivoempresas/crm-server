// js/auth.js
// Gerenciamento de autenticação e sessão do usuário

const AUTH_STORAGE_KEY = 'CRM_USER_SESSION';
const AUTH_TOKEN_KEY = 'CRM_AUTH_TOKEN';

// Estado da autenticação
let usuarioLogado = null;

/**
 * Fazer login do usuário
 * @param {string} email 
 * @param {string} senha 
 * @returns {Promise}
 */
async function login(email, senha) {
    try {
        console.log('🔐 Iniciando login para:', email);
        
        // Chamar backend para validar credenciais
        const response = await fetch(`${API_URL.replace('/api', '')}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        
        const result = await response.json();
        
        if (!result.success || !result.usuario) {
            console.error('❌ Login falhou:', result.error);
            throw new Error(result.error || 'Email ou senha incorretos');
        }
        
        console.log('✅ Login bem-sucedido:', result.usuario.nome);
        
        // Salvar dados do usuário apenas na sessão atual do navegador
        usuarioLogado = result.usuario;
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.usuario));
        
        // Salvar token (somente sessão atual)
        if (result.token) {
            sessionStorage.setItem(AUTH_TOKEN_KEY, result.token);
        }

        // Remover versões antigas persistidas para evitar auto-login permanente
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        
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
        
        // Limpar dados locais
        usuarioLogado = null;
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        
        // Notificar backend (opcional)
        try {
            await fetch(`${API_URL.replace('/api', '')}/auth/logout`, { method: 'POST' });
        } catch (e) {
            // Não falha se o backend não responder
        }
        
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
function recuperarSessao() {
    try {
        const saved = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (saved) {
            usuarioLogado = JSON.parse(saved);
            console.log('🔄 Sessão recuperada para:', usuarioLogado.nome);
            return usuarioLogado;
        }

        // Limpa sessão legada persistida em localStorage (versões antigas)
        if (localStorage.getItem(AUTH_STORAGE_KEY)) {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        }
        if (localStorage.getItem(AUTH_TOKEN_KEY)) {
            localStorage.removeItem(AUTH_TOKEN_KEY);
        }

        return null;
    } catch (err) {
        console.error('Erro ao recuperar sessão:', err);
        return null;
    }
}

/**
 * Verificar se usuário está logado
 */
function estaLogado() {
    return usuarioLogado !== null || recuperarSessao() !== null;
}

/**
 * Obter usuário atualmente logado
 */
function obterUsuarioLogado() {
    if (usuarioLogado) return usuarioLogado;
    return recuperarSessao();
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
