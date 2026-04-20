// Forge dashboard — vanilla ES modules. Honest layout, dismissable overlays,
// real command palette, Monaco-backed config editor.

const app = document.getElementById('app');
const toasts = document.getElementById('toasts');
const overlayHost = document.getElementById('overlay-host');
const navEl = document.getElementById('nav');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

let currentProject = null;
let projectWs = null;
const taskConnections = new Map();

// ---------- Icons ----------

const ICON_PATHS = {
  home: '<path d="M3 10l9-7 9 7v10a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2V10z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  play: '<path d="M5 3l14 9-14 9V3z"/>',
  bolt: '<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>',
  brain: '<path d="M12 3a3 3 0 00-3 3v0a3 3 0 00-3 3v1a3 3 0 00-2 2.83V14a3 3 0 003 3h1a3 3 0 003 3v0a3 3 0 003-3h1a3 3 0 003-3v-1.17A3 3 0 0018 10V9a3 3 0 00-3-3a3 3 0 00-3-3z"/>',
  plug: '<path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 01-5 5v6"/>',
  star: '<path d="M12 2l3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1 3-7z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
  sparkle: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l4 4M14 14l4 4M6 18l4-4M14 10l4-4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12M8 9h6a2 2 0 010 4H10a2 2 0 000 4h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  heart: '<path d="M20.8 5.6a5.5 5.5 0 00-7.8 0L12 6.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/>',
  arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 00-5.6 5.6L3 18l3 3 6.1-6.1a4 4 0 005.6-5.6l-2.5 2.5-2.5-2.5 2.5-2.5a4 4 0 00-2.5-0.5z"/>',
  test: '<path d="M10 2v7l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V2M9 14h6"/>',
  shield: '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  book: '<path d="M4 4h12a4 4 0 014 4v14H8a4 4 0 01-4-4V4z"/><path d="M4 18h16"/>',
  bug: '<path d="M8 10v4a4 4 0 108 0v-4M8 10a4 4 0 018 0M8 10H4M16 10h4M6 14H3M18 14h3M6 18H3M18 18h3M12 4V2M9 4l-2-2M15 4l2-2"/>',
  refresh: '<path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  chat: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6M5 6l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/>',
  robot: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M12 2v5M9 12h.01M15 12h.01M9 16h6"/>',
};

const icon = (name) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6">${ICON_PATHS[name] || ''}</svg>`;

// ---------- Navigation ----------

const NAV = [
  { group: 'overview', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'tasks', label: 'Tasks', icon: 'list' },
  ]},
  { group: 'run', items: [
    { id: 'chat', label: 'Chat', icon: 'chat' },
    { id: 'run', label: 'New task', icon: 'play' },
    { id: 'active', label: 'Active', icon: 'bolt', live: true },
  ]},
  { group: 'runtime', items: [
    { id: 'models', label: 'Models', icon: 'brain' },
    { id: 'mcp', label: 'MCP', icon: 'plug' },
    { id: 'skills', label: 'Skills', icon: 'star' },
    { id: 'web', label: 'Web', icon: 'globe' },
  ]},
  { group: 'memory', items: [
    { id: 'memory', label: 'Cold memory', icon: 'archive' },
    { id: 'learning', label: 'Learning', icon: 'sparkle' },
  ]},
  { group: 'ops', items: [
    { id: 'cost', label: 'Cost', icon: 'coin' },
    { id: 'config', label: 'Config', icon: 'gear' },
    { id: 'doctor', label: 'Doctor', icon: 'heart' },
  ]},
];

const renderNav = () => {
  navEl.innerHTML = NAV.map((g) => `
    <div class="nav-group">
      <div class="nav-group-title">${g.group}</div>
      ${g.items.map((it) => `
        <button class="nav-item" data-view="${it.id}">
          <span class="nav-icon">${icon(it.icon)}</span>
          <span>${esc(it.label)}</span>
          ${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}
          ${it.live ? `<span class="badge-live" data-active-count hidden>0</span>` : ''}
        </button>
      `).join('')}
    </div>
  `).join('');
  navEl.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => setView(b.dataset.view)),
  );
};

// ---------- Utilities ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const fmtDate = (iso) => {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  } catch { return iso; }
};

const badge = (status) => `<span class="badge badge-${esc(status)}">${esc(status)}</span>`;

const toast = (message, kind = 'info') => {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  toasts.appendChild(el);
  setTimeout(() => el.remove(), 4000);
};

const api = async (path, opts = {}) => {
  const init = { ...opts };
  // Auto-serialize plain-object bodies.
  if (init.body && typeof init.body === 'object' && !(init.body instanceof FormData) && !(init.body instanceof Blob)) {
    init.headers = { 'content-type': 'application/json', ...(init.headers || {}) };
    init.body = JSON.stringify(init.body);
  }
  const r = await fetch(path, init);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`${path}: ${r.status} ${txt.slice(0, 200)}`);
  }
  return r.status === 204 ? null : r.json();
};
const apiPost = (path, body) =>
  api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

const syntaxHighlight = (obj) =>
  JSON.stringify(obj, null, 2)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/("[^"]+")\s*:/g, '<span class="json-key">$1</span>:')
    .replace(/: ("(?:[^"\\]|\\.)*")/g, ': <span class="json-string">$1</span>')
    .replace(/: (-?\d+(?:\.\d+)?)/g, ': <span class="json-number">$1</span>')
    .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
    .replace(/: (null)/g, ': <span class="json-null">$1</span>');

const pageHeader = (title, subtitle = '', actions = '') => `
  <header class="page-header">
    <div>
      <h1 class="page-title">${esc(title)}</h1>
      ${subtitle ? `<div class="page-subtitle">${esc(subtitle)}</div>` : ''}
    </div>
    <div class="page-actions">${actions}</div>
  </header>`;

const sectionShell = (title, meta, body) => `
  <section class="section">
    ${title || meta ? `<div class="section-head">
      <h2>${esc(title || '')}</h2>
      ${meta ? `<span class="section-meta">${meta}</span>` : ''}
    </div>` : ''}
    <div class="section-body">${body}</div>
  </section>`;

const skeletonRows = (n = 3) =>
  `<div class="skeleton-list">${
    Array.from({ length: n }).map(() => `<div class="skeleton w-90"></div><div class="skeleton w-50"></div>`).join('')
  }</div>`;

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'You’re up late.';
  if (h < 12) return 'Good morning.';
  if (h < 17) return 'Good afternoon.';
  if (h < 22) return 'Good evening.';
  return 'You’re up late.';
};

// Wrap any view body in `.content-inner` so the content area's generous
// padding doesn't feel empty on wide monitors.
const page = (html) => `<div class="content-inner">${html}</div>`;

// ---------- Prompt history (arrow-up recall, UI-wide) ----------
//
// Mirrors the REPL's up/down recall. Shared pool across the hero, run, and
// chat inputs so a prompt you typed on one surface can be pulled back on
// another. Persists to localStorage; capped at 500 entries.

const PROMPT_HIST_KEY = 'forge:prompt-history';
const PROMPT_HIST_MAX = 500;

const loadPromptHistory = () => {
  try {
    const raw = localStorage.getItem(PROMPT_HIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s) : [];
  } catch {
    return [];
  }
};

const savePromptHistory = (arr) => {
  try {
    localStorage.setItem(PROMPT_HIST_KEY, JSON.stringify(arr.slice(-PROMPT_HIST_MAX)));
  } catch { /* quota — ignore */ }
};

const pushPromptHistory = (text) => {
  const s = (text || '').trim();
  if (!s) return;
  const hist = loadPromptHistory();
  // Drop an immediately-repeated entry so a double submit doesn't duplicate.
  if (hist[hist.length - 1] === s) return;
  hist.push(s);
  savePromptHistory(hist);
};

/**
 * Wire ArrowUp/ArrowDown history recall on an `<input>` or `<textarea>`.
 *
 * UX rules (mirrors bash/zsh + the REPL line editor):
 *  - ArrowUp when the field is empty OR the cursor is on the first line
 *    → replace value with the previous history entry
 *  - ArrowDown on the last line → step newer, eventually restoring the
 *    live draft that was in progress when navigation began
 *  - Esc while navigating → restore the live draft and stop navigating
 *  - Typing at any point cancels navigation so the next up-arrow picks up
 *    from the newest entry again
 */
const attachPromptHistory = (el) => {
  if (!el || el.dataset.historyAttached === '1') return;
  el.dataset.historyAttached = '1';

  let hist = loadPromptHistory();
  // -1 = live draft, 0..hist.length-1 = navigating from newest → oldest
  let idx = -1;
  let stash = '';

  const isTextarea = el.tagName === 'TEXTAREA';
  const onFirstLine = () => {
    if (!isTextarea) return true;
    const before = el.value.slice(0, el.selectionStart ?? 0);
    return !before.includes('\n');
  };
  const onLastLine = () => {
    if (!isTextarea) return true;
    const after = el.value.slice(el.selectionEnd ?? el.value.length);
    return !after.includes('\n');
  };

  const show = (value) => {
    el.value = value;
    // Place caret at the end so the next ArrowUp keeps navigating.
    const end = value.length;
    try { el.setSelectionRange(end, end); } catch { /* not all inputs support it */ }
    if (isTextarea && typeof autosize === 'function') {
      try { autosize(el); } catch { /* autosize is optional */ }
    }
  };

  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      if (!onFirstLine()) return;
      hist = loadPromptHistory();
      if (!hist.length) return;
      if (idx === -1) stash = el.value;
      idx = Math.min(idx + 1, hist.length - 1);
      e.preventDefault();
      show(hist[hist.length - 1 - idx]);
      return;
    }
    if (e.key === 'ArrowDown') {
      if (idx === -1 || !onLastLine()) return;
      idx--;
      e.preventDefault();
      show(idx === -1 ? stash : hist[hist.length - 1 - idx]);
      return;
    }
    if (e.key === 'Escape' && idx !== -1) {
      idx = -1;
      e.preventDefault();
      show(stash);
      return;
    }
    // Any ordinary typing cancels navigation.
    if (idx !== -1 && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      idx = -1;
      stash = '';
    }
  });
};

// ---------- View router ----------

const views = {};
let currentView = 'dashboard';

const setView = (name) => {
  currentView = name;
  document.querySelectorAll('.nav-item').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === name),
  );
  if (views[name]) return views[name]();
  app.innerHTML = page(`<div class="empty"><div class="empty-title">Unknown view</div><div>${esc(name)}</div></div>`);
};

// ---------- Dashboard ----------

