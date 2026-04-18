/* ============================================================
 * Rendimientos — Editorial Landing (opt-in, /nuevo)
 * Wiring to real endpoints. Visual-only chat.
 * ============================================================ */

// ─── Preference persistence ────────────────────────────────────
(function rememberEditorialPref() {
  try { localStorage.setItem('designPref', 'editorial'); } catch (e) {}
})();

// ─── Helpers ───────────────────────────────────────────────────
const money = (n, frac = 0) =>
  (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
const pct = (n, frac = 2) => `${(Number(n) || 0).toFixed(frac)}%`;
const $ = (sel) => document.querySelector(sel);

function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtDate(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}
function getSettlementDate(from) {
  const holidays = [
    '2026-03-23', '2026-03-24', '2026-04-02', '2026-04-03',
    '2026-05-01', '2026-05-25', '2026-06-15', '2026-06-20',
    '2026-07-09', '2026-08-17', '2026-10-12', '2026-11-23',
    '2026-12-07', '2026-12-08', '2026-12-25', '2027-01-01',
  ];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let steps = 0;
  while (steps < 1) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (holidays.includes(iso)) continue;
    steps++;
  }
  return d;
}

// Mini letter-color palette for logo chips fallback
const CHIP_COLORS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
function chipColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % CHIP_COLORS.length;
  return CHIP_COLORS[h];
}
function initials(name) {
  return name.split(/[\s-]+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '·';
}

// ─── Data model ─────────────────────────────────────────────────
let STATE = {
  walletMode: 'TNA',      // 'TNA' | 'TEA' | 'Neto'
  wallets: [],            // unified list
  pfs: [],                // plazo fijo banks
  lecaps: [],             // letras
};

// ─── Theme toggle (persistent) ─────────────────────────────────
function wireThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    // Also keep the editorial meta theme-color in sync
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#14120F' : '#F4EFE6');
  });
}

// ─── Live clock ────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('liveTime');
  if (!el) return;
  const d = new Date();
  el.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Ticker ────────────────────────────────────────────────────
async function loadTicker() {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  try {
    const r = await fetch('/api/cotizaciones');
    const c = await r.json();

    const items = [];
    const mkPctChg = (curr, prev) => {
      if (!prev || !curr) return null;
      const pp = ((curr - prev) / prev) * 100;
      return { pos: pp >= 0, txt: `${pp >= 0 ? '+' : ''}${pp.toFixed(2)}%` };
    };

    if (c.mep?.price) items.push({ lbl: 'Dólar MEP', val: `$${money(c.mep.price, 2)}` });
    if (c.ccl?.price) items.push({ lbl: 'Dólar CCL', val: `$${money(c.ccl.price, 2)}` });
    if (c.oficial?.price) {
      const chg = mkPctChg(c.oficial.price, c.oficial.prevClose);
      items.push({ lbl: 'Dólar Oficial', val: `$${money(c.oficial.price, 2)}`, chg });
    }
    if (c.riesgoPais?.value) items.push({ lbl: 'Riesgo País', val: `${c.riesgoPais.value} pb` });

    // Sprinkle in some static context markers so the ticker looks rich
    items.push({ lbl: 'BCRA', val: 'Tasa política' });
    items.push({ lbl: 'BYMA', val: 'LECAPs en vivo' });
    items.push({ lbl: 'CAFCI', val: 'FCIs actualizados' });

    const render = () => items.map((t) => `
      <span class="t-item">
        <span class="lbl">${t.lbl}</span>
        <span class="val">${t.val}</span>
        ${t.chg ? `<span class="chg ${t.chg.pos ? 'pos' : 'neg'}">${t.chg.txt}</span>` : ''}
      </span>
    `).join('');

    track.innerHTML = render() + render();
  } catch (e) {
    track.innerHTML = '<span class="t-item"><span class="lbl">Cotizaciones</span><span class="val">no disponibles</span></span>';
  }
}

