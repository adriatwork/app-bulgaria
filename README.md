# 🇧🇬 Bulgària 2026 · El nostre quadern de viatge

App web per al viatge a Bulgària del **3 al 15 d'agost de 2026**, generada a partir de l'itinerari de l'Excel `Itinerari Viatge Bulgària - Agost 2026.xlsx`.

## Què fa

- **2 usuaris amb contrasenya** (un per a cada viatger).
- **Una finestra per a cada dia del viatge** (13 dies), amb:
  - El pla del dia (matí / tarda / nit) tret de l'Excel.
  - Informació del lloc, **menjar típic**, **llocs a prop per visitar** i consells.
  - **Imatges** dels llocs (Wikimedia Commons, incloses al repositori).
  - On dormim cada nit (hotels de l'Excel).
- **Llista d'activitats per completar cada dia**, adaptada a cada zona. Es poden marcar com a fetes (es veu qui i quan) i **afegir-ne de noves o canvis** sobre la marxa.
- **Diari de viatge**: cada dia, cada viatger pot escriure les seves notes. Es veuen les notes de tots dos, però només pots editar o esborrar les teves.
- **Travel Guide (English)** — for each of the 13 days: destination story, history, highlights, fun facts, photo spots, food, Bulgarian phrase, daily challenges, insider tips, movie vibe, historical figure, and visual guide. Open any day → **Travel Guide** tab.
- **Bulgarian Food Passport** — full gastronomic guide with 20 must-try dishes, regional food map, 25 food challenges, interactive checklist (mark what you've tasted + rate 1–10), trivia, and restaurant vocabulary.

## Com engegar-la

Hi ha dues maneres de fer servir l'app:

### Opció A · En un enllaç de GitHub (GitHub Pages) 🌐

L'app es publica sola a **https://adriatwork.github.io/app-bulgaria/** cada cop que es fa un push a `main`. Només cal activar-ho un cop:

1. Al repositori de GitHub, aneu a **Settings → Pages**.
2. A **Build and deployment → Source**, trieu **GitHub Actions**.
3. Feu merge d'aquesta branca a `main` (o aneu a **Actions → "Publicar a GitHub Pages" → Run workflow**).
4. En un minut, l'app estarà a `https://adriatwork.github.io/app-bulgaria/`. Guardeu-la a la pantalla d'inici del mòbil!

En aquesta versió no hi ha servidor, així que **el diari i les activitats marcades es guarden al dispositiu de cadascú** (no es comparteixen entre mòbils). El login funciona igual, amb les mateixes contrasenyes per defecte; per canviar-les:

```bash
npm run set-static-password -- viatger1 laMevaNovaContrasenya
# i després: git add data/static-users.json && git commit && git push
```

> ⚠️ Si el repositori és públic, qualsevol pot veure l'itinerari al codi. El login de la versió web és una barrera senzilla, no seguretat forta.

### Opció B · Amb servidor propi (diari compartit) 🖥️

Amb [Node.js](https://nodejs.org) 18 o superior:

```bash
npm install
npm start
```

Obre [http://localhost:3000](http://localhost:3000). En aquest mode el diari i les activitats **es comparteixen entre tots dos** (es guarden al servidor). Per tenir-ho al mòbil durant el viatge, desplegueu-lo a un servei gratuït tipus Render o Railway.

## Usuaris i contrasenyes

En arrencar per primera vegada (mode servidor) es crea `data/users.json` amb dos usuaris:

| Usuari     | Contrasenya per defecte |
|------------|-------------------------|
| `viatger1` | `rila2026`              |
| `viatger2` | `pirin2026`             |

**Canvieu les contrasenyes** (i, si voleu, els noms que es mostren):

```bash
# canviar contrasenya
npm run set-password -- viatger1 laMevaNovaContrasenya

# canviar el nom que es mostra: editeu "displayName" (i l'emoji!) a data/users.json
```

## On es guarden les dades

- `data/store.json` — diari, activitats marcades i activitats afegides (es crea sol, no es puja a git).
- `data/users.json` — usuaris i contrasenyes (xifrades amb scrypt; tampoc es puja a git).
- `data/itinerary.json` — tot el contingut del viatge. Si canvieu plans, editeu aquest fitxer!

## Estructura

```
├── .github/workflows/deploy-pages.yml  # publicació automàtica a GitHub Pages
├── server/server.js               # servidor Express: login, diari, checklists
├── server/set-password.js         # canviar contrasenyes (mode servidor)
├── server/set-static-password.js  # canviar contrasenyes (versió GitHub Pages)
├── data/itinerary.json            # itinerari complet (generat des de l'Excel + contingut extra)
├── data/static-users.json         # usuaris de la versió GitHub Pages (contrasenyes xifrades)
├── data/image-credits.json        # crèdits de les imatges
└── public/                        # frontend (HTML + CSS + JS, sense build)
    └── images/                    # fotos dels llocs (Wikimedia Commons)
```

Bon viatge! 🌹✈️
