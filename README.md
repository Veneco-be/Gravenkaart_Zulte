# Gravenkaart — Begraafplaatsen Zulte (v1)

## Lokaal starten

Browsers blokkeren `fetch()` van lokale bestanden via `file://`. Start daarom
een simpele lokale server in deze map:

```bash
python3 -m http.server 8000
```

en open vervolgens **http://localhost:8000** in de browser.

(Bij een echte deployment op een webserver of intranet is dit niet nodig —
dan werkt `index.html` gewoon zoals elke andere pagina.)

## Bestanden

- `index.html` — paginastructuur
- `style.css` — vormgeving
- `app.js` — kaartlogica: herprojectie, lagen, klikgedrag, legende
- `data/graven.geojson` — brondata (Lambert72 / EPSG:31370), 5.644 graven
  over 5 begraafplaatsen (Zulte, Machelen Oud/Nieuw, Olsene Oud/Nieuw)
- `data/contouren.geojson` — brondata (Lambert72 / EPSG:31370)

## Wat deze eerste versie doet

- Basiskaart: OpenStreetMap
- Overlay: luchtfoto WMS van Digitaal Vlaanderen (aan/uit via lagenpaneel)
- Toont de contour van een begraafplaats
- Twee datalagen, beide afgeleid van dezelfde GeoJSON:
  - **Alle graven** — volledige inventaris
  - **Herbruikbaar / peterschap mogelijk** — subset op basis van het veld
    `hergebruik_peterschap` (`H` = herbruikbaar, `P` = peterschap)
- Klik op een graf → attributenkader rechts met alle gegevens, netjes
  geformatteerd (naam begraafplaats, blok, rij, volgnummer + foto)
- In-/uitzoomen, lagenpaneel, legende

## Aandachtspunt voor de volgende iteratie

De WMS-laagnaam (`Ortho`) voor de Digitaal Vlaanderen-luchtfoto is bevestigd
via publieke configuratievoorbeelden, maar niet live getest tegen de dienst
zelf vanuit deze omgeving (geen netwerktoegang hiernaartoe in de sandbox).
Controleer bij eerste gebruik even of de luchtfoto correct laadt; mocht dat
niet zo zijn, dan is het een kwestie van de laagnaam bijstellen op basis van
een `GetCapabilities`-request op `https://geo.api.vlaanderen.be/OMWRGBMRVL/wms`.