// ─── Billeteras + FCIs unificados ──────────────────────────────
async function loadWallets() {
  const [configRes, fciRes] = await Promise.all([
    fetch('/api/config').then((r) => r.json()).catch(() => ({})),
    fetch('/api/cafci').then((r) => r.json()).catch(() => ({ data: [] })),
  ]);

  const garantizados = (configRes.garantizados || []).filter((g) => g.activo !== false);
  const wallets = garantizados.map((g) => ({
    name: g.nombre,
    type: g.tipo || 'Billetera',
    tna: Number(g.tna) || 0,
    limit: g.limite || null,
    tag: g.limite ? `Hasta ${g.limite}` : (g.tipo || 'Sin requisitos'),
    logo: g.logo || initials(g.nombre),
    logoBg: g.logo_bg || null,
  }));

  // Top 4 FCIs por TNA
  const fcis = (fciRes.data || [])
    .filter((f) => f.nombre && !isNaN(f.tna))
    .sort((a, b) => b.tna - a.tna)
    .slice(0, 4)
    .map((f) => ({
      name: f.nombre.replace(/ - Clase [A-Z]$/, ''),
      type: 'FCI Money Market',
      tna: Number(f.tna) || 0,
      limit: null,
      tag: 'FCI',
      logo: initials(f.nombre),
      logoBg: null,
    }));

  const all = [...wallets, ...fcis].sort((a, b) => b.tna - a.tna);
  STATE.wallets = all;
  renderWallets();
  renderMiniRank();
  renderHeroStats();
}

function computeRate(tna, mode) {
  if (mode === 'TNA') return tna;
  if (mode === 'TEA') return (Math.pow(1 + tna / 100 / 12, 12) - 1) * 100;
  if (mode === 'Neto') return tna * (1 - 0.07); // -7% retención
  return tna;
}

function renderWallets() {
  const tb = document.getElementById('walletTable');
  const head = document.getElementById('walletHeadRate');
  const count = document.getElementById('walletCount');
  if (!tb) return;
  if (head) head.textContent = STATE.walletMode;
  if (count) count.textContent = `${STATE.wallets.length} productos · orden por ${STATE.walletMode}`;

  if (!STATE.wallets.length) {
    tb.innerHTML = '<tr><td colspan="5" class="loading-cell">Sin datos</td></tr>';
    return;
  }

  tb.innerHTML = STATE.wallets.map((w, i) => {
    const rate = computeRate(w.tna, STATE.walletMode);
    const mo = (w.tna / 12 / 100) * 100000;
    const chipStyle = w.logoBg ? `style="background: ${w.logoBg};"` : '';
    const chipCls = w.logoBg ? '' : chipColor(w.name);
    return `
      <tr>
        <td class="rk-num">${String(i + 1).padStart(2, '0')}</td>
        <td>
          <div class="rk-name">
            <div class="logo-chip ${chipCls}" ${chipStyle}>${w.logo}</div>
            <div class="txt"><div class="n">${w.name}</div><div class="t">${w.type}</div></div>
          </div>
        </td>
        <td class="num ${i === 0 ? 'hero-rate' : 'big'}">${rate.toFixed(2)}%</td>
        <td class="num soft">$${money(mo)}</td>
        <td><span class="tag ${i > 3 ? 'neutral' : ''}">${w.tag}</span></td>
      </tr>
    `;
  }).join('');
}

function renderMiniRank() {
  const el = document.getElementById('miniRank');
  if (!el) return;
  const top = STATE.wallets.slice(0, 4);
  if (!top.length) { el.innerHTML = ''; return; }
  el.innerHTML = top.map((w, i) => `
    <div class="row ${i === 0 ? 'top' : ''}">
      <span class="rk">${String(i + 1).padStart(2, '0')}</span>
      <span class="nm">${w.name}</span>
      <span class="rt">${w.tna.toFixed(2)}%</span>
    </div>
  `).join('');

  // Update the bot answer text using real data
  const answerEl = document.getElementById('chatAnswer');
  if (answerEl && top.length) {
    const t = top[0];
    const rend30 = (t.tna / 12 / 100) * 2000000;
    answerEl.innerHTML = `Hoy conviene <b>${t.name}</b> al <b>${t.tna.toFixed(2)}% TNA</b>. $2M te rendirían <b>$${money(rend30)}</b> en 30 días.`;
  }
}

