/* Bulgària 2026 · SPA del viatge */

const app = document.getElementById("app");

const S = {
  user: null,
  users: [],
  itinerary: null,
  travelGuide: null,
  foodPassport: null,
  imageCredits: {},
  state: { checks: {}, customActivities: {}, diary: {} },
  selectedLoginUser: null
};

const FOOD_PASSPORT_KEY = "bulgaria2026-food";

function foodPassportState() {
  try {
    return JSON.parse(localStorage.getItem(FOOD_PASSPORT_KEY)) || { tasted: {}, ratings: {} };
  } catch {
    return { tasted: {}, ratings: {} };
  }
}

function saveFoodPassportState(fp) {
  localStorage.setItem(FOOD_PASSPORT_KEY, JSON.stringify(fp));
}

/* ---------------- utils ---------------- */

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function linkify(text) {
  const escaped = esc(text);
  return escaped.replace(/(https?:\/\/[^\s<]+|[a-z0-9.-]+\.(?:com|cat|org|net)\/[^\s<]+)/gi, (m) => {
    const href = m.startsWith("http") ? m : "https://" + m;
    return `<a href="${href}" target="_blank" rel="noopener">${m}</a>`;
  });
}

function fmtWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("ca-ES", { day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" });
}

function toast(msg, isError = false) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

async function api(path, opts = {}) {
  if (S.staticMode) return staticApi(path, opts);
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401 && !path.includes("/login")) {
    S.user = null;
    render();
    throw new Error("Sessió caducada");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de connexió");
  return data;
}

/* ---------------- static mode (GitHub Pages, sense servidor) ----------------
   Quan no hi ha servidor Node (p. ex. l'app publicada a GitHub Pages), tot
   funciona al navegador: el login es valida contra data/static-users.json i
   el diari/activitats es guarden a localStorage (només en aquest dispositiu). */

const STORE_KEY = "bulgaria2026-store";
const SESSION_KEY = "bulgaria2026-user";

function staticStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || { checks: {}, customActivities: {}, diary: {} };
  } catch {
    return { checks: {}, customActivities: {}, diary: {} };
  }
}

// Només persisteix; S.state l'actualitzen els handlers del frontend,
// igual que en mode servidor (si no, les entrades es duplicarien).
function staticSave(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function staticId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function staticApi(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const body = opts.body || {};
  const store = staticStore();
  const now = new Date().toISOString();

  if (path === "/api/login") {
    const u = S.staticUsers[String(body.username || "").toLowerCase().trim()];
    if (!u) throw new Error("Usuari o contrasenya incorrectes");
    const hash = await sha256Hex(`${u.salt}:${body.password || ""}`);
    if (hash !== u.hash) throw new Error("Usuari o contrasenya incorrectes");
    localStorage.setItem(SESSION_KEY, body.username);
    S.user = { username: body.username, displayName: u.displayName, emoji: u.emoji };
    return { ok: true, user: S.user };
  }

  if (path === "/api/logout") {
    localStorage.removeItem(SESSION_KEY);
    return { ok: true };
  }

  const dayMatch = path.match(/^\/api\/days\/(\d+)\/(check|activities|diary)(?:\/([\w-]+))?$/);
  if (!dayMatch) throw new Error("Ruta desconeguda");
  const [, day, kind, id] = dayMatch;

  if (kind === "check") {
    store.checks[day] = store.checks[day] || {};
    if (body.done) store.checks[day][body.itemId] = { by: S.user.username, at: now };
    else delete store.checks[day][body.itemId];
    staticSave(store);
    return { ok: true, checks: store.checks[day] };
  }

  if (kind === "activities") {
    if (method === "POST") {
      const text = String(body.text || "").trim();
      if (!text) throw new Error("Escriu alguna cosa!");
      const item = { id: staticId("c"), text, by: S.user.username, at: now };
      (store.customActivities[day] = store.customActivities[day] || []).push(item);
      staticSave(store);
      return { ok: true, item };
    }
    if (method === "DELETE") {
      store.customActivities[day] = (store.customActivities[day] || []).filter((i) => i.id !== id);
      if (store.checks[day]) delete store.checks[day][id];
      staticSave(store);
      return { ok: true };
    }
  }

  if (kind === "diary") {
    const list = (store.diary[day] = store.diary[day] || []);
    if (method === "POST") {
      const text = String(body.text || "").trim();
      if (!text) throw new Error("El teu diari no pot estar buit!");
      const entry = { id: staticId("e"), text, by: S.user.username, at: now };
      list.push(entry);
      staticSave(store);
      return { ok: true, entry };
    }
    const entry = list.find((e) => e.id === id);
    if (!entry) throw new Error("No trobat");
    if (entry.by !== S.user.username) throw new Error("Només pots editar les teves notes");
    if (method === "PUT") {
      const text = String(body.text || "").trim();
      if (!text) throw new Error("El teu diari no pot estar buit!");
      entry.text = text;
      entry.editedAt = now;
      staticSave(store);
      return { ok: true, entry };
    }
    if (method === "DELETE") {
      store.diary[day] = list.filter((e) => e.id !== id);
      staticSave(store);
      return { ok: true };
    }
  }
  throw new Error("Ruta desconeguda");
}

async function enterStaticMode() {
  S.staticMode = true;
  const [itinerary, credits, users, guide, food] = await Promise.all([
    fetch("data/itinerary.json").then((r) => r.json()),
    fetch("data/image-credits.json").then((r) => r.json()).catch(() => ({})),
    fetch("data/static-users.json").then((r) => r.json()),
    fetch("data/travel-guide.json").then((r) => r.json()).catch(() => ({ days: {} })),
    fetch("data/food-passport.json").then((r) => r.json()).catch(() => null)
  ]);
  S.itinerary = itinerary;
  S.imageCredits = credits;
  S.travelGuide = guide;
  S.foodPassport = food;
  S.staticUsers = users;
  S.users = Object.entries(users).map(([username, u]) => ({
    username, displayName: u.displayName, emoji: u.emoji
  }));
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved && users[saved]) {
    S.user = { username: saved, displayName: users[saved].displayName, emoji: users[saved].emoji };
    S.state = staticStore();
  }
  render();
}

