/* Bulgària 2026 · Capa de dades
   Dues implementacions amb la mateixa interfície:
     - IdbStore: base de dades IndexedDB al navegador (versió GitHub Pages).
     - ApiStore: parla amb el servidor Node (SQLite).
   El diari i el passaport gastronòmic són PRIVATS de cada usuari; les activitats
   i els reptes del dia són compartits (es veu qui els ha fet). */

(function () {
  const DB_NAME = "bulgaria2026";
  const DB_VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("diary")) {
          const s = db.createObjectStore("diary", { keyPath: "id" });
          s.createIndex("byUserDay", ["user", "day"]);
          s.createIndex("byUser", "user");
        }
        if (!db.objectStoreNames.contains("food")) {
          const s = db.createObjectStore("food", { keyPath: "key" });
          s.createIndex("byUser", "user");
        }
        if (!db.objectStoreNames.contains("checks")) {
          const s = db.createObjectStore("checks", { keyPath: "key" });
          s.createIndex("byDay", "day");
        }
        if (!db.objectStoreNames.contains("customActivities")) {
          const s = db.createObjectStore("customActivities", { keyPath: "id" });
          s.createIndex("byDay", "day");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(db, storeName, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      let result;
      try {
        result = fn(store);
      } catch (e) {
        reject(e);
        return;
      }
      t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const wrap = (req) => ({ __req: req });
  const newId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  /* ---------------- IndexedDB (mode estàtic / GitHub Pages) ---------------- */

  class IdbStore {
    constructor() {
      this.dbp = openDb();
      this.user = null;
    }
    setUser(u) { this.user = u; }

    async migrateFromLocalStorage() {
      // Recupera dades antigues guardades a localStorage (versions anteriors de l'app).
      const done = localStorage.getItem("bulgaria2026-migrated");
      if (done) return;
      try {
        const old = JSON.parse(localStorage.getItem("bulgaria2026-store") || "null");
        if (old) {
          const db = await this.dbp;
          for (const [day, entries] of Object.entries(old.diary || {})) {
            for (const e of entries) {
              await tx(db, "diary", "readwrite", (s) => s.put({
                id: e.id || newId("e"), user: e.by || this.user, day: Number(day),
                text: e.text || "", images: [], createdAt: e.at || new Date().toISOString(),
                updatedAt: e.editedAt || e.at || new Date().toISOString()
              }));
            }
          }
          for (const [day, checks] of Object.entries(old.checks || {})) {
            for (const [itemId, meta] of Object.entries(checks)) {
              await tx(db, "checks", "readwrite", (s) => s.put({
                key: `${day}|${itemId}`, day: Number(day), itemId,
                by: meta.by, at: meta.at
              }));
            }
          }
          for (const [day, list] of Object.entries(old.customActivities || {})) {
            for (const it of list) {
              await tx(db, "customActivities", "readwrite", (s) => s.put({
                id: it.id, day: Number(day), text: it.text, by: it.by, at: it.at
              }));
            }
          }
        }
        const oldFood = JSON.parse(localStorage.getItem("bulgaria2026-food") || "null");
        if (oldFood) {
          const db = await this.dbp;
          for (const [itemId, v] of Object.entries(oldFood.tasted || {})) {
            const r = (oldFood.ratings || {})[itemId];
            await tx(db, "food", "readwrite", (s) => s.put({
              key: `${v.by || this.user}|${itemId}`, user: v.by || this.user, itemId,
              tasted: true, stars: r ? Math.round((r.overall || 0) / 2) : 0,
              notes: "", updatedAt: v.at || new Date().toISOString()
            }));
          }
        }
      } catch (e) {
        console.warn("migració omesa", e);
      }
      localStorage.setItem("bulgaria2026-migrated", "1");
    }

    // ----- diari (privat per usuari) -----
    async getDiary(day) {
      const db = await this.dbp;
      const all = await tx(db, "diary", "readonly", (s) => wrap(s.index("byUser").getAll(this.user)));
      const list = (all || []).filter((e) => day == null || e.day === Number(day));
      return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    async addDiary(day, text, images) {
      const db = await this.dbp;
      const now = new Date().toISOString();
      const entry = { id: newId("e"), user: this.user, day: Number(day), text, images: images || [], createdAt: now, updatedAt: now };
      await tx(db, "diary", "readwrite", (s) => s.put(entry));
      return entry;
    }
    async updateDiary(id, text, images) {
      const db = await this.dbp;
      const cur = await tx(db, "diary", "readonly", (s) => wrap(s.get(id)));
      if (!cur || cur.user !== this.user) throw new Error("No pots editar aquesta nota");
      const upd = { ...cur, text, images: images || cur.images || [], updatedAt: new Date().toISOString(), edited: true };
      await tx(db, "diary", "readwrite", (s) => s.put(upd));
      return upd;
    }
    async deleteDiary(id) {
      const db = await this.dbp;
      const cur = await tx(db, "diary", "readonly", (s) => wrap(s.get(id)));
      if (!cur || cur.user !== this.user) throw new Error("No pots esborrar aquesta nota");
      await tx(db, "diary", "readwrite", (s) => s.delete(id));
    }

    // ----- passaport gastronòmic (privat per usuari) -----
    async getAllFood() {
      const db = await this.dbp;
      const rows = await tx(db, "food", "readonly", (s) => wrap(s.index("byUser").getAll(this.user)));
      const map = {};
      (rows || []).forEach((r) => { map[r.itemId] = r; });
      return map;
    }
    async setFood(itemId, patch) {
      const db = await this.dbp;
      const key = `${this.user}|${itemId}`;
      const cur = (await tx(db, "food", "readonly", (s) => wrap(s.get(key)))) || { key, user: this.user, itemId, tasted: false, stars: 0, notes: "" };
      const upd = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      await tx(db, "food", "readwrite", (s) => s.put(upd));
      return upd;
    }

    // ----- activitats i reptes (compartits) -----
    async getChecks(day) {
      const db = await this.dbp;
      const rows = await tx(db, "checks", "readonly", (s) => wrap(s.index("byDay").getAll(Number(day))));
      const map = {};
      (rows || []).forEach((r) => { map[r.itemId] = { by: r.by, at: r.at }; });
      return map;
    }
    async getAllChecks() {
      const db = await this.dbp;
      const rows = await tx(db, "checks", "readonly", (s) => wrap(s.getAll()));
      const out = {};
      (rows || []).forEach((r) => {
        out[r.day] = out[r.day] || {};
        out[r.day][r.itemId] = { by: r.by, at: r.at };
      });
      return out;
    }
    async setCheck(day, itemId, done) {
      const db = await this.dbp;
      const key = `${day}|${itemId}`;
      if (done) {
        await tx(db, "checks", "readwrite", (s) => s.put({ key, day: Number(day), itemId, by: this.user, at: new Date().toISOString() }));
      } else {
        await tx(db, "checks", "readwrite", (s) => s.delete(key));
      }
      return this.getChecks(day);
    }
    async getCustomActivities(day) {
      const db = await this.dbp;
      const rows = await tx(db, "customActivities", "readonly", (s) => wrap(s.index("byDay").getAll(Number(day))));
      return (rows || []).sort((a, b) => (a.at || "").localeCompare(b.at || ""));
    }
    async getAllCustomActivities() {
      const db = await this.dbp;
      const rows = await tx(db, "customActivities", "readonly", (s) => wrap(s.getAll()));
      const out = {};
      (rows || []).forEach((r) => { (out[r.day] = out[r.day] || []).push(r); });
      return out;
    }
    async addCustomActivity(day, text) {
      const db = await this.dbp;
      const item = { id: newId("c"), day: Number(day), text, by: this.user, at: new Date().toISOString() };
      await tx(db, "customActivities", "readwrite", (s) => s.put(item));
      return item;
    }
    async deleteCustomActivity(day, id) {
      const db = await this.dbp;
      await tx(db, "customActivities", "readwrite", (s) => s.delete(id));
      await tx(db, "checks", "readwrite", (s) => s.delete(`${day}|${id}`));
    }
  }

  /* ---------------- API (mode servidor amb SQLite) ---------------- */

  class ApiStore {
    constructor() { this.user = null; }
    setUser(u) { this.user = u; }
    async migrateFromLocalStorage() { /* el servidor ja té les dades */ }

    async req(path, opts = {}) {
      const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error de connexió");
      return data;
    }

    async getDiary(day) {
      const q = day == null ? "" : `?day=${day}`;
      return (await this.req(`api/diary${q}`)).entries;
    }
    async addDiary(day, text, images) {
      return (await this.req("api/diary", { method: "POST", body: { day, text, images } })).entry;
    }
    async updateDiary(id, text, images) {
      return (await this.req(`api/diary/${id}`, { method: "PUT", body: { text, images } })).entry;
    }
    async deleteDiary(id) { await this.req(`api/diary/${id}`, { method: "DELETE" }); }

    async getAllFood() { return (await this.req("api/food")).items; }
    async setFood(itemId, patch) {
      return (await this.req(`api/food/${itemId}`, { method: "PUT", body: patch })).item;
    }

    async getChecks(day) { return (await this.req(`api/checks?day=${day}`)).checks; }
    async getAllChecks() { return (await this.req("api/checks")).checks; }
    async setCheck(day, itemId, done) {
      return (await this.req(`api/days/${day}/check`, { method: "POST", body: { itemId, done } })).checks;
    }
    async getCustomActivities(day) { return (await this.req(`api/days/${day}/activities`)).items; }
    async getAllCustomActivities() { return (await this.req("api/activities")).items; }
    async addCustomActivity(day, text) {
      return (await this.req(`api/days/${day}/activities`, { method: "POST", body: { text } })).item;
    }
    async deleteCustomActivity(day, id) {
      await this.req(`api/days/${day}/activities/${id}`, { method: "DELETE" });
    }
  }

  /* ---------------- utilitat: comprimir imatges al navegador ---------------- */

  async function fileToCompressedDataUrl(file, maxSide = 1280, quality = 0.75) {
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Imatge no vàlida"));
      i.src = dataUrl;
    });
    let { width: w, height: h } = img;
    if (Math.max(w, h) > maxSide) {
      const r = maxSide / Math.max(w, h);
      w = Math.round(w * r); h = Math.round(h * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  }

  window.TripStore = { IdbStore, ApiStore, fileToCompressedDataUrl };
})();