// ─── Hero stats ────────────────────────────────────────────────
function renderHeroStats() {
  const statWallet = document.getElementById('statBilletera');
  if (statWallet && STATE.wallets.length) {
    const w = STATE.wallets[0];
    statWallet.innerHTML = `${w.name} <span class="rate">${w.tna.toFixed(2)}%</span>`;
  }

  const statPF = document.getElementById('statPF');
  if (statPF && STATE.pfs.length) {
    const p = STATE.pfs[0];
    statPF.innerHTML = `${shortBank(p.name)} <span class="rate">${p.tna.toFixed(2)}%</span>`;
  }

  const statLecap = document.getElementById('statLecap');
  if (statLecap && STATE.lecaps.length) {
    const l = STATE.lecaps[0];
    statLecap.innerHTML = `${l.ticker} <span class="rate">${l.tir.toFixed(2)}%</span>`;
  }

  // Also update the second demo card with real data
  const a2 = document.getElementById('chatAnswer2');
  if (a2 && STATE.pfs.length) {
    const p = STATE.pfs[0];
    const gan = 500000 * p.tna / 100 / 12;
    a2.innerHTML = `La mejor oferta hoy es <b>${shortBank(p.name)}</b> al <b>${p.tna.toFixed(2)}% TNA</b>. A 30 días serían <b>$${money(gan)}</b>.`;
  }
  const a3 = document.getElementById('chatAnswer3');
  if (a3 && STATE.lecaps.length) {
    const l = STATE.lecaps[0];
    a3.innerHTML = `La LECAP más corta es <b>${l.ticker}</b> a <b>${l.dias} días</b>, con TIR anualizada <b>${l.tir.toFixed(2)}%</b>.`;
  }
}

// ─── Plazo Fijo ────────────────────────────────────────────────
function shortBank(name) {
  return name.replace(/^BANCO\s+(DE\s+)?(LA\s+)?/i, '').replace(/\s+S\.?A\.?$/i, '').replace(/\s+\(.*\)$/, '')
    .toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

async function loadPF() {
  const tb = document.getElementById('pfTable');
  try {
    const res = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');
    const data = await res.json();
    const rows = (data || [])
      .filter((p) => p.tnaClientes && p.tnaClientes > 0)
      .map((p) => ({ name: shortBank(p.entidad), tna: p.tnaClientes * 100 }))
      .sort((a, b) => b.tna - a.tna)
      .slice(0, 7);
    STATE.pfs = rows;
    if (tb) {
      tb.innerHTML = rows.map((p, i) => {
        const gan = 1000000 * p.tna / 100 / 12;
        const chip = chipColor(p.name);
        return `
          <tr>
            <td class="rk-num">${String(i + 1).padStart(2, '0')}</td>
            <td>
              <div class="rk-name">
                <div class="logo-chip ${chip}">${initials(p.name)}</div>
                <div class="txt"><div class="n">${p.name}</div><div class="t">Plazo fijo 30d</div></div>
              </div>
            </td>
            <td class="num ${i === 0 ? 'hero-rate' : 'big'}">${p.tna.toFixed(2)}%</td>
            <td class="num soft">+$${money(gan)}</td>
          </tr>
        `;
      }).join('');
    }
    renderHeroStats();
  } catch (e) {
    if (tb) tb.innerHTML = '<tr><td colspan="4" class="loading-cell">Sin datos</td></tr>';
  }
}

// ─── LECAPs ────────────────────────────────────────────────────
async function loadLecaps() {
  const tb = document.getElementById('lecapTable');
  try {
    const [cfg, bymaRes] = await Promise.all([
      fetch('/api/config').then((r) => r.json()),
      fetch('/api/lecaps').then((r) => r.json()).catch(() => ({ data: [] })),
    ]);
    const letras = cfg.lecaps?.letras || [];
    const livePrices = {};
    for (const item of (bymaRes.data || [])) {
      livePrices[item.symbol] = item.ask > 0 ? item.ask : item.price;
    }
    const today = new Date();
    const settlement = getSettlementDate(today);

    const rows = letras
      .filter((l) => l.activo !== false)
      .map((l) => {
        const precio = livePrices[l.ticker] || l.precio;
        if (!precio || precio <= 0) return null;
        const vto = parseLocalDate(l.fecha_vencimiento);
        const dias = Math.max(1, Math.round((vto - settlement) / 86400000));
        if (dias <= 0) return null;
        const ganancia = l.pago_final / precio;
        const tir = (Math.pow(ganancia, 365 / dias) - 1) * 100;
        return { ticker: l.ticker, tir, dias, vto, precio };
      })
      .filter(Boolean)
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 6);

    STATE.lecaps = rows;

    if (tb) {
      tb.innerHTML = rows.map((l, i) => {
        const chip = chipColor(l.ticker);
        return `
          <tr>
            <td class="rk-num">${String(i + 1).padStart(2, '0')}</td>
            <td>
              <div class="rk-name">
                <div class="logo-chip ${chip}">${l.ticker.slice(0, 2)}</div>
                <div class="txt"><div class="n">${l.ticker}</div><div class="t">Letra capitalizable</div></div>
              </div>
            </td>
            <td class="num ${i === 0 ? 'hero-rate' : 'big'}">${l.tir.toFixed(2)}%</td>
            <td class="num soft">${fmtDate(l.vto)}</td>
            <td class="num soft">${l.dias}d</td>
          </tr>
        `;
      }).join('');
    }

    renderHeroStats();
    renderCalendar();
  } catch (e) {
    if (tb) tb.innerHTML = '<tr><td colspan="5" class="loading-cell">Sin datos</td></tr>';
  }
}

