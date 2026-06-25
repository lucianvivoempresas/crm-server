(() => {
  'use strict';

  const API_URL = '/api/energia-data';
  const EMPTY = {
    clientes: [],
    produtos: [],
    vendas: [],
    vendedores: [],
    followups: [],
    pagamentos: [],
    metas: [],
    usuarios: [],
    oportunidades: [],
    config: {}
  };

  const $ = (id) => document.getElementById(id);
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const nowIso = () => new Date().toISOString();
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  const text = (value) => String(value ?? '').trim();
  const moneyNumber = (value) => Number(String(value ?? '0').replace(/\./g, '').replace(',', '.')) || 0;
  const brl = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const intFmt = (value) => new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
  const dateFmt = (value) => {
    if (!value) return '-';
    const [y, m, d] = String(value).slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : String(value);
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');
  const lower = (value) => String(value ?? '').toLowerCase();

  const labels = {
    dashboard: ['Dashboard', 'Visão geral das vendas'],
    clientes: ['Clientes', 'Cadastro e gestão de clientes'],
    pipeline: ['Pipeline', 'Oportunidades e forecast'],
    vendas: ['Vendas', 'Registro de vendas e comissões'],
    followups: ['Follow-ups', 'Próximas ações e lembretes'],
    comissoes: ['Comissões a Receber', 'Cronograma de comissões'],
    relatorios: ['Relatórios', 'Análises detalhadas'],
    config: ['Configurações', 'Produtos, vendedores, usuários e backup']
  };

  const icons = {
    dashboard: '▦',
    clientes: '♙',
    pipeline: '↗',
    vendas: '▰',
    followups: '◷',
    comissoes: '$',
    relatorios: '▥',
    config: '⚙'
  };

  const state = {
    data: clone(EMPTY),
    docId: null,
    user: null,
    tab: 'dashboard',
    query: '',
    filter: '',
    saving: false
  };

  const Store = {
    normalize(raw) {
      const data = { ...clone(EMPTY), ...(raw || {}) };
      Object.keys(EMPTY).forEach((key) => {
        if (Array.isArray(EMPTY[key]) && !Array.isArray(data[key])) data[key] = [];
      });
      if (!data.config || typeof data.config !== 'object' || Array.isArray(data.config)) data.config = {};
      data.clientes.forEach((c) => {
        if (!Array.isArray(c.notas)) c.notas = [];
        if (!Array.isArray(c.arquivos)) c.arquivos = [];
      });
      data.vendedores.forEach((v) => { if (v.ativo === undefined) v.ativo = true; });
      data.produtos.forEach((p) => { if (p.ativo === undefined) p.ativo = true; });
      data.usuarios.forEach((u) => { u.tipo = Auth.roleOf(u); if (u.ativo === undefined) u.ativo = true; });
      return data;
    },
    async load() {
      const res = await fetch(API_URL, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('Servidor retornou ' + res.status);
      const rows = await res.json();
      const item = Array.isArray(rows) && rows.length ? rows[0] : null;
      state.docId = item?.id || null;
      state.data = this.normalize(item || {});
    },
    payload() {
      return this.normalize(state.data);
    },
    async save() {
      const payload = this.payload();
      const body = JSON.stringify(payload);
      state.saving = true;
      try {
        let res;
        if (body.length > 900000) {
          res = await this.saveChunks(body);
        } else {
          res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
          });
        }
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`Servidor retornou ${res.status}${detail ? ': ' + detail : ''}`);
        }
        const json = await res.json().catch(() => ({}));
        if (json.id) state.docId = json.id;
        return true;
      } finally {
        state.saving = false;
      }
    },
    async saveChunks(body) {
      const size = 600000;
      const chunks = [];
      for (let i = 0; i < body.length; i += size) chunks.push(body.slice(i, i + size));
      for (let i = 0; i < chunks.length; i += 1) {
        const res = await fetch(`${API_URL}/chunks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunkIndex: i, data: chunks[i], clear: i === 0 })
        });
        if (!res.ok) return res;
      }
      state.docId = null;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
  };

  const Auth = {
    roleOf(user) {
      const tipo = lower(user?.tipo);
      if (tipo === 'master') return 'master';
      if (tipo === 'vendedor' || user?.vendedorId) return 'vendedor';
      return 'master';
    },
    salt() {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    },
    async hash(senha, salt) {
      const enc = new TextEncoder().encode(String(senha) + '::' + String(salt));
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    },
    async ensureMaster() {
      if (state.data.usuarios.length) return;
      const salt = this.salt();
      state.data.usuarios.push({
        id: uid(),
        nome: 'Administrador',
        login: 'lucian',
        salt,
        senhaHash: await this.hash('144161', salt),
        tipo: 'master',
        vendedorId: null,
        ativo: true,
        criadoEm: nowIso()
      });
      await Store.save();
    },
    visibleVendedorId() {
      if (!state.user || state.user.tipo === 'master') return null;
      return state.user.vendedorId || null;
    },
    clientes(list = state.data.clientes) {
      const vendedorId = this.visibleVendedorId();
      return vendedorId ? list.filter((c) => c.vendedorId === vendedorId || this.vendas([].concat(state.data.vendas)).some((v) => v.clienteId === c.id)) : list;
    },
    vendas(list = state.data.vendas) {
      const vendedorId = this.visibleVendedorId();
      return vendedorId ? list.filter((v) => v.vendedorId === vendedorId) : list;
    },
    oportunidades(list = state.data.oportunidades) {
      const vendedorId = this.visibleVendedorId();
      return vendedorId ? list.filter((o) => o.vendedorId === vendedorId) : list;
    },
    followups(list = state.data.followups) {
      const vendedorId = this.visibleVendedorId();
      return vendedorId ? list.filter((f) => f.vendedorId === vendedorId) : list;
    },
    isMaster() {
      return state.user?.tipo === 'master';
    },
    async login(login, senha) {
      const user = state.data.usuarios.find((u) => lower(u.login) === lower(login) && u.ativo !== false);
      if (!user) return false;
      const hash = await this.hash(senha, user.salt);
      if (hash !== user.senhaHash) return false;
      user.tipo = this.roleOf(user);
      state.user = user;
      return true;
    },
    logout() {
      state.user = null;
      state.tab = 'dashboard';
      App.showLogin();
    }
  };

  const UI = {
    toast(message, type = 'success') {
      const el = $('toast');
      el.className = `toast ${type}`;
      el.textContent = message;
      el.classList.remove('hidden');
      clearTimeout(this._timer);
      this._timer = setTimeout(() => el.classList.add('hidden'), 3200);
    },
    openModal(title, body) {
      $('modal-title').textContent = title;
      $('modal-body').innerHTML = body;
      $('modal').classList.remove('hidden');
      $('modal').setAttribute('aria-hidden', 'false');
    },
    closeModal() {
      $('modal').classList.add('hidden');
      $('modal').setAttribute('aria-hidden', 'true');
      $('modal-body').innerHTML = '';
    },
    async saveAndRender(message) {
      try {
        await Store.save();
        UI.closeModal();
        UI.toast(message);
        Render.all();
      } catch (err) {
        console.error(err);
        UI.toast('Não foi possível salvar no banco. Tente novamente.', 'error');
      }
    },
    confirm(message) {
      return window.confirm(message);
    },
    options(items, selected, empty = 'Selecione') {
      return [`<option value="">${esc(empty)}</option>`].concat(items.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.nome || item.titulo)}</option>`)).join('');
    },
    vendedorOptions(selected) {
      const items = state.data.vendedores.filter((v) => v.ativo !== false);
      return this.options(items, selected, 'Sem vendedor');
    },
    clienteOptions(selected) {
      return this.options(Auth.clientes().sort((a, b) => text(a.nome).localeCompare(text(b.nome))), selected, 'Selecione o cliente');
    },
    produtoOptions(selected) {
      return this.options(state.data.produtos.filter((p) => p.ativo !== false), selected, 'Selecione o produto');
    },
    statusPill(status) {
      const map = {
        fechada: ['ok', 'Fechada'],
        pendente: ['warn', 'Pendente'],
        cancelada: ['bad', 'Cancelada'],
        ganho: ['ok', 'Ganho'],
        perdido: ['bad', 'Perdido'],
        concluido: ['ok', 'Concluído']
      };
      const [cls, label] = map[status] || ['', status || '-'];
      return `<span class="pill ${cls}">${esc(label)}</span>`;
    }
  };

  const Calc = {
    produto(id) {
      return state.data.produtos.find((p) => p.id === id) || null;
    },
    cliente(id) {
      return state.data.clientes.find((c) => c.id === id) || null;
    },
    vendedor(id) {
      return state.data.vendedores.find((v) => v.id === id) || null;
    },
    vendaComissao(venda) {
      const produto = this.produto(venda.produtoId);
      const vendedor = this.vendedor(venda.vendedorId);
      const fatorVenda = Number(venda.fatorComissao || venda.comissao || produto?.comissao || 0);
      const reducao = Number(venda.reducaoComissao ?? vendedor?.reducaoComissao ?? 0);
      const base = (Number(venda.valor) || 0) * (fatorVenda / 100);
      return Math.max(0, base * (1 - reducao / 100));
    },
    totalVendas(list = Auth.vendas()) {
      return list.reduce((sum, v) => sum + (Number(v.valor) || 0), 0);
    },
    totalComissao(list = Auth.vendas()) {
      return list.filter((v) => v.status === 'fechada').reduce((sum, v) => sum + this.vendaComissao(v), 0);
    },
    pago(vendaId) {
      return state.data.pagamentos.filter((p) => p.vendaId === vendaId).reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
    },
    pendenteComissao(venda) {
      return Math.max(0, this.vendaComissao(venda) - this.pago(venda.id));
    }
  };

  const Render = {
    all() {
      this.nav();
      this.header();
      this.content();
      this.badges();
    },
    nav() {
      const tabs = ['dashboard', 'clientes', 'pipeline', 'vendas', 'followups', 'comissoes', 'relatorios'].concat(Auth.isMaster() ? ['config'] : []);
      $('nav').innerHTML = tabs.map((tab) => `<button data-tab="${tab}" class="${state.tab === tab ? 'active' : ''}"><span>${icons[tab]}</span>${labels[tab][0]}<span class="badge" data-badge="${tab}">0</span></button>`).join('');
    },
    header() {
      const [title, subtitle] = labels[state.tab] || labels.dashboard;
      $('page-title').textContent = title;
      $('page-subtitle').textContent = subtitle;
      $('user-name').textContent = state.user?.nome || 'Usuário';
      $('user-role').textContent = state.user?.tipo || 'perfil';
      $('user-avatar').textContent = (state.user?.nome || 'U').slice(0, 1).toUpperCase();
      const action = {
        clientes: ['Novo Cliente', () => Forms.cliente()],
        vendas: ['Nova Venda', () => Forms.venda()],
        pipeline: ['Nova Oportunidade', () => Forms.oportunidade()],
        followups: ['Novo Follow-up', () => Forms.followup()]
      }[state.tab];
      const configAction = state.tab === 'config' && Auth.isMaster() ? ['Novo Produto', () => Forms.produto()] : null;
      $('page-actions').innerHTML = '';
      [action, configAction].filter(Boolean).forEach(([label, fn], idx) => {
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.textContent = '+ ' + label;
        btn.addEventListener('click', fn);
        $('page-actions').appendChild(btn);
      });
    },
    badges() {
      const counts = {
        dashboard: Auth.vendas().filter((v) => v.status === 'fechada').length,
        clientes: Auth.clientes().length,
        pipeline: Auth.oportunidades().filter((o) => !['ganho', 'perdido'].includes(o.etapa)).length,
        vendas: Auth.vendas().length,
        followups: Auth.followups().filter((f) => f.status !== 'concluido').length,
        comissoes: Auth.vendas().filter((v) => v.status === 'fechada' && Calc.pendenteComissao(v) > 0).length,
        relatorios: Auth.vendas().length,
        config: state.data.produtos.length
      };
      document.querySelectorAll('[data-badge]').forEach((el) => { el.textContent = counts[el.dataset.badge] || 0; });
    },
    content() {
      state.query = '';
      state.filter = '';
      const map = {
        dashboard: Pages.dashboard,
        clientes: Pages.clientes,
        pipeline: Pages.pipeline,
        vendas: Pages.vendas,
        followups: Pages.followups,
        comissoes: Pages.comissoes,
        relatorios: Pages.relatorios,
        config: Pages.config
      };
      (map[state.tab] || Pages.dashboard)();
    },
    list(items, empty, rowFn) {
      if (!items.length) return `<div class="empty">${esc(empty)}</div>`;
      return `<div class="list">${items.map(rowFn).join('')}</div>`;
    }
  };

  const Pages = {
    dashboard() {
      const vendas = Auth.vendas();
      const fechadas = vendas.filter((v) => v.status === 'fechada');
      const pendentes = vendas.filter((v) => v.status === 'pendente');
      const followups = Auth.followups().filter((f) => f.status !== 'concluido').sort((a, b) => String(a.data).localeCompare(String(b.data))).slice(0, 5);
      $('content').innerHTML = `
        <section class="grid cols-4">
          <div class="panel metric"><span>Clientes</span><strong>${intFmt(Auth.clientes().length)}</strong><small>visíveis para seu perfil</small></div>
          <div class="panel metric"><span>Vendas fechadas</span><strong>${intFmt(fechadas.length)}</strong><small>${brl(Calc.totalVendas(fechadas))}</small></div>
          <div class="panel metric"><span>Comissões</span><strong>${brl(Calc.totalComissao(vendas))}</strong><small>a receber/calculadas</small></div>
          <div class="panel metric"><span>Pendentes</span><strong>${intFmt(pendentes.length)}</strong><small>vendas em andamento</small></div>
        </section>
        <section class="grid cols-2" style="margin-top:16px">
          <div class="panel pad">
            <h3 class="section-title">Últimas vendas</h3>
            ${Render.list(vendas.slice().sort((a, b) => String(b.data || b.criadoEm).localeCompare(String(a.data || a.criadoEm))).slice(0, 6), 'Nenhuma venda cadastrada', Rows.venda)}
          </div>
          <div class="panel pad">
            <h3 class="section-title">Próximos follow-ups</h3>
            ${Render.list(followups, 'Nenhum follow-up pendente', Rows.followup)}
          </div>
        </section>`;
    },
    clientes() {
      const items = Auth.clientes().slice().sort((a, b) => text(a.nome).localeCompare(text(b.nome)));
      $('content').innerHTML = `
        <section class="panel">
          <div class="toolbar"><input id="search" placeholder="Buscar por nome, CPF/CNPJ, telefone ou email..."></div>
          <div id="list-target">${Render.list(items, 'Nenhum cliente vinculado às suas vendas', Rows.cliente)}</div>
        </section>`;
      wireSearch(items, Rows.cliente);
    },
    vendas() {
      const items = Auth.vendas().slice().sort((a, b) => String(b.data || b.criadoEm).localeCompare(String(a.data || a.criadoEm)));
      $('content').innerHTML = `
        <section class="panel">
          <div class="toolbar">
            <input id="search" placeholder="Buscar por cliente ou produto...">
            <select id="filter"><option value="">Todos os status</option><option value="pendente">Pendente</option><option value="fechada">Fechada</option><option value="cancelada">Cancelada</option></select>
          </div>
          <div id="list-target">${Render.list(items, 'Nenhuma venda cadastrada', Rows.venda)}</div>
        </section>`;
      wireSearch(items, Rows.venda, (v) => !state.filter || v.status === state.filter);
    },
    pipeline() {
      const items = Auth.oportunidades().slice().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
      $('content').innerHTML = `
        <section class="panel">
          <div class="toolbar">
            <input id="search" placeholder="Buscar oportunidade ou cliente...">
            <select id="filter"><option value="">Todas as etapas</option><option value="novo">Novo</option><option value="contato">Contato</option><option value="proposta">Proposta</option><option value="negociacao">Negociação</option><option value="ganho">Ganho</option><option value="perdido">Perdido</option></select>
          </div>
          <div id="list-target">${Render.list(items, 'Nenhuma oportunidade cadastrada', Rows.oportunidade)}</div>
        </section>`;
      wireSearch(items, Rows.oportunidade, (o) => !state.filter || o.etapa === state.filter);
    },
    followups() {
      const items = Auth.followups().slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
      $('content').innerHTML = `
        <section class="panel">
          <div class="toolbar">
            <input id="search" placeholder="Buscar follow-up ou cliente...">
            <select id="filter"><option value="">Todos</option><option value="pendente">Pendentes</option><option value="concluido">Concluídos</option></select>
          </div>
          <div id="list-target">${Render.list(items, 'Nenhum follow-up cadastrado', Rows.followup)}</div>
        </section>`;
      wireSearch(items, Rows.followup, (f) => !state.filter || f.status === state.filter);
    },
    comissoes() {
      const vendas = Auth.vendas().filter((v) => v.status === 'fechada');
      $('content').innerHTML = `
        <section class="panel pad">
          <table>
            <thead><tr><th>Cliente</th><th>Produto</th><th>Venda</th><th>Comissão</th><th>Pago</th><th>Pendente</th><th></th></tr></thead>
            <tbody>${vendas.length ? vendas.map(Rows.comissao).join('') : '<tr><td colspan="7" class="empty">Nenhuma comissão a exibir</td></tr>'}</tbody>
          </table>
        </section>`;
    },
    relatorios() {
      const vendas = Auth.vendas();
      const porVendedor = {};
      vendas.forEach((v) => {
        const nome = Calc.vendedor(v.vendedorId)?.nome || 'Sem vendedor';
        porVendedor[nome] = (porVendedor[nome] || 0) + (Number(v.valor) || 0);
      });
      $('content').innerHTML = `
        <section class="grid cols-3">
          <div class="panel metric"><span>Faturamento</span><strong>${brl(Calc.totalVendas(vendas))}</strong></div>
          <div class="panel metric"><span>Comissão fechada</span><strong>${brl(Calc.totalComissao(vendas))}</strong></div>
          <div class="panel metric"><span>Ticket médio</span><strong>${brl(vendas.length ? Calc.totalVendas(vendas) / vendas.length : 0)}</strong></div>
        </section>
        <section class="panel pad" style="margin-top:16px">
          <div class="row" style="padding:0 0 14px;border-bottom:1px solid var(--line)">
            <div><h3>Vendas por vendedor</h3><p>Resumo calculado com os registros atuais do banco.</p></div>
            <button class="btn" id="export-csv">Exportar CSV</button>
          </div>
          <table><thead><tr><th>Vendedor</th><th>Total vendido</th></tr></thead><tbody>${Object.entries(porVendedor).map(([n, v]) => `<tr><td>${esc(n)}</td><td>${brl(v)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Sem dados</td></tr>'}</tbody></table>
        </section>`;
      $('export-csv').addEventListener('click', exportCsv);
    },
    config() {
      if (!Auth.isMaster()) {
        state.tab = 'dashboard';
        Render.all();
        return;
      }
      $('content').innerHTML = `
        <div class="tabs">
          <button class="btn active" data-config="produtos">Produtos</button>
          <button class="btn" data-config="vendedores">Vendedores</button>
          <button class="btn" data-config="usuarios">Usuários</button>
          <button class="btn" data-config="backup">Backup</button>
        </div>
        <section id="config-target"></section>`;
      document.querySelectorAll('[data-config]').forEach((btn) => btn.addEventListener('click', () => {
        document.querySelectorAll('[data-config]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        Config.render(btn.dataset.config);
      }));
      Config.render('produtos');
    }
  };

  function wireSearch(items, rowFn, extra = () => true) {
    const render = () => {
      const q = lower(state.query);
      const list = items.filter((item) => extra(item) && lower(JSON.stringify(item) + ' ' + (Calc.cliente(item.clienteId)?.nome || '') + ' ' + (Calc.produto(item.produtoId)?.nome || '')).includes(q));
      $('list-target').innerHTML = Render.list(list, 'Nenhum registro encontrado', rowFn);
    };
    $('search')?.addEventListener('input', (e) => { state.query = e.target.value; render(); });
    $('filter')?.addEventListener('change', (e) => { state.filter = e.target.value; render(); });
  }

  const Rows = {
    cliente(c) {
      const vendas = Auth.vendas().filter((v) => v.clienteId === c.id);
      return `<article class="row">
        <div><h3>${esc(c.nome)}</h3><p>${esc(c.tipo || 'Cliente')} · ${esc(c.documento || '-')} · ${esc(c.telefone || '-')} · ${esc(c.email || '-')}</p></div>
        <div class="row-actions"><span class="pill">${vendas.length} venda${vendas.length === 1 ? '' : 's'}</span><strong>${brl(Calc.totalVendas(vendas))}</strong><button class="icon-btn" title="Ver" data-view-cliente="${c.id}">◉</button><button class="icon-btn" title="Editar" data-edit-cliente="${c.id}">✎</button><button class="icon-btn" title="Excluir" data-del-cliente="${c.id}">⌫</button></div>
      </article>`;
    },
    venda(v) {
      const c = Calc.cliente(v.clienteId);
      const p = Calc.produto(v.produtoId);
      return `<article class="row">
        <div><h3>${esc(c?.nome || 'Cliente removido')}</h3><p>${esc(p?.nome || 'Produto')} · ${dateFmt(v.data)} · Comissão ${brl(Calc.vendaComissao(v))}</p></div>
        <div class="row-actions">${UI.statusPill(v.status)}<strong>${brl(v.valor)}</strong><button class="icon-btn" title="Editar" data-edit-venda="${v.id}">✎</button><button class="icon-btn" title="Excluir" data-del-venda="${v.id}">⌫</button></div>
      </article>`;
    },
    oportunidade(o) {
      const c = Calc.cliente(o.clienteId);
      return `<article class="row">
        <div><h3>${esc(o.titulo || 'Oportunidade')}</h3><p>${esc(c?.nome || 'Sem cliente')} · ${brl(o.valor)} · ${Number(o.probabilidade || 0)}%</p></div>
        <div class="row-actions">${UI.statusPill(o.etapa)}<button class="icon-btn" title="Editar" data-edit-oportunidade="${o.id}">✎</button><button class="icon-btn" title="Excluir" data-del-oportunidade="${o.id}">⌫</button></div>
      </article>`;
    },
    followup(f) {
      const c = Calc.cliente(f.clienteId);
      return `<article class="row">
        <div><h3>${esc(f.titulo || 'Follow-up')}</h3><p>${dateFmt(f.data)} ${esc(f.hora || '')} · ${esc(c?.nome || 'Sem cliente')} · ${esc(f.descricao || '')}</p></div>
        <div class="row-actions">${UI.statusPill(f.status || 'pendente')}<button class="icon-btn" title="Concluir" data-done-followup="${f.id}">✓</button><button class="icon-btn" title="Editar" data-edit-followup="${f.id}">✎</button><button class="icon-btn" title="Excluir" data-del-followup="${f.id}">⌫</button></div>
      </article>`;
    },
    comissao(v) {
      const comissao = Calc.vendaComissao(v);
      const pago = Calc.pago(v.id);
      return `<tr><td>${esc(Calc.cliente(v.clienteId)?.nome || '-')}</td><td>${esc(Calc.produto(v.produtoId)?.nome || '-')}</td><td>${brl(v.valor)}</td><td>${brl(comissao)}</td><td>${brl(pago)}</td><td>${brl(Math.max(0, comissao - pago))}</td><td><button class="btn small" data-pay="${v.id}">Registrar pagamento</button></td></tr>`;
    },
    produto(p) {
      return `<article class="row"><div><h3>${esc(p.nome)}</h3><p>Comissão ${Number(p.comissao || 0)}% · ${p.recorrencia || 'sem recorrência'} · ${p.ativo === false ? 'inativo' : 'ativo'}</p></div><div class="row-actions"><button class="icon-btn" data-edit-produto="${p.id}">✎</button><button class="icon-btn" data-del-produto="${p.id}">⌫</button></div></article>`;
    },
    vendedor(v) {
      return `<article class="row"><div><h3>${esc(v.nome)}</h3><p>${esc(v.telefone || '-')} · ${esc(v.email || '-')} · Redução ${Number(v.reducaoComissao || 0)}%</p></div><div class="row-actions"><span class="pill ${v.ativo === false ? 'bad' : 'ok'}">${v.ativo === false ? 'Inativo' : 'Ativo'}</span><button class="icon-btn" data-edit-vendedor="${v.id}">✎</button><button class="icon-btn" data-del-vendedor="${v.id}">⌫</button></div></article>`;
    },
    usuario(u) {
      return `<article class="row"><div><h3>${esc(u.nome)}</h3><p>${esc(u.login)} · ${esc(Auth.roleOf(u))}</p></div><div class="row-actions"><span class="pill ${u.ativo === false ? 'bad' : 'ok'}">${u.ativo === false ? 'Inativo' : 'Ativo'}</span><button class="icon-btn" data-edit-usuario="${u.id}">✎</button><button class="icon-btn" data-del-usuario="${u.id}">⌫</button></div></article>`;
    }
  };

  const Forms = {
    cliente(id) {
      const c = state.data.clientes.find((x) => x.id === id) || {};
      UI.openModal(id ? 'Editar Cliente' : 'Novo Cliente', `<form id="form-cliente" class="form-grid">
        <label>Tipo<select name="tipo"><option ${c.tipo === 'CPF' ? 'selected' : ''}>CPF</option><option ${c.tipo === 'CNPJ' ? 'selected' : ''}>CNPJ</option></select></label>
        <label>CPF/CNPJ<input name="documento" value="${esc(c.documento)}"></label>
        <label class="full">Nome<input name="nome" required value="${esc(c.nome)}"></label>
        <label>Telefone<input name="telefone" value="${esc(c.telefone)}"></label>
        <label>Email<input name="email" type="email" value="${esc(c.email)}"></label>
        <label>Vendedor<select name="vendedorId">${UI.vendedorOptions(c.vendedorId || Auth.visibleVendedorId())}</select></label>
        <label>Origem<input name="origem" value="${esc(c.origem)}"></label>
        <label class="full">Endereço<input name="endereco" value="${esc(c.endereco)}"></label>
        <label class="full">Notas<textarea name="observacao">${esc(c.observacao || '')}</textarea></label>
        <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`);
      $('form-cliente').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const item = c.id ? c : { id: uid(), criadoEm: nowIso(), notas: [], arquivos: [] };
        Object.assign(item, f, { atualizadoEm: nowIso() });
        if (Auth.visibleVendedorId()) item.vendedorId = Auth.visibleVendedorId();
        if (!item.nome) return UI.toast('Informe o nome do cliente.', 'error');
        if (!c.id) state.data.clientes.push(item);
        await UI.saveAndRender(c.id ? 'Cliente atualizado.' : 'Cliente criado.');
      });
    },
    venda(id) {
      const v = state.data.vendas.find((x) => x.id === id) || { data: today(), status: 'pendente' };
      UI.openModal(id ? 'Editar Venda' : 'Nova Venda', `<form id="form-venda" class="form-grid">
        <label>Cliente<select name="clienteId" required>${UI.clienteOptions(v.clienteId)}</select></label>
        <label>Produto<select name="produtoId" required>${UI.produtoOptions(v.produtoId)}</select></label>
        <label>Vendedor<select name="vendedorId">${UI.vendedorOptions(v.vendedorId || Auth.visibleVendedorId())}</select></label>
        <label>Valor<input name="valor" value="${esc(v.valor)}" inputmode="decimal" required></label>
        <label>Data<input name="data" type="date" value="${esc((v.data || today()).slice(0, 10))}"></label>
        <label>Status<select name="status"><option value="pendente" ${v.status === 'pendente' ? 'selected' : ''}>Pendente</option><option value="fechada" ${v.status === 'fechada' ? 'selected' : ''}>Fechada</option><option value="cancelada" ${v.status === 'cancelada' ? 'selected' : ''}>Cancelada</option></select></label>
        <label>Comissão %<input name="fatorComissao" value="${esc(v.fatorComissao || v.comissao || '')}" inputmode="decimal"></label>
        <label>Redução %<input name="reducaoComissao" value="${esc(v.reducaoComissao || '')}" inputmode="decimal"></label>
        <label class="full">Observações<textarea name="observacoes">${esc(v.observacoes || '')}</textarea></label>
        <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`);
      $('form-venda').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const produto = Calc.produto(f.produtoId);
        const item = v.id ? v : { id: uid(), criadoEm: nowIso() };
        Object.assign(item, f, {
          valor: moneyNumber(f.valor),
          fatorComissao: Number(String(f.fatorComissao || produto?.comissao || 0).replace(',', '.')) || 0,
          reducaoComissao: Number(String(f.reducaoComissao || 0).replace(',', '.')) || 0,
          atualizadoEm: nowIso()
        });
        if (Auth.visibleVendedorId()) item.vendedorId = Auth.visibleVendedorId();
        if (!item.clienteId || !item.produtoId) return UI.toast('Informe cliente e produto.', 'error');
        if (!v.id) state.data.vendas.push(item);
        Followups.autoFromVenda(item);
        await UI.saveAndRender(v.id ? 'Venda atualizada.' : 'Venda criada.');
      });
    },
    oportunidade(id) {
      const o = state.data.oportunidades.find((x) => x.id === id) || { etapa: 'novo', probabilidade: 10, dataAbertura: today() };
      UI.openModal(id ? 'Editar Oportunidade' : 'Nova Oportunidade', `<form id="form-oportunidade" class="form-grid">
        <label class="full">Título<input name="titulo" required value="${esc(o.titulo || '')}"></label>
        <label>Cliente<select name="clienteId">${UI.clienteOptions(o.clienteId)}</select></label>
        <label>Produto<select name="produtoId">${UI.produtoOptions(o.produtoId)}</select></label>
        <label>Vendedor<select name="vendedorId">${UI.vendedorOptions(o.vendedorId || Auth.visibleVendedorId())}</select></label>
        <label>Valor<input name="valor" value="${esc(o.valor || '')}" inputmode="decimal"></label>
        <label>Etapa<select name="etapa"><option value="novo">Novo</option><option value="contato">Contato</option><option value="proposta">Proposta</option><option value="negociacao">Negociação</option><option value="ganho">Ganho</option><option value="perdido">Perdido</option></select></label>
        <label>Probabilidade %<input name="probabilidade" value="${esc(o.probabilidade || 0)}" inputmode="numeric"></label>
        <label>Previsão<input name="dataPrevisao" type="date" value="${esc(o.dataPrevisao || '')}"></label>
        <label class="full">Observações<textarea name="observacoes">${esc(o.observacoes || '')}</textarea></label>
        <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`);
      $('form-oportunidade').elements.etapa.value = o.etapa || 'novo';
      $('form-oportunidade').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const item = o.id ? o : { id: uid(), criadoEm: nowIso(), dataAbertura: today() };
        Object.assign(item, f, { valor: moneyNumber(f.valor), probabilidade: Number(f.probabilidade) || 0, atualizadoEm: nowIso() });
        if (Auth.visibleVendedorId()) item.vendedorId = Auth.visibleVendedorId();
        if (!o.id) state.data.oportunidades.push(item);
        await UI.saveAndRender(o.id ? 'Oportunidade atualizada.' : 'Oportunidade criada.');
      });
    },
    followup(id) {
      const f = state.data.followups.find((x) => x.id === id) || { data: today(), status: 'pendente', tipo: 'ligacao', prioridade: 'media' };
      UI.openModal(id ? 'Editar Follow-up' : 'Novo Follow-up', `<form id="form-followup" class="form-grid">
        <label class="full">Título<input name="titulo" required value="${esc(f.titulo || '')}"></label>
        <label>Cliente<select name="clienteId">${UI.clienteOptions(f.clienteId)}</select></label>
        <label>Vendedor<select name="vendedorId">${UI.vendedorOptions(f.vendedorId || Auth.visibleVendedorId())}</select></label>
        <label>Data<input name="data" type="date" value="${esc((f.data || today()).slice(0, 10))}"></label>
        <label>Hora<input name="hora" type="time" value="${esc(f.hora || '')}"></label>
        <label>Status<select name="status"><option value="pendente">Pendente</option><option value="concluido">Concluído</option></select></label>
        <label>Prioridade<select name="prioridade"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></label>
        <label class="full">Descrição<textarea name="descricao">${esc(f.descricao || '')}</textarea></label>
        <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`);
      $('form-followup').elements.status.value = f.status || 'pendente';
      $('form-followup').elements.prioridade.value = f.prioridade || 'media';
      $('form-followup').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        const item = f.id ? f : { id: uid(), criadoEm: nowIso() };
        Object.assign(item, data, { atualizadoEm: nowIso() });
        if (Auth.visibleVendedorId()) item.vendedorId = Auth.visibleVendedorId();
        if (!f.id) state.data.followups.push(item);
        await UI.saveAndRender(f.id ? 'Follow-up atualizado.' : 'Follow-up criado.');
      });
    },
    produto(id) {
      const p = state.data.produtos.find((x) => x.id === id) || { ativo: true, comissao: 0 };
      UI.openModal(id ? 'Editar Produto' : 'Novo Produto', `<form id="form-produto" class="form-grid">
        <label class="full">Nome<input name="nome" required value="${esc(p.nome || '')}"></label>
        <label>Comissão %<input name="comissao" inputmode="decimal" value="${esc(p.comissao || 0)}"></label>
        <label>Recorrência<select name="recorrencia"><option value="">Sem recorrência</option><option value="mensal">Mensal</option><option value="bimestral">Bimestral</option><option value="trimestral">Trimestral</option><option value="semestral">Semestral</option><option value="anual">Anual</option></select></label>
        <label>Ativo<select name="ativo"><option value="true">Sim</option><option value="false">Não</option></select></label>
        <label class="full">Descrição<textarea name="descricao">${esc(p.descricao || '')}</textarea></label>
        <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`);
      $('form-produto').elements.recorrencia.value = p.recorrencia || '';
      $('form-produto').elements.ativo.value = String(p.ativo !== false);
      $('form-produto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const item = p.id ? p : { id: uid(), criadoEm: nowIso() };
        Object.assign(item, f, { comissao: Number(String(f.comissao).replace(',', '.')) || 0, ativo: f.ativo === 'true', atualizadoEm: nowIso() });
        if (!p.id) state.data.produtos.push(item);
        await UI.saveAndRender(p.id ? 'Produto atualizado.' : 'Produto criado.');
      });
    },
    vendedor(id) {
      const v = state.data.vendedores.find((x) => x.id === id) || { ativo: true, reducaoComissao: 0 };
      UI.openModal(id ? 'Editar Vendedor' : 'Novo Vendedor', `<form id="form-vendedor" class="form-grid">
        <label class="full">Nome<input name="nome" required value="${esc(v.nome || '')}"></label>
        <label>Telefone<input name="telefone" value="${esc(v.telefone || '')}"></label>
        <label>Email<input name="email" type="email" value="${esc(v.email || '')}"></label>
        <label>Redução comissão %<input name="reducaoComissao" inputmode="decimal" value="${esc(v.reducaoComissao || 0)}"></label>
        <label>Ativo<select name="ativo"><option value="true">Sim</option><option value="false">Não</option></select></label>
        <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`);
      $('form-vendedor').elements.ativo.value = String(v.ativo !== false);
      $('form-vendedor').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const item = v.id ? v : { id: uid(), criadoEm: nowIso() };
        Object.assign(item, f, { reducaoComissao: Number(String(f.reducaoComissao).replace(',', '.')) || 0, ativo: f.ativo === 'true', atualizadoEm: nowIso() });
        if (!v.id) state.data.vendedores.push(item);
        await UI.saveAndRender(v.id ? 'Vendedor atualizado.' : 'Vendedor criado.');
      });
    },
    usuario(id) {
      const u = state.data.usuarios.find((x) => x.id === id) || { ativo: true, tipo: 'vendedor' };
      UI.openModal(id ? 'Editar Usuário' : 'Novo Usuário', `<form id="form-usuario" class="form-grid">
        <label>Nome<input name="nome" required value="${esc(u.nome || '')}"></label>
        <label>Login<input name="login" required value="${esc(u.login || '')}"></label>
        <label>Senha<input name="senha" type="password" ${id ? '' : 'required'}></label>
        <label>Perfil<select name="tipo"><option value="master">Master</option><option value="vendedor">Vendedor</option></select></label>
        <label>Vendedor vinculado<select name="vendedorId">${UI.vendedorOptions(u.vendedorId)}</select></label>
        <label>Ativo<select name="ativo"><option value="true">Sim</option><option value="false">Não</option></select></label>
        <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`);
      $('form-usuario').elements.tipo.value = Auth.roleOf(u);
      $('form-usuario').elements.ativo.value = String(u.ativo !== false);
      $('form-usuario').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const item = u.id ? u : { id: uid(), criadoEm: nowIso() };
        if (state.data.usuarios.some((x) => x.id !== item.id && lower(x.login) === lower(f.login))) return UI.toast('Login já cadastrado.', 'error');
        Object.assign(item, { nome: f.nome, login: f.login, tipo: f.tipo, vendedorId: f.tipo === 'vendedor' ? f.vendedorId : null, ativo: f.ativo === 'true', atualizadoEm: nowIso() });
        if (f.senha) {
          item.salt = Auth.salt();
          item.senhaHash = await Auth.hash(f.senha, item.salt);
        }
        if (!u.id) state.data.usuarios.push(item);
        await UI.saveAndRender(u.id ? 'Usuário atualizado.' : 'Usuário criado.');
      });
    },
    pagamento(vendaId) {
      const v = state.data.vendas.find((x) => x.id === vendaId);
      if (!v) return;
      UI.openModal('Registrar Pagamento', `<form id="form-pagamento" class="form-grid">
        <label>Valor<input name="valor" inputmode="decimal" value="${esc(Calc.pendenteComissao(v).toFixed(2).replace('.', ','))}" required></label>
        <label>Data<input name="data" type="date" value="${today()}"></label>
        <label class="full">Observação<input name="observacao"></label>
        <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`);
      $('form-pagamento').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        state.data.pagamentos.push({ id: uid(), vendaId, valor: moneyNumber(f.valor), data: f.data || today(), observacao: f.observacao || '', criadoEm: nowIso() });
        await UI.saveAndRender('Pagamento registrado.');
      });
    }
  };

  const Config = {
    render(tab) {
      const target = $('config-target');
      if (tab === 'produtos') {
        target.innerHTML = `<section class="panel"><div class="toolbar"><button class="btn primary" id="new-produto">+ Novo Produto</button></div>${Render.list(state.data.produtos, 'Nenhum produto cadastrado', Rows.produto)}</section>`;
        $('new-produto').addEventListener('click', () => Forms.produto());
      }
      if (tab === 'vendedores') {
        target.innerHTML = `<section class="panel"><div class="toolbar"><button class="btn primary" id="new-vendedor">+ Novo Vendedor</button></div>${Render.list(state.data.vendedores, 'Nenhum vendedor cadastrado', Rows.vendedor)}</section>`;
        $('new-vendedor').addEventListener('click', () => Forms.vendedor());
      }
      if (tab === 'usuarios') {
        target.innerHTML = `<section class="panel"><div class="toolbar"><button class="btn primary" id="new-usuario">+ Novo Usuário</button></div>${Render.list(state.data.usuarios, 'Nenhum usuário cadastrado', Rows.usuario)}</section>`;
        $('new-usuario').addEventListener('click', () => Forms.usuario());
      }
      if (tab === 'backup') {
        target.innerHTML = `<section class="panel pad grid">
          <h3 class="section-title">Backup do banco</h3>
          <p>Exporta ou importa os dados salvos no banco de dados do servidor. Nenhuma cópia é gravada no navegador.</p>
          <div class="page-actions" style="justify-content:flex-start">
            <button class="btn" id="backup-export">Exportar JSON</button>
            <label class="btn">Importar JSON<input id="backup-import" type="file" accept=".json,application/json" class="hidden"></label>
          </div>
        </section>`;
        $('backup-export').addEventListener('click', exportBackup);
        $('backup-import').addEventListener('change', importBackup);
      }
    }
  };

  const Followups = {
    autoFromVenda(venda) {
      if (!venda.id || venda.status !== 'fechada') return;
      const exists = state.data.followups.some((f) => f.vendaId === venda.id && f.origem === 'auto:pos-venda');
      if (exists) return;
      const cliente = Calc.cliente(venda.clienteId);
      const data = new Date((venda.data || today()) + 'T00:00:00');
      data.setDate(data.getDate() + 7);
      state.data.followups.push({
        id: uid(),
        titulo: 'Pós-venda: ' + (cliente?.nome || 'cliente'),
        data: data.toISOString().slice(0, 10),
        hora: '',
        tipo: 'ligacao',
        prioridade: 'media',
        clienteId: venda.clienteId,
        vendedorId: venda.vendedorId,
        vendaId: venda.id,
        origem: 'auto:pos-venda',
        status: 'pendente',
        descricao: 'Contato automático de pós-venda.',
        criadoEm: nowIso()
      });
    }
  };

  function exportCsv() {
    const rows = [['Data', 'Cliente', 'Produto', 'Vendedor', 'Status', 'Valor', 'Comissao']];
    Auth.vendas().forEach((v) => rows.push([
      dateFmt(v.data),
      Calc.cliente(v.clienteId)?.nome || '',
      Calc.produto(v.produtoId)?.nome || '',
      Calc.vendedor(v.vendedorId)?.nome || '',
      v.status || '',
      String(v.valor || 0).replace('.', ','),
      String(Calc.vendaComissao(v).toFixed(2)).replace('.', ',')
    ]));
    download('relatorio-vendas.csv', rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv;charset=utf-8');
  }

  function exportBackup() {
    download(`crm-energia-backup-${today()}.json`, JSON.stringify(Store.payload(), null, 2), 'application/json;charset=utf-8');
  }

  async function importBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = Store.normalize(JSON.parse(await file.text()));
      if (!UI.confirm('Importar este backup e substituir os dados atuais do CRM Energia?')) return;
      state.data = payload;
      state.docId = null;
      await Store.save();
      UI.toast('Backup importado.');
      Render.all();
    } catch (err) {
      console.error(err);
      UI.toast('Backup inválido.', 'error');
    }
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function removeBy(collection, id, label) {
    if (!UI.confirm(`Excluir ${label}?`)) return;
    state.data[collection] = state.data[collection].filter((item) => item.id !== id);
    UI.saveAndRender(`${label} excluído.`);
  }

  function viewCliente(id) {
    const c = state.data.clientes.find((x) => x.id === id);
    if (!c) return;
    const vendas = Auth.vendas().filter((v) => v.clienteId === id);
    UI.openModal('Ficha do Cliente', `
      <div class="grid">
        <div><h3>${esc(c.nome)}</h3><p>${esc(c.tipo || '')} ${esc(c.documento || '')}</p></div>
        <div class="grid cols-2">
          <div><strong>Telefone</strong><p>${esc(c.telefone || '-')}</p></div>
          <div><strong>Email</strong><p>${esc(c.email || '-')}</p></div>
          <div><strong>Vendedor</strong><p>${esc(Calc.vendedor(c.vendedorId)?.nome || '-')}</p></div>
          <div><strong>Total vendido</strong><p>${brl(Calc.totalVendas(vendas))}</p></div>
        </div>
        <div><strong>Endereço</strong><p>${esc(c.endereco || '-')}</p></div>
        <div><strong>Observações</strong><p>${esc(c.observacao || '-')}</p></div>
      </div>`);
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button, [data-close]');
    if (!t) return;
    if (t.dataset.close !== undefined) UI.closeModal();
    if (t.dataset.tab) {
      state.tab = t.dataset.tab;
      document.body.classList.remove('menu-open');
      Render.all();
    }
    if (t.dataset.viewCliente) viewCliente(t.dataset.viewCliente);
    if (t.dataset.editCliente) Forms.cliente(t.dataset.editCliente);
    if (t.dataset.delCliente) removeBy('clientes', t.dataset.delCliente, 'cliente');
    if (t.dataset.editVenda) Forms.venda(t.dataset.editVenda);
    if (t.dataset.delVenda) removeBy('vendas', t.dataset.delVenda, 'venda');
    if (t.dataset.editOportunidade) Forms.oportunidade(t.dataset.editOportunidade);
    if (t.dataset.delOportunidade) removeBy('oportunidades', t.dataset.delOportunidade, 'oportunidade');
    if (t.dataset.editFollowup) Forms.followup(t.dataset.editFollowup);
    if (t.dataset.delFollowup) removeBy('followups', t.dataset.delFollowup, 'follow-up');
    if (t.dataset.doneFollowup) {
      const item = state.data.followups.find((f) => f.id === t.dataset.doneFollowup);
      if (item) {
        item.status = 'concluido';
        item.atualizadoEm = nowIso();
        await UI.saveAndRender('Follow-up concluído.');
      }
    }
    if (t.dataset.pay) Forms.pagamento(t.dataset.pay);
    if (t.dataset.editProduto) Forms.produto(t.dataset.editProduto);
    if (t.dataset.delProduto) removeBy('produtos', t.dataset.delProduto, 'produto');
    if (t.dataset.editVendedor) Forms.vendedor(t.dataset.editVendedor);
    if (t.dataset.delVendedor) removeBy('vendedores', t.dataset.delVendedor, 'vendedor');
    if (t.dataset.editUsuario) Forms.usuario(t.dataset.editUsuario);
    if (t.dataset.delUsuario) removeBy('usuarios', t.dataset.delUsuario, 'usuário');
  });

  const App = {
    async init() {
      try {
        await Store.load();
        await Auth.ensureMaster();
        $('boot').classList.add('hidden');
        this.showLogin();
      } catch (err) {
        console.error('Falha ao carregar CRM Energia:', err);
        $('boot').innerHTML = '<strong>Não foi possível carregar os dados do CRM Energia.</strong><span>Verifique se o servidor está online e tente atualizar a página.</span>';
      }
    },
    showLogin() {
      $('app').classList.add('hidden');
      $('login-screen').classList.remove('hidden');
      $('login-error').textContent = '';
      $('login-user').focus();
    },
    showApp() {
      $('login-screen').classList.add('hidden');
      $('app').classList.remove('hidden');
      Render.all();
    }
  };

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-error').textContent = '';
    const ok = await Auth.login($('login-user').value, $('login-pass').value);
    if (!ok) {
      $('login-error').textContent = 'Login ou senha inválidos.';
      return;
    }
    $('login-pass').value = '';
    App.showApp();
  });
  $('logout-btn').addEventListener('click', () => Auth.logout());
  $('modal-close').addEventListener('click', () => UI.closeModal());
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') UI.closeModal(); });
  $('menu-btn').addEventListener('click', () => document.body.classList.toggle('menu-open'));

  window.CrmEnergia = { state, Store, Auth, Forms, Pages, Calc };
  App.init();
})();
