/* Bulgària 2026 · App de viatge */

const app = document.getElementById("app");

const S = {
  user: null,
  users: [],
  itinerary: null,
  guide: { days: {} },
  food: null,
  imageCredits: {},
  staticMode: false,
  staticUsers: null,
  store: null,
  checks: {},
  customActivities: {},
  diary: {},
  foodState: {},
  foodFilters: { region: "", type: "", level: "", sort: "default", q: "" },
  selectedLoginUser: null
};

const SESSION_KEY = "bulgaria2026-user";

const TYPE_LABELS = {
  entrant: "Entrant", principal: "Plat principal", postre: "Postre",
  beguda: "Beguda", esmorzar: "Esmorzar", snack: "Snack"
};
const TYPE_ICONS = {
  entrant: "🥗", principal: "🍽️", postre: "🍰", beguda: "🍷", esmorzar: "🥐", snack: "🍿"
};

/* ---------------- utils ---------------- */

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+|[a-z0-9.-]+\.(?:com|cat|org|net)\/[^\s<]+)/gi, (m) => {
    const href = m.startsWith("http") ? m : "https://" + m;
    const label = m.length > 40 ? m.slice(0, 38) + "…" : m;
    return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  });
}

function fmtWhen(iso) {
  if (!iso) return "";
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

function userName(username) {
  const u = S.users.find((x) => x.username === username);
  return u ? `${u.emoji} ${u.displayName}` : username || "";
}

function currentUserLabel() {
  return S.user ? `${S.user.emoji} ${S.user.displayName}` : "";
}

function dayGuide(n) {
  return S.guide?.days?.[String(n)] || null;
}

/** Activitats + reptes del guia + activitats afegides = tot el que es pot marcar. */
function dayCheckItems(day) {
  const g = dayGuide(day.day);
  return [
    ...(day.activities || []),
    ...((g?.challenges) || []).map((c) => ({ id: c.id, text: c.text, type: "challenge" })),
    ...(S.customActivities[day.day] || [])
  ];
}

function dayProgress(day) {
  const items = dayCheckItems(day);
  const checks = S.checks[day.day] || {};
  return { done: items.filter((i) => checks[i.id]).length, total: items.length };
}

function todayDayNumber() {
  const today = new Date().toISOString().slice(0, 10);
  const d = S.itinerary.days.find((x) => x.date === today);
  return d ? d.day : null;
}

/* ---------------- login ---------------- */

async function doLogin(username, password) {
  if (S.staticMode) {
    const u = S.staticUsers[String(username || "").toLowerCase().trim()];
    if (!u) throw new Error("Usuari o contrasenya incorrectes");
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${u.salt}:${password || ""}`));
    const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hash !== u.hash) throw new Error("Usuari o contrasenya incorrectes");
    localStorage.setItem(SESSION_KEY, username);
    S.user = { username, displayName: u.displayName, emoji: u.emoji };
    return;
  }
  const res = await fetch("api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de connexió");
  S.user = data.user;
}

async function doLogout() {
  if (S.staticMode) localStorage.removeItem(SESSION_KEY);
  else await fetch("api/logout", { method: "POST" });
  S.user = null;
  S.diary = {}; S.foodState = {};
  location.hash = "#/";
  render();
}

function renderLogin() {
  const users = S.users.length ? S.users : [
    { username: "viatger1", displayName: "Viatger 1", emoji: "🌻" },
    { username: "viatger2", displayName: "Viatger 2", emoji: "🌊" }
  ];
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
      await doLogin(S.selectedLoginUser, document.getElementById("password").value);
      await loadUserData();
      render();
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
          <a href="#/food" class="${active === "food" ? "active" : ""}">Passaport 🍴</a>
          <a href="#/diari" class="${active === "diari" ? "active" : ""}">El meu diari</a>
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
  document.getElementById("logout-btn")?.addEventListener("click", doLogout);
}

/* ---------------- overview ---------------- */

function renderOverview() {
  const { trip, days } = S.itinerary;
  const today = todayDayNumber();
  const diffDays = Math.ceil((new Date("2026-08-03T06:00:00") - new Date()) / 86400000);
  const totalDone = days.reduce((s, d) => s + dayProgress(d).done, 0);
  const totalItems = days.reduce((s, d) => s + dayProgress(d).total, 0);

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
        <div class="countdown">
          ${diffDays > 0 ? `<div class="unit"><div class="num">${diffDays}</div><div class="lbl">dies per marxar</div></div>` : ""}
          <div class="unit"><div class="num">13</div><div class="lbl">dies de ruta</div></div>
          <div class="unit"><div class="num">${totalDone}/${totalItems}</div><div class="lbl">fetes</div></div>
        </div>
      </div>
    </div>

    <h2 class="page-title" style="font-size:1.6rem">El viatge, dia a dia</h2>
    <p class="page-sub">Toca un dia per veure el pla, la guia i el teu diari.</p>
    <div class="days-grid">
      ${days.map((d) => {
        const p = dayProgress(d);
        const hasDiary = (S.diary[d.day] || []).length > 0;
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
              ${hasDiary ? '<span class="diary-dot" title="Tens notes al diari">📖</span>' : ""}
            </div>
          </div>
        </a>`;
      }).join("")}
    </div>`;

  app.innerHTML = chrome("home", content);
  afterChrome();
}

/* ---------------- guia del dia ---------------- */

function momentClass(moment) {
  const m = (moment || "").toLowerCase();
  if (m.includes("tarda")) return "tarda";
  if (m.includes("nit")) return "nit";
  if (m.includes("tot")) return "totdia";
  return "";
}

function section(icon, title, inner, open = false, badge = "") {
  return `<details class="gsec" ${open ? "open" : ""}>
    <summary><span class="gsec-ico">${icon}</span><span class="gsec-title">${esc(title)}</span>
      ${badge ? `<span class="gsec-badge">${badge}</span>` : ""}
      <span class="gsec-arrow">›</span></summary>
    <div class="gsec-body">${inner}</div>
  </details>`;
}

function paras(arr) {
  return (arr || []).map((p) => `<p class="gp">${esc(p)}</p>`).join("");
}

function renderGuide(day) {
  const g = dayGuide(day.day);
  if (!g) return `<div class="card"><p class="empty-note">Encara no hi ha guia per a aquest dia.</p></div>`;

  const checks = S.checks[day.day] || {};
  const chDone = (g.challenges || []).filter((c) => checks[c.id]).length;
  const chTotal = (g.challenges || []).length;

  const cards = (list, fields) => `<div class="ilist">${(list || []).map((h) => `
    <div class="icard">
      <div class="ic-name">${esc(h.name)}</div>
      ${fields.map(([k, lbl]) => h[k] ? `<div class="ic-row">${lbl ? `<b>${lbl}</b> ` : ""}${esc(h[k])}</div>` : "").join("")}
    </div>`).join("")}</div>`;

  const bullets = (arr, cls = "") => `<ul class="gbul ${cls}">${(arr || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`;

  const foodHtml = `<div class="gfood">${(g.food || []).map((f) => `
    <div class="gfood-item">
      <div class="gf-name">${esc(f.name)}</div>
      <div class="gf-row">${esc(f.description)}</div>
      ${f.special ? `<div class="gf-row alt">✨ ${esc(f.special)}</div>` : ""}
      ${f.where ? `<div class="gf-row alt">📍 ${esc(f.where)}</div>` : ""}
    </div>`).join("")}</div>`;

  const phr = g.phrase || {};
  const fig = g.historicalFigure || {};

  const challengeHtml = `
    <div class="checklist-progress">
      <div class="progress"><div style="width:${chTotal ? (chDone / chTotal) * 100 : 0}%"></div></div>
      <span class="progress-label">${chDone}/${chTotal}</span>
    </div>
    <div class="check-list">
      ${(g.challenges || []).map((c) => {
        const ck = checks[c.id];
        return `<label class="check-item ${ck ? "done" : ""}">
          <input type="checkbox" data-item="${esc(c.id)}" ${ck ? "checked" : ""} />
          <span class="txt">${esc(c.text)}
            ${ck ? `<span class="by">✔ ${esc(userName(ck.by))} · ${fmtWhen(ck.at)}</span>` : ""}
          </span>
        </label>`;
      }).join("")}
    </div>`;

  return `
    ${section("🏛️", "El lloc d'avui", paras(g.destination), true)}
    ${section("🎯", "Reptes del dia", challengeHtml, true, `${chDone}/${chTotal}`)}
    ${section("👀", "No et pots perdre", cards(g.highlights, [["what", ""], ["why", "Per què:"], ["notice", "Fixa't en:"]]), false, String((g.highlights || []).length))}
    ${section("📖", "Història i context", paras(g.history))}
    ${section("🤯", "Curiositats", bullets(g.funFacts), false, String((g.funFacts || []).length))}
    ${section("🍴", "Què tastar avui", foodHtml, false, String((g.food || []).length))}
    ${section("🗣️", "Frase del dia", `
      <div class="phrase-box">
        <div class="phrase-cyr">${esc(phr.cyrillic)}</div>
        <div class="phrase-trans">${esc(phr.transliteration)}</div>
        <div class="phrase-ca">«${esc(phr.catalan)}»</div>
        <div class="phrase-when">${esc(phr.when)}</div>
      </div>`)}
    ${section("💡", "Consells locals", bullets(g.insiderTips, "tips"), false, String((g.insiderTips || []).length))}
    ${section("👤", "Personatge del dia", `
      <div class="figure-box">
        <div class="fig-name">${esc(fig.name)}</div>
        <div class="gp">${esc(fig.who)}</div>
        <div class="gp">${esc(fig.why)}</div>
        ${fig.detail ? `<div class="fig-detail">💫 ${esc(fig.detail)}</div>` : ""}
      </div>`)}
    ${section("🔍", "Guia visual", cards(g.visualGuide, [["what", ""], ["why", "Importa perquè:"], ["detail", "Mira:"]]), false, String((g.visualGuide || []).length))}`;
}

/* ---------------- detall del dia ---------------- */

function renderDay(n, tab) {
  const days = S.itinerary.days;
  const day = days.find((d) => d.day === n);
  if (!day) { location.hash = "#/"; return; }
  tab = tab || "pla";

  const prev = days.find((d) => d.day === n - 1);
  const next = days.find((d) => d.day === n + 1);
  const checks = S.checks[n] || {};
  const customs = S.customActivities[n] || [];
  const entries = S.diary[n] || [];
  const p = dayProgress(day);
  const hotelWarn = /pendent/i.test(day.hotel?.name || "");
  const ci = day.culturalInfo;

  const activityHtml = (items, isCustom) => items.map((item) => {
    const ck = checks[item.id];
    const isFun = item.type === "fun";
    return `<label class="check-item ${ck ? "done" : ""}">
      <input type="checkbox" data-item="${esc(item.id)}" ${ck ? "checked" : ""} />
      <span class="txt">${isFun ? "🎲 " : ""}${esc(item.text)}
        ${ck ? `<span class="by">✔ ${esc(userName(ck.by))} · ${fmtWhen(ck.at)}</span>` : ""}
        ${isCustom ? `<span class="by">➕ ${esc(userName(item.by))}</span>` : ""}
      </span>
      ${isCustom ? `<button class="btn danger-ghost" data-del-activity="${esc(item.id)}" title="Esborrar">✕</button>` : ""}
    </label>`;
  }).join("");

  const planTab = `
    <div class="day-columns">
      <div>
        <div class="card">
          <h2><span class="ico">🗓️</span> El pla del dia</h2>
          <div class="timeline">
            ${(day.schedule || []).map((s) => `
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
          <h2><span class="ico">📍</span> Sobre aquest lloc</h2>
          <p class="place-info">${esc(day.placeInfo)}</p>
          ${ci ? `
            ${ci.history ? `<div class="ci-block"><b>Història</b><p>${esc(ci.history)}</p></div>` : ""}
            ${(ci.curiosities || []).length ? `<div class="ci-block"><b>Curiositats</b>
              <ul class="gbul">${ci.curiosities.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
          ` : ""}
        </div>

        ${(day.food || []).length ? `
        <div class="card">
          <h2><span class="ico">🍽️</span> Què hi mengem?</h2>
          <ul class="food-list">${day.food.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </div>` : ""}

        ${(day.nearby || []).length ? `
        <div class="card">
          <h2><span class="ico">🧭</span> A prop d'aquí</h2>
          <div class="nearby-list">
            ${day.nearby.map((nb) => `
              <div class="nearby-item"><div class="n">${esc(nb.name)}</div><div class="d">${esc(nb.desc)}</div></div>`).join("")}
          </div>
        </div>` : ""}

        ${(day.gallery || []).length > 1 ? `
        <div class="card">
          <h2><span class="ico">📷</span> Imatges</h2>
          <div class="gallery">
            ${day.gallery.map((g) => `<img src="images/${esc(g)}.jpg" alt="${esc(day.title)}" loading="lazy" data-zoom />`).join("")}
          </div>
        </div>` : ""}
      </div>

      <div>
        <div class="card">
          <h2><span class="ico">🛏️</span> On dormim</h2>
          <div class="hotel-card ${hotelWarn ? "warn" : ""}">
            <div class="h-name">${esc(day.hotel?.name)}</div>
            ${day.hotel?.address ? `<div class="h-addr">📍 ${esc(day.hotel.address)}</div>` : ""}
            ${day.hotel?.notes ? `<div class="h-notes">${esc(day.hotel.notes)}</div>` : ""}
          </div>
          <div class="car-line">🚗 Cotxe aquest dia: <b>${day.car ? "Sí" : "No"}</b></div>
        </div>

        <div class="card">
          <h2><span class="ico">✅</span> Activitats</h2>
          <div class="checklist-progress">
            <div class="progress"><div style="width:${p.total ? (p.done / p.total) * 100 : 0}%"></div></div>
            <span class="progress-label">${p.done}/${p.total}</span>
          </div>
          <div class="check-list">
            ${activityHtml(day.activities || [], false)}
            ${activityHtml(customs, true)}
          </div>
          <form class="add-activity" id="add-activity-form">
            <input type="text" id="new-activity" placeholder="Afegir activitat o canvi..." maxlength="300" />
            <button class="btn small" type="submit">Afegir</button>
          </form>
        </div>

        ${(day.tips || []).length ? `
        <div class="card">
          <h2><span class="ico">💡</span> Consells</h2>
          <ul class="tips-list">${day.tips.map((t) => `<li>${linkify(t)}</li>`).join("")}</ul>
        </div>` : ""}
      </div>
    </div>`;

  const guideTab = `<div class="guide-wrap">
    <p class="guide-intro">La teva guia de butxaca per avui. Toca cada secció per obrir-la.</p>
    ${renderGuide(day)}
  </div>`;

  const diaryTab = `
    <div class="card diary-card">
      <h2><span class="ico">✍️</span> El meu diari · dia ${day.day}</h2>
      <p class="private-note">🔒 Privat: només tu veus aquestes notes.</p>
      <div id="diary-list">${diaryEntriesHtml(entries)}</div>
      ${diaryFormHtml(day.day)}
    </div>`;

  const content = `
    <div class="day-nav">
      <a href="#/" class="back">← Tots els dies</a>
      <div class="day-nav-arrows">
        <a href="#/dia/${n - 1}${tab === "pla" ? "" : "/" + tab}" class="${prev ? "" : "disabled"}">←</a>
        <a href="#/dia/${n + 1}${tab === "pla" ? "" : "/" + tab}" class="${next ? "" : "disabled"}">→</a>
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
      <a href="#/dia/${n}" class="day-tab ${tab === "pla" ? "active" : ""}">🗓️ Pla</a>
      <a href="#/dia/${n}/guia" class="day-tab ${tab === "guia" ? "active" : ""}">📖 Guia</a>
      <a href="#/dia/${n}/diari" class="day-tab ${tab === "diari" ? "active" : ""}">✍️ Diari${entries.length ? ` (${entries.length})` : ""}</a>
    </div>

    ${tab === "guia" ? guideTab : tab === "diari" ? diaryTab : planTab}`;

  app.innerHTML = chrome("home", content);
  afterChrome();
  wireChecks(n);
  if (tab === "pla") wirePlanTab(n);
  if (tab === "diari") wireDiaryForm(n);
  wireZoom();
}

/* ---------------- diari ---------------- */

function diaryEntriesHtml(entries) {
  if (!entries.length) {
    return `<p class="empty-note">Encara no hi ha cap nota d'aquest dia. Comença a escriure!</p>`;
  }
  return entries.map((e) => `
    <div class="diary-entry" data-entry="${esc(e.id)}">
      <div class="head">
        <span class="when">${fmtWhen(e.createdAt)}${e.edited ? " · editat" : ""}</span>
        <button class="btn danger-ghost" data-edit-entry="${esc(e.id)}">✏️</button>
        <button class="btn danger-ghost" data-del-entry="${esc(e.id)}">🗑️</button>
      </div>
      <div class="txt">${linkify(e.text)}</div>
      ${(e.images || []).length ? `<div class="diary-imgs">
        ${e.images.map((src) => `<img src="${src}" alt="" data-zoom />`).join("")}
      </div>` : ""}
    </div>`).join("");
}

function diaryFormHtml(day) {
  return `
    <form class="diary-form" id="diary-form" data-day="${day}">
      <textarea id="diary-text" placeholder="Com ha anat el dia? Escriu els teus records, anècdotes i moments..."></textarea>
      <div class="diary-form-row">
        <label class="btn ghost small photo-btn">
          📷 Afegir fotos
          <input type="file" id="diary-images" accept="image/*" multiple hidden />
        </label>
        <div id="img-preview" class="img-preview"></div>
        <button class="btn small" type="submit">Guardar 📖</button>
      </div>
    </form>`;
}

let pendingImages = [];

function wireDiaryForm(day) {
  pendingImages = [];
  const form = document.getElementById("diary-form");
  if (!form) return;
  const fileInput = document.getElementById("diary-images");
  const preview = document.getElementById("img-preview");

  const renderPreview = () => {
    preview.innerHTML = pendingImages.map((src, i) =>
      `<span class="prev-thumb"><img src="${src}" alt="" /><button type="button" data-rm="${i}">✕</button></span>`).join("");
    preview.querySelectorAll("[data-rm]").forEach((b) => {
      b.addEventListener("click", () => {
        pendingImages.splice(Number(b.dataset.rm), 1);
        renderPreview();
      });
    });
  };

  fileInput?.addEventListener("change", async () => {
    const files = [...fileInput.files];
    fileInput.value = "";
    for (const f of files) {
      if (pendingImages.length >= 6) { toast("Màxim 6 fotos per nota", true); break; }
      try {
        pendingImages.push(await TripStore.fileToCompressedDataUrl(f));
      } catch { toast("No s'ha pogut llegir la imatge", true); }
    }
    renderPreview();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ta = document.getElementById("diary-text");
    const text = ta.value.trim();
    if (!text && !pendingImages.length) { toast("Escriu alguna cosa o afegeix una foto", true); return; }
    try {
      const entry = await S.store.addDiary(day, text, pendingImages);
      (S.diary[day] = S.diary[day] || []).push(entry);
      pendingImages = [];
      renderDay(day, "diari");
      toast("Nota guardada 📖");
    } catch (err) { toast(err.message, true); }
  });

  wireDiaryEntryActions(day);
}

function wireDiaryEntryActions(day) {
  app.querySelectorAll("[data-del-entry]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Segur que vols esborrar aquesta nota?")) return;
      try {
        await S.store.deleteDiary(btn.dataset.delEntry);
        S.diary[day] = (S.diary[day] || []).filter((x) => x.id !== btn.dataset.delEntry);
        renderDay(day, "diari");
        toast("Nota esborrada");
      } catch (err) { toast(err.message, true); }
    });
  });

  app.querySelectorAll("[data-edit-entry]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.editEntry;
      const wrapEl = app.querySelector(`[data-entry="${CSS.escape(id)}"]`);
      const entry = (S.diary[day] || []).find((x) => x.id === id);
      if (!entry || wrapEl.querySelector("textarea")) return;
      const txtEl = wrapEl.querySelector(".txt");
      txtEl.innerHTML = "";
      const ta = document.createElement("textarea");
      ta.className = "edit-area";
      ta.value = entry.text;
      const save = document.createElement("button");
      save.className = "btn small";
      save.textContent = "Guardar canvis";
      save.addEventListener("click", async () => {
        try {
          const upd = await S.store.updateDiary(id, ta.value.trim(), entry.images);
          Object.assign(entry, upd);
          renderDay(day, "diari");
        } catch (err) { toast(err.message, true); }
      });
      txtEl.append(ta, save);
      ta.focus();
    });
  });
}