function userName(username) {
  const u = S.users.find((x) => x.username === username);
  return u ? `${u.emoji} ${u.displayName}` : username;
}

function dayProgress(day) {
  const items = [...day.activities, ...(S.state.customActivities[day.day] || [])];
  const checks = S.state.checks[day.day] || {};
  const done = items.filter((i) => checks[i.id]).length;
  return { done, total: items.length };
}

function todayDayNumber() {
  const today = new Date().toISOString().slice(0, 10);
  const d = S.itinerary.days.find((x) => x.date === today);
  return d ? d.day : null;
}

/* ---------------- router ---------------- */

function route() {
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);
  if (!S.user) return renderLogin();
  if (parts[0] === "dia" && parts[1]) return renderDay(parseInt(parts[1], 10), parts[2] || "plan");
  if (parts[0] === "diari") return renderDiaryPage();
  if (parts[0] === "food") return renderFoodPassportPage();
  if (parts[0] === "info") return renderInfoPage();
  return renderOverview();
}

function render() { route(); }
window.addEventListener("hashchange", route);

/* ---------------- login ---------------- */

function renderLogin() {
  const users = S.users.length
    ? S.users
    : [{ username: "viatger1", displayName: "Viatger 1", emoji: "🌻" },
       { username: "viatger2", displayName: "Viatger 2", emoji: "🌊" }];
  if (!S.selectedLoginUser) S.selectedLoginUser = users[0].username;

  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="flag"><div class="w"></div><div class="g"></div><div class="r"></div></div>
        <h1>Bulgària 2026</h1>
        <p class="sub">El nostre quadern de viatge · 3–15 d'agost</p>
        <div class="user-picker">
          ${users.map((u) => `
            <button class="user-pick ${u.username === S.selectedLoginUser ? "active" : ""}" data-user="${esc(u.username)}">
              <span class="emoji">${esc(u.emoji)}</span>${esc(u.displayName)}
            </button>`).join("")}
        </div>
        <form id="login-form">
          <input type="password" id="password" placeholder="Contrasenya" autocomplete="current-password" required />
          <button class="btn full" type="submit">Entrar al viatge ✈️</button>
        </form>
        <div class="login-error" id="login-error"></div>
      </div>
    </div>`;

  app.querySelectorAll(".user-pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      S.selectedLoginUser = btn.dataset.user;
      renderLogin();
      document.getElementById("password").focus();
    });
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("login-error");
    errEl.textContent = "";
    try {
      await api("/api/login", {
        method: "POST",
        body: { username: S.selectedLoginUser, password: document.getElementById("password").value }
      });
      await bootstrap();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}

/* ---------------- chrome ---------------- */

function chrome(active, content) {
  return `
    <nav class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="#/">Bulgària <span>2026</span></a>
        <div class="nav-links">
          <a href="#/" class="${active === "home" ? "active" : ""}">Itinerari</a>
          <a href="#/food" class="${active === "food" ? "active" : ""}">Food Passport</a>
          <a href="#/diari" class="${active === "diari" ? "active" : ""}">El nostre diari</a>
          <a href="#/info" class="${active === "info" ? "active" : ""}">Info pràctica</a>
        </div>
        <div class="who">
          <span>${esc(S.user.emoji)} <span class="name-txt">${esc(S.user.displayName)}</span></span>
          <button class="logout" id="logout-btn">Sortir</button>
        </div>
      </div>
    </nav>
    <main class="page">${content}</main>`;
}

function afterChrome() {
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    S.user = null;
    location.hash = "#/";
    render();
  });
}

/* ---------------- overview ---------------- */

function renderOverview() {
  const { trip, days } = S.itinerary;
  const today = todayDayNumber();
  const start = new Date("2026-08-03T06:00:00");
  const now = new Date();
  const diffDays = Math.ceil((start - now) / 86400000);

  let countdownHtml = "";
  if (diffDays > 0) {
    countdownHtml = `
      <div class="countdown">
        <div class="unit"><div class="num">${diffDays}</div><div class="lbl">dies</div></div>
        <div class="unit"><div class="num">13</div><div class="lbl">dies de ruta</div></div>
        <div class="unit"><div class="num">10</div><div class="lbl">destins</div></div>
      </div>`;
  }

  const content = `
    <div class="hero" style="background-image:url('images/rila-monastery.jpg')">
      <div class="hero-content">
        <h1>${esc(trip.title)}</h1>
        <p>${esc(trip.subtitle)}</p>
        <div class="hero-badges">
          <span class="badge">🏔️ Rila i Pirin</span>
          <span class="badge">🏛️ Plovdiv</span>
          <span class="badge">🌊 Mar Negre</span>
          <span class="badge">🛸 Buzludzha</span>
          <span class="badge">🌹 Sofia</span>
        </div>
        ${countdownHtml}
      </div>
    </div>
    <h2 class="page-title" style="font-size:1.6rem">El viatge, dia a dia</h2>
    <p class="page-sub">Clica un dia per veure el pla, el travel guide en anglès i el diari.</p>
    <div class="days-grid">
      ${days.map((d) => {
        const p = dayProgress(d);
        const hasDiary = (S.state.diary[d.day] || []).length > 0;
        return `
        <a class="day-card" href="#/dia/${d.day}">
          <div class="thumb" style="background-image:url('images/${esc(d.heroImage)}.jpg')">
            <span class="day-chip">Dia ${d.day}</span>
            ${today === d.day ? '<span class="today-chip">AVUI</span>' : ""}
          </div>
          <div class="body">
            <span class="date">${esc(d.dateLabel)}</span>
            <h3>${esc(d.title)}</h3>
            <span class="area">📍 ${esc(d.area)}</span>
            <div class="meta-row">
              <div class="progress"><div style="width:${p.total ? (p.done / p.total) * 100 : 0}%"></div></div>
              <span class="progress-label">${p.done}/${p.total}</span>
              ${hasDiary ? '<span class="diary-dot" title="Hi ha notes al diari">📖</span>' : ""}
            </div>
          </div>
        </a>`;
      }).join("")}
    </div>`;

  app.innerHTML = chrome("home", content);
  afterChrome();
}

/* ---------------- travel guide helpers ---------------- */

function paras(arr) {
  return (arr || []).map((p) => `<p class="guide-p">${esc(p)}</p>`).join("");
}

function renderGuideSection(title, inner) {
  return `<section class="guide-section"><h3 class="guide-h3">${title}</h3>${inner}</section>`;
}

function renderDayGuide(g) {
  if (!g) return `<div class="card"><p class="guide-empty">Travel guide content coming soon for this day.</p></div>`;

  const highlights = (g.highlights || []).map((h) => `
    <div class="guide-highlight">
      <div class="gh-name">${esc(h.name)}</div>
      <div class="gh-what"><b>What:</b> ${esc(h.what)}</div>
      <div class="gh-why"><b>Why:</b> ${esc(h.why)}</div>
      <div class="gh-notice"><b>Look for:</b> ${esc(h.notice)}</div>
    </div>`).join("");

  const visual = (g.visualGuide || []).map((v) => `
    <div class="guide-highlight">
      <div class="gh-name">${esc(v.name)}</div>
      <div class="gh-what">${esc(v.what)}</div>
      <div class="gh-why"><b>Why it matters:</b> ${esc(v.why)}</div>
      <div class="gh-notice"><b>Detail:</b> ${esc(v.detail)}</div>
    </div>`).join("");

  const food = (g.food || []).map((f) => `
    <div class="guide-food-item">
      <div class="gf-name">${esc(f.name)}</div>
      <div class="gf-desc">${esc(f.description)}</div>
      <div class="gf-special">✨ ${esc(f.special)}</div>
      <div class="gf-where">📍 ${esc(f.where)}</div>
    </div>`).join("");

  const ps = g.photoSpot || {};
  const phr = g.phrase || {};
  const mov = g.movie || {};
  const fig = g.historicalFigure || {};

  return `
    <div class="guide-content">
      ${renderGuideSection("🏛️ Today's Destination", paras(g.destination))}
      ${renderGuideSection("📖 History & Cultural Context", paras(g.history))}
      ${renderGuideSection("👀 Don't Miss These Highlights", `<div class="guide-list">${highlights}</div>`)}
      ${renderGuideSection("🤯 Fun Facts & Surprising Trivia", `<ul class="guide-bullets">${(g.funFacts || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`)}
      ${renderGuideSection("📸 The Perfect Photo Spot", `
        <p class="guide-p"><b>Best viewpoint:</b> ${esc(ps.viewpoint)}</p>
        <p class="guide-p"><b>Best time:</b> ${esc(ps.time)}</p>
        <p class="guide-p"><b>Why it's photogenic:</b> ${esc(ps.why)}</p>
        <p class="guide-p"><b>Tips:</b> ${esc(ps.tips)}</p>`)}
      ${renderGuideSection("🍴 What to Eat Today", `<div class="guide-food-list">${food}</div>`)}
      ${renderGuideSection("🗣️ Bulgarian Phrase of the Day", `
        <div class="phrase-box">
          <div class="phrase-cyr">${esc(phr.cyrillic)}</div>
          <div class="phrase-trans">${esc(phr.transliteration)}</div>
          <div class="phrase-en">"${esc(phr.english)}"</div>
          <div class="phrase-when">${esc(phr.when)}</div>
        </div>`)}
      ${renderGuideSection("🎯 Daily Challenges", `<ul class="guide-bullets challenge-list">${(g.challenges || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`)}
      ${renderGuideSection("💡 Local Insider Tips", `<ul class="guide-bullets">${(g.insiderTips || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`)}
      ${renderGuideSection("🎬 If This Place Were a Movie...", `
        <p class="guide-p"><b>Genre:</b> ${esc(mov.genre)}</p>
        <p class="guide-p"><b>Atmosphere:</b> ${esc(mov.atmosphere)}</p>
        <p class="guide-p"><b>Feels like:</b> ${esc(mov.resembles)}</p>`)}
      ${renderGuideSection("👤 Historical Figure of the Day", `
        <p class="guide-p"><b>${esc(fig.name)}</b> — ${esc(fig.who)}</p>
        <p class="guide-p">${esc(fig.why)}</p>
        <p class="guide-p"><i>Fun detail:</i> ${esc(fig.detail)}</p>`)}
      ${renderGuideSection("🔍 Visual Guide", `<div class="guide-list">${visual}</div>`)}
    </div>`;
}

/* ---------------- day detail ---------------- */

function momentClass(moment) {
  const m = moment.toLowerCase();
  if (m.includes("tarda")) return "tarda";
  if (m.includes("nit")) return "nit";
  if (m.includes("tot")) return "totdia";
  return "";
}

function renderDay(n, tab = "plan") {
  const days = S.itinerary.days;
  const day = days.find((d) => d.day === n);
  if (!day) { location.hash = "#/"; return; }

  const guide = S.travelGuide?.days?.[String(n)];
  const prev = days.find((d) => d.day === n - 1);
  const next = days.find((d) => d.day === n + 1);
  const customs = S.state.customActivities[n] || [];
  const checks = S.state.checks[n] || {};
  const entries = S.state.diary[n] || [];
  const p = dayProgress(day);
  const hotelWarn = /pendent/i.test(day.hotel.name);

  const checklistHtml = (items, isCustom) => items.map((item) => {
    const check = checks[item.id];
    return `
      <label class="check-item ${check ? "done" : ""}">
        <input type="checkbox" data-item="${esc(item.id)}" ${check ? "checked" : ""} />
        <span class="txt">${esc(item.text)}
          ${check ? `<span class="by">✔ ${esc(userName(check.by))} · ${fmtWhen(check.at)}</span>` : ""}
          ${isCustom ? `<span class="by">➕ afegit per ${esc(userName(item.by))}</span>` : ""}
        </span>
        ${isCustom ? `<button class="btn danger-ghost" data-del-activity="${esc(item.id)}" title="Esborrar">✕</button>` : ""}
      </label>`;
  }).join("");

  const diaryHtml = entries.map((e) => `
    <div class="diary-entry" data-entry="${esc(e.id)}">
      <div class="head">
        <span class="author">${esc(userName(e.by))}</span>
        <span class="when">${fmtWhen(e.at)}${e.editedAt ? " · editat" : ""}</span>
        ${e.by === S.user.username ? `
          <button class="btn danger-ghost" data-edit-entry="${esc(e.id)}">✏️ Edita</button>
          <button class="btn danger-ghost" data-del-entry="${esc(e.id)}">🗑️</button>` : ""}
      </div>
      <div class="txt">${linkify(e.text)}</div>
    </div>`).join("");

  const content = `
    <div class="day-nav">
      <a href="#/" class="back">← Tots els dies</a>
      <div style="display:flex;gap:8px">
        <a href="#/dia/${n - 1}" class="${prev ? "" : "disabled"}">← Dia ${n - 1}</a>
        <a href="#/dia/${n + 1}" class="${next ? "" : "disabled"}">Dia ${n + 1} →</a>
      </div>
    </div>

    <div class="day-hero" style="background-image:url('images/${esc(day.heroImage)}.jpg')">
      <div class="inner">
        <div class="kicker">Dia ${day.day} · ${esc(day.dateLabel)} · 📍 ${esc(day.area)}</div>
        <h1>${esc(day.title)}</h1>
        <p class="sum">${esc(day.summary)}</p>
      </div>
    </div>

    <div class="day-tabs">
      <a href="#/dia/${n}/plan" class="day-tab ${tab === "plan" ? "active" : ""}">🗓️ Plan</a>
      <a href="#/dia/${n}/guide" class="day-tab ${tab === "guide" ? "active" : ""}">📖 Travel Guide</a>
    </div>

    ${tab === "guide" ? `
    <div class="card guide-card">
      <p class="guide-intro">Your pocket guide for today — read this while you're on the ground.</p>
      ${renderDayGuide(guide)}
    </div>` : `
    <div class="day-columns">
      <div>
        <div class="card">
          <h2><span class="ico">🗓️</span> El pla del dia</h2>
          <div class="timeline">
            ${day.schedule.map((s) => `
              <div class="tl-item">
                <span class="tl-moment ${momentClass(s.moment)}">${esc(s.moment)}</span>
                <div>
                  <div class="tl-plan">${esc(s.plan)}</div>
                  ${s.details ? `<div class="tl-details">${linkify(s.details)}</div>` : ""}
                </div>
              </div>`).join("")}
          </div>
        </div>

        <div class="card">
          <h2><span class="ico">📖</span> Sobre aquest lloc</h2>
          <p class="place-info">${esc(day.placeInfo)}</p>
        </div>

        ${day.food.length ? `
        <div class="card">
          <h2><span class="ico">🍽️</span> Què hi mengem?</h2>
          <ul class="food-list">${day.food.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </div>` : ""}

        ${day.nearby.length ? `
        <div class="card">
          <h2><span class="ico">🧭</span> A prop d'aquí</h2>
          <div class="nearby-list">
            ${day.nearby.map((nb) => `
              <div class="nearby-item">
                <div class="n">${esc(nb.name)}</div>
                <div class="d">${esc(nb.desc)}</div>
              </div>`).join("")}
          </div>
        </div>` : ""}

        ${day.gallery.length > 1 ? `
        <div class="card">
          <h2><span class="ico">📷</span> Imatges</h2>
          <div class="gallery">
            ${day.gallery.map((g) => `<img src="images/${esc(g)}.jpg" alt="${esc(day.title)}" loading="lazy" data-zoom />`).join("")}
          </div>
        </div>` : ""}

        <div class="card">
          <h2><span class="ico">✍️</span> El diari del dia ${day.day}</h2>
          ${S.staticMode ? `<p class="static-note">📱 Versió web sense servidor: les notes i activitats es guarden només en aquest dispositiu.</p>` : ""}
          ${entries.length ? diaryHtml : `<p class="diary-empty">Encara no hi ha cap nota d'aquest dia. Sigues el primer a escriure-hi!</p>`}
          <form class="diary-form" id="diary-form" style="margin-top:16px">
            <textarea id="diary-text" placeholder="Com ha anat el dia? Escriu aquí els teus records, anècdotes i moments..."></textarea>
            <div class="row"><button class="btn small" type="submit">Guardar al diari 📖</button></div>
          </form>
        </div>
      </div>

      <div>
        <div class="card">
          <h2><span class="ico">🛏️</span> On dormim</h2>
          <div class="hotel-card ${hotelWarn ? "warn" : ""}">
            <div class="h-name">${esc(day.hotel.name)}</div>
            ${day.hotel.address ? `<div class="h-addr">📍 ${esc(day.hotel.address)}</div>` : ""}
            ${day.hotel.notes ? `<div class="h-notes">${esc(day.hotel.notes)}</div>` : ""}
          </div>
          <div style="margin-top:12px;font-size:.85rem;color:var(--ink-soft)">
            🚗 Cotxe aquest dia: <b>${day.car ? "Sí" : "No"}</b>
          </div>
        </div>

        <div class="card">
          <h2><span class="ico">✅</span> Activitats del dia</h2>
          <div class="checklist-progress">
            <div class="progress"><div style="width:${p.total ? (p.done / p.total) * 100 : 0}%"></div></div>
            <span class="progress-label">${p.done}/${p.total}</span>
          </div>
          <div class="check-list">
            ${checklistHtml(day.activities, false)}
            ${checklistHtml(customs, true)}
          </div>
          <form class="add-activity" id="add-activity-form">
            <input type="text" id="new-activity" placeholder="Afegir activitat o canvi..." maxlength="300" />
            <button class="btn small" type="submit">Afegir</button>
          </form>
        </div>

        ${day.tips.length ? `
        <div class="card">
          <h2><span class="ico">💡</span> Consells</h2>
          <ul class="tips-list">${day.tips.map((t) => `<li>${linkify(t)}</li>`).join("")}</ul>
        </div>` : ""}
      </div>
    </div>`}`;

  app.innerHTML = chrome("home", content);
  afterChrome();
  if (tab === "plan") wireDayEvents(n);
}

function wireDayEvents(n) {
  // checklist toggles
  app.querySelectorAll('input[type="checkbox"][data-item]').forEach((cb) => {
    cb.addEventListener("change", async () => {
      try {
        const data = await api(`/api/days/${n}/check`, {
          method: "POST",
          body: { itemId: cb.dataset.item, done: cb.checked }
        });
        S.state.checks[n] = data.checks;
        renderDay(n);
      } catch (err) { toast(err.message, true); }
    });
  });

  // add custom activity
  document.getElementById("add-activity-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("new-activity");
    if (!input.value.trim()) return;
    try {
      const data = await api(`/api/days/${n}/activities`, { method: "POST", body: { text: input.value } });
      (S.state.customActivities[n] = S.state.customActivities[n] || []).push(data.item);
      renderDay(n);
      toast("Activitat afegida ✔");
    } catch (err) { toast(err.message, true); }
  });

  // delete custom activity
  app.querySelectorAll("[data-del-activity]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("Segur que vols esborrar aquesta activitat?")) return;
      try {
        await api(`/api/days/${n}/activities/${btn.dataset.delActivity}`, { method: "DELETE" });
        S.state.customActivities[n] = (S.state.customActivities[n] || []).filter((i) => i.id !== btn.dataset.delActivity);
        if (S.state.checks[n]) delete S.state.checks[n][btn.dataset.delActivity];
        renderDay(n);
      } catch (err) { toast(err.message, true); }
    });
  });

  // diary add
  document.getElementById("diary-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ta = document.getElementById("diary-text");
    if (!ta.value.trim()) return;
    try {
      const data = await api(`/api/days/${n}/diary`, { method: "POST", body: { text: ta.value } });
      (S.state.diary[n] = S.state.diary[n] || []).push(data.entry);
      renderDay(n);
      toast("Nota guardada al diari 📖");
    } catch (err) { toast(err.message, true); }
  });

  // diary edit
  app.querySelectorAll("[data-edit-entry]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.editEntry;
      const entryEl = app.querySelector(`[data-entry="${CSS.escape(id)}"]`);
      const entry = (S.state.diary[n] || []).find((x) => x.id === id);
      if (!entry || entryEl.querySelector("textarea")) return;
      const txtEl = entryEl.querySelector(".txt");
      txtEl.innerHTML = "";
      const ta = document.createElement("textarea");
      ta.value = entry.text;
      const save = document.createElement("button");
      save.className = "btn small";
      save.style.marginTop = "8px";
      save.textContent = "Guardar canvis";
      save.addEventListener("click", async () => {
        try {
          const data = await api(`/api/days/${n}/diary/${id}`, { method: "PUT", body: { text: ta.value } });
          Object.assign(entry, data.entry);
          renderDay(n);
        } catch (err) { toast(err.message, true); }
      });
      txtEl.append(ta, save);
      ta.focus();
    });
  });

  // diary delete
  app.querySelectorAll("[data-del-entry]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Segur que vols esborrar aquesta nota del diari?")) return;
      try {
        await api(`/api/days/${n}/diary/${btn.dataset.delEntry}`, { method: "DELETE" });
        S.state.diary[n] = (S.state.diary[n] || []).filter((x) => x.id !== btn.dataset.delEntry);
        renderDay(n);
      } catch (err) { toast(err.message, true); }
    });
  });

  // lightbox
  app.querySelectorAll("[data-zoom]").forEach((img) => {
    img.addEventListener("click", () => {
      const lb = document.createElement("div");
      lb.className = "lightbox";
      lb.innerHTML = `<img src="${img.src}" alt="" />`;
      lb.addEventListener("click", () => lb.remove());
      document.body.appendChild(lb);
    });
  });
}

