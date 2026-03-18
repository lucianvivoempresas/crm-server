// js/utils.js
function formatCurrency(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const d = new Date(dateString);
  if (isNaN(d)) {
    const parts = dateString.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateString;
  }
  return d.toLocaleDateString('pt-BR');
}

function parseNumericId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function calcularComissao(venda) {
  if (!venda) return 0;

  const valor = Number(venda.valorVenda) || 0;
  const vendaVendedorId = parseNumericId(venda.vendedor_id ?? venda.vendedorId ?? venda.usuario_id ?? venda.userId);

  const regrasAplicaveis = (comissoes || []).filter(c => {
    return c.produto === venda.produto && c.operadora === venda.operadora && c.tipoCliente === venda.tipoCliente;
  });

  if (regrasAplicaveis.length) {
    const regrasOrdenadas = [...regrasAplicaveis].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

    const regraEspecifica = regrasOrdenadas.find(c => {
      const regraVendedorId = parseNumericId(c.vendedor_id ?? c.vendedorId ?? c.usuario_id ?? c.userId);
      return vendaVendedorId !== null && regraVendedorId !== null && regraVendedorId === vendaVendedorId;
    });

    const regraGlobal = regrasOrdenadas.find(c => {
      const regraVendedorId = parseNumericId(c.vendedor_id ?? c.vendedorId ?? c.usuario_id ?? c.userId);
      return regraVendedorId === null;
    });

    const regra = regraEspecifica || regraGlobal;
    if (regra) return valor * (Number(regra.comissao || 0) / 100);
  }

  // Fallback legado para Energia B quando nao existir regra cadastrada.
  if (venda.produto === 'Energia B') {
    const faixa = faixasEnergiaB.find(f => valor >= f.min && valor <= f.max);
    return faixa ? (valor * faixa.comissao / 100) : 0;
  }

  return 0;
}

function getDateRangeFromFilter(filterValue) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let start, end;
  const primeiroDiaDoMes = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const ultimoDiaDoMes = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
  
  switch (filterValue) {
    case 'last_month':
      const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      start = primeiroDiaDoMes(mesPassado);
      end = ultimoDiaDoMes(mesPassado);
      break;
    case 'this_quarter':
      const trimestre = Math.floor(hoje.getMonth() / 3);
      start = new Date(hoje.getFullYear(), trimestre * 3, 1);
      end = new Date(hoje.getFullYear(), trimestre * 3 + 3, 0);
      break;
    case 'last_30_days':
      end = new Date(hoje);
      start = new Date(hoje);
      start.setDate(hoje.getDate() - 30);
      break;
    case 'this_month':
    default:
      start = primeiroDiaDoMes(hoje);
      end = ultimoDiaDoMes(hoje);
      break;
  }
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function filterVendasByDateRange(vendasArray, range) {
  return (vendasArray || []).filter(v => {
    if (!v.dataConclusao || v.status !== 'Concluído') return false;
    const dataVenda = new Date(v.dataConclusao + 'T00:00:00');
    return dataVenda >= range.start && dataVenda <= range.end;
  });
}

function normalizeDoc(v) { return String(v || '').replace(/\D+/g, '').trim(); }
function normalizePhone(v) { return String(v || '').replace(/\D+/g, '').trim(); }

function excelDateToISO(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value)) {
    return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  }
  if (typeof value === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + value * 86400000);
    if (isNaN(d)) return '';
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

function fillSelectOptions(selectEl, headers, preferred) {
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">(não importar)</option>';
  headers.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h; opt.textContent = h;
    selectEl.appendChild(opt);
  });
  if (preferred && headers.includes(preferred)) selectEl.value = preferred;
}

function autoMapHeaders(headers) {
  const pick = (...cands) => cands.find(c => headers.includes(c)) || '';
  return {
    cpfCnpj: pick('CPF/CNPJ','CPF','CNPJ'),
    nome: pick('Razão Social','Nome Contato','Nome'),
    telefone: pick('Celular','Telefone Comercial','Telefone'),
    email: pick('Email','E-mail'),
    cep: pick('CEP'),
    logradouro: pick('Logradouro','Endereço','Endereco'),
    numero: pick('Número','Numero'),
    complemento: pick('Complemento'),
    bairro: pick('Bairro'),
    cidade: pick('Cidade'),
    uf: pick('UF','Estado'),
    contaContrato: pick('Conta Contrato','Instalação','Instalacao','Conta'),
    dataNascimento: pick('Data Nascimento','Nascimento'),
  };
}

function getMappedValue(row, key) {
  const col = importMappings[key] ? importMappings[key].value : '';
  return col ? row[col] : '';
}

function autoMapHeadersVendas(headers) {
  const pick = (...cands) => cands.find(c => headers.includes(c)) || '';
  return {
    data: pick('Data','data','Date'),
    cliente: pick('Cliente','cliente','Cliente','Empresa','Razão Social'),
    produto: pick('Produto','produto','Tipo'),
    operadora: pick('Operadora','operadora','Carrier','Operadora Telecom'),
    tipoCliente: pick('Tipo Cliente','TipoCliente','Tipo','Cliente Type'),
    valor: pick('Valor','valor','Valor Venda','Comissão Base','Comissão','Value','Amount'),
    status: pick('Status','status','Situação'),
    comissao: pick('Comissão','Comissao','Commission','Comissao')
  };
}

function getMappedVendasValue(row, key) {
  const col = importVendasMappings[key] ? importVendasMappings[key].value : '';
  return col ? row[col] : '';
}