async function renderDiaryPage() {
  const days = S.itinerary.days;
  const total = Object.values(S.diary).reduce((s, l) => s + (l?.length || 0), 0);
  const withPhotos = Object.values(S.diary).flat().filter((e) => (e.images || []).length).length;
  const daysWritten = Object.keys(S.diary).filter((k) => S.diary[k]?.length).length;

  const sections = days.map((d) => {
    const entries = S.diary[d.day] || [];
    if (!entries.length) return "";
    return `
      <div class="diary-day-section">
        <div class="diary-day-head">
          <h2>Dia ${d.day} · ${esc(d.title)}</h2>
          <span class="d">${esc(d.dateLabel)}</span>
          <a href="#/dia/${d.day}/diari">escriure-hi →</a>
        </div>
        ${entries.map((e) => `
          <div class="diary-entry">
            <div class="head"><span class="when">${fmtWhen(e.createdAt)}${e.edited ? " · editat" : ""}</span></div>
            <div class="txt">${linkify(e.text)}</div>
            ${(e.images || []).length ? `<div class="diary-imgs">
              ${e.images.map((src) => `<img src="${src}" alt="" data-zoom />`).join("")}</div>` : ""}
          </div>`).join("")}
      </div>`;
  }).join("");

  const content = `
    <h1 class="page-title">📖 El meu diari de viatge</h1>
    <p class="page-sub">Les teves notes, dia a dia. 🔒 Privades: l'altre viatger no les veu.</p>

    <div class="card export-bar">
      <div class="export-stats">
        <span><b>${total}</b> ${total === 1 ? "nota" : "notes"}</span>
        <span><b>${withPhotos}</b> amb fotos</span>
        <span><b>${daysWritten}</b> ${daysWritten === 1 ? "dia escrit" : "dies escrits"}</span>
      </div>
      <div class="export-actions">
        <button class="btn small" id="exp-pdf">📄 Descarregar PDF</button>
        <button class="btn ghost small" id="exp-word">📝 Descarregar Word</button>
        <button class="btn ghost small" id="exp-cal">🗓️ Itinerari en PDF</button>
      </div>
    </div>

    ${total ? sections : `
      <div class="card" style="text-align:center;padding:50px 20px">
        <div style="font-size:2.4rem;margin-bottom:10px">🌻</div>
        <p style="color:var(--ink-soft)">El teu diari encara està en blanc.<br/>Obre un dia i escriu-hi els teus records!</p>
        <a class="btn" style="margin-top:18px;text-decoration:none" href="#/dia/1/diari">Anar al dia 1 →</a>
      </div>`}`;

  app.innerHTML = chrome("diari", content);
  afterChrome();
  wireZoom();

  const label = currentUserLabel();
  document.getElementById("exp-pdf")?.addEventListener("click", () => {
    TripExport.toPdf("Diari de viatge · Bulgària 2026", label,
      TripExport.diaryBody(days, S.diary, label, fmtWhen));
  });
  document.getElementById("exp-word")?.addEventListener("click", () => {
    TripExport.toWord("Diari de viatge · Bulgària 2026", label,
      TripExport.diaryBody(days, S.diary, label, fmtWhen), "diari-bulgaria-2026.doc");
    toast("Descarregant Word…");
  });
  document.getElementById("exp-cal")?.addEventListener("click", () => {
    TripExport.toPdf("Itinerari · Bulgària 2026", S.itinerary.trip.subtitle || "",
      TripExport.itineraryBody(S.itinerary.trip, days));
  });
}

