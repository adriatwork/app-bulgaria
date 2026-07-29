import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const SECRET_FILE = path.join(DATA_DIR, ".secret");

const PORT = process.env.PORT || 3000;

// ---------- helpers ----------

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---------- bootstrap data files ----------

if (!fs.existsSync(SECRET_FILE)) {
  saveJSON(SECRET_FILE, crypto.randomBytes(32).toString("hex"));
}
const SECRET = loadJSON(SECRET_FILE, "");

// Two travelers. Change display names here and passwords with `npm run set-password`.
if (!fs.existsSync(USERS_FILE)) {
  saveJSON(USERS_FILE, {
    viatger1: { displayName: "Viatger 1", emoji: "🌻", password: hashPassword("rila2026") },
    viatger2: { displayName: "Viatger 2", emoji: "🌊", password: hashPassword("pirin2026") }
  });
  console.log("Creat data/users.json amb els usuaris per defecte (viatger1 / viatger2).");
}

const users = loadJSON(USERS_FILE, {});
const itinerary = loadJSON(path.join(DATA_DIR, "itinerary.json"), { trip: {}, days: [] });
const imageCredits = loadJSON(path.join(DATA_DIR, "image-credits.json"), {});

// Shared app state: checked activities, custom activities and diary entries.
let store = loadJSON(STORE_FILE, { checks: {}, customActivities: {}, diary: {} });
const persist = () => saveJSON(STORE_FILE, store);

// ---------- auth (signed cookie token) ----------

function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

function makeToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, t: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { u } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return users[u] ? u : null;
  } catch {
    return null;
  }
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function requireAuth(req, res, next) {
  const username = parseToken(getCookie(req, "trip_session"));
  if (!username) return res.status(401).json({ error: "No autenticat" });
  req.username = username;
  next();
}

// ---------- app ----------

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(ROOT, "public")));

const loginAttempts = new Map();

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const key = req.ip || "unknown";
  const attempts = loginAttempts.get(key) || { count: 0, until: 0 };
  if (attempts.until > Date.now()) {
    return res.status(429).json({ error: "Massa intents. Espera un minut i torna-ho a provar." });
  }
  const user = users[String(username || "").toLowerCase().trim()];
  if (!user || !verifyPassword(String(password || ""), user.password)) {
    attempts.count += 1;
    if (attempts.count >= 8) {
      attempts.until = Date.now() + 60_000;
      attempts.count = 0;
    }
    loginAttempts.set(key, attempts);
    return res.status(401).json({ error: "Usuari o contrasenya incorrectes" });
  }
  loginAttempts.delete(key);
  const uname = String(username).toLowerCase().trim();
  res.setHeader(
    "Set-Cookie",
    `trip_session=${encodeURIComponent(makeToken(uname))}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 90}; SameSite=Lax`
  );
  res.json({ ok: true, user: publicUser(uname) });
});

app.post("/api/logout", (_req, res) => {
  res.setHeader("Set-Cookie", "trip_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.json({ ok: true });
});

function publicUser(username) {
  const u = users[username];
  return { username, displayName: u.displayName, emoji: u.emoji || "🙂" };
}

app.get("/api/bootstrap", requireAuth, (req, res) => {
  res.json({
    user: publicUser(req.username),
    users: Object.keys(users).map(publicUser),
    itinerary,
    imageCredits,
    state: store
  });
});

// ----- activity checklist -----

app.post("/api/days/:day/check", requireAuth, (req, res) => {
  const day = String(parseInt(req.params.day, 10));
  const { itemId, done } = req.body || {};
  if (!itemId) return res.status(400).json({ error: "Falta itemId" });
  store.checks[day] = store.checks[day] || {};
  if (done) {
    store.checks[day][itemId] = { by: req.username, at: new Date().toISOString() };
  } else {
    delete store.checks[day][itemId];
  }
  persist();
  res.json({ ok: true, checks: store.checks[day] });
});

// ----- custom activities -----

app.post("/api/days/:day/activities", requireAuth, (req, res) => {
  const day = String(parseInt(req.params.day, 10));
  const text = String((req.body || {}).text || "").trim();
  if (!text) return res.status(400).json({ error: "Escriu alguna cosa!" });
  if (text.length > 300) return res.status(400).json({ error: "Màxim 300 caràcters" });
  const item = {
    id: `c-${crypto.randomBytes(5).toString("hex")}`,
    text,
    by: req.username,
    at: new Date().toISOString()
  };
  store.customActivities[day] = store.customActivities[day] || [];
  store.customActivities[day].push(item);
  persist();
  res.json({ ok: true, item });
});

app.delete("/api/days/:day/activities/:id", requireAuth, (req, res) => {
  const day = String(parseInt(req.params.day, 10));
  const list = store.customActivities[day] || [];
  const idx = list.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "No trobat" });
  list.splice(idx, 1);
  if (store.checks[day]) delete store.checks[day][req.params.id];
  persist();
  res.json({ ok: true });
});

// ----- diary -----

app.post("/api/days/:day/diary", requireAuth, (req, res) => {
  const day = String(parseInt(req.params.day, 10));
  const text = String((req.body || {}).text || "").trim();
  if (!text) return res.status(400).json({ error: "El teu diari no pot estar buit!" });
  if (text.length > 5000) return res.status(400).json({ error: "Màxim 5000 caràcters" });
  const entry = {
    id: `e-${crypto.randomBytes(5).toString("hex")}`,
    text,
    by: req.username,
    at: new Date().toISOString()
  };
  store.diary[day] = store.diary[day] || [];
  store.diary[day].push(entry);
  persist();
  res.json({ ok: true, entry });
});

app.put("/api/days/:day/diary/:id", requireAuth, (req, res) => {
  const day = String(parseInt(req.params.day, 10));
  const entry = (store.diary[day] || []).find((e) => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "No trobat" });
  if (entry.by !== req.username) return res.status(403).json({ error: "Només pots editar les teves notes" });
  const text = String((req.body || {}).text || "").trim();
  if (!text) return res.status(400).json({ error: "El teu diari no pot estar buit!" });
  entry.text = text;
  entry.editedAt = new Date().toISOString();
  persist();
  res.json({ ok: true, entry });
});

app.delete("/api/days/:day/diary/:id", requireAuth, (req, res) => {
  const day = String(parseInt(req.params.day, 10));
  const list = store.diary[day] || [];
  const idx = list.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "No trobat" });
  if (list[idx].by !== req.username) return res.status(403).json({ error: "Només pots esborrar les teves notes" });
  list.splice(idx, 1);
  persist();
  res.json({ ok: true });
});

// SPA fallback
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`✈️  Bulgària 2026 · App en marxa a http://localhost:${PORT}`);
  });
}

export default app;
