import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const DB_FILE = path.join(DATA_DIR, "trip.db");
const SECRET_FILE = path.join(DATA_DIR, ".secret");
const LEGACY_STORE = path.join(DATA_DIR, "store.json");

const PORT = process.env.PORT || 3000;

// ---------- helpers ----------

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---------- arrencada ----------

if (!fs.existsSync(SECRET_FILE)) saveJSON(SECRET_FILE, crypto.randomBytes(32).toString("hex"));
const SECRET = loadJSON(SECRET_FILE, "");

if (!fs.existsSync(USERS_FILE)) {
  saveJSON(USERS_FILE, {
    viatger1: { displayName: "Viatger 1", emoji: "🌻", password: hashPassword("rila2026") },
    viatger2: { displayName: "Viatger 2", emoji: "🌊", password: hashPassword("pirin2026") }
  });
  console.log("Creat data/users.json amb els usuaris per defecte (viatger1 / viatger2).");
}

const users = loadJSON(USERS_FILE, {});
const itinerary = loadJSON(path.join(DATA_DIR, "itinerary.json"), { trip: {}, days: [] });
const travelGuide = loadJSON(path.join(DATA_DIR, "travel-guide.json"), { days: {} });
const foodPassport = loadJSON(path.join(DATA_DIR, "food-ca.json"), null);
const imageCredits = loadJSON(path.join(DATA_DIR, "image-credits.json"), {});