const QUICK_CHIPS = [
  { label: 'Add tests', prompt: 'Write unit tests for the most important module in this project. Auto-detect the test framework.', icon: 'test' },
  { label: 'Audit security', prompt: 'Audit this codebase for common security issues. Report findings by severity, do not modify files.', icon: 'shield' },
  { label: 'Refactor', prompt: 'Identify the module most in need of refactoring and produce a plan with low-risk small steps.', icon: 'wrench' },
  { label: 'Generate docs', prompt: 'Generate README and architecture documentation for this project.', icon: 'book' },
  { label: 'Fix a bug', prompt: 'Investigate any failing tests or obvious bugs and fix the root cause.', icon: 'bug' },
  { label: 'Ship it', prompt: 'Prepare this repo for a release: changelog, version bump, build check.', icon: 'rocket' },
];

views.dashboard = async () => {
  app.innerHTML = page(skeletonRows(4));
  try {
    const [status, projects, tasks, activeRes, cost] = await Promise.all([
      api('/api/status'),
      api('/api/projects'),
      api('/api/tasks?limit=8'),
      api('/api/tasks/active'),
      api('/api/cost').catch(() => ({ totals: { calls: 0, tokens: 0, usd: 0 } })),
    ]);
    currentProject = currentProject || projects[0]?.path || status.cwd;
    updateActiveBadge(activeRes.active);

    const live = (activeRes.active || []).filter((t) => t.status === 'running' || t.status === 'awaiting');

    // Recent prompts extracted from task titles (most recent first, de-duped)
    const seenPrompts = new Set();
    const recentPrompts = [];
    for (const t of tasks) {
      const title = (t.title || '').trim();
      if (!title || seenPrompts.has(title.toLowerCase())) continue;
      seenPrompts.add(title.toLowerCase());
      recentPrompts.push({ id: t.id, title, status: t.status, updated: t.updated_at });
      if (recentPrompts.length >= 5) break;
    }

    const chipsHtml = QUICK_CHIPS.map((c) => `
      <button class="chip" data-chip="${esc(c.prompt)}">
        <span class="chip-icon">${icon(c.icon)}</span>
        ${esc(c.label)}
      </button>
    `).join('');

    const liveSection = live.length
      ? sectionShell(`Active · ${live.length}`, '', live.map((t) => `
          <div class="row">
            ${badge(t.status)}
            <div class="row-main">
              <div class="title">${esc(t.prompt.slice(0, 140))}</div>
              <div class="sub"><code>${esc(t.taskId)}</code><span>${esc(t.mode)}</span></div>
            </div>
            <button class="btn btn-ghost btn-sm" data-open-task="${esc(t.taskId)}">Open</button>
          </div>`).join(''))
      : '';

    const recentSection = sectionShell('Recent tasks', tasks.length ? `${tasks.length} shown` : '',
      tasks.length
        ? `<div class="table-wrap"><table class="table sortable" data-default-sort="4">
            <thead><tr>
              <th data-sort="text">id</th>
              <th data-sort="text">status</th>
              <th data-sort="text">mode</th>
              <th data-sort="text">intent</th>
              <th data-sort="text" class="col-wrap">title</th>
              <th data-sort="date" data-default-dir="desc">updated</th>
            </tr></thead>
            <tbody>${tasks.map((t) => `<tr>
              <td><code>${esc(t.id)}</code></td>
              <td>${badge(t.status)}</td>
              <td>${esc(t.mode)}</td>
              <td>${esc(t.intent ?? '—')}</td>
              <td class="col-wrap">${esc((t.title ?? '').slice(0, 80) || '—')}</td>
              <td data-raw="${esc(t.updated_at ?? '')}">${esc(fmtDate(t.updated_at))}</td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="empty"><div class="empty-title">No tasks yet</div><div>Type a prompt above or press <kbd>⌘ K</kbd>.</div></div>');

    const providerSection = sectionShell('Runtime',
      status.daemon.running ? `daemon pid ${status.daemon.pid}` : 'daemon stopped',
      `<div class="section-body-padded" style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${(status.providers || []).map((p) => `
            <span class="pill ${p.available ? 'ok' : 'down'}"><span class="dot"></span>${esc(p.name)}</span>
          `).join('')}
        </div>
        <div style="font-size:12px;color:var(--muted)">provider · <strong style="color:var(--fg-2)">${esc(status.provider)}</strong></div>
        <div style="font-size:12px;color:var(--muted)">mode · <strong style="color:var(--fg-2)">${esc(status.defaultMode)}</strong></div>
        <div style="font-size:12px;color:var(--muted)">channel · <strong style="color:var(--fg-2)">${esc(status.channel)}</strong>${status.version ? ' · v' + esc(status.version) : ''}</div>
      </div>`);

    const recentPromptsSection = recentPrompts.length
      ? sectionShell('Recent prompts', 'click to rerun', recentPrompts.map((r) => `
          <div class="row" data-rerun="${esc(r.title)}" style="cursor:pointer">
            ${badge(r.status)}
            <div class="row-main">
              <div class="title">${esc(r.title.slice(0, 140))}</div>
              <div class="sub"><code>${esc(r.id)}</code><span>${esc(fmtDate(r.updated))}</span></div>
            </div>
            <span class="nav-icon" style="color:var(--muted)">${icon('refresh')}</span>
          </div>`).join(''))
      : '';

    app.innerHTML = page(`
      <section class="hero">
        <h1>${esc(greeting())} What should Forge build?</h1>
        <div class="hero-sub">Type a prompt. Or press <kbd>⌘ K</kbd> for the command palette.</div>
        <div class="hero-input-wrap">
          <input class="hero-input" id="hero-input" placeholder="e.g. add a /health endpoint to the Express server" autocomplete="off" />
          <button class="hero-submit" id="hero-go" aria-label="Run">${icon('arrow')}</button>
        </div>
        <div class="hero-chips">${chipsHtml}</div>
        <div class="hero-hint"><kbd>⏎</kbd> run · <kbd>⇧ ⏎</kbd> open advanced form</div>
      </section>

      <div class="stats">
        <div class="stat">
          <div class="label">Active</div>
          <div class="value">${live.length}</div>
          <div class="sub">${live.length ? 'running now' : 'idle'}</div>
        </div>
        <div class="stat">
          <div class="label">Tasks</div>
          <div class="value">${tasks.length}</div>
          <div class="sub">shown · ${projects.length} projects</div>
        </div>
        <div class="stat">
          <div class="label">Spend</div>
          <div class="value">$${Number(cost.totals?.usd ?? 0).toFixed(3)}</div>
          <div class="sub">${Number(cost.totals?.tokens ?? 0).toLocaleString()} tokens</div>
        </div>
        <div class="stat">
          <div class="label">Provider</div>
          <div class="value" style="font-size:18px">${esc(status.provider)}</div>
          <div class="sub">mode · ${esc(status.defaultMode)}</div>
        </div>
      </div>

      ${liveSection}

      <div class="grid-2">
        ${recentSection}
        <div style="display:flex;flex-direction:column;gap:16px">
          ${providerSection}
          ${recentPromptsSection}
        </div>
      </div>
    `);

    const input = document.getElementById('hero-input');
    const go = async (prompt = null) => {
      const p = (prompt ?? input.value).trim();
      if (!p) return;
      pushPromptHistory(p);
      try {
        const { taskId } = await apiPost('/api/tasks/run', { prompt: p, autoApprove: false });
        toast('Task started', 'ok');
        openTask(taskId);
      } catch (e) { toast(String(e), 'err'); }
    };
    document.getElementById('hero-go').addEventListener('click', () => go());
    attachPromptHistory(input);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); }
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); setView('run'); }
    });
    app.querySelectorAll('[data-chip]').forEach((b) =>
      b.addEventListener('click', () => { input.value = b.dataset.chip; input.focus(); }),
    );
    app.querySelectorAll('[data-open-task]').forEach((b) =>
      b.addEventListener('click', () => openTask(b.dataset.openTask)),
    );
    app.querySelectorAll('[data-rerun]').forEach((el) =>
      el.addEventListener('click', () => { input.value = el.dataset.rerun; input.focus(); }),
    );
    setTimeout(() => input.focus(), 30);
  } catch (e) {
    app.innerHTML = page(`<div class="empty"><div class="empty-title">Failed to load</div><div>${esc(e.message)}</div></div>`);
  }
};

// ---------- Chat (multi-turn conversations) ----------

const chatState = {
  sessionId: null,
  poll: null,
  ws: null,
};

const closeChatWs = () => {
  if (chatState.ws) {
    try { chatState.ws.close(); } catch {}
    chatState.ws = null;
  }
};

const CHAT_MODES = ['fast', 'balanced', 'heavy', 'plan', 'audit', 'debug', 'architect'];

