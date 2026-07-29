// Canvia la contrasenya d'un usuari de la versió GitHub Pages (data/static-users.json):
//   npm run set-static-password -- <usuari> <novaContrasenya>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, "..", "data", "static-users.json");

const [, , username, password] = process.argv;
if (!username || !password) {
  console.log("Ús: npm run set-static-password -- <usuari> <novaContrasenya>");
  process.exit(1);
}

const users = JSON.parse(fs.readFileSync(FILE, "utf8"));
const key = username.toLowerCase().trim();
if (!users[key]) {
  console.error(`L'usuari "${key}" no existeix. Usuaris disponibles: ${Object.keys(users).join(", ")}`);
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
users[key].salt = salt;
users[key].hash = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
fs.writeFileSync(FILE, JSON.stringify(users, null, 2) + "\n");
console.log(`Contrasenya (versió web) actualitzada per a "${key}". Recorda fer commit i push perquè es publiqui!`);
