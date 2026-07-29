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
- Pàgina d'**informació pràctica**: vols, cotxe de lloguer, taxis, pla B, bàsics del país.

## Com engegar-la

Cal [Node.js](https://nodejs.org) 18 o superior.

```bash
npm install
npm start
```

Obre [http://localhost:3000](http://localhost:3000).

## Usuaris i contrasenyes

En arrencar per primera vegada es crea `data/users.json` amb dos usuaris:

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
├── server/server.js        # servidor Express: login, diari, checklists
├── server/set-password.js  # utilitat per canviar contrasenyes
├── data/itinerary.json     # itinerari complet (generat des de l'Excel + contingut extra)
├── data/image-credits.json # crèdits de les imatges
└── public/                 # frontend (HTML + CSS + JS, sense build)
    └── images/             # fotos dels llocs (Wikimedia Commons)
```

Bon viatge! 🌹✈️