views.chat = async () => {
  app.innerHTML = page(`
    <div class="chat-shell">
      <aside class="chat-sidebar">
        <div class="chat-sidebar-head">
          <button id="chat-new" class="chat-new-btn">${icon('plus')}<span>New chat</span></button>
        </div>
        <div id="chat-list" class="chat-list"></div>
      </aside>
      <section class="chat-main" id="chat-main">
        <div class="chat-empty">
          <div class="chat-empty-icon">${icon('chat')}</div>
          <div class="chat-empty-title">Start a conversation</div>
          <div class="chat-empty-sub">Multi-turn follow-ups: Forge threads prior turns into each new plan.</div>
          <button id="chat-empty-new" class="chat-empty-cta">${icon('plus')}<span>New chat</span></button>
        </div>
      </section>
    </div>
  `);

  const projectPath = encodeURIComponent(currentProject || '');

  const refreshList = async () => {
    const sessions = await api(`/api/chat/sessions?projectPath=${projectPath}`).catch(() => []);
    const host = document.getElementById('chat-list');
    if (!host) return;
    if (!sessions.length) {
      host.innerHTML = `<div class="chat-list-empty">No conversations yet.</div>`;
      return;
    }
    host.innerHTML = sessions.map((s) => {
      const badge = s.source === 'repl'
        ? `<span class="chat-src chat-src-repl">REPL</span>`
        : `<span class="chat-src chat-src-chat">CHAT</span>`;
      return `
        <button class="chat-list-item${s.id === chatState.sessionId ? ' active' : ''}" data-id="${esc(s.id)}">
          <div class="chat-list-title">${badge}${esc(s.title || 'Untitled')}</div>
          <div class="chat-list-meta">
            <span>${s.turns} turn${s.turns === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>${esc(s.mode)}</span>
            <span>·</span>
            <span>${timeago(s.lastAt)}</span>
          </div>
        </button>
      `;
    }).join('');
    host.querySelectorAll('.chat-list-item').forEach((el) =>
      el.addEventListener('click', () => openSession(el.dataset.id)),
    );
  };

  const openSession = async (id) => {
    chatState.sessionId = id;
    stopPolling();
    closeChatWs();
    await refreshList();
    await renderConversation();
    startPolling();
    openChatWs(id);
  };

  const openChatWs = (id) => {
    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const qs = new URLSearchParams({ projectPath: currentProject || '' });
      const ws = new WebSocket(`${proto}//${location.host}/ws/conversations/${id}?${qs}`);
      ws.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.kind === 'conversation.update' && chatState.sessionId === id) {
            // Refresh conversation + sidebar on remote-authored updates so
            // turns/status/files appear without waiting for the poller.
            await renderConversation();
            await refreshList();
          }
        } catch {}
      };
      ws.onclose = () => { if (chatState.ws === ws) chatState.ws = null; };
      chatState.ws = ws;
    } catch (err) {
      // WebSocket unavailable is non-fatal — the poll loop covers updates.
    }
  };

  const newSession = async () => {
    const body = { projectPath: currentProject, source: 'chat' };
    const s = await api('/api/chat/sessions', { method: 'POST', body });
    chatState.sessionId = s.meta ? s.meta.id : s.id;
    await refreshList();
    await renderConversation();
    openChatWs(chatState.sessionId);
  };

  const renderConversation = async () => {
    const host = document.getElementById('chat-main');
    if (!host) return;
    if (!chatState.sessionId) {
      host.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-icon">${icon('chat')}</div>
          <div class="chat-empty-title">Start a conversation</div>
          <div class="chat-empty-sub">Multi-turn follow-ups: Forge threads prior turns into each new plan.</div>
          <button id="chat-empty-new" class="chat-empty-cta">${icon('plus')}<span>New chat</span></button>
        </div>`;
      host.querySelector('#chat-empty-new')?.addEventListener('click', newSession);
      return;
    }
    const sess = await api(`/api/chat/sessions/${chatState.sessionId}?projectPath=${projectPath}`).catch(() => null);
    if (!sess) {
      host.innerHTML = `<div class="chat-empty"><div class="chat-empty-title">Session not found.</div></div>`;
      return;
    }
    // Unified Conversation response: { meta, turns }. Fall back to the old
    // flat shape for backward compat with any cached tabs.
    const meta = sess.meta || sess;
    const turns = sess.turns || [];
    const isRunning = turns.some((t) => t.status === 'running' || t.status === 'pending');
    const sourceBadge = meta.source === 'repl'
      ? `<span class="chat-src chat-src-repl" title="Created from the CLI REPL">REPL</span>`
      : `<span class="chat-src chat-src-chat" title="Created from the Web UI">CHAT</span>`;
    host.innerHTML = `
      <header class="chat-header">
        <div class="chat-header-title" title="${esc(meta.title || '')}">${sourceBadge}${esc(meta.title || '')}</div>
        <div class="chat-header-meta">
          <span class="chip chip-neutral">${esc(meta.mode || '')}</span>
          <span class="chip chip-neutral">${turns.length} turn${turns.length === 1 ? '' : 's'}</span>
          <button class="chat-header-del" id="chat-delete" title="Delete this chat">${icon('trash')}</button>
        </div>
      </header>
      <div class="chat-turns" id="chat-turns">
        ${turns.map(turnHtml).join('')}
        ${isRunning ? `<div class="chat-running">${icon('bolt')}<span>Forge is working…</span></div>` : ''}
      </div>
      <form class="chat-composer" id="chat-composer">
        <div class="chat-composer-inner">
          <textarea id="chat-input" placeholder="Reply… (Shift+Enter for newline)" rows="1" ${isRunning ? 'disabled' : ''}></textarea>
          <div class="chat-composer-bar">
            <select id="chat-mode" class="chat-mode-select" ${isRunning ? 'disabled' : ''}>
              ${CHAT_MODES.map((m) => `<option value="${m}" ${m === meta.mode ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <label class="chat-auto"><input type="checkbox" id="chat-auto"> auto-approve</label>
            <button type="submit" class="chat-send" ${isRunning ? 'disabled' : ''}>${icon('send')}<span>Send</span></button>
          </div>
        </div>
      </form>
    `;

    // Preserve scroll position on re-render: only auto-scroll if the user
    // was already near the bottom (within 80px) — keeps them pinned as new
    // content arrives, but doesn't rip them away mid-scroll if they're
    // reading older turns.
    const turnsEl = document.getElementById('chat-turns');
    if (turnsEl) {
      const prev = chatState.lastScroll;
      const wasAtBottom = prev == null
        ? true
        : prev.scrollHeight - (prev.scrollTop + prev.clientHeight) < 80;
      turnsEl.scrollTop = wasAtBottom ? turnsEl.scrollHeight : prev.scrollTop;
      turnsEl.addEventListener('scroll', () => {
        chatState.lastScroll = {
          scrollTop: turnsEl.scrollTop,
          scrollHeight: turnsEl.scrollHeight,
          clientHeight: turnsEl.clientHeight,
        };
      });
    }

    // Wire retry buttons on failed turns.
    document.querySelectorAll('.chat-retry').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.input;
        if (!text) return;
        try {
          await api(`/api/chat/sessions/${chatState.sessionId}/turns`, {
            method: 'POST',
            body: { input: text, mode: document.getElementById('chat-mode')?.value, projectPath: currentProject },
          });
          await renderConversation();
          await refreshList();
          startPolling();
        } catch (err) {
          toast('retry failed: ' + err.message, 'err');
        }
      });
    });

    const input = document.getElementById('chat-input');
    if (input && !isRunning) {
      input.focus();
      attachPromptHistory(input);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          document.getElementById('chat-composer').dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
      input.addEventListener('input', () => autosize(input));
    }

    const form = document.getElementById('chat-composer');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = (input.value || '').trim();
        if (!text) return;
        pushPromptHistory(text);
        const mode = document.getElementById('chat-mode').value;
        const auto = document.getElementById('chat-auto').checked;
        input.disabled = true;
        try {
          await api(`/api/chat/sessions/${chatState.sessionId}/turns`, {
            method: 'POST',
            body: { input: text, mode, autoApprove: auto, projectPath: currentProject },
          });
          input.value = '';
        } catch (err) {
          toast('send failed: ' + err.message, 'err');
        }
        await renderConversation();
        await refreshList();
        startPolling();
      });
    }

    document.getElementById('chat-delete')?.addEventListener('click', async () => {
      if (!confirm('Delete this conversation? This cannot be undone.')) return;
      await api(`/api/chat/sessions/${chatState.sessionId}?projectPath=${projectPath}`, { method: 'DELETE' });
      chatState.sessionId = null;
      closeChatWs();
      await refreshList();
      await renderConversation();
    });
  };

  const turnHtml = (t) => {
    const r = t.result || {};
    const status = t.status || 'pending';
    const badge = status === 'done' ? 'chip-ok' : status === 'failed' ? 'chip-err' : status === 'running' ? 'chip-warn' : 'chip-neutral';
    const cost = r.costUsd ? `$${r.costUsd.toFixed(4)}` : '';
    const dur = r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '';
    const files = (r.filesChanged || []).slice(0, 8);
    let body;
    if (status === 'running' || status === 'pending') {
      body = `<div class="chat-thinking">Planning and executing…</div>`;
    } else if (status === 'failed' || status === 'cancelled') {
      body = `
        <div class="chat-failure">
          <div class="chat-failure-title">${status === 'cancelled' ? 'Cancelled' : 'Failed'}</div>
          <div class="chat-failure-body">${esc(r.summary || '(no error text recorded)')}</div>
          <button class="chat-retry" data-input="${esc(t.input)}">${icon('refresh')}<span>Retry</span></button>
        </div>`;
    } else {
      body = `<div class="chat-summary">${esc(r.summary || '(no summary)')}</div>`;
    }
    return `
      <div class="chat-turn" data-turn="${esc(t.id)}">
        <div class="chat-msg chat-msg-user">
          <div class="chat-avatar">${icon('user')}</div>
          <div class="chat-bubble">${esc(t.input)}</div>
        </div>
        <div class="chat-msg chat-msg-agent">
          <div class="chat-avatar agent">${icon('robot')}</div>
          <div class="chat-bubble">
            <div class="chat-bubble-head">
              <span class="chip ${badge}">${esc(status)}</span>
              ${dur ? `<span class="chat-meta">${dur}</span>` : ''}
              ${cost ? `<span class="chat-meta">${cost}</span>` : ''}
              <span class="chat-meta">${esc(t.mode)}</span>
            </div>
            ${body}
            ${files.length ? `
              <div class="chat-files">
                ${files.map((f) => `<span class="chat-file">${esc(f)}</span>`).join('')}
                ${(r.filesChanged || []).length > 8 ? `<span class="chat-file-more">+${(r.filesChanged || []).length - 8} more</span>` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  };

  const autosize = (el) => {
    el.style.height = 'auto';
    el.style.height = Math.min(240, el.scrollHeight) + 'px';
  };

  const startPolling = () => {
    stopPolling();
    if (!chatState.sessionId) return;
    chatState.poll = setInterval(async () => {
      if (currentView !== 'chat') { stopPolling(); return; }
      const sess = await api(`/api/chat/sessions/${chatState.sessionId}?projectPath=${projectPath}`).catch(() => null);
      if (!sess) return;
      const running = sess.turns.some((t) => t.status === 'running' || t.status === 'pending');
      if (!running) {
        stopPolling();
        await renderConversation();
        await refreshList();
      } else {
        await renderConversation();
      }
    }, 1500);
  };

  const stopPolling = () => {
    if (chatState.poll) { clearInterval(chatState.poll); chatState.poll = null; }
  };

  // wire buttons
  document.getElementById('chat-new')?.addEventListener('click', newSession);
  document.getElementById('chat-empty-new')?.addEventListener('click', newSession);

  await refreshList();
  // auto-open the most recent session, if any
  const sessions = await api(`/api/chat/sessions?projectPath=${projectPath}`).catch(() => []);
  if (sessions.length) {
    await openSession(sessions[0].id);
  }
};

// helpers for chat
const timeago = (iso) => {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60000) return 'just now';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
    if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago';
    return Math.floor(ms / 86400000) + 'd ago';
  } catch { return ''; }
};

// ---------- Run (full form) ----------