/* ---------------- passaport gastronòmic ---------------- */

function foodStars(itemId, stars, interactive) {
  return `<span class="stars ${interactive ? "interactive" : ""}" ${interactive ? `data-stars-for="${esc(itemId)}"` : ""}>
    ${[1, 2, 3, 4, 5].map((n) => `<span class="star ${n <= stars ? "on" : ""}" ${interactive ? `data-star="${n}"` : ""}>★</span>`).join("")}
  </span>`;
}

function filteredFoodItems() {
  const f = S.foodFilters;
  let items = [...(S.food?.items || [])];
  if (f.region) items = items.filter((i) => i.region === f.region || (i.cities || []).includes(f.region));
  if (f.type) items = items.filter((i) => i.type === f.type);
  if (f.level) items = items.filter((i) => i.level === f.level);
  if (f.q) {
    const q = f.q.toLowerCase();
    items = items.filter((i) => (i.name + " " + i.nameBg + " " + i.summary + " " + i.region).toLowerCase().includes(q));
  }
  const st = (id) => S.foodState[id] || {};
  if (f.sort === "stars") items.sort((a, b) => (st(b.id).stars || 0) - (st(a.id).stars || 0) || a.name.localeCompare(b.name));
  else if (f.sort === "starsAsc") items.sort((a, b) => (st(a.id).stars || 0) - (st(b.id).stars || 0) || a.name.localeCompare(b.name));
  else if (f.sort === "name") items.sort((a, b) => a.name.localeCompare(b.name));
  else if (f.sort === "tasted") items.sort((a, b) => (st(b.id).tasted ? 1 : 0) - (st(a.id).tasted ? 1 : 0));
  return items;
}

