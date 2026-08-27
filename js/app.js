/* =========================================================================
   Gravenkaart — Begraafplaatsen Zulte
   -------------------------------------------------------------------------
   - Basemap: OpenStreetMap / Luchtfoto Digitaal Vlaanderne
   - Datalagen: "Alle graven" en "Herbruikbaar / peterschap mogelijk",
     beide afgeleid uit dezelfde GeoJSON-bron (data/graven.geojson).
   - Brondata staat in Lambert72 (EPSG:31370) en wordt client-side
     herprojecteerd naar WGS84 met proj4, zodat een nieuwe data-export
     zonder voorbewerking hergebruikt kan worden.
   ========================================================================= */

(function () {
  "use strict";

  /* ---------------------------------------------------------------------
   * 1. Configuratie
   * ------------------------------------------------------------------- */

  const DATA_URL = "./data/graven.geojson";
  const CONTOURS_URL = "./data/contouren.geojson";

  // Lambert72 / Belgian Datum 1972 (EPSG:31370)
  proj4.defs(
    "EPSG:31370",
    "+proj=lcc +lat_1=51.16666723333333 +lat_2=49.8333339 +lat_0=90 " +
    "+lon_0=4.367486666666666 +x_0=150000.013 +y_0=5400088.438 " +
    "+ellps=intl +towgs84=-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747 " +
    "+units=m +no_defs"
  );

  // WMS luchtfoto — Digitaal Vlaanderen (Informatie Vlaanderen).
  // Meest recente kleuren-orthofotomozaïek, middenschalig, winteropnamen.
  // Layer-naam "Ortho" is de gepubliceerde naam van deze dienst; controleer
  // via een GetCapabilities-request (?SERVICE=WMS&REQUEST=GetCapabilities)
  // of dit nog klopt mocht de dienst ooit een andere laagnaam krijgen.
  const WMS_URL = "https://geo.api.vlaanderen.be/OMWRGBMRVL/wms";
  const WMS_LAYER = "Ortho";

  const COLORS = {
    all: "#7d8a93",
    H: "#2f8f76",
    P: "#b8802e",
  };

  // Nette Nederlandse labels voor de attributen van een graf, in de volgorde
  // waarin ze getoond worden. Velden die niet in de lijst staan worden
  // genegeerd; lege/null-waarden worden overgeslagen.
  const FIELD_DEFS = [
    { key: "kerkhof", label: "Begraafplaats" },
    { key: "blok", label: "Blok" },
    { key: "rij", label: "Rij" },
    { key: "volgnr", label: "Volgnummer" },
  ];

  /* ---------------------------------------------------------------------
   * 2. Herprojectie Lambert72 -> WGS84
   * ------------------------------------------------------------------- */

  function reprojectCoordinates(coords) {
    // GeoJSON-coördinaten zijn geneste arrays; het diepste niveau is
    // altijd een [x, y]-paar (getallen).
    if (typeof coords[0] === "number") {
      const [lon, lat] = proj4("EPSG:31370", "WGS84", coords);
      return [lon, lat];
    }
    return coords.map(reprojectCoordinates);
  }

  function reprojectGeoJSON(geojson) {
    geojson.features.forEach((feature) => {
      feature.geometry.coordinates = reprojectCoordinates(
        feature.geometry.coordinates
      );
    });
    return geojson;
  }

  /* ---------------------------------------------------------------------
   * 3. Kaart opzetten
   * ------------------------------------------------------------------- */

  const map = L.map("map", {
    zoomControl: true,
    preferCanvas: true, // canvas-renderer: vlot bij duizenden polygonen
  }).setView([50.936, 3.45], 14); // voorlopig centrum, wordt na laden herzien

  //  L.control.zoom({ position: "topright" }).addTo(map);

  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 19,
    maxZoom: 24,
    attribution: "&copy; OpenStreetMap-auteurs",
  }).addTo(map);

  const luchtfoto = L.tileLayer.wms(WMS_URL, {
    layers: WMS_LAYER,
    format: "image/png",
    transparent: true,
    version: "1.3.0",
    maxZoom: 24,
    attribution: "&copy; Digitaal Vlaanderen (Informatie Vlaanderen)",
  });

  // Aparte "pane" voor de highlight-laag, zodat herbruikbare/peterschap-
  // graven altijd zichtbaar boven de volledige grafenlaag getekend worden,
  // ongeacht de volgorde waarin lagen aan/uit gezet worden.
  map.createPane("reusePane");
  map.getPane("reusePane").style.zIndex = 450;

  /* ---------------------------------------------------------------------
   * 4. Attributenkader (detailpaneel)
   * ------------------------------------------------------------------- */

  const detailPanel = document.getElementById("detailPanel");
  const detailTitle = document.getElementById("detailTitle");
  const detailBody = document.getElementById("detailBody");
  const layersToggle = document.getElementById("layersToggle");
  const layersBody = document.getElementById("layersBody");

  document.getElementById("detailClose").addEventListener("click", closeDetailPanel);
  layersToggle.addEventListener("click", () => {
    const isExpanded = layersToggle.getAttribute("aria-expanded") === "true";
    layersToggle.setAttribute("aria-expanded", String(!isExpanded));
    layersBody.hidden = isExpanded;
  });

  function formatDate(value) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatValue(def, value) {
    if (value === null || value === undefined || value === "") return null;
    if (def.type === "date") return formatDate(value);
    if (def.type === "bool") return value ? "Ja" : "Nee";
    return String(value);
  }

  function statusBadge(code) {
    if (code === "H") return '<span class="status-badge status-badge--herbruik">Herbruikbaar</span>';
    if (code === "P") return '<span class="status-badge status-badge--peter">Peterschap mogelijk</span>';
    return '<span class="status-badge status-badge--none">Geen bijzonder statuut</span>';
  }

  function gravePhotoHtml(properties) {
    // Foto's worden uitsluitend getoond voor herbruikbare graven (H)
    // en graven waarvoor peterschap mogelijk is (P).
    const code = properties.hergebruik_peterschap;
    if (code !== "H" && code !== "P") return "";

    // Gebruik de bestandsnaam uit GeoJSON. Tijdens de testfase valt de code
    // terug op dummy.jpg wanneer het veld nog ontbreekt of leeg is.
    const photo = properties.foto || "dummy.jpg";
    const filename = String(photo).trim();
    if (!filename) return "";

    const src = `img/${encodeURIComponent(filename)}`;
    const altParts = [properties.kerkhof, properties.blok, properties.rij, properties.volgnr]
      .filter((value) => value !== null && value !== undefined && value !== "");
    const alt = altParts.length ? `Foto van graf ${altParts.join(" - ")}` : "Foto van graf";

    return `
      <figure class="grave-photo">
        <a class="grave-photo__link" href="${src}" target="_blank" rel="noopener noreferrer"
           title="Open foto in groter formaat">
          <img src="${src}" alt="${escapeHtml(alt)}" loading="lazy"
               onerror="this.closest('figure').remove()">
        </a>
        <figcaption>Klik op de foto voor een grotere weergave</figcaption>
      </figure>`;
  }

  function showDetailPanel(properties) {
    detailTitle.textContent = properties.locatie || `Graf ${properties.id ?? ""}`;

    const rows = FIELD_DEFS
      .map((def) => {
        const formatted = formatValue(def, properties[def.key]);
        if (formatted === null) return "";
        return `<tr><th>${def.label}</th><td>${escapeHtml(formatted)}</td></tr>`;
      })
      .join("");

    detailBody.innerHTML =
      gravePhotoHtml(properties) +
      statusBadge(properties.hergebruik_peterschap) +
      `<table class="attr-table">${rows}</table>`;

    detailPanel.classList.remove("detail-panel--hidden");
  }

  function closeDetailPanel() {
    detailPanel.classList.add("detail-panel--hidden");
    if (activeLayer) {
      resetFeatureStyle(activeLayer);
      activeLayer = null;
    }
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ---------------------------------------------------------------------
   * 5. Stijl & interactie per graf
   * ------------------------------------------------------------------- */

  let activeLayer = null;

  function baseStyleAll() {
    return { color: "#5b6672", weight: 1, fillColor: COLORS.all, fillOpacity: 0.35 };
  }

  function baseStyleReuse(feature) {
    const code = feature.properties.hergebruik_peterschap;
    const c = code === "H" ? COLORS.H : COLORS.P;
    return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.55 };
  }

  function highlightStyle(baseColor) {
    return { color: "#17324d", weight: 3, fillOpacity: 0.75 };
  }

  function resetFeatureStyle(layer) {
    layer.setStyle(layer.__baseStyle);
  }

  function onEachGraveFeature(feature, layer) {
    const baseStyle = layer.options.color
      ? { color: layer.options.color, weight: layer.options.weight, fillColor: layer.options.fillColor, fillOpacity: layer.options.fillOpacity }
      : null;
    layer.__baseStyle = baseStyle;

    //    layer.bindTooltip(feature.properties.locatie || "Graf", { sticky: true });

    layer.on("click", () => {
      if (activeLayer && activeLayer !== layer) resetFeatureStyle(activeLayer);
      layer.setStyle(highlightStyle());
      activeLayer = layer;
      showDetailPanel(feature.properties);
    });
  }

  /* ---------------------------------------------------------------------
   * 6. Legende
   * ------------------------------------------------------------------- */

  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `
      <div class="legend__title">Legende</div>
      <div class="legend__row"><span class="legend__swatch" style="background:${COLORS.all}"></span>Graf</div>
      <div class="legend__row"><span class="legend__swatch" style="background:${COLORS.H}"></span>Herbruikbaar</div>
      <div class="legend__row"><span class="legend__swatch" style="background:${COLORS.P}"></span>Peterschap mogelijk</div>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legend.addTo(map);

  /* ---------------------------------------------------------------------
   * 7. Data laden en lagen opbouwen
   * ------------------------------------------------------------------- */

  const statusEl = document.getElementById("loadingIndicator");

  Promise.all([
    fetch(DATA_URL).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} bij laden van ${DATA_URL}`);
      return res.json();
    }),
    fetch(CONTOURS_URL).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} bij laden van ${CONTOURS_URL}`);
      return res.json();
    }),
  ])
    .then(([rawGraves, rawContours]) => {
      statusEl.textContent = "Coördinaten herprojecteren…";
      const geojson = reprojectGeoJSON(rawGraves);
      const contoursGeojson = reprojectGeoJSON(rawContours);

      const allFeatures = geojson.features;
      const reuseFeatures = allFeatures.filter(
        (f) => f.properties.hergebruik_peterschap === "H" || f.properties.hergebruik_peterschap === "P"
      );

      const cemeteryContoursLayer = L.geoJSON(contoursGeojson, {
        style: {
          color: "#17324d",
          weight: 2.5,
          opacity: 0.9,
          fillColor: "#17324d",
          fillOpacity: 0.04,
          dashArray: "7 5",
        },
        onEachFeature: (feature, layer) => {
          if (feature.properties && feature.properties.naam) {
            layer.bindTooltip(feature.properties.naam, { sticky: true });
          }
        },
      }).addTo(map);

      const allGravesLayer = L.geoJSON(allFeatures, {
        style: baseStyleAll,
        onEachFeature: onEachGraveFeature,
      }).addTo(map);

      const reuseLayer = L.geoJSON(reuseFeatures, {
        pane: "reusePane",
        style: baseStyleReuse,
        onEachFeature: onEachGraveFeature,
      }).addTo(map);

      const overlays = {
        "Contour begraafplaatsen": cemeteryContoursLayer,
        "Alle graven": allGravesLayer,
        "Herbruikbaar / peterschap mogelijk": reuseLayer,
        "Luchtfoto": luchtfoto
      };
      const baseLayers = {
        OpenStreetMap: osm
      };

      const layersControl = L.control.layers(baseLayers, overlays, {
        collapsed: false,
        position: "topright",
      }).addTo(map);

      const layersHost = document.getElementById("layersControlHost");
      const layersContainer = layersControl.getContainer();
      layersHost.appendChild(layersContainer);
      L.DomEvent.disableClickPropagation(layersContainer);
      L.DomEvent.disableScrollPropagation(layersContainer);

      const bounds = cemeteryContoursLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });

      statusEl.textContent = `${allFeatures.length} graven geladen (${reuseFeatures.length} herbruikbaar/peterschap)`;
      setTimeout(() => { statusEl.textContent = ""; }, 4000);
    })
    .catch((err) => {
      console.error(err);
      statusEl.textContent = "Fout bij laden van de data.";
    });

  /* ---------------------------------------------------------------------
   * 8. Responsive kaartgedrag
   * ------------------------------------------------------------------- */

  // Leaflet moet zijn canvas opnieuw berekenen wanneer viewport, browserbalk
  // of toesteloriëntatie wijzigt. Anders kunnen tegels aan de rand ontbreken.
  let resizeTimer = null;
  function refreshMapSize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => map.invalidateSize({ pan: false }), 120);
  }

  window.addEventListener("resize", refreshMapSize, { passive: true });
  window.addEventListener("orientationchange", refreshMapSize, { passive: true });

  // Op kleine schermen starten de kaartlagen ingeklapt zodat de kaart
  // onmiddellijk bruikbaar blijft. De gebruiker kan ze altijd openklappen.
  if (window.matchMedia("(max-width: 700px)").matches) {
    layersToggle.setAttribute("aria-expanded", "false");
    layersBody.hidden = true;
  }

})();