views.run = async () => {
  const status = await api('/api/status').catch(() => ({ defaultMode: 'balanced', cwd: '' }));
  app.innerHTML = page(`
    ${pageHeader('New task', 'Describe what Forge should do, then launch.')}
    <section class="section"><div class="section-body"><div class="section-body-padded">
      <div class="form-row"><label>Prompt</label>
        <textarea id="run-prompt" placeholder="e.g. add a /health endpoint to the Express server"></textarea>
      </div>
      <div class="form-row"><label>Mode</label>
        <select id="run-mode">
          ${['fast','balanced','heavy','plan','audit','debug','architect','offline-safe']
            .map((m) => `<option value="${m}" ${m === status.defaultMode ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="form-row"><label>Project path</label>
        <input type="text" id="run-cwd" value="${esc(status.cwd ?? '')}" placeholder="/absolute/path (blank = current)">
      </div>
      <div class="form-row"><label>Permissions</label>
        <div class="grid-checkboxes">
          ${[
            ['autoApprove','Auto-approve plan'],
            ['skipRoutine','Skip routine prompts'],
            ['allowFiles','Allow file writes'],
            ['allowShell','Allow shell'],
            ['allowNetwork','Allow network'],
            ['allowWeb','Allow web tools'],
            ['allowMcp','Allow MCP'],
            ['strict','Strict (confirm each)'],
          ].map(([k, l]) => `<label class="checkbox-row"><input type="checkbox" data-flag="${k}"><span>${l}</span></label>`).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" id="run-go">Launch task</button>
        <button class="btn btn-ghost" id="run-reset">Reset</button>
      </div>
    </div></div></section>
  `);

  const go = async () => {
    const prompt = document.getElementById('run-prompt').value.trim();
    if (!prompt) return toast('prompt required', 'warn');
    pushPromptHistory(prompt);
    const mode = document.getElementById('run-mode').value;
    const cwd = document.getElementById('run-cwd').value.trim() || undefined;
    const flags = {};
    let autoApprove = false;
    app.querySelectorAll('[data-flag]').forEach((i) => {
      if (i.checked) {
        if (i.dataset.flag === 'autoApprove') autoApprove = true;
        else flags[i.dataset.flag] = true;
      }
    });
    try {
      const { taskId } = await apiPost('/api/tasks/run', { prompt, mode, cwd, autoApprove, flags });
      toast('Task started', 'ok');
      openTask(taskId);
    } catch (e) { toast(String(e), 'err'); }
  };

  document.getElementById('run-go').addEventListener('click', go);
  attachPromptHistory(document.getElementById('run-prompt'));
  document.getElementById('run-prompt').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') go();
  });
  document.getElementById('run-reset').addEventListener('click', () => setView('run'));
  document.getElementById('run-prompt').focus();
};

// ---------- Task detail ----------

const openTask = (taskId) => {
  currentView = 'task';
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
  app.innerHTML = page(`
    ${pageHeader('Task · ' + taskId, 'Live stream from the interactive host.', `
      <button class="btn btn-ghost" data-action="back">← Active</button>
      <button class="btn btn-danger" data-action="cancel">Cancel</button>
    `)}
    <section class="section" id="task-plan" hidden></section>
    <section class="section">
      <div class="section-head">
        <h2>Stream</h2>
        <span class="section-meta" id="task-meta">connecting…</span>
      </div>
      <div class="section-body"><div style="padding:14px 18px">
        <div id="task-stream" class="log-stream"></div>
      </div></div>
    </section>
  `);

  const stream = document.getElementById('task-stream');
  const planSec = document.getElementById('task-plan');
  let currentPlanPromptId = null;

  const push = (line) => {
    const el = document.createElement('div');
    el.className = line.cls;
    el.innerHTML = line.html;
    stream.insertBefore(el, stream.firstChild);
    while (stream.childElementCount > 300) stream.lastChild?.remove();
  };

  const renderPlan = (plan) => {
    const steps = (plan.steps || []).map((s, i) => `
      <div class="plan-step">
        <div class="plan-step-num">${i + 1}</div>
        <div class="plan-step-body">
          <div class="plan-step-head">
            <span class="plan-step-type">${esc(s.type)}</span>
            ${s.risk ? `<span class="badge badge-${s.risk === 'critical' ? 'failed' : 'awaiting'}">${esc(s.risk)}</span>` : ''}
            ${s.id ? `<code>${esc(s.id)}</code>` : ''}
          </div>
          <div class="plan-step-desc">${esc(s.description)}</div>
          ${s.target ? `<div class="plan-step-meta"><span>target · <code>${esc(s.target)}</code></span></div>` : ''}
        </div>
      </div>`).join('');
    planSec.hidden = false;
    planSec.innerHTML = `
      <div class="section-head">
        <h2>Proposed plan</h2>
        <span class="section-meta">${(plan.steps || []).length} steps · ${esc((plan.goal || '').slice(0, 80))}</span>
      </div>
      <div class="section-body">
        <div class="plan-viewer">${steps}</div>
        <div style="padding:12px 18px;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--border)">
          <button class="btn btn-ghost" data-plan-action="cancel">Reject</button>
          <button class="btn btn-primary" data-plan-action="approve">Approve & run</button>
        </div>
      </div>`;
    planSec.querySelectorAll('[data-plan-action]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!currentPlanPromptId) return;
        await apiPost('/api/prompts/respond', { promptId: currentPlanPromptId, value: b.dataset.planAction });
        planSec.hidden = true;
        planSec.innerHTML = '';
        currentPlanPromptId = null;
      }),
    );
  };

  app.querySelector('[data-action="back"]').addEventListener('click', () => setView('active'));
  app.querySelector('[data-action="cancel"]').addEventListener('click', async () => {
    try { await apiPost(`/api/tasks/${taskId}/cancel`); toast('cancel requested', 'warn'); }
    catch (e) { toast(String(e), 'err'); }
  });

  if (taskConnections.has(taskId)) { try { taskConnections.get(taskId).close(); } catch {} }
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/tasks/${taskId}`;
  const ws = new WebSocket(url);
  taskConnections.set(taskId, ws);

  const meta = document.getElementById('task-meta');
  ws.onopen = () => { meta.textContent = 'live'; };
  ws.onclose = () => { meta.textContent = 'disconnected'; };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.kind === 'event') {
      const ev = msg.event;
      push({
        cls: `log-line ${ev.severity ?? 'info'}`,
        html: `<time>${esc(fmtDate(ev.timestamp))}</time><span class="log-type">${esc(ev.type)}</span> · ${esc(ev.message)}`,
      });
    } else if (msg.kind === 'prompt') {
      if (msg.promptType === 'plan_approval') {
        currentPlanPromptId = msg.promptId;
        renderPlan(msg.plan);
      } else if (msg.promptType === 'permission') {
        openPermissionModal(msg);
      } else if (msg.promptType === 'user_input') {
        openUserInputModal(msg);
      }
    } else if (msg.kind === 'task.started') {
      push({ cls: 'log-line', html: `<span class="log-type">STARTED</span> · ${esc(msg.prompt.slice(0, 120))}` });
    } else if (msg.kind === 'task.result') {
      const ok = msg.result?.success;
      push({ cls: `log-line ${ok ? '' : 'error'}`, html: `<span class="log-type">${ok ? 'DONE' : 'FAILED'}</span> · ${esc(msg.result?.summary ?? '')}` });
      toast(ok ? 'Task complete' : 'Task failed', ok ? 'ok' : 'err');
    } else if (msg.kind === 'task.error') {
      push({ cls: 'log-line error', html: `<span class="log-type">ERROR</span> · ${esc(msg.error)}` });
    } else if (msg.kind === 'task.cancel_requested') {
      push({ cls: 'log-line warning', html: `<span class="log-type">CANCEL</span> · requested` });
    }
  };
};

// ---------- Active / tasks ----------

views.active = async () => {
  app.innerHTML = page(`${pageHeader('Active tasks', 'Running or awaiting approval.')}
    <div id="active-body">${skeletonRows(3)}</div>`);
  const render = async () => {
    const { active } = await api('/api/tasks/active');
    updateActiveBadge(active);
    const body = document.getElementById('active-body');
    body.innerHTML = active.length
      ? sectionShell('', `${active.length} total`, active.map((t) => `
          <div class="row">
            ${badge(t.status)}
            <div class="row-main">
              <div class="title">${esc(t.prompt.slice(0, 160))}</div>
              <div class="sub">
                <code>${esc(t.taskId)}</code>
                <span>${esc(t.mode)}</span>
                <span>started ${esc(fmtDate(new Date(t.startedAt).toISOString()))}</span>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" data-open="${esc(t.taskId)}">Open</button>
            <button class="btn btn-danger btn-sm" data-cancel="${esc(t.taskId)}">Cancel</button>
          </div>`).join(''))
      : `<div class="empty"><div class="empty-title">Nothing running</div><div>Start something from <strong>New task</strong> or press <kbd>⌘ K</kbd>.</div></div>`;
    body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openTask(b.dataset.open)));
    body.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
      await apiPost(`/api/tasks/${b.dataset.cancel}/cancel`);
      toast('cancel requested', 'warn');
      render();
    }));
  };
  render();
};

views.tasks = async () => {
  app.innerHTML = page(`${pageHeader('Tasks', 'Full history, searchable.')}
    <div class="section"><div class="section-body-padded">
      <input type="search" id="q" placeholder="Search by title or intent…" autocomplete="off" />
    </div></div>
    <div id="tasks-body">${skeletonRows(4)}</div>`);
  const body = document.getElementById('tasks-body');
  const render = async (q) => {
    body.innerHTML = skeletonRows(3);
    const params = new URLSearchParams({ limit: '100' });
    if (q) params.set('q', q);
    const rows = await api(`/api/tasks?${params}`);
    body.innerHTML = rows.length
      ? `<section class="section"><div class="section-body"><div class="table-wrap"><table class="table sortable" data-default-sort="6" data-default-dir="desc">
          <thead><tr>
            <th data-sort="text">id</th>
            <th data-sort="text">status</th>
            <th data-sort="text">mode</th>
            <th data-sort="text">intent</th>
            <th data-sort="text">risk</th>
            <th data-sort="text" class="col-wrap">title</th>
            <th data-sort="date">updated</th>
          </tr></thead>
          <tbody>${rows.map((t) => `<tr>
            <td><code>${esc(t.id)}</code></td>
            <td>${badge(t.status)}</td>
            <td>${esc(t.mode)}</td>
            <td>${esc(t.intent ?? '—')}</td>
            <td>${esc(t.risk ?? '—')}</td>
            <td class="col-wrap">${esc((t.title ?? '').slice(0, 100) || '—')}</td>
            <td data-raw="${esc(t.updated_at ?? '')}">${esc(fmtDate(t.updated_at))}</td>
          </tr>`).join('')}</tbody>
        </table></div></div></section>`
      : `<div class="empty"><div class="empty-title">No matching tasks</div></div>`;
  };
  const input = document.getElementById('q');
  let h;
  input.addEventListener('input', () => {
    clearTimeout(h);
    h = setTimeout(() => render(input.value.trim()), 200);
  });
  input.focus();
  render('');
};

