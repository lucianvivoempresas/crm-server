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
            body: JSON.stringify({ email, senha })
        });
        
        const result = await response.json();
        
        if (!result.success || !result.usuario) {
            console.error('❌ Login falhou:', result.error);
            throw new Error(result.error || 'Email ou senha incorretos');
        }
        
        console.log('✅ Login bem-sucedido:', result.usuario.nome);
        
        // Salvar dados do usuário na sessão atual ou de forma persistente (lembrar-me)
        usuarioLogado = result.usuario;
        if (lembrarSessao) {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.usuario));
            if (result.token) localStorage.setItem(AUTH_TOKEN_KEY, result.token);
            sessionStorage.removeItem(AUTH_STORAGE_KEY);
            sessionStorage.removeItem(AUTH_TOKEN_KEY);
        } else {
            sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.usuario));
            if (result.token) sessionStorage.setItem(AUTH_TOKEN_KEY, result.token);
            localStorage.removeItem(AUTH_STORAGE_KEY);
            localStorage.removeItem(AUTH_TOKEN_KEY);
        }
        
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
        const savedSession = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (savedSession) {
            usuarioLogado = JSON.parse(savedSession);
            console.log('🔄 Sessão recuperada para:', usuarioLogado.nome);
            return usuarioLogado;
        }

        const savedLocal = localStorage.getItem(AUTH_STORAGE_KEY);
        if (savedLocal) {
            usuarioLogado = JSON.parse(savedLocal);
            console.log('🔄 Sessão recuperada para:', usuarioLogado.nome);
            return usuarioLogado;
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