/* ---------------- diary page ---------------- */

function renderDiaryPage() {
  const days = S.itinerary.days;
  const sections = days.map((d) => {
    const entries = S.state.diary[d.day] || [];
    if (!entries.length) return "";
    return `
      <div class="diary-day-section">
        <div class="diary-day-head">
          <h2>Dia ${d.day} · ${esc(d.title)}</h2>
          <span class="d">${esc(d.dateLabel)}</span>
          <a href="#/dia/${d.day}">veure el dia →</a>
        </div>
        ${entries.map((e) => `
          <div class="diary-entry">
            <div class="head">
              <span class="author">${esc(userName(e.by))}</span>
              <span class="when">${fmtWhen(e.at)}</span>
            </div>
            <div class="txt">${linkify(e.text)}</div>
          </div>`).join("")}
      </div>`;
  }).join("");

  const hasAny = Object.values(S.state.diary).some((l) => l && l.length);

  const content = `
    <h1 class="page-title">📖 El nostre diari de viatge</h1>
    <p class="page-sub">Totes les notes que hem anat escrivint, dia a dia. Per afegir-ne, entra al dia corresponent.</p>
    ${S.staticMode ? `<p class="static-note" style="margin-bottom:20px">📱 Versió web sense servidor: aquí només es veuen les notes escrites des d'aquest dispositiu.</p>` : ""}
    ${hasAny ? sections : `
      <div class="card" style="text-align:center;padding:50px 20px">
        <div style="font-size:2.4rem;margin-bottom:10px">🌻</div>
        <p style="color:var(--ink-soft)">El diari encara està en blanc.<br/>Quan comenci el viatge, obriu cada dia i escriviu-hi els vostres records!</p>
        <a class="btn" style="margin-top:18px;text-decoration:none" href="#/dia/1">Anar al dia 1 →</a>
      </div>`}`;

  app.innerHTML = chrome("diari", content);
  afterChrome();
}

/* ---------------- food passport page ---------------- */

function renderFoodPassportPage() {
  const fp = S.foodPassport;
  if (!fp) {
    app.innerHTML = chrome("food", `<p class="guide-empty">Food passport loading…</p>`);
    afterChrome();
    return;
  }

  const state = foodPassportState();
  const tastedCount = Object.keys(state.tasted).filter((k) => state.tasted[k]).length;
  const total = fp.checklist.length;

  const levelBadge = (level) => {
    const cls = level === "Must Try" ? "must" : level === "Highly Recommended" ? "high" : "curio";
    return `<span class="fp-badge ${cls}">${esc(level)}</span>`;
  };

  const dishesHtml = fp.topDishes.map((d) => `
    <div class="fp-dish">
      <div class="fp-dish-head">${esc(d.name)} ${levelBadge(d.level)}</div>
      <div class="fp-meta">${esc(d.category)} · ${esc(d.region)}</div>
      <p>${esc(d.description)}</p>
      <p class="fp-ing"><b>Ingredients:</b> ${esc(d.ingredients)}</p>
    </div>`).join("");

  const dessertsHtml = fp.desserts.map((d) => `
    <div class="fp-dish"><div class="fp-dish-head">${esc(d.name)}</div><p>${esc(d.description)}</p></div>`).join("");

  const drinks = fp.drinks;
  const drinksHtml = Object.entries(drinks).map(([k, v]) => `
    <div class="fp-drink"><b>${esc(k.charAt(0).toUpperCase() + k.slice(1))}</b><p>${esc(v)}</p></div>`).join("");

  const mapLabels = {
    sofia: "Sofia", rila: "Rila", pirinBansko: "Pirin / Bansko", plovdiv: "Plovdiv",
    nessebar: "Nessebar", varna: "Varna", velikoTarnovo: "Veliko Tarnovo", koprivshtitsa: "Koprivshtitsa"
  };
  const mapHtml = Object.entries(fp.foodMap).map(([k, v]) => `
    <div class="fp-region">
      <h4>${esc(mapLabels[k] || k)}</h4>
      <p><b>Eat:</b> ${esc(v.eat)}</p>
      <p><b>Drink:</b> ${esc(v.drink)}</p>
      <p><b>Specialties:</b> ${esc(v.specialties)}</p>
    </div>`).join("");

  const checklistHtml = fp.checklist.map((item) => {
    const done = state.tasted[item.id];
    const rating = state.ratings[item.id];
    return `
      <label class="check-item fp-check ${done ? "done" : ""}">
        <input type="checkbox" data-fp-item="${esc(item.id)}" ${done ? "checked" : ""} />
        <span class="txt">${esc(item.name)} <span class="fp-cat">${esc(item.category)}</span>
          ${rating ? `<span class="by">⭐ ${rating.overall}/10</span>` : ""}
        </span>
        <button class="btn danger-ghost fp-rate-btn" data-fp-rate="${esc(item.id)}" title="Rate">⭐</button>
      </label>`;
  }).join("");

  const vocabHtml = fp.vocabulary.map((v) => `
    <div class="vocab-row">
      <span class="vocab-cyr">${esc(v.cyrillic)}</span>
      <span class="vocab-trans">${esc(v.transliteration)}</span>
      <span class="vocab-en">${esc(v.english)}</span>
    </div>`).join("");

  const content = `
    <h1 class="page-title">🍽️ Bulgarian Food Passport</h1>
    <p class="page-sub">Eat your way across Bulgaria — mark what you've tried and rate your favorites.</p>
    <div class="fp-progress card">
      <div class="fp-progress-head">
        <span><b>${tastedCount}/${total}</b> items tasted</span>
        <div class="progress" style="flex:1;max-width:200px"><div style="width:${total ? (tastedCount/total)*100 : 0}%"></div></div>
      </div>
    </div>

    <div class="card">${renderGuideSection("🍴 Introduction to Bulgarian Cuisine", paras(fp.introduction))}</div>

    <div class="card">
      <h2 class="guide-h2">🥇 Top 20 Must-Try Dishes</h2>
      <div class="fp-dish-grid">${dishesHtml}</div>
    </div>

    <div class="card">
      <h2 class="guide-h2">🍰 Traditional Desserts</h2>
      ${dessertsHtml}
    </div>

    <div class="card">
      <h2 class="guide-h2">🍷 Drinks of Bulgaria</h2>
      <div class="fp-drinks">${drinksHtml}</div>
    </div>

    <div class="card">
      <h2 class="guide-h2">🗺️ Food Map of Bulgaria</h2>
      <div class="fp-map-grid">${mapHtml}</div>
    </div>

    <div class="card">
      <h2 class="guide-h2">🎯 Food Challenges</h2>
      <ul class="guide-bullets challenge-list">${fp.challenges.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
    </div>

    <div class="card">
      <h2 class="guide-h2">🏆 Food Passport Checklist</h2>
      <p class="guide-intro">Mark each dish or drink as you try it. Tap ⭐ to rate (1–10).</p>
      <div class="check-list">${checklistHtml}</div>
    </div>

    <div class="card">
      <h2 class="guide-h2">⭐ Rating System</h2>
      <p class="guide-p">Rate each item on: ${fp.ratingSystem.criteria.join(", ")} (1–10 each).</p>
      <p class="guide-p">${esc(fp.ratingSystem.scale)}</p>
      <p class="guide-p"><b>Overall score:</b> ${esc(fp.ratingSystem.formula)}</p>
    </div>

    <div class="card">
      <h2 class="guide-h2">🥇 End-of-Trip Food Awards</h2>
      <ul class="guide-bullets">${fp.endOfTripAwards.map((a) => `<li><b>${esc(a.category)}:</b> ${esc(a.description)}</li>`).join("")}</ul>
    </div>

    <div class="card">
      <h2 class="guide-h2">🤯 Food Trivia</h2>
      <ul class="guide-bullets">${fp.trivia.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    </div>

    <div class="card">
      <h2 class="guide-h2">🗣️ Restaurant Survival Vocabulary</h2>
      <div class="vocab-table">${vocabHtml}</div>
    </div>`;

  app.innerHTML = chrome("food", content);
  afterChrome();
  wireFoodPassportEvents();
}

function wireFoodPassportEvents() {
  app.querySelectorAll("[data-fp-item]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const st = foodPassportState();
      if (cb.checked) st.tasted[cb.dataset.fpItem] = { at: new Date().toISOString(), by: S.user?.username };
      else delete st.tasted[cb.dataset.fpItem];
      saveFoodPassportState(st);
      renderFoodPassportPage();
    });
  });

  app.querySelectorAll("[data-fp-rate]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.dataset.fpRate;
      const item = S.foodPassport.checklist.find((x) => x.id === id);
      const st = foodPassportState();
      const cur = st.ratings[id] || {};
      const taste = prompt(`Rate "${item?.name}" — Taste (1-10):`, cur.taste || "8");
      if (taste === null) return;
      const auth = prompt("Authenticity (1-10):", cur.authenticity || "8");
      if (auth === null) return;
      const val = prompt("Value for money (1-10):", cur.value || "8");
      if (val === null) return;
      const t = +taste, a = +auth, v = +val;
      const overall = Math.round(((t + a + v) / 3) * 10) / 10;
      st.ratings[id] = { taste: t, authenticity: a, value: v, overall, at: new Date().toISOString() };
      st.tasted[id] = st.tasted[id] || { at: new Date().toISOString(), by: S.user?.username };
      saveFoodPassportState(st);
      toast(`Rated ${overall}/10 ⭐`);
      renderFoodPassportPage();
    });
  });
}

/* ---------------- info page ---------------- */

function renderInfoPage() {
  const t = S.itinerary.trip;
  const credits = Object.entries(S.imageCredits);

  const content = `
    <h1 class="page-title">ℹ️ Informació pràctica</h1>
    <p class="page-sub">Vols, cotxe i altres coses a tenir a mà durant el viatge.</p>
    <div class="info-grid">
      <div class="card">
        <h2><span class="ico">✈️</span> Vols</h2>
        <div class="info-item"><b>Anada</b>${esc(t.flightOut)}</div>
        <div class="info-item"><b>Tornada</b>${esc(t.flightBack)}</div>
      </div>
      <div class="card">
        <h2><span class="ico">🚗</span> Cotxe i transport</h2>
        <div class="info-item"><b>Cotxe de lloguer</b>${esc(t.car)}</div>
        <div class="info-item"><b>Recollida</b>${esc(t.carPickup)}</div>
        <div class="info-item"><b>Taxis</b>${esc(t.taxis)}</div>
      </div>
      <div class="card">
        <h2><span class="ico">🔀</span> Pla B</h2>
        <div class="info-item">${esc(t.alternative)}</div>
      </div>
      <div class="card">
        <h2><span class="ico">🇧🇬</span> Bàsics de Bulgària</h2>
        <div class="info-item"><b>Moneda</b>Lev búlgar (BGN) · 1 € ≈ 1,96 BGN</div>
        <div class="info-item"><b>Hora</b>1 hora més que a Barcelona</div>
        <div class="info-item"><b>Emergències</b>112 (com a tota la UE)</div>
        <div class="info-item"><b>Curiositat</b>Els búlgars mouen el cap al revés: assentir pot voler dir «no»!</div>
        <div class="info-item"><b>Gràcies</b>«Blagodarya» (благодаря) o el més fàcil: «mersí»</div>
      </div>
    </div>
    <details class="credits">
      <summary>Crèdits de les imatges (Wikimedia Commons)</summary>
      <ul>
        ${credits.map(([k, c]) => `
          <li><b>${esc(k)}</b>: ${esc(c.author || "autor desconegut")} · ${esc(c.license)} ·
          <a href="${esc(c.source)}" target="_blank" rel="noopener">font</a></li>`).join("")}
      </ul>
    </details>`;

  app.innerHTML = chrome("info", content);
  afterChrome();
}

/* ---------------- boot ---------------- */

async function bootstrap() {
  try {
    const res = await fetch("api/bootstrap", { headers: { "Content-Type": "application/json" } });
    if (res.status === 404) {
      // No hi ha servidor (p. ex. GitHub Pages) → mode estàtic al navegador
      await enterStaticMode();
      return;
    }
    if (res.ok) {
      const data = await res.json();
      S.user = data.user;
      S.users = data.users;
      S.itinerary = data.itinerary;
      S.travelGuide = data.travelGuide;
      S.foodPassport = data.foodPassport;
      S.imageCredits = data.imageCredits;
      S.state = data.state;
    }
    render(); // si 401: pantalla de login del mode servidor
  } catch {
    render();
  }
}

bootstrap();