// ---------- Models / MCP / Skills / Web / Memory / Learning / Cost / Doctor ----------
// (unchanged from the previous pass, just wrapped in page())

views.models = async () => {
  app.innerHTML = page(`${pageHeader('Models', 'Registered providers and catalogs.')}
    <div id="models-body">${skeletonRows(3)}</div>`);
  const data = await api('/api/models');
  document.getElementById('models-body').innerHTML = data.map((p) => `
    <section class="section">
      <div class="section-head">
        <h2>${esc(p.provider)}</h2>
        <span class="pill ${p.available ? 'ok' : 'down'}"><span class="dot"></span>${p.available ? 'available' : 'unavailable'}</span>
      </div>
      <div class="section-body">
        ${p.models.length ? `<div class="table-wrap"><table class="table sortable">
            <thead><tr>
              <th data-sort="text">model</th>
              <th data-sort="text">class</th>
              <th data-sort="number">context</th>
              <th data-sort="text" class="col-wrap">roles</th>
            </tr></thead>
            <tbody>${p.models.map((m) => `<tr>
              <td><code>${esc(m.id)}</code></td>
              <td>${esc(m.class)}</td>
              <td data-raw="${esc(m.contextTokens)}">${esc(m.contextTokens)}</td>
              <td class="col-wrap">${esc((m.roles ?? []).join(', '))}</td>
            </tr>`).join('')}</tbody>
          </table></div>` : '<div class="empty">no models</div>'}
      </div>
    </section>`).join('');
};

views.mcp = async () => {
  app.innerHTML = page(`${pageHeader('MCP connections', 'Stdio & HTTP Model Context Protocol servers.')}
    <div id="mcp-body">${skeletonRows(3)}</div>`);
  const render = async () => {
    const rows = await api('/api/mcp');
    const body = document.getElementById('mcp-body');
    const form = `<section class="section"><div class="section-head"><h2>Add connection</h2></div>
      <div class="section-body"><div class="section-body-padded">
        <div class="form-row"><label>Name</label><input type="text" id="mcp-name" placeholder="github" /></div>
        <div class="form-row"><label>Transport</label>
          <select id="mcp-transport"><option value="stdio">stdio</option><option value="http_stream">http_stream</option></select>
        </div>
        <div class="form-row"><label>Command (stdio)</label><input type="text" id="mcp-command" placeholder="/usr/local/bin/mcp-server" /></div>
        <div class="form-row"><label>Args</label><input type="text" id="mcp-args" placeholder="space-separated" /></div>
        <div class="form-row"><label>Endpoint (http_stream)</label><input type="url" id="mcp-endpoint" placeholder="https://…/mcp" /></div>
        <div class="form-row"><label>Auth</label>
          <select id="mcp-auth"><option value="none">none</option><option value="api_key">api_key</option><option value="oauth">oauth</option><option value="basic">basic</option></select>
        </div>
        <button class="btn btn-primary" id="mcp-add">Add</button>
      </div></div></section>`;
    const list = rows.length
      ? sectionShell('Connections', `${rows.length} total`, rows.map((c) => `
          <div class="row">
            <div class="row-main">
              <div class="title">${esc(c.name)} <code>${esc(c.id)}</code></div>
              <div class="sub">
                <span>${esc(c.transport)}</span>
                <code>${esc(c.endpoint || c.command || '')}</code>
                <span>auth: ${esc(c.auth)}</span>
              </div>
            </div>
            ${badge(c.status === 'connected' ? 'completed' : 'cancelled')}
            <button class="btn btn-danger btn-sm" data-del="${esc(c.id)}">Remove</button>
          </div>`).join(''))
      : '';
    body.innerHTML = form + list;
    document.getElementById('mcp-add').addEventListener('click', async () => {
      const name = document.getElementById('mcp-name').value.trim();
      if (!name) return toast('name required', 'warn');
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const transport = document.getElementById('mcp-transport').value;
      const endpoint = document.getElementById('mcp-endpoint').value || undefined;
      const command = document.getElementById('mcp-command').value || undefined;
      const argsRaw = document.getElementById('mcp-args').value.trim();
      const args = argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : undefined;
      const auth = document.getElementById('mcp-auth').value;
      try {
        await apiPost('/api/mcp', { id, name, transport, endpoint, command, args, auth, status: 'disconnected' });
        toast('added', 'ok');
        render();
      } catch (e) { toast(String(e), 'err'); }
    });
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      await api(`/api/mcp/${b.dataset.del}`, { method: 'DELETE' });
      render();
    }));
  };
  render();
};

views.skills = async () => {
  app.innerHTML = page(`${pageHeader('Skills', 'Markdown skills loaded from ~/.forge/skills and .forge/skills.')}
    <div id="skills-body">${skeletonRows(3)}</div>`);
  const installed = await api('/api/skills');
  const body = document.getElementById('skills-body');
  const installedSection = installed.length
    ? sectionShell('Installed', `${installed.length}`, installed.map((s) => `
        <div class="row">
          <div class="row-main">
            <div class="title">${esc(s.name)}</div>
            <div class="sub">
              ${s.tags.length ? `<span>${esc(s.tags.join(', '))}</span>` : ''}
              <span>${esc(s.description || '(no description)')}</span>
            </div>
          </div>
        </div>`).join(''))
    : `<div class="empty"><div class="empty-title">No skills installed</div><div>Drop a Markdown file into ~/.forge/skills/ or search the registry below.</div></div>`;
  body.innerHTML = installedSection + `
    <section class="section">
      <div class="section-head"><h2>Install from registry</h2></div>
      <div class="section-body"><div class="section-body-padded">
        <div class="form-row"><input type="search" id="skill-search" placeholder="e.g. react, test, refactor" /></div>
        <div id="skill-results"></div>
      </div></div>
    </section>`;
  const searchInput = document.getElementById('skill-search');
  const resultsEl = document.getElementById('skill-results');
  let h;
  searchInput.addEventListener('input', () => {
    clearTimeout(h);
    h = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (!q) { resultsEl.innerHTML = ''; return; }
      resultsEl.innerHTML = skeletonRows(2);
      try {
        const hits = await api(`/api/skills/search?q=${encodeURIComponent(q)}`);
        resultsEl.innerHTML = hits.length
          ? hits.map((hit) => `
              <div class="row">
                <div class="row-main">
                  <div class="title">${esc(hit.name)}</div>
                  <div class="sub"><span>${esc(hit.description)}</span><code>${esc(hit.url)}</code></div>
                </div>
                <button class="btn btn-primary btn-sm" data-install='${esc(JSON.stringify(hit))}'>Install</button>
              </div>`).join('')
          : '<div class="empty">No matches.</div>';
        resultsEl.querySelectorAll('[data-install]').forEach((b) => b.addEventListener('click', async () => {
          const { name, url } = JSON.parse(b.getAttribute('data-install'));
          try {
            await apiPost('/api/skills/install', { name, url });
            toast(`installed ${name}`, 'ok');
            views.skills();
          } catch (e) { toast(String(e), 'err'); }
        }));
      } catch (e) { toast(String(e), 'err'); }
    }, 250);
  });
};

views.memory = async () => {
  app.innerHTML = page(`${pageHeader('Cold memory', 'Project FTS5 index — the planner retrieves context from here.')}
    <section class="section"><div class="section-body"><div class="section-body-padded">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn btn-primary" id="mem-index">Re-index project</button>
      </div>
      <div class="form-row"><label>Search</label><input type="search" id="mem-q" placeholder="try: 'scheduler' or 'permission'" /></div>
      <div id="mem-results"></div>
    </div></div></section>`);
  document.getElementById('mem-index').addEventListener('click', async () => {
    try {
      const stats = await apiPost('/api/memory/index', {});
      toast(`indexed ${stats.scanned} files (${stats.durationMs}ms)`, 'ok');
    } catch (e) { toast(String(e), 'err'); }
  });
  const qEl = document.getElementById('mem-q');
  const resEl = document.getElementById('mem-results');
  let h;
  qEl.addEventListener('input', () => {
    clearTimeout(h);
    h = setTimeout(async () => {
      const q = qEl.value.trim();
      if (!q) { resEl.innerHTML = ''; return; }
      resEl.innerHTML = skeletonRows(2);
      try {
        const hits = await api(`/api/memory/search?q=${encodeURIComponent(q)}`);
        resEl.innerHTML = hits.length
          ? `<div class="table-wrap"><table class="table sortable" data-default-sort="1" data-default-dir="desc">
              <thead><tr>
                <th data-sort="text" class="col-wrap">path</th>
                <th data-sort="number">score</th>
                <th data-sort="text" class="col-wrap">snippet</th>
              </tr></thead>
              <tbody>${hits.map((r) => `<tr>
                <td class="col-wrap"><code>${esc(r.path)}</code></td>
                <td data-raw="${Number(r.score)}">${Number(r.score).toFixed(2)}</td>
                <td class="col-wrap">${esc(r.snippet.replace(/\s+/g, ' ').slice(0, 180))}</td>
              </tr>`).join('')}</tbody>
            </table></div>`
          : '<div class="empty">No matches.</div>';
      } catch (e) { resEl.innerHTML = `<div class="empty">${esc(String(e))}</div>`; }
    }, 200);
  });
};

