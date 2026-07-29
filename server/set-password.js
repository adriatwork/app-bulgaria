// Canvia la contrasenya d'un usuari:  npm run set-password -- <usuari> <novaContrasenya>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, "..", "data", "users.json");

const [, , username, password] = process.argv;
if (!username || !password) {
  console.log("Ús: npm run set-password -- <usuari> <novaContrasenya>");
  process.exit(1);
}

const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
const key = username.toLowerCase().trim();
if (!users[key]) {
  console.error(`L'usuari "${key}" no existeix. Usuaris disponibles: ${Object.keys(users).join(", ")}`);
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
users[key].password = `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
console.log(`Contrasenya actualitzada per a "${key}".`);
