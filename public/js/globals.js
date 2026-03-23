// js/globals.js
const DB_NAME = 'CRM_VENDAS_DB';
const DB_VERSION = 1;
const STORES = ['clientes', 'vendas', 'comissoes', 'metas'];
let db;

// Estado da aplicação
let clientes = [];
let vendas = [];
let comissoes = [];
let metas = [];

let lineChartInstance = null;
let pieChartInstance = null;
let deleteResolver = null;

// Variáveis para importação
let importRowsCache = [];
let importHeadersCache = [];

// Regras padrão
const faixasEnergiaB = [
  { min: 1, max: 3000, comissao: 70 },
  { min: 3001, max: 10000, comissao: 75 },
  { min: 10001, max: 20000, comissao: 80 },
  { min: 20001, max: 49999, comissao: 90 },
  { min: 50000, max: Infinity, comissao: 100 }
];

const tabelaComissoesDefault = [
  { produto: 'Móvel', tipoCliente: 'Novo', operadora: 'Vivo', comissao: 230, tipo: 'percentual' },
  { produto: 'Móvel', tipoCliente: 'Novo', operadora: 'Claro', comissao: 300, tipo: 'percentual' },
  { produto: 'Móvel', tipoCliente: 'Novo', operadora: 'TIM', comissao: 500, tipo: 'percentual' },
  { produto: 'Móvel', tipoCliente: 'Base', operadora: 'Vivo', comissao: 172, tipo: 'percentual' },
  { produto: 'Móvel', tipoCliente: 'Base', operadora: 'Claro', comissao: 300, tipo: 'percentual' },
  { produto: 'Móvel', tipoCliente: 'Base', operadora: 'TIM', comissao: 450, tipo: 'percentual' },
  { produto: 'Banda Larga', tipoCliente: 'Novo', operadora: 'Vivo', comissao: 140, tipo: 'percentual' },
  { produto: 'Banda Larga', tipoCliente: 'Novo', operadora: 'Claro', comissao: 200, tipo: 'percentual' },
  { produto: 'Banda Larga', tipoCliente: 'Novo', operadora: 'TIM', comissao: 200, tipo: 'percentual' },
  { produto: 'Banda Larga', tipoCliente: 'Base', operadora: 'Vivo', comissao: 120, tipo: 'percentual' },
  { produto: 'Banda Larga', tipoCliente: 'Base', operadora: 'Claro', comissao: 200, tipo: 'percentual' },
  { produto: 'Banda Larga', tipoCliente: 'Base', operadora: 'TIM', comissao: 200, tipo: 'percentual' },
  { produto: 'Avançado', tipoCliente: 'Novo', operadora: 'Vivo', comissao: 127, tipo: 'percentual' },
  { produto: 'Avançado', tipoCliente: 'Base', operadora: 'Vivo', comissao: 70, tipo: 'percentual' },
  { produto: 'Locação', tipoCliente: 'Novo', operadora: 'Vivo', comissao: 127, tipo: 'percentual' },
  { produto: 'Locação', tipoCliente: 'Base', operadora: 'Vivo', comissao: 70, tipo: 'percentual' },
  { produto: 'Energia A', tipoCliente: 'Novo', operadora: 'Vivo', comissao: 50, tipo: 'percentual' },
  { produto: 'Energia A', tipoCliente: 'Base', operadora: 'Vivo', comissao: 50, tipo: 'percentual' },
  { produto: 'Energia B', tipoCliente: 'Novo', operadora: 'Evolua', comissao: 50, tipo: 'percentual' },
  { produto: 'Energia B', tipoCliente: 'Base', operadora: 'Evolua', comissao: 50, tipo: 'percentual' }
];

// Instâncias de DOM (carregadas após o HTML no rodapé)
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalFormContent = document.getElementById('modal-form-content');
const modalTypeInput = document.getElementById('modal-type-input');
const editingIdInput = document.getElementById('modal-editing-id-input');
const modalForm = document.getElementById('modal-form');
const modalErrorMessage = document.getElementById('modal-error-message');
const clientProfileModal = document.getElementById('client-profile-modal');
const confirmModal = document.getElementById('confirm-modal');
const importClientesModal = document.getElementById('import-clientes-modal');
const importClientesError = document.getElementById('import-clientes-error');
const importPreviewBody = document.getElementById('import-preview-body');
const importPreviewCount = document.getElementById('import-preview-count');

// Variáveis para importação de clientes
const importMappings = {
  cpfCnpj: document.getElementById('map-cpfCnpj'),
  nome: document.getElementById('map-nome'),
  telefone: document.getElementById('map-telefone'),
  email: document.getElementById('map-email'),
  cep: document.getElementById('map-cep'),
  logradouro: document.getElementById('map-logradouro'),
  numero: document.getElementById('map-numero'),
  complemento: document.getElementById('map-complemento'),
  bairro: document.getElementById('map-bairro'),
  cidade: document.getElementById('map-cidade'),
  uf: document.getElementById('map-uf'),
  contaContrato: document.getElementById('map-contaContrato'),
  dataNascimento: document.getElementById('map-dataNascimento'),
  tipoProduto: document.getElementById('map-tipoProduto'),
  qtMovel: document.getElementById('map-qtMovel'),
  quantidadeBasicaBL: document.getElementById('map-quantidadeBasicaBL'),
};

// Variáveis para importação de vendas
const importVendasModal = document.getElementById('import-vendas-modal');
const importVendasError = document.getElementById('import-vendas-error');
const importVendasPreviewBody = document.getElementById('import-vendas-preview-body');
const importVendasPreviewCount = document.getElementById('import-vendas-preview-count');
let importVendasRowsCache = [];
let importVendasHeadersCache = [];

const importVendasMappings = {
  data: document.getElementById('map-venda-data'),
  cliente: document.getElementById('map-venda-cliente'),
  produto: document.getElementById('map-venda-produto'),
  operadora: document.getElementById('map-venda-operadora'),
  tipoCliente: document.getElementById('map-venda-tipoCliente'),
  valor: document.getElementById('map-venda-valor'),
  status: document.getElementById('map-venda-status'),
  comissao: document.getElementById('map-venda-comissao'),
};