views.web = async () => {
  app.innerHTML = page(`${pageHeader('Web tools', 'Search and fetch. SSRF-guarded and injection-filtered.')}
    <section class="section"><div class="section-head"><h2>Search</h2></div><div class="section-body"><div class="section-body-padded">
      <div class="form-row"><input type="search" id="web-q" placeholder="search the web…" /></div>
      <div id="web-results"></div>
    </div></div></section>
    <section class="section"><div class="section-head"><h2>Fetch</h2></div><div class="section-body"><div class="section-body-padded">
      <div class="form-row"><input type="url" id="web-url" placeholder="https://…" /></div>
      <button class="btn btn-primary" id="web-fetch">Fetch</button>
      <div id="web-page" style="margin-top:14px"></div>
    </div></div></section>`);
  const qEl = document.getElementById('web-q');
  const resEl = document.getElementById('web-results');
  let h;
  qEl.addEventListener('input', () => {
    clearTimeout(h);
    h = setTimeout(async () => {
      const q = qEl.value.trim();
      if (!q) { resEl.innerHTML = ''; return; }
      resEl.innerHTML = skeletonRows(3);
      try {
        const hits = await api(`/api/web/search?q=${encodeURIComponent(q)}`);
        resEl.innerHTML = hits.length
          ? hits.map((r) => `
              <div class="row">
                <div class="row-main">
                  <div class="title">${esc(r.title)}</div>
                  <div class="sub"><span>${esc(r.snippet.slice(0, 220))}</span></div>
                  <div class="sub"><a href="${esc(r.url)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(r.url)}</a></div>
                </div>
              </div>`).join('')
          : '<div class="empty">No results.</div>';
      } catch (e) { resEl.innerHTML = `<div class="empty">${esc(String(e))}</div>`; }
    }, 300);
  });
  document.getElementById('web-fetch').addEventListener('click', async () => {
    const url = document.getElementById('web-url').value.trim();
    if (!url) return;
    const pageEl = document.getElementById('web-page');
    pageEl.innerHTML = skeletonRows(3);
    try {
      const r = await apiPost('/api/web/fetch', { url });
      pageEl.innerHTML = `
        <div style="color:var(--muted);font-size:12px;margin-bottom:10px">
          ${esc(r.status)} · ${esc(r.contentType)} · ${r.bytesReceived}B
          ${r.flaggedInjection ? ' · <span class="pill warn"><span class="dot"></span>injection filtered</span>' : ''}
        </div>
        <h3 style="margin:0 0 8px 0;font-size:14px">${esc(r.title ?? '(no title)')}</h3>
        <pre class="json-view" style="white-space:pre-wrap">${esc(r.text.slice(0, 6000))}</pre>`;
    } catch (e) { pageEl.innerHTML = `<div class="empty">${esc(String(e))}</div>`; }
  });
};

views.learning = async () => {
  app.innerHTML = page(`${pageHeader('Learning memory', 'Patterns Forge has reinforced from past tasks.')}
    <div id="learn-body">${skeletonRows(3)}</div>`);
  const rows = await api('/api/learning');
  document.getElementById('learn-body').innerHTML = rows.length
    ? `<section class="section"><div class="section-body"><div class="table-wrap"><table class="table sortable" data-default-sort="3" data-default-dir="desc">
        <thead><tr>
          <th data-sort="text" class="col-wrap">pattern</th>
          <th data-sort="text" class="col-wrap">context</th>
          <th data-sort="text" class="col-wrap">fix</th>
          <th data-sort="number">confidence</th>
          <th data-sort="number">✓</th>
          <th data-sort="number">✗</th>
          <th data-sort="date">updated</th>
        </tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td class="col-wrap">${esc(r.pattern)}</td>
          <td class="col-wrap">${esc(r.context ?? '')}</td>
          <td class="col-wrap">${esc(r.fix ?? '')}</td>
          <td data-raw="${Number(r.confidence)}"><span class="pill ${r.confidence > 0.6 ? 'ok' : 'warn'}"><span class="dot"></span>${Number(r.confidence).toFixed(2)}</span></td>
          <td>${r.success_count}</td>
          <td>${r.failure_count}</td>
          <td data-raw="${esc(r.updated_at ?? '')}">${esc(fmtDate(r.updated_at))}</td>
        </tr>`).join('')}</tbody>
      </table></div></div></section>`
    : `<div class="empty"><div class="empty-title">No patterns yet</div><div>Forge learns as you run tasks.</div></div>`;
};

views.cost = async () => {
  app.innerHTML = page(`${pageHeader('Cost', 'USD and token usage per model call.')}
    <div id="cost-body">${skeletonRows(3)}</div>`);
  const data = await api('/api/cost');
  const t = data.totals;
  const rows = data.recent || [];
  document.getElementById('cost-body').innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">Calls</div><div class="value">${esc(t.calls)}</div><div class="sub">all providers</div></div>
      <div class="stat"><div class="label">Tokens</div><div class="value">${Number(t.tokens).toLocaleString()}</div><div class="sub">input + output</div></div>
      <div class="stat"><div class="label">Spend</div><div class="value">$${Number(t.usd).toFixed(4)}</div><div class="sub">estimated USD</div></div>
    </div>
    <section class="section"><div class="section-head"><h2>Recent calls</h2></div>
      <div class="section-body">${rows.length
        ? `<div class="table-wrap"><table class="table sortable" data-default-sort="6" data-default-dir="desc">
            <thead><tr>
              <th data-sort="text">provider</th>
              <th data-sort="text" class="col-wrap">model</th>
              <th data-sort="number">in</th>
              <th data-sort="number">out</th>
              <th data-sort="number">ms</th>
              <th data-sort="number">usd</th>
              <th data-sort="date">when</th>
            </tr></thead>
            <tbody>${rows.map((r) => `<tr>
              <td>${esc(r.provider)}</td>
              <td class="col-wrap"><code>${esc(r.model)}</code></td>
              <td>${r.input_tokens}</td>
              <td>${r.output_tokens}</td>
              <td>${r.duration_ms}</td>
              <td data-raw="${Number(r.cost_usd)}">$${Number(r.cost_usd).toFixed(4)}</td>
              <td data-raw="${esc(r.created_at ?? '')}">${esc(fmtDate(r.created_at))}</td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="empty">No model calls yet.</div>'}</div></section>`;
};

// ---------- Config (Monaco editor) ----------

let monacoLoading = null;
const loadMonaco = () => {
  if (window.monaco) return Promise.resolve(window.monaco);
  if (monacoLoading) return monacoLoading;
  monacoLoading = new Promise((resolve, reject) => {
    const loader = document.createElement('script');
    loader.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
    loader.onerror = () => reject(new Error('monaco loader failed'));
    loader.onload = () => {
      try {
        window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
        window.require(['vs/editor/editor.main'], () => {
          window.monaco.editor.defineTheme('forge-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
              'editor.background': '#0f161d',
              'editor.foreground': '#e7eaee',
              'editor.lineHighlightBackground': '#13171c',
              'editorLineNumber.foreground': '#4b5460',
              'editorLineNumber.activeForeground': '#7d8692',
              'editorCursor.foreground': '#14b8a6',
              'editor.selectionBackground': '#14b8a632',
              'editorIndentGuide.background': '#1d232a',
              'editorIndentGuide.activeBackground': '#27333f',
            },
          });
          resolve(window.monaco);
        });
      } catch (e) { reject(e); }
    };
    document.head.appendChild(loader);
  });
  return monacoLoading;
};

views.config = async () => {
  const cfg = await api('/api/config');
  app.innerHTML = page(`${pageHeader('Config', 'Global ~/.forge/config.json — edit inline or via key-path.', `
    <button class="btn btn-ghost" id="cfg-reload">Reload</button>
    <button class="btn btn-primary" id="cfg-save-all">Save editor</button>
  `)}
    <section class="section">
      <div class="section-head">
        <h2>Editor</h2>
        <span class="section-meta" id="cfg-editor-status">loading editor…</span>
      </div>
      <div class="section-body"><div class="section-body-padded">
        <div id="cfg-editor" class="monaco-host"></div>
      </div></div>
    </section>
    <section class="section"><div class="section-head"><h2>Update a single key</h2></div>
      <div class="section-body"><div class="section-body-padded">
        <div class="form-row"><label>Key (dot-path)</label><input type="text" id="cfg-key" placeholder="update.channel" /></div>
        <div class="form-row"><label>Value (JSON)</label><input type="text" id="cfg-val" placeholder='"beta" · true · 30' /></div>
        <button class="btn btn-secondary" id="cfg-save-key">Save key</button>
      </div></div></section>`);

  const statusEl = document.getElementById('cfg-editor-status');
  const editorHost = document.getElementById('cfg-editor');
  let editor = null;
  let currentRaw = JSON.stringify(cfg, null, 2);

  // Load Monaco. Fall back to a styled textarea if CDN fails.
  try {
    const monaco = await loadMonaco();
    editor = monaco.editor.create(editorHost, {
      value: currentRaw,
      language: 'json',
      theme: 'forge-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 13,
      tabSize: 2,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      smoothScrolling: true,
    });
    statusEl.textContent = 'Monaco · ⌘S to save';
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveEditor());
  } catch (err) {
    statusEl.textContent = 'textarea fallback (Monaco CDN unreachable)';
    editorHost.innerHTML = `<textarea id="cfg-fallback" style="width:100%;height:100%;min-height:520px;background:#0f161d;color:#e7eaee;border:none;padding:14px;font-family:'JetBrains Mono',monospace;font-size:13px"></textarea>`;
    const t = document.getElementById('cfg-fallback');
    t.value = currentRaw;
    editor = {
      getValue: () => t.value,
      setValue: (v) => { t.value = v; },
    };
  }

  const saveEditor = async () => {
    const raw = editor.getValue();
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { toast(`invalid JSON: ${e.message}`, 'err'); return; }
    try {
      // Backend supports per-key PATCH; emulate a full replace by sending every top-level key.
      for (const [key, value] of Object.entries(parsed)) {
        await apiPost('/api/config', { key, value });
      }
      toast('Config saved', 'ok');
      const refreshed = await api('/api/config');
      currentRaw = JSON.stringify(refreshed, null, 2);
      editor.setValue(currentRaw);
    } catch (e) { toast(String(e), 'err'); }
  };

  document.getElementById('cfg-save-all').addEventListener('click', saveEditor);
  document.getElementById('cfg-reload').addEventListener('click', async () => {
    const refreshed = await api('/api/config');
    currentRaw = JSON.stringify(refreshed, null, 2);
    editor.setValue(currentRaw);
    toast('Reloaded', 'ok');
  });
  document.getElementById('cfg-save-key').addEventListener('click', async () => {
    const key = document.getElementById('cfg-key').value.trim();
    const rawVal = document.getElementById('cfg-val').value.trim();
    if (!key) return;
    let value;
    try { value = JSON.parse(rawVal); } catch { value = rawVal; }
    try {
      await apiPost('/api/config', { key, value });
      toast('saved', 'ok');
      const refreshed = await api('/api/config');
      currentRaw = JSON.stringify(refreshed, null, 2);
      editor.setValue(currentRaw);
    } catch (e) { toast(String(e), 'err'); }
  });
};

