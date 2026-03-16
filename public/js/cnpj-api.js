// js/cnpj-api.js
// Integração com API de CNPJ Brasil (gratuita)

console.log('✅ Script cnpj-api.js carregado com sucesso!');

/**
 * Busca dados da empresa pelo CNPJ na API pública (via backend)
 * @param {string} cnpj - CNPJ sem formatação (apenas números)
 * @returns {Promise<Object>} Dados da empresa
 */
async function fetchCNPJData(cnpj) {
  try {
    console.log(`🔍 Iniciando busca de CNPJ: ${cnpj}`);
    
    // Remove caracteres não-numéricos
    const cleanCnpj = cnpj.replace(/\D/g, '');
    
    console.log(`🧹 CNPJ limpo: ${cleanCnpj}`);
    
    // Valida se tem 14 dígitos
    if (cleanCnpj.length !== 14) {
      throw new Error(`CNPJ deve ter 14 dígitos (tem ${cleanCnpj.length})`);
    }

    // Requisita para o backend (contorna CORS)
    const baseUrl = window.location.protocol + '//' + window.location.host;
    const url = `${baseUrl}/api-cnpj/buscar/${cleanCnpj}`;
    console.log(`📡 Requisitando: ${url}`);

    const cnpjHeaders = (typeof buildAuthHeaders === 'function') ? buildAuthHeaders() : {};
    const response = await fetch(url, { headers: cnpjHeaders });
    
    console.log(`📊 Status da resposta: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();

    console.log(`📥 Resposta recebida:`, data);

    // Verifica se houve erro
    if (!data.success) {
      throw new Error(data.error || 'CNPJ não encontrado na base de dados da Receita Federal');
    }

    // Retorna os dados formatados
    const result = {
      razaoSocial: data.razaoSocial || '',
      endereco: data.endereco || '',
      numero: data.numero || '',
      complemento: data.complemento || '',
      bairro: data.bairro || '',
      cidade: data.cidade || '',
      uf: data.uf || '',
      cep: data.cep || '',
      telefone: data.telefone || '',
      email: data.email || '',
      success: true
    };
    
    console.log(`✅ Dados formatados:`, result);
    return result;
    
  } catch (error) {
    console.error('❌ Erro ao buscar CNPJ:', error.message);
    console.error('Stack:', error);
    
    return {
      success: false,
      error: error.message,
      razaoSocial: '',
      endereco: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
      cep: '',
      telefone: '',
      email: ''
    };
  }
}

/**
 * Preenche o formulário de cliente com dados da API do CNPJ
 * @param {string} cnpj - CNPJ fornecido pelo usuário
 * @param {string} formType - Tipo do formulário: 'quick' ou 'modal'
 */
async function loadCNPJDataInForm(cnpj, formType = 'modal') {
  console.log(`📋 Iniciando preenchimento do formulário (${formType})`);
  
  const data = await fetchCNPJData(cnpj);

  if (!data.success) {
    console.error('❌ Erro ao buscar CNPJ:', data.error);
    return false;
  }

  console.log(`✅ Dados obtidos da API:`, data);

  // Seleciona os IDs dos campos baseado no tipo de formulário
  const prefix = formType === 'quick' ? 'qf-cliente-' : 'cliente-';

  console.log(`🔧 Usando prefixo: ${prefix}`);

  // Preenche os campos disponíveis no formulário
  const fieldsToFill = {
    nome: 'razaoSocial',
    logradouro: 'endereco',
    numero: 'numero',
    complemento: 'complemento',
    bairro: 'bairro',
    cidade: 'cidade',
    uf: 'uf',
    cep: 'cep',
    telefone: 'telefone',
    email: 'email'
  };

  let filledCount = 0;
  
  for (const [fieldId, dataKey] of Object.entries(fieldsToFill)) {
    const fullId = `${prefix}${fieldId}`;
    const field = document.getElementById(fullId);
    
    if (field) {
      field.value = data[dataKey] || '';
      console.log(`  ✅ Preenchido: ${fullId} = "${field.value}"`);
      if (field.value) filledCount++;
    } else {
      console.warn(`  ⚠️ Campo não encontrado: ${fullId}`);
    }
  }

  console.log(`📊 Total de campos preenchidos: ${filledCount}/${Object.keys(fieldsToFill).length}`);
  return true;
}

/**
 * Adiciona event listener para buscar CNPJ automaticamente ao sair do campo
 * @param {string} cnpjInputId - ID do campo de entrada de CNPJ
 * @param {string} formType - Tipo do formulário: 'quick' ou 'modal'
 */
function setupCNPJListener(cnpjInputId, formType = 'modal') {
  const cnpjInput = document.getElementById(cnpjInputId);
  
  if (!cnpjInput) {
    console.warn(`Campo ${cnpjInputId} não encontrado`);
    return;
  }

  console.log(`✅ Listener CNPJ configurado para: ${cnpjInputId} (${formType})`);

  // Remove listener anterior se existir
  if (cnpjInput._cnpjListener) {
    cnpjInput.removeEventListener('blur', cnpjInput._cnpjListener);
  }

  // Cria novo listener
  cnpjInput._cnpjListener = async function() {
    const cnpj = this.value.trim();
    
    console.log(`🔍 CNPJ digitado: ${cnpj}`);
    
    // Só faz a busca se o CNPJ tem pelo menos 11 caracteres (com ou sem formatação)
    if (cnpj.length < 11) {
      console.log(`⚠️ CNPJ muito curto (${cnpj.length} chars), pulando busca`);
      return;
    }

    // Mostra indicador de carregamento
    console.log(`⏳ Iniciando busca na API...`);
    this.style.opacity = '0.5';
    this.style.backgroundColor = '#f0f0f0';
    
    const success = await loadCNPJDataInForm(cnpj, formType);
    
    this.style.opacity = '1';
    this.style.backgroundColor = '';

    if (!success) {
      console.warn('❌ Não foi possível buscar dados do CNPJ');
    } else {
      console.log(`✅ Dados preenchidos com sucesso!`);
    }
  };

  cnpjInput.addEventListener('blur', cnpjInput._cnpjListener);
}

/**
 * Remove event listener do campo CNPJ
 * @param {string} cnpjInputId - ID do campo de entrada de CNPJ
 */
function removeCNPJListener(cnpjInputId) {
  const cnpjInput = document.getElementById(cnpjInputId);
  if (cnpjInput && cnpjInput._cnpjListener) {
    cnpjInput.removeEventListener('blur', cnpjInput._cnpjListener);
  }
}