// ---------- base de dades ----------

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS diary (
    id TEXT PRIMARY KEY, user TEXT NOT NULL, day INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '', images TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, edited INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS diary_user_day ON diary(user, day);

  CREATE TABLE IF NOT EXISTS food (
    user TEXT NOT NULL, item_id TEXT NOT NULL,
    tasted INTEGER NOT NULL DEFAULT 0, stars INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
    PRIMARY KEY (user, item_id)
  );

  CREATE TABLE IF NOT EXISTS checks (
    day INTEGER NOT NULL, item_id TEXT NOT NULL,
    by_user TEXT NOT NULL, at TEXT NOT NULL,
    PRIMARY KEY (day, item_id)
  );

  CREATE TABLE IF NOT EXISTS custom_activities (
    id TEXT PRIMARY KEY, day INTEGER NOT NULL, text TEXT NOT NULL,
    by_user TEXT NOT NULL, at TEXT NOT NULL
  );
`);

// Migració única des de l'antic store.json
if (fs.existsSync(LEGACY_STORE) && !fs.existsSync(DB_FILE + ".migrated")) {
  try {
    const old = loadJSON(LEGACY_STORE, {});
    const insDiary = db.prepare("INSERT OR IGNORE INTO diary (id,user,day,text,images,created_at,updated_at,edited) VALUES (?,?,?,?,?,?,?,?)");
    for (const [day, list] of Object.entries(old.diary || {})) {
      for (const e of list) {
        insDiary.run(e.id || crypto.randomUUID(), e.by || "viatger1", Number(day), e.text || "", "[]",
          e.at || new Date().toISOString(), e.editedAt || e.at || new Date().toISOString(), e.editedAt ? 1 : 0);
      }
    }
    const insCheck = db.prepare("INSERT OR IGNORE INTO checks (day,item_id,by_user,at) VALUES (?,?,?,?)");
    for (const [day, checks] of Object.entries(old.checks || {})) {
      for (const [itemId, m] of Object.entries(checks)) insCheck.run(Number(day), itemId, m.by, m.at);
    }
    const insAct = db.prepare("INSERT OR IGNORE INTO custom_activities (id,day,text,by_user,at) VALUES (?,?,?,?,?)");
    for (const [day, list] of Object.entries(old.customActivities || {})) {
      for (const it of list) insAct.run(it.id, Number(day), it.text, it.by, it.at);
    }
    fs.writeFileSync(DB_FILE + ".migrated", new Date().toISOString());
    console.log("Dades antigues de store.json migrades a SQLite.");
  } catch (e) {
    console.warn("No s'ha pogut migrar store.json:", e.message);
  }
}

// ---------- auth ----------

const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("hex");

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
  } catch { return null; }
}

function getCookie(req, name) {
  for (const part of (req.headers.cookie || "").split(";")) {
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

const publicUser = (username) => ({
  username, displayName: users[username].displayName, emoji: users[username].emoji || "🙂"
});

// ---------- app ----------

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(ROOT, "public")));

const loginAttempts = new Map();

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const key = req.ip || "unknown";
  const attempts = loginAttempts.get(key) || { count: 0, until: 0 };
  if (attempts.until > Date.now()) {
    return res.status(429).json({ error: "Massa intents. Espera un minut." });
  }
  const uname = String(username || "").toLowerCase().trim();
  const user = users[uname];
  if (!user || !verifyPassword(String(password || ""), user.password)) {
    attempts.count += 1;
    if (attempts.count >= 8) { attempts.until = Date.now() + 60_000; attempts.count = 0; }
    loginAttempts.set(key, attempts);
    return res.status(401).json({ error: "Usuari o contrasenya incorrectes" });
  }
  loginAttempts.delete(key);
  res.setHeader("Set-Cookie",
    `trip_session=${encodeURIComponent(makeToken(uname))}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 90}; SameSite=Lax`);
  res.json({ ok: true, user: publicUser(uname) });
});

app.post("/api/logout", (_req, res) => {
  res.setHeader("Set-Cookie", "trip_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.json({ ok: true });
});

const contentPayload = () => ({
  users: Object.keys(users).map(publicUser),
  itinerary, travelGuide, foodPassport, imageCredits
});

app.get("/api/public", (_req, res) => res.json(contentPayload()));

app.get("/api/bootstrap", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.username), ...contentPayload() });
});

// ----- diari (privat per usuari) -----

const rowToEntry = (r) => ({
  id: r.id, day: r.day, text: r.text, images: JSON.parse(r.images || "[]"),
  createdAt: r.created_at, updatedAt: r.updated_at, edited: !!r.edited
});

app.get("/api/diary", requireAuth, (req, res) => {
  const day = req.query.day;
  const rows = day != null && day !== ""
    ? db.prepare("SELECT * FROM diary WHERE user=? AND day=? ORDER BY created_at").all(req.username, Number(day))
    : db.prepare("SELECT * FROM diary WHERE user=? ORDER BY day, created_at").all(req.username);
  res.json({ entries: rows.map(rowToEntry) });
});

function validImages(images) {
  const list = Array.isArray(images) ? images.slice(0, 6) : [];
  return list.filter((s) => typeof s === "string" && /^data:image\/(jpeg|png|webp|gif);base64,/.test(s) && s.length < 4_000_000);
}

app.post("/api/diary", requireAuth, (req, res) => {
  const day = parseInt((req.body || {}).day, 10);
  const text = String((req.body || {}).text || "").trim();
  const images = validImages((req.body || {}).images);
  if (!Number.isFinite(day)) return res.status(400).json({ error: "Dia no vàlid" });
  if (!text && !images.length) return res.status(400).json({ error: "Escriu alguna cosa o afegeix una foto" });
  if (text.length > 8000) return res.status(400).json({ error: "Màxim 8000 caràcters" });
  const now = new Date().toISOString();
  const id = "e-" + crypto.randomBytes(6).toString("hex");
  db.prepare("INSERT INTO diary (id,user,day,text,images,created_at,updated_at,edited) VALUES (?,?,?,?,?,?,?,0)")
    .run(id, req.username, day, text, JSON.stringify(images), now, now);
  res.json({ ok: true, entry: { id, day, text, images, createdAt: now, updatedAt: now, edited: false } });
});

app.put("/api/diary/:id", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM diary WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "No trobat" });
  if (row.user !== req.username) return res.status(403).json({ error: "Aquesta nota no és teva" });
  const text = String((req.body || {}).text || "").trim();
  const images = (req.body || {}).images !== undefined ? validImages(req.body.images) : JSON.parse(row.images || "[]");
  if (!text && !images.length) return res.status(400).json({ error: "La nota no pot quedar buida" });
  const now = new Date().toISOString();
  db.prepare("UPDATE diary SET text=?, images=?, updated_at=?, edited=1 WHERE id=?")
    .run(text, JSON.stringify(images), now, req.params.id);
  res.json({ ok: true, entry: { id: row.id, day: row.day, text, images, createdAt: row.created_at, updatedAt: now, edited: true } });
});

app.delete("/api/diary/:id", requireAuth, (req, res) => {
  const row = db.prepare("SELECT user FROM diary WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "No trobat" });
  if (row.user !== req.username) return res.status(403).json({ error: "Aquesta nota no és teva" });
  db.prepare("DELETE FROM diary WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ----- passaport gastronòmic (privat per usuari) -----

const rowToFood = (r) => ({
  itemId: r.item_id, tasted: !!r.tasted, stars: r.stars, notes: r.notes, updatedAt: r.updated_at
});

app.get("/api/food", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM food WHERE user=?").all(req.username);
  const out = {};
  rows.forEach((r) => { out[r.item_id] = rowToFood(r); });
  res.json({ items: out });
});

app.put("/api/food/:itemId", requireAuth, (req, res) => {
  const itemId = req.params.itemId;
  if (!/^[\w-]{1,40}$/.test(itemId)) return res.status(400).json({ error: "Id no vàlid" });
  const cur = db.prepare("SELECT * FROM food WHERE user=? AND item_id=?").get(req.username, itemId)
    || { tasted: 0, stars: 0, notes: "" };
  const b = req.body || {};
  const tasted = b.tasted !== undefined ? (b.tasted ? 1 : 0) : cur.tasted;
  let stars = b.stars !== undefined ? parseInt(b.stars, 10) : cur.stars;
  if (!Number.isFinite(stars) || stars < 0 || stars > 5) stars = 0;
  const notes = b.notes !== undefined ? String(b.notes).slice(0, 2000) : cur.notes;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO food (user,item_id,tasted,stars,notes,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(user,item_id) DO UPDATE SET tasted=excluded.tasted, stars=excluded.stars,
    notes=excluded.notes, updated_at=excluded.updated_at`)
    .run(req.username, itemId, tasted, stars, notes, now);
  res.json({ ok: true, item: { itemId, tasted: !!tasted, stars, notes, updatedAt: now } });
});