// ─── Calendar (próximos vencimientos LECAPs) ───────────────────
function renderCalendar() {
  const body = document.getElementById('calBody');
  if (!body) return;
  const next = STATE.lecaps.slice(0, 4);
  if (!next.length) {
    body.innerHTML = '<div class="loading-cell" style="padding: 16px 0;">Sin datos</div>';
    return;
  }
  const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  body.innerHTML = next.map((l) => `
    <div class="cal-row">
      <div class="cal-date">
        <div class="d">${String(l.vto.getDate()).padStart(2, '0')}</div>
        <div class="m">${MES[l.vto.getMonth()]}</div>
      </div>
      <div class="cal-body">
        <div class="nm">LECAP ${l.ticker}</div>
        <div class="t">Vencimiento · ${l.dias} días · TIR ${l.tir.toFixed(2)}%</div>
      </div>
      <div class="cal-amt">$${money(l.precio, 2)}<span style="color:var(--ink-mute); font-size:10px; margin-left:4px;">c/100 VN</span></div>
    </div>
  `).join('');
}

// ─── Suggest chips (visual-only) ───────────────────────────────
function wireSuggest() {
  const input = document.getElementById('promptInput');
  const userMsg = document.getElementById('chatUserMsg');
  document.querySelectorAll('.suggest button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.suggest button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      const q = b.getAttribute('data-q') || b.textContent;
      if (input) input.value = q;
      if (userMsg) userMsg.textContent = q;
    });
  });
}

// ─── Wallet tabs (TNA / TEA / Neto) ────────────────────────────
function wireWalletTabs() {
  document.querySelectorAll('#walletTabs button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#walletTabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      STATE.walletMode = b.getAttribute('data-mode') || 'TNA';
      renderWallets();
    });
  });
}

// ─── Back-to-classic flips pref ────────────────────────────────
function wireBackToClassic() {
  const link = document.getElementById('back-classic');
  if (link) {
    link.addEventListener('click', () => {
      try { localStorage.setItem('designPref', 'classic'); } catch (e) {}
    });
  }
  // Any link that goes to "/" or "/#<hash>" should reset preference so the user
  // doesn't get bounced back to /nuevo.
  document.querySelectorAll('a[href^="/"]:not([href^="/nuevo"])').forEach((a) => {
    a.addEventListener('click', () => {
      try { localStorage.setItem('designPref', 'classic'); } catch (e) {}
    });
  });
}

// ─── Boot ──────────────────────────────────────────────────────
function boot() {
  wireThemeToggle();
  wireSuggest();
  wireWalletTabs();
  wireBackToClassic();
  updateClock();
  setInterval(updateClock, 30000);
  loadTicker();
  loadWallets();
  loadPF();
  loadLecaps();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