function renderFoodPage() {
  const fp = S.food;
  if (!fp) {
    app.innerHTML = chrome("food", `<p class="empty-note">Carregant el passaport…</p>`);
    afterChrome();
    return;
  }
  const items = fp.items || [];
  const tasted = items.filter((i) => S.foodState[i.id]?.tasted);
  const rated = tasted.filter((i) => (S.foodState[i.id]?.stars || 0) > 0);
  const avg = rated.length ? (rated.reduce((s, i) => s + S.foodState[i.id].stars, 0) / rated.length).toFixed(1) : "—";
  const shown = filteredFoodItems();

  const regions = [...new Set(items.map((i) => i.region))].sort();
  const cities = [...new Set(items.flatMap((i) => i.cities || []))].sort();
  const f = S.foodFilters;

  const content = `
    <h1 class="page-title">🍽️ Passaport gastronòmic</h1>
    <p class="page-sub">Menja't Bulgària. 🔒 Les teves notes i puntuacions són privades.</p>

    <div class="card fp-top">
      <div class="fp-stats">
        <div class="fp-stat"><div class="n">${tasted.length}<span>/${items.length}</span></div><div class="l">tastats</div></div>
        <div class="fp-stat"><div class="n">${avg}</div><div class="l">nota mitjana</div></div>
        <div class="fp-stat"><div class="n">${Math.round(items.length ? (tasted.length / items.length) * 100 : 0)}%</div><div class="l">del passaport</div></div>
      </div>
      <div class="progress big"><div style="width:${items.length ? (tasted.length / items.length) * 100 : 0}%"></div></div>
      <div class="export-actions">
        <button class="btn small" id="fp-pdf">📄 PDF per compartir</button>
        <button class="btn ghost small" id="fp-word">📝 Word</button>
      </div>
    </div>

    <div class="card filters">
      <input type="search" id="f-q" class="f-input" placeholder="🔍 Buscar un plat..." value="${esc(f.q)}" />
      <div class="filter-row">
        <select id="f-type" class="f-input">
          <option value="">Tots els tipus</option>
          ${Object.entries(TYPE_LABELS).map(([k, v]) =>
            `<option value="${k}" ${f.type === k ? "selected" : ""}>${TYPE_ICONS[k]} ${v}</option>`).join("")}
        </select>
        <select id="f-region" class="f-input">
          <option value="">Tota Bulgària</option>
          <optgroup label="Regió">
            ${regions.map((r) => `<option value="${esc(r)}" ${f.region === r ? "selected" : ""}>${esc(r)}</option>`).join("")}
          </optgroup>
          <optgroup label="Ciutat">
            ${cities.map((c) => `<option value="${esc(c)}" ${f.region === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
          </optgroup>
        </select>
        <select id="f-sort" class="f-input">
          <option value="default" ${f.sort === "default" ? "selected" : ""}>Ordre del passaport</option>
          <option value="stars" ${f.sort === "stars" ? "selected" : ""}>⭐ Millor puntuats</option>
          <option value="starsAsc" ${f.sort === "starsAsc" ? "selected" : ""}>⭐ Pitjor puntuats</option>
          <option value="tasted" ${f.sort === "tasted" ? "selected" : ""}>✔ Tastats primer</option>
          <option value="name" ${f.sort === "name" ? "selected" : ""}>A–Z</option>
        </select>
      </div>
      <div class="filter-row chips">
        ${["Imprescindible", "Molt recomanable", "Curiositat"].map((l) =>
          `<button class="chip ${f.level === l ? "on" : ""}" data-level="${esc(l)}">${esc(l)}</button>`).join("")}
        ${(f.q || f.type || f.region || f.level) ? `<button class="chip clear" id="f-clear">✕ Netejar</button>` : ""}
      </div>
      <div class="filter-count">${shown.length} ${shown.length === 1 ? "plat" : "plats"}</div>
    </div>

    <div class="fp-grid">
      ${shown.map((i) => {
        const st = S.foodState[i.id] || {};
        return `
        <a class="fp-card ${st.tasted ? "tasted" : ""}" href="#/food/${esc(i.id)}">
          <div class="fp-card-img" style="background-image:url('images/food/${esc(i.image)}.jpg')">
            ${st.tasted ? `<span class="fp-tick">✔ Tastat</span>` : ""}
            <span class="fp-type">${TYPE_ICONS[i.type] || "🍴"} ${esc(TYPE_LABELS[i.type] || i.type)}</span>
          </div>
          <div class="fp-card-body">
            <div class="fp-card-name">${esc(i.name)}</div>
            <div class="fp-card-region">📍 ${esc(i.region)}</div>
            <p class="fp-card-sum">${esc(i.summary)}</p>
            <div class="fp-card-foot">
              ${foodStars(i.id, st.stars || 0, false)}
              <span class="fp-level ${i.level === "Imprescindible" ? "must" : i.level === "Molt recomanable" ? "high" : "curio"}">${esc(i.level)}</span>
            </div>
            ${st.notes ? `<div class="fp-card-note">📝 ${esc(st.notes.slice(0, 60))}${st.notes.length > 60 ? "…" : ""}</div>` : ""}
          </div>
        </a>`;
      }).join("")}
    </div>
    ${shown.length === 0 ? `<p class="empty-note">Cap plat amb aquests filtres.</p>` : ""}

    <div class="fp-extras">
      ${section("🍴", "La cuina búlgara en 3 minuts", paras(fp.introduction))}
      ${section("🍷", "Begudes de Bulgària", `<div class="fp-drinks">${Object.entries(fp.drinks || {}).map(([k, v]) =>
        `<div class="fp-drink"><b>${esc(k.charAt(0).toUpperCase() + k.slice(1))}</b><p>${esc(v)}</p></div>`).join("")}</div>`)}
      ${section("🗺️", "Mapa gastronòmic", `<div class="fp-map-grid">${Object.entries(fp.foodMap || {}).map(([k, v]) => `
        <div class="fp-region"><h4>${esc(({ sofia: "Sofia", rila: "Rila", pirinBansko: "Pirin / Bansko", plovdiv: "Plovdiv", nessebar: "Nessebar", varna: "Varna", velikoTarnovo: "Veliko Tarnovo", koprivshtitsa: "Koprivshtitsa" })[k] || k)}</h4>
          <p><b>Menjar:</b> ${esc(v.eat)}</p><p><b>Beure:</b> ${esc(v.drink)}</p><p><b>Especialitats:</b> ${esc(v.specialties)}</p></div>`).join("")}</div>`)}
      ${section("🎯", "Reptes gastronòmics", `<ul class="gbul challenge">${(fp.challenges || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`, false, String((fp.challenges || []).length))}
      ${section("🤯", "Curiositats", `<ul class="gbul">${(fp.trivia || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`, false, String((fp.trivia || []).length))}
      ${section("🏆", "Premis de final de viatge", `<ul class="gbul">${(fp.awards || []).map((a) => `<li><b>${esc(a.category)}:</b> ${esc(a.description)}</li>`).join("")}</ul>`)}
      ${section("🗣️", "Vocabulari de restaurant", `<div class="vocab-table">${(fp.vocabulary || []).map((v) => `
        <div class="vocab-row"><span class="vocab-cyr">${esc(v.cyrillic)}</span>
          <span class="vocab-trans">${esc(v.transliteration)}</span>
          <span class="vocab-ca">${esc(v.catalan)}</span></div>`).join("")}</div>`, false, String((fp.vocabulary || []).length))}
    </div>`;

  app.innerHTML = chrome("food", content);
  afterChrome();
  wireFoodFilters();

  const label = currentUserLabel();
  document.getElementById("fp-pdf")?.addEventListener("click", () => {
    TripExport.toPdf("Passaport gastronòmic · Bulgària 2026", label,
      TripExport.foodBody(items, S.foodState, label, TYPE_LABELS));
  });
  document.getElementById("fp-word")?.addEventListener("click", () => {
    TripExport.toWord("Passaport gastronòmic · Bulgària 2026", label,
      TripExport.foodBody(items, S.foodState, label, TYPE_LABELS), "passaport-gastronomic.doc");
    toast("Descarregant Word…");
  });
}

function wireFoodFilters() {
  const q = document.getElementById("f-q");
  q?.addEventListener("input", () => {
    S.foodFilters.q = q.value;
    const pos = q.selectionStart;
    renderFoodPage();
    const nq = document.getElementById("f-q");
    if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
  });
  document.getElementById("f-type")?.addEventListener("change", (e) => { S.foodFilters.type = e.target.value; renderFoodPage(); });
  document.getElementById("f-region")?.addEventListener("change", (e) => { S.foodFilters.region = e.target.value; renderFoodPage(); });
  document.getElementById("f-sort")?.addEventListener("change", (e) => { S.foodFilters.sort = e.target.value; renderFoodPage(); });
  app.querySelectorAll("[data-level]").forEach((b) => {
    b.addEventListener("click", () => {
      S.foodFilters.level = S.foodFilters.level === b.dataset.level ? "" : b.dataset.level;
      renderFoodPage();
    });
  });
  document.getElementById("f-clear")?.addEventListener("click", () => {
    S.foodFilters = { region: "", type: "", level: "", sort: "default", q: "" };
    renderFoodPage();
  });
}

function renderFoodDetail(id) {
  const item = (S.food?.items || []).find((i) => i.id === id);
  if (!item) { location.hash = "#/food"; return; }
  const st = S.foodState[item.id] || {};
  const all = S.food.items;
  const idx = all.findIndex((i) => i.id === id);
  const prev = all[idx - 1], next = all[idx + 1];
  const pl = item.place || {};
  const bbox = pl.lat ? `${(pl.lng - 0.06).toFixed(4)},${(pl.lat - 0.035).toFixed(4)},${(pl.lng + 0.06).toFixed(4)},${(pl.lat + 0.035).toFixed(4)}` : null;

  const content = `
    <div class="day-nav">
      <a href="#/food" class="back">← Passaport</a>
      <div class="day-nav-arrows">
        <a href="#/food/${prev ? esc(prev.id) : ""}" class="${prev ? "" : "disabled"}">←</a>
        <a href="#/food/${next ? esc(next.id) : ""}" class="${next ? "" : "disabled"}">→</a>
      </div>
    </div>

    <div class="fd-hero">
      <img src="images/food/${esc(item.image)}.jpg" alt="${esc(item.name)}" data-zoom />
      <div class="fd-hero-info">
        <div class="fd-type">${TYPE_ICONS[item.type] || "🍴"} ${esc(TYPE_LABELS[item.type] || item.type)}</div>
        <h1>${esc(item.name)}</h1>
        <div class="fd-bg">${esc(item.nameBg)}</div>
        <div class="fd-tags">
          <span class="fp-level ${item.level === "Imprescindible" ? "must" : item.level === "Molt recomanable" ? "high" : "curio"}">${esc(item.level)}</span>
          <span class="fd-tag">📍 ${esc(item.region)}</span>
          ${(item.cities || []).map((c) => `<span class="fd-tag">${esc(c)}</span>`).join("")}
        </div>
      </div>
    </div>

    <div class="day-columns">
      <div>
        <div class="card">
          <h2><span class="ico">📖</span> Què és</h2>
          <p class="gp">${esc(item.description)}</p>
          <div class="fd-ing"><b>Ingredients</b><p>${esc(item.ingredients)}</p></div>
        </div>

        <div class="card">
          <h2><span class="ico">🍴</span> On tastar-lo</h2>
          <p class="gp">${esc(item.whereToTry)}</p>
          ${bbox ? `
          <div class="fd-map">
            <iframe title="Mapa de ${esc(pl.name)}" loading="lazy"
              src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${pl.lat},${pl.lng}"></iframe>
          </div>
          <div class="fd-map-links">
            <b>📍 ${esc(pl.name)}</b>
            <a href="https://www.google.com/maps/search/${encodeURIComponent(item.name + " " + pl.name + " Bulgaria")}" target="_blank" rel="noopener">Buscar restaurants a Google Maps →</a>
          </div>` : ""}
        </div>
      </div>

      <div>
        <div class="card fd-rate">
          <h2><span class="ico">⭐</span> La meva valoració</h2>
          <p class="private-note">🔒 Només tu veus això.</p>
          <label class="fd-tasted">
            <input type="checkbox" id="fd-tasted" ${st.tasted ? "checked" : ""} />
            <span>Ja l'he tastat!</span>
          </label>
          <div class="fd-stars-wrap">
            <div class="fd-label">Puntuació</div>
            ${foodStars(item.id, st.stars || 0, true)}
            <span class="fd-score">${st.stars ? st.stars + "/5" : "sense puntuar"}</span>
          </div>
          <div class="fd-notes-wrap">
            <div class="fd-label">Les meves notes</div>
            <textarea id="fd-notes" placeholder="On l'has tastat? Què t'ha semblat?">${esc(st.notes || "")}</textarea>
            <button class="btn small" id="fd-save-notes">Guardar notes</button>
          </div>
          ${st.updatedAt ? `<div class="fd-updated">Actualitzat ${fmtWhen(st.updatedAt)}</div>` : ""}
        </div>
      </div>
    </div>`;

  app.innerHTML = chrome("food", content);
  afterChrome();
  wireZoom();

  document.getElementById("fd-tasted")?.addEventListener("change", async (e) => {
    try {
      S.foodState[item.id] = await S.store.setFood(item.id, { tasted: e.target.checked });
      renderFoodDetail(id);
      toast(e.target.checked ? "Marcat com a tastat ✔" : "Desmarcat");
    } catch (err) { toast(err.message, true); }
  });

  app.querySelectorAll("[data-stars-for] .star").forEach((s) => {
    s.addEventListener("click", async () => {
      const n = Number(s.dataset.star);
      try {
        const stars = (S.foodState[item.id]?.stars || 0) === n ? 0 : n;
        S.foodState[item.id] = await S.store.setFood(item.id, { stars, tasted: stars > 0 ? true : S.foodState[item.id]?.tasted });
        renderFoodDetail(id);
        toast(stars ? `Puntuat ${stars}/5 ⭐` : "Puntuació esborrada");
      } catch (err) { toast(err.message, true); }
    });
  });

  document.getElementById("fd-save-notes")?.addEventListener("click", async () => {
    try {
      S.foodState[item.id] = await S.store.setFood(item.id, { notes: document.getElementById("fd-notes").value });
      toast("Notes guardades 📝");
      renderFoodDetail(id);
    } catch (err) { toast(err.message, true); }
  });
}

/* ---------------- info pràctica ---------------- */

function renderInfoPage() {
  const t = S.itinerary.trip;
  const credits = Object.entries(S.imageCredits);

  const content = `
    <h1 class="page-title">ℹ️ Informació pràctica</h1>
    <p class="page-sub">Vols, cotxe i coses a tenir a mà durant el viatge.</p>
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
      <div class="card">
        <h2><span class="ico">💾</span> Les meves dades</h2>
        <div class="info-item">${S.staticMode
          ? "El diari i el passaport es guarden en una base de dades del navegador (IndexedDB) d'aquest dispositiu. Descarrega el PDF de tant en tant com a còpia de seguretat."
          : "El diari i el passaport es guarden a la base de dades del servidor."}</div>
        <div class="info-item"><b>Privacitat</b>El teu diari i les teves valoracions són només teves. Les activitats del dia són compartides.</div>
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

/* ---------------- events compartits ---------------- */

function wireChecks(n) {
  app.querySelectorAll('input[type="checkbox"][data-item]').forEach((cb) => {
    cb.addEventListener("change", async () => {
      try {
        S.checks[n] = await S.store.setCheck(n, cb.dataset.item, cb.checked);
        const tab = (location.hash.split("/")[3]) || "pla";
        renderDay(n, tab);
      } catch (err) { toast(err.message, true); }
    });
  });
}

function wirePlanTab(n) {
  document.getElementById("add-activity-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("new-activity");
    if (!input.value.trim()) return;
    try {
      const item = await S.store.addCustomActivity(n, input.value.trim());
      (S.customActivities[n] = S.customActivities[n] || []).push(item);
      renderDay(n, "pla");
      toast("Activitat afegida ✔");
    } catch (err) { toast(err.message, true); }
  });

  app.querySelectorAll("[data-del-activity]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("Esborrar aquesta activitat?")) return;
      try {
        await S.store.deleteCustomActivity(n, btn.dataset.delActivity);
        S.customActivities[n] = (S.customActivities[n] || []).filter((i) => i.id !== btn.dataset.delActivity);
        if (S.checks[n]) delete S.checks[n][btn.dataset.delActivity];
        renderDay(n, "pla");
      } catch (err) { toast(err.message, true); }
    });
  });
}