// ----- activitats i reptes (compartits) -----

app.get("/api/checks", requireAuth, (req, res) => {
  const day = req.query.day;
  if (day != null && day !== "") {
    const rows = db.prepare("SELECT * FROM checks WHERE day=?").all(Number(day));
    const out = {};
    rows.forEach((r) => { out[r.item_id] = { by: r.by_user, at: r.at }; });
    return res.json({ checks: out });
  }
  const rows = db.prepare("SELECT * FROM checks").all();
  const out = {};
  rows.forEach((r) => {
    out[r.day] = out[r.day] || {};
    out[r.day][r.item_id] = { by: r.by_user, at: r.at };
  });
  res.json({ checks: out });
});

app.post("/api/days/:day/check", requireAuth, (req, res) => {
  const day = parseInt(req.params.day, 10);
  const { itemId, done } = req.body || {};
  if (!itemId) return res.status(400).json({ error: "Falta itemId" });
  if (done) {
    db.prepare(`INSERT INTO checks (day,item_id,by_user,at) VALUES (?,?,?,?)
      ON CONFLICT(day,item_id) DO UPDATE SET by_user=excluded.by_user, at=excluded.at`)
      .run(day, itemId, req.username, new Date().toISOString());
  } else {
    db.prepare("DELETE FROM checks WHERE day=? AND item_id=?").run(day, itemId);
  }
  const rows = db.prepare("SELECT * FROM checks WHERE day=?").all(day);
  const out = {};
  rows.forEach((r) => { out[r.item_id] = { by: r.by_user, at: r.at }; });
  res.json({ ok: true, checks: out });
});

const rowToAct = (r) => ({ id: r.id, day: r.day, text: r.text, by: r.by_user, at: r.at });

app.get("/api/activities", requireAuth, (_req, res) => {
  const rows = db.prepare("SELECT * FROM custom_activities ORDER BY at").all();
  const out = {};
  rows.forEach((r) => { (out[r.day] = out[r.day] || []).push(rowToAct(r)); });
  res.json({ items: out });
});

app.get("/api/days/:day/activities", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM custom_activities WHERE day=? ORDER BY at").all(parseInt(req.params.day, 10));
  res.json({ items: rows.map(rowToAct) });
});

app.post("/api/days/:day/activities", requireAuth, (req, res) => {
  const day = parseInt(req.params.day, 10);
  const text = String((req.body || {}).text || "").trim();
  if (!text) return res.status(400).json({ error: "Escriu alguna cosa!" });
  if (text.length > 300) return res.status(400).json({ error: "Màxim 300 caràcters" });
  const item = { id: "c-" + crypto.randomBytes(5).toString("hex"), day, text, by: req.username, at: new Date().toISOString() };
  db.prepare("INSERT INTO custom_activities (id,day,text,by_user,at) VALUES (?,?,?,?,?)")
    .run(item.id, day, text, item.by, item.at);
  res.json({ ok: true, item });
});

app.delete("/api/days/:day/activities/:id", requireAuth, (req, res) => {
  const row = db.prepare("SELECT id FROM custom_activities WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "No trobat" });
  db.prepare("DELETE FROM custom_activities WHERE id=?").run(req.params.id);
  db.prepare("DELETE FROM checks WHERE day=? AND item_id=?").run(parseInt(req.params.day, 10), req.params.id);
  res.json({ ok: true });
});

// SPA fallback
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => console.log(`✈️  Bulgària 2026 · App en marxa a http://localhost:${PORT}`));
}

export default app;