views.doctor = async () => {
  app.innerHTML = page(`${pageHeader('Doctor', 'Health diagnostics.')}
    <div id="doc-body">${skeletonRows(3)}</div>`);
  const checks = await api('/api/doctor');
  document.getElementById('doc-body').innerHTML = sectionShell('', `${checks.length} checks`, checks.map((c) => `
    <div class="row">
      <span class="pill ${c.ok ? 'ok' : 'down'}"><span class="dot"></span>${c.ok ? 'ok' : 'fail'}</span>
      <div class="row-main">
        <div class="title">${esc(c.name)}</div>
        <div class="sub"><code>${esc(c.detail)}</code></div>
      </div>
    </div>`).join(''));
};

// ---------- Overlays ----------

const mountOverlay = (innerHTML, { closeOnClickOutside = true, onClose, onKey } = {}) => {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = innerHTML;
  overlayHost.appendChild(overlay);
  const close = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKeyInternal);
    onClose?.();
  };
  if (closeOnClickOutside) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const onKeyInternal = (e) => {
    if (e.key === 'Escape') { close(); return; }
    onKey?.(e);
  };
  window.addEventListener('keydown', onKeyInternal);
  return { overlay, close };
};

const openPermissionModal = (msg) => {
  const { overlay, close } = mountOverlay(`
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">Permission required</div>
        <button class="modal-close" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <div class="modal-body">
        <div style="font-size:13px;color:var(--fg-2);margin-bottom:14px">${esc(msg.request.action)}</div>
        <div style="display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;font-size:12px">
          <span style="color:var(--muted)">tool</span><code>${esc(msg.request.tool)}</code>
          <span style="color:var(--muted)">risk</span>${badge(msg.request.risk === 'critical' ? 'failed' : 'awaiting')}
          <span style="color:var(--muted)">side-effect</span><span>${esc(msg.request.sideEffect)}</span>
          ${msg.request.target ? `<span style="color:var(--muted)">target</span><code>${esc(msg.request.target)}</code>` : ''}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-perm="deny">Deny</button>
        <button class="btn btn-secondary" data-perm="allow">Allow once</button>
        <button class="btn btn-primary" data-perm="allow_session">Allow for session</button>
      </div>
    </div>`, { closeOnClickOutside: false });
  overlay.querySelectorAll('[data-perm]').forEach((b) => b.addEventListener('click', async () => {
    await apiPost('/api/prompts/respond', { promptId: msg.promptId, value: b.dataset.perm });
    close();
  }));
};

const openUserInputModal = (msg) => {
  const { overlay, close } = mountOverlay(`
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">Forge needs input</div>
        <button class="modal-close" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:12px;color:var(--fg-2)">${esc(msg.question)}</div>
        ${msg.choices?.length
          ? `<div style="display:flex;flex-direction:column;gap:6px">${msg.choices.map((c) => `<button class="btn btn-secondary" data-choice="${esc(c)}">${esc(c)}</button>`).join('')}</div>`
          : `<input type="text" id="ui-input" value="${esc(msg.defaultValue ?? '')}" />`}
      </div>
      ${msg.choices?.length ? '' : `<div class="modal-foot">
        <button class="btn btn-ghost" data-ui="">Skip</button>
        <button class="btn btn-primary" data-ui="__submit__">Submit</button>
      </div>`}
    </div>`);
  const send = async (v) => {
    await apiPost('/api/prompts/respond', { promptId: msg.promptId, value: v });
    close();
  };
  overlay.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => send(b.dataset.choice)));
  overlay.querySelectorAll('[data-ui]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.ui === '__submit__' ? overlay.querySelector('#ui-input').value : '';
    send(v);
  }));
};

// ---------- Command palette ----------
//
// Navigation + quick actions + fallback "Run task: <text>".
// Arrow keys pick items, Enter executes, Esc dismisses.

const buildCommands = () => [
  { group: 'go',      id: 'nav.dashboard', label: 'Go to Dashboard',        keywords: 'home overview',     icon: 'home',    run: () => setView('dashboard') },
  { group: 'go',      id: 'nav.tasks',     label: 'Go to Tasks',            keywords: 'history list',      icon: 'list',    run: () => setView('tasks') },
  { group: 'go',      id: 'nav.active',    label: 'Go to Active',           keywords: 'running live',      icon: 'bolt',    run: () => setView('active') },
  { group: 'go',      id: 'nav.run',       label: 'Open New-Task form',     keywords: 'launch create',     icon: 'play',    run: () => setView('run') },
  { group: 'go',      id: 'nav.models',    label: 'Go to Models',           keywords: 'providers',         icon: 'brain',   run: () => setView('models') },
  { group: 'go',      id: 'nav.mcp',       label: 'Go to MCP connections',  keywords: 'servers',           icon: 'plug',    run: () => setView('mcp') },
  { group: 'go',      id: 'nav.skills',    label: 'Go to Skills',           keywords: 'plugins',           icon: 'star',    run: () => setView('skills') },
  { group: 'go',      id: 'nav.web',       label: 'Go to Web tools',        keywords: 'search fetch',      icon: 'globe',   run: () => setView('web') },
  { group: 'go',      id: 'nav.memory',    label: 'Go to Cold memory',      keywords: 'index search',      icon: 'archive', run: () => setView('memory') },
  { group: 'go',      id: 'nav.learning',  label: 'Go to Learning memory',  keywords: 'patterns',          icon: 'sparkle', run: () => setView('learning') },
  { group: 'go',      id: 'nav.cost',      label: 'Go to Cost',             keywords: 'tokens usd',        icon: 'coin',    run: () => setView('cost') },
  { group: 'go',      id: 'nav.config',    label: 'Go to Config',           keywords: 'settings json',     icon: 'gear',    run: () => setView('config') },
  { group: 'go',      id: 'nav.doctor',    label: 'Go to Doctor',           keywords: 'health diag',       icon: 'heart',   run: () => setView('doctor') },
  { group: 'action',  id: 'act.index',     label: 'Re-index cold memory',   keywords: 'fts5 search',       icon: 'archive', run: async () => { try { const s = await apiPost('/api/memory/index', {}); toast(`indexed ${s.scanned} files`, 'ok'); } catch (e) { toast(String(e), 'err'); } } },
  { group: 'action',  id: 'act.doctor',    label: 'Run health check',       keywords: 'diagnose',          icon: 'heart',   run: () => setView('doctor') },
  { group: 'action',  id: 'act.cancel',    label: 'Cancel all active tasks',keywords: 'stop',              icon: 'close',   run: async () => {
    const { active } = await api('/api/tasks/active');
    for (const t of active) await apiPost(`/api/tasks/${t.taskId}/cancel`);
    toast(`cancelled ${active.length}`, 'warn');
  } },
];

const scoreCommand = (cmd, q) => {
  if (!q) return 1;
  const needle = q.toLowerCase();
  const hay = `${cmd.label} ${cmd.keywords || ''}`.toLowerCase();
  if (hay.includes(needle)) {
    // Prefer label prefix > label substring > keyword match
    if (cmd.label.toLowerCase().startsWith(needle)) return 3;
    if (cmd.label.toLowerCase().includes(needle)) return 2;
    return 1;
  }
  return 0;
};