function wireZoom() {
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

/* ---------------- router ---------------- */

function route() {
  if (!S.user) return renderLogin();
  const parts = (location.hash || "#/").replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "dia" && parts[1]) return renderDay(parseInt(parts[1], 10), parts[2]);
  if (parts[0] === "food" && parts[1]) return renderFoodDetail(parts[1]);
  if (parts[0] === "food") return renderFoodPage();
  if (parts[0] === "diari") return renderDiaryPage();
  if (parts[0] === "info") return renderInfoPage();
  return renderOverview();
}

function render() { route(); }
window.addEventListener("hashchange", route);

/* ---------------- càrrega de dades ---------------- */

async function loadUserData() {
  S.store.setUser(S.user.username);
  await S.store.migrateFromLocalStorage();
  const [checks, customs, food] = await Promise.all([
    S.store.getAllChecks(),
    S.store.getAllCustomActivities(),
    S.store.getAllFood()
  ]);
  S.checks = checks || {};
  S.customActivities = customs || {};
  S.foodState = food || {};
  const entries = await S.store.getDiary(null);
  S.diary = {};
  (entries || []).forEach((e) => { (S.diary[e.day] = S.diary[e.day] || []).push(e); });
}

async function loadStaticContent() {
  const [itinerary, credits, users, guide, food] = await Promise.all([
    fetch("data/itinerary.json").then((r) => r.json()),
    fetch("data/image-credits.json").then((r) => r.json()).catch(() => ({})),
    fetch("data/static-users.json").then((r) => r.json()),
    fetch("data/travel-guide.json").then((r) => r.json()).catch(() => ({ days: {} })),
    fetch("data/food-ca.json").then((r) => r.json()).catch(() => null)
  ]);
  S.itinerary = itinerary;
  S.imageCredits = credits;
  S.guide = guide;
  S.food = food;
  S.staticUsers = users;
  S.users = Object.entries(users).map(([username, u]) => ({ username, displayName: u.displayName, emoji: u.emoji }));
}

