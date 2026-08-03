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
- **Diari de viatge privat**: cada viatger escriu les seves notes i hi pot **afegir fotos**. 🔒 Cada usuari només veu el seu diari. Es pot **descarregar en PDF o Word** (fotos incloses) des de la pàgina «El meu diari», i també l'itinerari sencer en PDF.
- **Guia del dia (en català)** — per a cadascun dels 13 dies: el lloc d'avui, reptes amb checkpoints, què no et pots perdre, història, curiositats, què tastar, frase en búlgar, consells locals, personatge del dia i guia visual. Tot en seccions plegables per llegir-ho còmodament al mòbil. Obre un dia → pestanya **Guia**.
- **Passaport gastronòmic** — 30 plats i begudes amb foto, resum, regió i tipus. Toca'n un per veure la fitxa completa amb mapa d'on tastar-lo, valoració amb estrelles i les teves notes. A la llista pots **filtrar** per tipus, regió o ciutat i **ordenar** per puntuació. Descarregable en PDF/Word per compartir.

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
npm run set-static-password -- lorena laMevaNovaContrasenya
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
| `lorena`   | `lorenamorena`          |
| `adria`    | `adrianocapitano`       |

**Canvieu les contrasenyes** (i, si voleu, els noms que es mostren):

```bash
# canviar contrasenya
npm run set-password -- lorena laMevaNovaContrasenya

# canviar el nom que es mostra: editeu "displayName" (i l'emoji!) a data/users.json
```

## On es guarden les dades

Les dades es guarden en una **base de dades** perquè no es perdin:

- **Amb servidor**: SQLite a `data/trip.db` (es crea sol, no es puja a git). Si veniu d'una versió antiga, `data/store.json` es migra automàticament.
- **A GitHub Pages**: **IndexedDB** al navegador de cada dispositiu — molt més robust que localStorage i suporta fotos. Les dades antigues de localStorage es migren soles el primer cop.

Altres fitxers:

- `data/users.json` — usuaris i contrasenyes (xifrades amb scrypt; no es puja a git).
- `data/itinerary.json` — el pla del viatge. Si canvieu plans, editeu aquest fitxer!
- `data/travel-guide.json` — la guia de cada dia.
- `data/food-ca.json` — els 30 plats del passaport gastronòmic.

> 💡 A GitHub Pages les dades viuen al dispositiu. Descarregueu el PDF del diari de tant en tant com a còpia de seguretat.

## Estructura

```
├── .github/workflows/deploy-pages.yml  # publicació automàtica a GitHub Pages
├── server/server.js               # servidor Express + SQLite: login, diari, passaport
├── server/set-password.js         # canviar contrasenyes (mode servidor)
├── server/set-static-password.js  # canviar contrasenyes (versió GitHub Pages)
├── data/itinerary.json            # itinerari complet (generat des de l'Excel + contingut extra)
├── data/travel-guide.json         # guia turística de cada dia (en català)
├── data/food-ca.json              # passaport gastronòmic: 30 plats amb regió, tipus i mapa
├── data/static-users.json         # usuaris de la versió GitHub Pages (contrasenyes xifrades)
├── data/image-credits.json        # crèdits de les imatges
└── public/                        # frontend (HTML + CSS + JS, sense build)
    ├── js/store.js                # dades: IndexedDB (navegador) o API+SQLite (servidor)
    ├── js/export.js               # exportació a PDF i Word
    ├── images/                    # fotos dels llocs (Wikimedia Commons)
    └── images/food/               # fotos dels plats (Wikimedia Commons)
```

Bon viatge! 🌹✈️