const openPalette = () => {
  let selected = 0;
  const commands = buildCommands();
  let filtered = commands;

  const render = () => {
    const list = overlay.querySelector('#pal-list');
    list.innerHTML = filtered.length
      ? filtered.map((c, i) => `
          <div class="palette-item ${i === selected ? 'active' : ''}" data-idx="${i}">
            <span class="palette-icon">${icon(c.icon || 'arrow')}</span>
            <span class="palette-label">${esc(c.label)}</span>
            <span class="palette-group">${esc(c.group)}</span>
          </div>`).join('')
      : `<div class="palette-empty">No commands match. Press <kbd>⏎</kbd> to run it as a task.</div>`;
    list.querySelectorAll('.palette-item').forEach((el) => {
      el.addEventListener('mouseenter', () => { selected = Number(el.dataset.idx); render(); });
      el.addEventListener('click', () => execute());
    });
  };

  const execute = async () => {
    const q = input.value.trim();
    if (filtered.length) {
      const cmd = filtered[selected];
      close();
      await cmd.run();
      return;
    }
    // Fallback: run the typed text as a task.
    if (q) {
      close();
      try {
        const { taskId } = await apiPost('/api/tasks/run', { prompt: q, autoApprove: false });
        toast('Task started', 'ok');
        openTask(taskId);
      } catch (e) { toast(String(e), 'err'); }
    } else {
      close();
    }
  };

  const { overlay, close } = mountOverlay(`
    <div class="modal" style="max-width:640px">
      <input class="palette-input" id="pal-input" placeholder="Jump to a view, run an action, or type a task…" autocomplete="off" />
      <div class="palette-list" id="pal-list"></div>
      <div class="palette-hint">
        <span><kbd>↑ ↓</kbd> navigate</span>
        <span><kbd>⏎</kbd> run</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>`, {
    onKey: (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(filtered.length - 1, selected + 1); render(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, selected - 1); render(); }
      if (e.key === 'Enter') { e.preventDefault(); execute(); }
    },
  });

  const input = overlay.querySelector('#pal-input');
  setTimeout(() => input.focus(), 30);
  input.addEventListener('input', () => {
    const q = input.value.trim();
    const ranked = commands
      .map((c) => ({ c, score: scoreCommand(c, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
    filtered = ranked;
    selected = 0;
    render();
  });

  render();
};

// ---------- Project event WS (for live log on dashboard, if used) ----------

const connectProjectWs = (projectPath) => {
  if (projectWs) { try { projectWs.close(); } catch {} }
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?projectPath=${encodeURIComponent(projectPath)}`;
  try {
    projectWs = new WebSocket(url);
    projectWs.onopen = () => setStatus(true);
    projectWs.onclose = () => setStatus(false);
  } catch {}
};

const setStatus = (online) => {
  statusDot.classList.toggle('off', !online);
  statusText.textContent = online ? 'online' : 'offline';
};

const updateActiveBadge = (list) => {
  const n = (list ?? []).filter((t) => t.status === 'running' || t.status === 'awaiting').length;
  document.querySelectorAll('[data-active-count]').forEach((el) => {
    if (n > 0) { el.hidden = false; el.textContent = String(n); }
    else el.hidden = true;
  });
};

const pollActive = async () => {
  try { const { active } = await api('/api/tasks/active'); updateActiveBadge(active); }
  catch {}
};

// ---------- Keyboard ----------
//
// Global shortcuts:
//   ⌘/Ctrl + K           command palette (already existed)
//   ⌘/Ctrl + N           new chat (jumps to chat view & creates session)
//   ⌘/Ctrl + Enter       send chat message (inside composer) · submit task (inside run form)
//   ⌘/Ctrl + ↑ / ↓       previous / next chat session
//   /                    focus chat input (when on chat view)
//   ?                    open shortcut reference overlay
//   Esc                  close overlay · blur input
//   g then h/t/r/c/m/d   vim-style go-to (dashboard/tasks/run/chat/models/doctor)
//   1..9                 jump to nav item N

const SHORTCUT_DOC = [
  ['⌘/Ctrl + K', 'command palette'],
  ['⌘/Ctrl + N', 'new chat'],
  ['⌘/Ctrl + Enter', 'send from composer · submit from run form'],
  ['⌘/Ctrl + ↑ / ↓', 'previous / next chat session'],
  ['/', 'focus chat input'],
  ['?', 'this help'],
  ['Esc', 'close overlay · blur input'],
  ['g h / g t / g r / g c', 'go to Dashboard / Tasks / Run / Chat'],
  ['g m / g d', 'go to Models / Doctor'],
  ['1 … 9', 'jump to nav item N'],
];

const openShortcuts = () => {
  const existing = document.querySelector('.shortcut-overlay');
  if (existing) { existing.remove(); return; }
  const host = document.getElementById('overlay-host');
  const el = document.createElement('div');
  el.className = 'shortcut-overlay';
  el.innerHTML = `
    <div class="shortcut-card">
      <div class="shortcut-head">
        <span>Keyboard shortcuts</span>
        <button class="shortcut-close">${icon('close')}</button>
      </div>
      <table class="shortcut-table">
        ${SHORTCUT_DOC.map(([k, d]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join('')}
      </table>
    </div>
  `;
  host.appendChild(el);
  const close = () => el.remove();
  el.querySelector('.shortcut-close').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  const onEsc = (e) => { if (e.key === 'Escape') { close(); window.removeEventListener('keydown', onEsc); } };
  window.addEventListener('keydown', onEsc);
};

// Simple two-key "g X" sequence handler: press g, then within 1s the next key
// selects a destination. Works when no input is focused.
let pendingG = 0;
const goToMap = {
  h: 'dashboard',
  t: 'tasks',
  r: 'run',
  c: 'chat',
  m: 'models',
  d: 'doctor',
  s: 'skills',
  u: 'mcp',
  w: 'web',
  o: 'cost',     // "o" for money
  f: 'config',   // "f" for config
  l: 'learning',
  b: 'memory',   // b for "brain"
  a: 'active',
};

const createNewChat = async () => {
  if (currentView !== 'chat') setView('chat');
  // After the view mounts, hit the New Chat button.
  setTimeout(() => {
    const btn = document.getElementById('chat-new');
    if (btn) btn.click();
    else {
      // fallback: call directly if chatState exists
      if (typeof currentProject === 'string') {
        fetch('/api/chat/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectPath: currentProject }),
        }).then(() => setView('chat'));
      }
    }
  }, 120);
};

const cycleChatSession = async (direction) => {
  if (currentView !== 'chat') return;
  const list = [...document.querySelectorAll('.chat-list-item')];
  if (!list.length) return;
  const activeIdx = list.findIndex((el) => el.classList.contains('active'));
  const nextIdx = Math.max(0, Math.min(list.length - 1,
    (activeIdx < 0 ? 0 : activeIdx) + direction));
  list[nextIdx]?.click();
};

window.addEventListener('keydown', (e) => {
  const tag = e.target?.tagName;
  const inEditable = ['INPUT', 'TEXTAREA'].includes(tag) || e.target?.isContentEditable;
  const meta = e.metaKey || e.ctrlKey;

  // Command palette (works everywhere)
  if (meta && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    openPalette();
    return;
  }

  // New chat (works everywhere)
  if (meta && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    createNewChat();
    return;
  }

  // Cmd+Enter submit — routed per-context
  if (meta && e.key === 'Enter') {
    const composer = document.getElementById('chat-composer');
    if (composer) { e.preventDefault(); composer.dispatchEvent(new Event('submit', { cancelable: true })); return; }
    const runGo = document.getElementById('run-go');
    if (runGo) { e.preventDefault(); runGo.click(); return; }
  }

  // Cmd+↑/↓ switches chat sessions
  if (meta && e.key === 'ArrowUp') { if (currentView === 'chat') { e.preventDefault(); cycleChatSession(-1); } return; }
  if (meta && e.key === 'ArrowDown') { if (currentView === 'chat') { e.preventDefault(); cycleChatSession(+1); } return; }

  // Escape: close overlays, blur input
  if (e.key === 'Escape') {
    const overlay = document.querySelector('.shortcut-overlay, .palette-overlay:not([hidden])');
    if (overlay) { overlay.remove(); return; }
    if (inEditable && typeof e.target.blur === 'function') { e.target.blur(); return; }
    return;
  }

  if (inEditable) return;

  // "/" focuses the chat composer
  if (e.key === '/' && currentView === 'chat') {
    const input = document.getElementById('chat-input');
    if (input) { e.preventDefault(); input.focus(); return; }
  }

  // "?" opens the shortcut card
  if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }

  // 1..9: jump to nav item by index
  if (/^[1-9]$/.test(e.key)) {
    const items = [...document.querySelectorAll('.nav-item')];
    const target = items[parseInt(e.key, 10) - 1];
    if (target) { e.preventDefault(); target.click(); }
    return;
  }

  // g then X: go to view
  if (e.key === 'g') {
    pendingG = Date.now();
    return;
  }
  if (Date.now() - pendingG < 1000 && goToMap[e.key]) {
    pendingG = 0;
    e.preventDefault();
    setView(goToMap[e.key]);
  } else if (pendingG) {
    pendingG = 0;
  }
});

// ---------- Mobile navigation ----------
//
// The sidebar slides in from the left on mobile; the hamburger button and
// backdrop come into the DOM in index.html but are hidden above the CSS
// breakpoint. Wire toggle + close-on-nav + Escape.

const navToggleEl = document.getElementById('nav-toggle');
const navBackdropEl = document.getElementById('nav-backdrop');
const sidebarEl = document.querySelector('.sidebar');

const setNavOpen = (open) => {
  if (!sidebarEl || !navToggleEl || !navBackdropEl) return;
  sidebarEl.classList.toggle('open', open);
  // Visibility is managed via .visible class, NOT the hidden attribute —
  // the global `[hidden]{display:none!important}` rule would win against
  // our backdrop styles otherwise.
  navBackdropEl.classList.toggle('visible', open);
  navToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.style.overflow = open ? 'hidden' : '';
};
navToggleEl?.addEventListener('click', () => {
  const open = sidebarEl?.classList.contains('open');
  setNavOpen(!open);
});
navBackdropEl?.addEventListener('click', () => setNavOpen(false));
// Close the sidebar when a nav item is tapped so the user sees the page.
navEl.addEventListener('click', (e) => {
  const target = e.target;
  if (target && target.closest('[data-view]')) setNavOpen(false);
});
// Escape closes on any screen size.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebarEl?.classList.contains('open')) setNavOpen(false);
});
// If the user resizes above the breakpoint, force-close so layout is clean.
window.addEventListener('resize', () => {
  if (window.innerWidth > 920) setNavOpen(false);
});

// ---------- Sortable tables ----------
//
// Any table with class `sortable` gets click-to-sort on each <th> that has
// a `data-sort="text|number|date"` attribute. Cells may override their
// sort key via `data-raw="..."` (useful for columns that display a
// formatted value — e.g. "3m ago" — but need the raw timestamp for sort).
//
// Default sort can be set via `data-default-sort="<col-index>"` (zero-based)
// and `data-default-dir="asc|desc"` on the <table>.

const readCellKey = (td, kind) => {
  const raw = td.getAttribute('data-raw');
  const text = (raw ?? td.textContent ?? '').trim();
  if (kind === 'number') {
    const n = parseFloat(text.replace(/[^\d.\-eE]/g, ''));
    return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
  }
  if (kind === 'date') {
    const t = Date.parse(text);
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  }
  return text.toLowerCase();
};

const sortTable = (table, colIdx, dir) => {
  const ths = [...table.querySelectorAll('thead th')];
  const kind = ths[colIdx]?.dataset.sort || 'text';
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const rows = [...tbody.querySelectorAll('tr')];
  rows.sort((a, b) => {
    const ka = readCellKey(a.children[colIdx], kind);
    const kb = readCellKey(b.children[colIdx], kind);
    if (ka < kb) return dir === 'asc' ? -1 : 1;
    if (ka > kb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  for (const row of rows) tbody.appendChild(row);
  // Visual indicator on headers.
  ths.forEach((th, i) => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (i === colIdx) th.classList.add(dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
  });
};

const initSortableTables = (rootEl) => {
  const root = rootEl ?? document;
  root.querySelectorAll('table.sortable').forEach((table) => {
    if (table.dataset.sortWired) return;
    table.dataset.sortWired = '1';
    const ths = [...table.querySelectorAll('thead th')];
    ths.forEach((th, i) => {
      if (!th.dataset.sort) return;
      th.classList.add('sort-head');
      th.setAttribute('tabindex', '0');
      th.setAttribute('role', 'button');
      th.setAttribute('aria-label', `Sort by ${th.textContent.trim()}`);
      const trigger = () => {
        const current =
          th.classList.contains('sorted-asc') ? 'asc' :
          th.classList.contains('sorted-desc') ? 'desc' : null;
        const next = current === 'asc' ? 'desc' : 'asc';
        sortTable(table, i, next);
      };
      th.addEventListener('click', trigger);
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); }
      });
    });
    const defaultCol = parseInt(table.dataset.defaultSort ?? '', 10);
    const defaultDir = table.dataset.defaultDir === 'desc' ? 'desc' : 'asc';
    if (Number.isFinite(defaultCol)) sortTable(table, defaultCol, defaultDir);
  });
};

// Auto-wire sortable tables whenever the app root is mutated.
const _sortObserver = new MutationObserver(() => initSortableTables());
_sortObserver.observe(document.getElementById('app'), { childList: true, subtree: true });

// ---------- Bootstrap ----------

renderNav();
setStatus(true);
setView('dashboard');
setInterval(pollActive, 4000);
pollActive();

api('/api/projects').then((ps) => {
  currentProject = ps[0]?.path || currentProject;
  if (currentProject) connectProjectWs(currentProject);
}).catch(() => {});