async function bootstrap() {
  try {
    const res = await fetch("api/bootstrap", { headers: { "Content-Type": "application/json" } });
    if (res.status === 404) throw new Error("static");
    S.staticMode = false;
    S.store = new TripStore.ApiStore();
    if (res.ok) {
      const data = await res.json();
      S.user = data.user;
      S.users = data.users;
      S.itinerary = data.itinerary;
      S.guide = data.travelGuide || { days: {} };
      S.food = data.foodPassport;
      S.imageCredits = data.imageCredits;
      await loadUserData();
    } else {
      // 401: cal login. Necessitem la llista d'usuaris i el contingut públic.
      const pub = await fetch("api/public").then((r) => r.json()).catch(() => null);
      if (pub) {
        S.users = pub.users;
        S.itinerary = pub.itinerary;
        S.guide = pub.travelGuide || { days: {} };
        S.food = pub.foodPassport;
        S.imageCredits = pub.imageCredits;
      }
    }
  } catch {
    S.staticMode = true;
    S.store = new TripStore.IdbStore();
    await loadStaticContent();
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved && S.staticUsers[saved]) {
      S.user = { username: saved, displayName: S.staticUsers[saved].displayName, emoji: S.staticUsers[saved].emoji };
      await loadUserData();
    }
  }
  render();
}

bootstrap();
