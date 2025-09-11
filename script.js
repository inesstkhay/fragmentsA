// ============================
// TOGGLE LÉGENDE (Affiche/masque la légende des critères)
// ============================

document.getElementById('toggle-legend-btn').addEventListener('click', () => {
    const legend = document.getElementById('criteria-legend');
    legend.style.display = (legend.style.display === 'none' || legend.style.display === '') ? 'block' : 'none';
});

// ============================
// INITIALISATION CARTE ET VARIABLES GLOBALES
// ============================
let currentView = 'map';

    // Initialisation de la carte sur Montreuil avec Leaflet
    // Les vues peuvent alterner entre Montreuil et Toulouse
const montreuilView = [48.8710, 2.4330];
const montreuilZoom = 15;
const toulouseView = [43.5675824, 1.4000176];
const toulouseZoom = 15; // 
let currentLocation = 'montreuil'; // Commencer par Montreuil


let patternThreshold = 5; // seuil pour former les patterns

// Permet de basculer entre les deux localisations géographiques
function toggleLocation() {
  const locationButton = document.getElementById('toggle-location-btn');

  // Choisit la bonne carte selon la vue courante
  let targetMap = map; // défaut
  if (currentView === 'patterns-map' && patternMap) {
    targetMap = patternMap;
  } else if ((currentView === 'unit' || currentView === 'unit-view') && unitMap) {
    targetMap = unitMap;
  }

  if (currentLocation === 'montreuil') {
    targetMap.setView(toulouseView, toulouseZoom);
    locationButton.textContent = 'Voir Montreuil';
    currentLocation = 'toulouse';
  } else {
    targetMap.setView(montreuilView, montreuilZoom);
    locationButton.textContent = 'Voir Toulouse';
    currentLocation = 'montreuil';
  }
}


    const map = L.map('map').setView(montreuilView, montreuilZoom); // Initialiser la carte sur Montreuil
    const sidebar = document.getElementById('sidebar');
    const proxemicView = document.getElementById('proxemic-view');
    let allLayers = [];
    let dataGeojson = [];
    let datamGeojson = [];
    let isMapView = true;
    let patterns = {}; // Objet pour stocker les patterns 
    let patternNames = {}; // Objet pour stocker les noms des patterns
    map.createPane('pane-discours');
    map.getPane('pane-discours').style.zIndex = 650; // plus que les autres couches

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors, © CartoDB'
    }).addTo(map);


    // ======= ÉTAT CRÉATION D’UNITÉ =======
let unitCreation = {
  active: false,
  // référence aux couches/handlers que l’on désactive/temporairement
  ringsVisible: true,
  mouseMoveHandler: null
};
let unitMap = null; // la carte dédiée dans l’onglet "Unité de projet"
let unitLayerGroup = null;   // toutes les unités dessinées
let unitContextGroup = null; // contexte (contours, base grise, etc.)



// ============================
// AFFICHAGE DES DÉTAILS DANS LES SIDEBARS
// ============================


function openSidebar(el) {
  if (!el) return;
  el.style.display = 'block';
  el.style.position = 'fixed';
  el.style.top = '90px';
  el.style.right = '10px';
  el.style.maxHeight = 'calc(100vh - 120px)';
  el.style.overflowY = 'auto';
  el.style.zIndex = '4001'; // au-dessus du footer (3000) & des panes Leaflet
}





function showDetails(props) {
  // on unifie : plus d’ouverture des anciennes sidebars
  clearAllTabbedTabs(); // exclusif : 1 clic = 1 set d’infos

  if (props.isPattern) {
    // appelé depuis proxémie (ou ailleurs) avec patternKey/elements/criteria
    const key = props.patternKey || 'Pattern';
    openTab({
      id: `pattern-${key}`,
      title: key,
      kind: 'pattern',
      render: (panel) => renderPatternPanel(panel, key, {
        criteria: props.criteria || {},
        elements: props.elements || []
      })
    });
  } else if (props.isDiscourse) {
    openTab({
      id: `disc-${props.id || Math.random().toString(36).slice(2)}`,
      title: props.id || 'Discours',
      kind: 'discourse',
      render: (panel) => renderDiscoursePanel(panel, props)
    });
  } else {
    // fragment "classique"
    const fid = props.id || Math.random().toString(36).slice(2);
    openTab({
      id: `frag-${fid}`,
      title: props.id || 'Fragment',
      kind: 'fragment',
      render: (panel) => renderFragmentPanel(panel, props)
    });
  }

  // masque les anciennes sidebars (sécurité)
  document.getElementById('spatial-sidebar').style.display = 'none';
  document.getElementById('discourse-sidebar').style.display = 'none';
}


// Ferme toutes les barres latérales (sidebar)
function closeSidebars() {
  document.getElementById('spatial-sidebar').style.display = 'none';
  document.getElementById('discourse-sidebar').style.display = 'none';
  clearAllTabbedTabs(); // << ajoute ça
}

// ============================
// APPLICATION DES FILTRES DE ZONE + RECALCUL DES PATTERNS
// ============================
// Applique les filtres d’affichage selon les zones, tonalités et discours cochés
function applyFilters() {
 const showDiscourses = true;
  const activeZones = Array.from(document.querySelectorAll('.filter-zone:checked')).map(cb => cb.value);

  allLayers.forEach(layer => {
    const props = layer.feature.properties;
    const isDiscourse = props.isDiscourse;
    let showLayer = false;

    if (isDiscourse) {
      showLayer = showDiscourses;
    } else {
      showLayer = activeZones.includes(layer.zone);
    }

    if (showLayer) {
      if (!map.hasLayer(layer)) {
        layer.addTo(map);
      }
    } else {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    }
  });

  // Recalcule TOUJOURS les patterns sur les éléments visibles
  const visibleFeatures = allLayers
    .filter(layer => map.hasLayer(layer))
    .map(layer => layer.feature)
    .filter(f => !f.properties.isDiscourse); // exclut les discours du calcul des patterns

  patterns = identifyPatterns(visibleFeatures);

  // Rafraîchit la vue si ce n’est pas la carte
  if (currentView === 'proxemic') {
    showProxemicView();
  } else if (currentView === 'gallery') {
    showGalleryView();
  }

  // Ramène les discours au premier plan si nécessaire
  if (discoursLayer) {
    discoursLayer.bringToFront();
  }
}



let patternCounter = 1; // Compteur pour les patterns



const CRITERIA_KEYS = [
  "frequence_usage_aucun", "frequence_usage_ponctuel", "frequence_usage_regulier", "frequence_usage_quotidien",
  "mode_usage_prevu", "mode_usage_detourne", "mode_usage_creatif",
  "intensite_usage_aucun", "intensite_usage_faible", "intensite_usage_moyenne", "intensite_usage_forte",
  "echelle_micro", "echelle_meso", "echelle_macro",
  "origine_forme_institutionnelle", "origine_forme_singuliere", "origine_forme_collective",
  "accessibilite_libre", "accessibilite_semi_ouverte", "accessibilite_fermee",
  "visibilite_cachee", "visibilite_visible", "visibilite_exposee",
  "acteurs_visibles_habitant", "acteurs_visibles_institution", "acteurs_visibles_collectif", "acteurs_visibles_invisible",
  "rapport_affectif_symbolique"
];


const MASK_BY_ID = new Map();
function buildMaskFor(feature) {
  const id = feature.properties.id;
  if (MASK_BY_ID.has(id)) return MASK_BY_ID.get(id);
  let mask = 0;
  CRITERIA_KEYS.forEach((key, idx) => { if (feature.properties[key] === true) mask |= (1 << idx); });
  MASK_BY_ID.set(id, mask);
  return mask;
}
function popcount32(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}
function maskToCriteriaDict(mask) {
  const o = {};
  CRITERIA_KEYS.forEach((key, idx) => { if (mask & (1 << idx)) o[key] = true; });
  return o;
}


// Transforme un dictionnaire {critère:true} en mask binaire
function criteriaDictToMask(dict) {
  let mask = 0;
  CRITERIA_KEYS.forEach((key, idx) => { if (dict && dict[key]) mask |= (1 << idx); });
  return mask;
}

// Calcule les différences entre le mask du pattern et celui du fragment
function diffCriteria(patternMask, fragMask) {
  const shared    = patternMask & fragMask;     // communs
  const different = fragMask   & ~patternMask;  // présents sur le fragment mais pas dans le pattern
  return { shared, different };
}


// Rend une "série de badges" pour un mask donné
function badgesFromMask(mask, className) {
  const frag = document.createDocumentFragment();
  let hasAny = false;
  CRITERIA_KEYS.forEach((key, idx) => {
    if (mask & (1 << idx)) {
      hasAny = true;
      const span = document.createElement('span');
      span.className = `crit-badge ${className}`;
      span.textContent = key.replace(/_/g, ' ');
      frag.appendChild(span);
    }
  });
  if (!hasAny) {
    const span = document.createElement('span');
    span.className = 'crit-empty';
    span.textContent = '—';
    frag.appendChild(span);
  }
  return frag;
}







// ============================
// DÉTECTION DES PATTERNS PAR SIMILARITÉ DE CRITÈRES
// ============================
// Identifie les patterns : groupes d’éléments partageant exactement X critères communs
function identifyPatterns(features) {
  const used = new Set();
  const groups = [];
  let groupIndex = 1;

  for (let i = 0; i < features.length; i++) {
    const f1 = features[i], id1 = f1.properties.id;
    if (used.has(id1)) continue;
    const m1 = buildMaskFor(f1);

    for (let j = i + 1; j < features.length; j++) {
      const f2 = features[j], id2 = f2.properties.id;
      if (used.has(id2)) continue;
      const m2 = buildMaskFor(f2);

      const sharedMask  = (m1 & m2);
      const sharedCount = popcount32(sharedMask);
      if (sharedCount !== patternThreshold) continue;

      const group = { name: `P${groupIndex++}`, elements: [id1, id2], criteria: maskToCriteriaDict(sharedMask) };

      for (let k = 0; k < features.length; k++) {
        const f3 = features[k], id3 = f3.properties.id;
        if (group.elements.includes(id3)) continue;
        const m3 = buildMaskFor(f3);
        if ((m3 & sharedMask) === sharedMask) group.elements.push(id3);
      }

      group.elements.forEach(id => used.add(id));
      groups.push(group);
    }
  }

  const result = {};
  patternNames = {};
  groups.forEach(g => { result[g.name] = g; patternNames[g.name] = g.name; });
  return result;
}


// ============================
// CHARGEMENT DES DONNÉES GEOJSON
// ============================

// Contours (peu interactif) : préciser interactive:false
fetch('data/contour.geojson')
  .then(r => r.json())
  .then(data => {
    L.geoJSON(data, {
      style: { color:'#919090', weight:2, opacity:0.8, fillOpacity:0 },
      interactive: false
    }).addTo(map);
  });

// Chargement parallèle des deux bases spatiales
Promise.all([
  fetch('data/data.geojson').then(r => r.json()),
  fetch('data/datam.geojson').then(r => r.json())
]).then(([data, dataM]) => {
  dataGeojson  = data.features;
  datamGeojson = dataM.features;

  // Montreuil
  L.geoJSON({ type:'FeatureCollection', features: dataGeojson }, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius: 4, color: 'red', weight: 1, opacity: 1, fillColor: 'red', fillOpacity: 0.8
    }),
    style: () => ({ color:'red', weight:0.9, fillOpacity:0.3 }),
    onEachFeature: (feature, layer) => {
      layer.zone = 'montreuil';
      allLayers.push(layer);
      layer.on('click', () => showDetails(feature.properties));
    }
  }).addTo(map);

  // Mirail
  L.geoJSON({ type:'FeatureCollection', features: datamGeojson }, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius: 4, color: 'blue', weight: 1, opacity: 1, fillColor: 'blue', fillOpacity: 0.8
    }),
    style: () => ({ color:'blue', weight:0.9, fillOpacity:0.3 }),
    onEachFeature: (feature, layer) => {
      layer.zone = 'mirail';
      allLayers.push(layer);
      layer.on('click', () => showDetails(feature.properties));
    }
  }).addTo(map);

  // Calcul initial des patterns après chargement des 2 bases
  const allSpatialFeatures = [...dataGeojson, ...datamGeojson].filter(f => !f.properties.isDiscourse);
  patterns = identifyPatterns(allSpatialFeatures); patternsVersion++;
  combinedFeatures = [...dataGeojson, ...datamGeojson];

  if (currentView === 'patterns-map') {
    initPatternMapOnce();
    renderPatternBaseGrey();
    refreshPatternsMap();
  }
});



let discoursLayer = null;

// Assure que le pane est bien créé AVANT le fetch

fetch('data/discours.geojson')
  .then(res => res.json())
  .then(data => {
    discoursLayer = L.geoJSON(data, {
      pane: 'pane-discours',
      pointToLayer: (feature, latlng) => {
        const visible = L.circleMarker(latlng, {
          radius: 5,
          fillColor: 'white',
          color: 'white',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8,
          pane: 'pane-discours'
        });

        const clickableArea = L.circle(latlng, {
          radius: 30,
          color: 'transparent',
          fillColor: 'transparent',
          weight: 0,
          fillOpacity: 0,
          pane: 'pane-discours'
        });

        clickableArea.on('click', () => showDetails(feature.properties));
        visible.on('click', () => showDetails(feature.properties));

        return L.layerGroup([clickableArea, visible]);
      },
      onEachFeature: (feature, layerGroup) => {
        allLayers.push(layerGroup);
        layerGroup.feature = feature;
      }
    });

    discoursLayer.addTo(map);
    applyFilters();
  });


document.querySelectorAll('.filter-zone').forEach(cb => {
  cb.addEventListener('change', () => {
    applyFilters();

    if (currentView === 'proxemic' || currentView === 'gallery') {
      const visibleFeatures = allLayers.filter(layer => map.hasLayer(layer)).map(layer => layer.feature);
      patterns = identifyPatterns(visibleFeatures);

      if (currentView === 'gallery') {
        showGalleryView();
      } else if (currentView === 'proxemic') {
        showProxemicView();
      }
    } else if (currentView === 'critical') {
      showCriticalView(); // ← met à jour la vue critique aussi
    }

      if (currentView === 'patterns-map') {
    // La base grise dépend des zones actives, et les contours aussi
    renderPatternBaseGrey();
    // Les patterns dépendent aussi du seuil → on recalcule comme proxémie/galerie
    const visible = [...dataGeojson, ...datamGeojson].filter(f => isFeatureInActiveZones(f) && !f.properties.isDiscourse);
    patterns = identifyPatterns(visible);
    refreshPatternsMap();
  }
  });
});

// ============================
// CARTE PATTERNS (nouvelle, indépendante)
// ============================
function initPatternMapOnce() {
  if (patternMap) return; // déjà init

  patternMap = L.map('patterns-map', {
    zoomControl: true,
    attributionControl: true
  }).setView(montreuilView, montreuilZoom);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors, © CartoDB'
  }).addTo(patternMap);

  patternBaseLayer = L.layerGroup().addTo(patternMap);  // fragments gris
  patternOverlayGroup = L.layerGroup().addTo(patternMap); // contours colorés

  // Conserver le contour du site si tu le veux aussi sur la carte patterns
  fetch('data/contour.geojson')
    .then(r => r.json())
    .then(contour => {
      L.geoJSON(contour, {
        style: {
          color: '#919090',
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0
        }
      }).addTo(patternMap);
    });
}

// Couches grises des fragments (réutilise tes GeoJSON)
function renderPatternBaseGrey() {
  if (!patternMap) return;
  patternBaseLayer.clearLayers();

  // Fonction de style gris (points / lignes / polygones)
  const baseStyle = {
    color: '#777',
    weight: 1,
    opacity: 1,
    fillColor: '#777',
    fillOpacity: 0.25
  };

  const filterActiveZones = feat => isFeatureInActiveZones(feat) && !feat.properties.isDiscourse;

  // Montreuil
  if (dataGeojson?.length) {
    L.geoJSON({ type: 'FeatureCollection', features: dataGeojson }, {
      filter: filterActiveZones,
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { ...baseStyle, radius: 4 }),
      style: () => baseStyle,
      // ... inside L.geoJSON(... onEachFeature)
onEachFeature: (feature, layer) => {
  layer.on('click', () => onPatternsMapFragmentClick(feature));
}

    }).addTo(patternBaseLayer);
  }

  // Mirail
  if (datamGeojson?.length) {
    L.geoJSON({ type: 'FeatureCollection', features: datamGeojson }, {
      filter: filterActiveZones,
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { ...baseStyle, radius: 4 }),
      style: () => baseStyle,
      // ... inside L.geoJSON(... onEachFeature)
onEachFeature: (feature, layer) => {
  layer.on('click', () => onPatternsMapFragmentClick(feature));
}

    }).addTo(patternBaseLayer);
  }
}


// Crée (au besoin) un pane dédié à un pattern pour contrôler l'ordre d'empilement
function ensureRingPane(ringIndex) {
  const paneId = `pane-ring-${ringIndex}`;
  if (patternPanes.has(paneId)) return paneId;
  patternMap.createPane(paneId);
  patternMap.getPane(paneId).style.zIndex = 600 + ringIndex; // intérieur < extérieur
  patternPanes.set(paneId, paneId);
  return paneId;
}


// Centre "robuste" de n'importe quelle géométrie (Point, LineString, Polygon...)
function getFeatureCenter(feature) {
  // Point → direct
  if (feature.geometry && feature.geometry.type === 'Point') {
    const c = feature.geometry.coordinates;
    return L.latLng(c[1], c[0]);
  }
  // Autres → centre de l'emprise
  const tmp = L.geoJSON(feature);
  let center;
  try {
    center = tmp.getBounds().getCenter();
  } catch(e) {
    // fallback très défensif
    const c = (feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates[0]) || [0,0];
    center = L.latLng(c[1] || 0, c[0] || 0);
  }
  return center;
}


// Redessine les contours colorés en fonction de "patterns" courant et des zones actives

function refreshPatternsMap() {
  if (!patternMap) return;
  patternOverlayGroup.clearLayers();

  // Index global id -> Feature
  if (!combinedFeatures.length) {
    combinedFeatures = [...(dataGeojson || []), ...(datamGeojson || [])];
  }
  const byId = new Map(combinedFeatures.map(f => [f.properties.id, f]));

  // id -> liste des patterns auxquels le fragment appartient (après filtre de zones)
  const entries = Object.entries(patterns); // [['P1',{...}], ...]
  const membersByFragment = new Map();

  entries.forEach(([pName, pData]) => {
    (pData.elements || []).forEach(id => {
      const f = byId.get(id);
      if (!f) return;
      if (f.properties.isDiscourse) return;
      if (!isFeatureInActiveZones(f)) return;
      if (!membersByFragment.has(id)) membersByFragment.set(id, []);
      membersByFragment.get(id).push(pName);
    });
  });

  // Paramètres visuels “discrets”
  const BASE_RADIUS  = 5; // rayon intérieur
  const RING_SPACING = 3; // écart entre anneaux
  const RING_WEIGHT  = 2; // épaisseur de trait (fixe)

  // On dessine PAR FRAGMENT : cercles concentriques (un par pattern)
  membersByFragment.forEach((pList, id) => {
    const feature = byId.get(id);
    if (!feature) return;

    // ordre stable : intérieur = plus petit numéro (P1), extérieur = plus grand
    const rings = pList.slice().sort((a, b) => {
      const ai = parseInt(String(a).replace('P', ''), 10);
      const bi = parseInt(String(b).replace('P', ''), 10);
      return ai - bi; // P1 dedans, Pmax dehors
    });

    const centerLatLng = getFeatureCenter(feature);

    rings.forEach((pName, idx) => {
      const color  = colorForPattern(pName);
      const radius = BASE_RADIUS + idx * RING_SPACING;

      // un pane par anneau pour bien gérer la superposition
      const pane = ensureRingPane(idx);


      // ----- contenu de la tooltip -----
      const fragId   = feature.properties.id || '';
      const fragName = feature.properties.name || '';
      const ringsSorted = rings.slice().sort((a,b) => {
        const ai = parseInt(String(a).replace('P',''), 10);
        const bi = parseInt(String(b).replace('P',''), 10);
        return ai - bi;
      }).join(', ');
      const tipHtml = `
        <div class="pt-title">${fragId}${fragName ? ' — ' + fragName : ''}</div>
        <div class="pt-sub">Appartient aux patterns : ${ringsSorted}</div>
      `;

      // ----- création + attachements -----
      const marker = L.circleMarker(centerLatLng, {
        pane,
        radius,
        color,
        weight: RING_WEIGHT,
        fillOpacity: 0
      });

      marker.on('mouseover', function () {
  if (!this._tooltip) {
    this.bindTooltip(tipHtml, {
      className: 'pattern-tip',
      direction: 'top',
      sticky: true,
      offset: [0, -6],
      opacity: 1
    }).openTooltip();
  }
});
marker.on('mouseout', function () { this.closeTooltip(); });


      marker.on('click', () => onPatternsMapFragmentClick(feature));

      marker.addTo(patternOverlayGroup);
    });
  });
}

function startUnitCreation() {
  setTopTab('patterns');
  setSubTab('patterns-map');
  initPatternMapOnce();

  if (unitCreation.active) return;
  unitCreation.active = true;

  // Masquer les anneaux colorés
  if (patternOverlayGroup && patternMap.hasLayer(patternOverlayGroup)) {
    patternMap.removeLayer(patternOverlayGroup);
    unitCreation.ringsVisible = false;
  }

  // NEW: feedback bouton
  const btn = document.getElementById('create-unit-btn');
  if (btn) {
    btn.textContent = 'Annuler la création';
    btn.classList.add('is-armed');
    btn.setAttribute('aria-pressed', 'true');
  }

  // Curseur + hint
  const cont = patternMap.getContainer();
  cont.classList.add('patterns-creating');

  const hint = document.getElementById('unit-hint');
  hint.style.display = 'block';

  unitCreation.mouseMoveHandler = (e) => {
    hint.style.left = e.clientX + 'px';
    hint.style.top  = e.clientY + 'px';
  };
  window.addEventListener('mousemove', unitCreation.mouseMoveHandler);
}

function stopUnitCreation() {
  if (!unitCreation.active) return;
  unitCreation.active = false;

  // Ré-afficher les anneaux
  if (!unitCreation.ringsVisible && patternOverlayGroup) {
    patternOverlayGroup.addTo(patternMap);
    unitCreation.ringsVisible = true;
  }

  // NEW: remettre le bouton en état normal
  const btn = document.getElementById('create-unit-btn');
  if (btn) {
    btn.textContent = 'Créer une Unité de Projet';
    btn.classList.remove('is-armed');
    btn.setAttribute('aria-pressed', 'false');
  }

  // Enlever curseur + hint
  const cont = patternMap.getContainer();
  cont.classList.remove('patterns-creating');

  const hint = document.getElementById('unit-hint');
  hint.style.display = 'none';

  if (unitCreation.mouseMoveHandler) {
    window.removeEventListener('mousemove', unitCreation.mouseMoveHandler);
    unitCreation.mouseMoveHandler = null;
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && unitCreation.active) {
    stopUnitCreation();
  }
});


// ============================
// SIDEBAR À ONGLETS (uniquement pour "patterns-map")
// ============================
const Tabbed = {
  el: null, tabsBar: null, content: null,
  openTabs: new Map(),     // id -> {btn, panel, kind}
  activeId: null
};

function ensureTabbedSidebar() {
  if (Tabbed.el) return;
  Tabbed.el      = document.getElementById('tabbed-sidebar');
  Tabbed.tabsBar = document.getElementById('tabbed-sidebar-tabs');
  Tabbed.content = document.getElementById('tabbed-sidebar-content');
}

function showTabbedSidebar() {
  ensureTabbedSidebar();
  Tabbed.el.style.display = 'block';
}
function hideTabbedSidebarIfEmpty() {
  if (Tabbed.openTabs.size === 0) {
    Tabbed.el.style.display = 'none';
    Tabbed.activeId = null;
  }
}

function clearAllTabbedTabs() {
  ensureTabbedSidebar();
  // fermer proprement tous les onglets ouverts
  Array.from(Tabbed.openTabs.keys()).forEach(id => closeTab(id));
  // et nettoyer les conteneurs (au cas où)
  Tabbed.tabsBar.innerHTML = '';
  Tabbed.content.innerHTML = '';
  Tabbed.activeId = null;
  Tabbed.el.style.display = 'none';
}


function focusTab(id) {
  if (!Tabbed.openTabs.has(id)) return;
  Tabbed.activeId = id;
  // activer visuellement le bon bouton + panneau
  Tabbed.openTabs.forEach((rec, key) => {
    rec.btn.style.background = (key === id) ? '#222' : '#000';
    rec.btn.style.color      = '#fff';
    rec.panel.style.display  = (key === id) ? 'block' : 'none';
  });
}

function closeTab(id) {
  const rec = Tabbed.openTabs.get(id);
  if (!rec) return;
  rec.btn.remove();
  rec.panel.remove();
  Tabbed.openTabs.delete(id);
  if (Tabbed.activeId === id) {
    // focus sur le dernier onglet restant
    const last = Array.from(Tabbed.openTabs.keys()).pop();
    if (last) focusTab(last);
  }
  hideTabbedSidebarIfEmpty();
}

function makeTabButton(title, id) {
  const btn = document.createElement('button');
  btn.textContent = title;
  btn.title = title;
  btn.style.cssText = 'border:1px solid #333; background:#000; color:#fff; padding:6px 8px; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px; border-radius:4px;';
  btn.addEventListener('click', () => focusTab(id));

  const x = document.createElement('span');
  x.textContent = '×';
  x.style.cssText = 'display:inline-block; padding:0 4px; border-left:1px solid #333; cursor:pointer; opacity:.85;';
  x.addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); });
  btn.appendChild(x);

  return btn;
}

function makePanelContainer(id) {
  const panel = document.createElement('div');
  panel.id = `panel-${id}`;
  panel.style.display = 'none';
  return panel;
}

function openTab({ id, title, kind, render }) {
  ensureTabbedSidebar();

  // Si déjà ouvert : on le met à jour + focus
  if (Tabbed.openTabs.has(id)) {
    focusTab(id);
    return;
  }

  const btn   = makeTabButton(title, id);
  const panel = makePanelContainer(id);

  // Remplir le panneau
  render(panel);

  // Injecter
  Tabbed.tabsBar.appendChild(btn);
  Tabbed.content.appendChild(panel);

  Tabbed.openTabs.set(id, { btn, panel, kind });
  showTabbedSidebar();
  focusTab(id);
}

// Contenu "fragment" (proche de ta sidebar spatiale)
function renderFragmentPanel(panel, props) {
  panel.innerHTML = '';
  const h2 = document.createElement('h2'); h2.textContent = props.name || props.id || 'Fragment';
  const pId = document.createElement('p'); pId.innerHTML = `<strong>ID :</strong> ${props.id || ''}`;
  const pDesc = document.createElement('p'); pDesc.textContent = props.description || '';
  const photos = document.createElement('div');
  if (props.photos && props.photos.length) {
    props.photos.forEach(src => {
      const img = document.createElement('img');
      img.src = src; img.style.width = '100%'; img.style.marginBottom = '8px';
      photos.appendChild(img);
    });
  }
  panel.append(h2, pId, pDesc, photos);
}

// Contenu "pattern" (condensé proxémie)
function renderPatternPanel(panel, patternKey, patternData) {
  panel.innerHTML = '';

  // Titre + critères communs du pattern
  const h2 = document.createElement('h2');
  h2.textContent = `${patternKey} — Pattern`;
  const crits = Object.keys(patternData.criteria || {}).map(c => c.replace(/_/g, ' ')).join(', ');
  const pCrit = document.createElement('p');
  pCrit.innerHTML = `<strong>Critères communs du pattern :</strong> ${crits || '—'}`;

  // Légende explicabilité
  const legend = document.createElement('div');
  legend.className = 'crit-legend';
  legend.innerHTML = `
    <span class="crit-badge badge-shared">partagés</span>
    <span class="crit-badge badge-different">différents</span>
  `;

  // Liste des fragments membres (avec miniature + "pourquoi moi ?")
  const list = document.createElement('div');
  list.className = 'pattern-members';

  const all = [...(dataGeojson || []), ...(datamGeojson || [])];
  const byId = new Map(all.map(f => [f.properties.id, f]));

  // Mask du pattern (à partir de son dict de critères)
  const patternMask = criteriaDictToMask(patternData.criteria || {});

  (patternData.elements || []).forEach(id => {
    const f = byId.get(id);
    const row = document.createElement('div');
    row.className = 'member-row';

    // miniature
    const thumb = document.createElement('div');
    thumb.className = 'member-thumb';
    if (f?.properties?.photos?.[0]) {
      thumb.style.backgroundImage = `url(${f.properties.photos[0]})`;
    }

    // titre fragment
    const title = document.createElement('div');
    title.className = 'member-title';
    title.textContent = f?.properties?.name || id;

    // bloc "pourquoi moi ?"
    const why = document.createElement('div');
    why.className = 'member-why';

    // calcule les 3 masques à partir du bitmask du fragment
    const fragMask = buildMaskFor(f || { properties: { id } });
    const { shared, different } = diffCriteria(patternMask, fragMask);

    // lignes
    const rowShared = document.createElement('div');
    rowShared.className = 'crit-row';
    rowShared.innerHTML = `<span class="crit-label">Partagés</span>`;
    rowShared.appendChild(badgesFromMask(shared, 'badge-shared'));

    const rowDifferent = document.createElement('div');
    rowDifferent.className = 'crit-row';
    rowDifferent.innerHTML = `<span class="crit-label">Différents</span>`;
    rowDifferent.appendChild(badgesFromMask(different, 'badge-different'));

    // clic : ouvre détails du fragment
    row.addEventListener('click', () => showDetails(f?.properties || { id }));

    why.appendChild(rowShared);
    why.appendChild(rowDifferent);

    const right = document.createElement('div');
    right.className = 'member-right';
    right.appendChild(title);
    right.appendChild(why);

    row.appendChild(thumb);
    row.appendChild(right);
    list.appendChild(row);
  });

  panel.append(h2, pCrit, legend, list);
}



function renderDiscoursePanel(panel, props) {
  panel.innerHTML = '';
  const h2 = document.createElement('h2'); h2.textContent = props.id || 'Discours';
  const pA = document.createElement('p'); pA.innerHTML = `<strong>Auteur :</strong> ${props.auteur || ''}`;
  const pD = document.createElement('p'); pD.innerHTML = `<strong>Date :</strong> ${props.date || ''}`;
  const pS = document.createElement('p');
  const src = props.source || '';
  pS.innerHTML = `<strong>Source :</strong> ${
    src && String(src).startsWith('http') ? `<a href="${src}" target="_blank">${src}</a>` : src
  }`;
  const pT = document.createElement('p'); pT.textContent = props.contenu || '';
  panel.append(h2, pA, pD, pS, pT);
}



let isGalleryView = false;

// ============================
// VUE GALERIE (Affichage des patterns sous forme de photos)
// ============================

function showGalleryView() {
  const gallery = document.getElementById('gallery-view');
  gallery.innerHTML = '';

  // conteneur centré et borné (géré par le CSS)
  const wrapper = document.createElement('div');
  wrapper.className = 'gallery-wrapper';
  gallery.appendChild(wrapper);

  Object.entries(patterns).forEach(([key, pattern]) => {
    const block = document.createElement('section');
    block.className = 'pattern-block';

    // Titre propre
    const title = document.createElement('h3');
    const crits = Object.keys(pattern.criteria).map(c => c.replace(/_/g, ' ')).join(', ');
    title.className = 'pattern-title';
    title.textContent = `${key} — Critères : ${crits}`;
    block.appendChild(title);

    // Grille photos
    const grid = document.createElement('div');
    grid.className = 'photo-grid';

    // Ajoute les photos existantes (si présentes)
    [...dataGeojson, ...datamGeojson].forEach(feature => {
      if (pattern.elements.includes(feature.properties.id) && feature.properties.photos?.length) {
        feature.properties.photos.forEach(photo => {
          const cell = document.createElement('div');
          cell.className = 'photo-cell';

          const img = document.createElement('img');
          img.loading = 'lazy';
          img.decoding = 'async';
          img.src = photo;
          img.alt = feature.properties.name || feature.properties.id || 'photo';
          img.onclick = () => showDetails(feature.properties);

          cell.appendChild(img);
          grid.appendChild(cell);
        });
      }
    });

    block.appendChild(grid);
    wrapper.appendChild(block);
  });
}




// ============================
// VUE PROXÉMIQUE (Affichage des patterns en cluster)
// ============================

function showProxemicView() {
    proxemicView.innerHTML = '';

    const viewWidth = proxemicView.offsetWidth;
    const viewHeight = proxemicView.offsetHeight;

    const categories = {
        percu: [
            "frequence_usage_ponctuel", "frequence_usage_regulier", "frequence_usage_quotidien",
            "mode_usage_prevu", "mode_usage_detourne", "mode_usage_creatif",
            "intensite_usage_faible", "intensite_usage_moyenne", "intensite_usage_forte", "intensite_usage_saturee"
        ],
        concu: [
            "echelle_micro", "echelle_meso", "echelle_macro",
            "origine_forme_institutionnelle", "origine_forme_singuliere", "origine_forme_collective",
            "accessibilite_libre", "accessibilite_semi_ouverte", "accessibilite_fermee",
            "visibilite_cachee", "visibilite_visible", "visibilite_exposee"
        ],
        vecu: [
            "acteurs_visibles_habitant", "acteurs_visibles_institution", "acteurs_visibles_collectif", "acteurs_visibles_invisible",
            "rapport_affectif_symbolique"
        ]
    };

    function getDominantCategory(criteria) {
        const counts = { percu: 0, concu: 0, vecu: 0 };
        for (const key of Object.keys(criteria)) {
            if (categories.percu.includes(key)) counts.percu++;
            if (categories.concu.includes(key)) counts.concu++;
            if (categories.vecu.includes(key)) counts.vecu++;
        }
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        return dominant;
    }

    const positions = {
    percu: { x: viewWidth * 0.25, y: viewHeight * 0.35 },
    concu: { x: viewWidth * 0.75, y: viewHeight * 0.35 },
    vecu: { x: viewWidth * 0.5, y: viewHeight * 0.80 }
};

    const radiusScale = d => 8 + d.elements.length * 2;
    const collisionPadding = 4;

    const patternData = Object.values(patterns).map(pattern => {
        const id = Object.keys(patterns).find(key => patterns[key] === pattern);
        const category = getDominantCategory(pattern.criteria);
        return {
            id,
            name: pattern.name,
            criteria: pattern.criteria,
            elements: pattern.elements,
            category,
            x: positions[category].x + (Math.random() - 0.5) * 50,
            y: positions[category].y + (Math.random() - 0.5) * 50
        };
    });

const svgWidth = viewWidth * 2.5;
const svgHeight = viewHeight * 2.5;

const svg = d3.select("#proxemic-view").append("svg")
    .attr("width", svgWidth)
    .attr("height", svgHeight)
    .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`)
    .call(d3.zoom().on("zoom", function (event) {
        svg.attr("transform", event.transform);
    }))
    .append("g");


    const simulation = d3.forceSimulation(patternData)
        .force("x", d3.forceX(d => positions[d.category].x).strength(0.1))
        .force("y", d3.forceY(d => positions[d.category].y).strength(0.1))
        .force("collide", d3.forceCollide(d => radiusScale(d) + collisionPadding).iterations(3))
        .stop();

    for (let i = 0; i < 120; ++i) simulation.tick();

    const patternNodes = svg.selectAll(".pattern-node")
        .data(patternData)
        .join("g")
        .attr("class", "pattern-node")
        .attr("transform", d => `translate(${d.x},${d.y})`);

patternNodes.append("circle")
  .attr("r", d => radiusScale(d))
  .style("fill", d => colorForPattern(d.id))       // même couleur que la carte des patterns
  .style("stroke", d => colorForPattern(d.id))     // contour identique (tu peux mettre noir si tu préfères)
  .style("stroke-width", 2)
  .style("cursor", "pointer")
  .on("click", function(event, d) {
    showDetails({ isPattern: true, patternKey: d.id, elements: d.elements, criteria: d.criteria });
  });

patternNodes.append("text")
  .style("text-anchor", "middle")
  .style("font-size", "12px")
  .style("fill", d => labelColorForPattern(d.id))   // lisible sur la couleur de fond
  .style("font-weight", "bold")
  .text(d => d.name);

        function addLabelWithBackground(svg, x, y, textContent) {
    const group = svg.append("g").attr("transform", `translate(${x}, ${y})`);

    const text = group.append("text")
        .text(textContent)
        .attr("x", 0)
        .attr("y", 0)
        .style("fill", "white")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .style("text-anchor", "middle")
        .attr("dominant-baseline", "middle");

    const bbox = text.node().getBBox();

    group.insert("rect", "text")
        .attr("x", bbox.x - 6)
        .attr("y", bbox.y - 2)
        .attr("width", bbox.width + 12)
        .attr("height", bbox.height + 4)
        .attr("fill", "black")
        .attr("rx", 3)
        .attr("ry", 3);
}

addLabelWithBackground(svg, positions.percu.x, positions.percu.y - 80, "Espace perçu (usage)");
addLabelWithBackground(svg, positions.concu.x, positions.concu.y - 80, "Espace conçu");
addLabelWithBackground(svg, positions.vecu.x, positions.vecu.y + 80, "Espace vécu (expérience)");

}


// ============================
// VUE CRITIQUE (Affichage des discours dans un plan 2D), pour l'instant désactivé
// ============================

function showCriticalView() {
    const positionCounter = {};  // pour compter les discours sur chaque position logique
    const spacing = 21;          // distance de décalage
    const critView = document.getElementById('critical-view');
    critView.innerHTML = ''; // Nettoyer

    const width = 600;
    const height = 600;
    const padding = 70;

    const svg = d3.select("#critical-view").append("svg")
    .attr("width", width)
    .attr("height", height);

const g = svg.append("g").attr("transform", "translate(0,0)")
    .append("g")
    .attr("transform", `translate(${width * 0.1}, ${height * 0.1})`);

    const xScale = d3.scaleLinear().domain([0, 5]).range([padding, width - padding]);
    const yScale = d3.scaleLinear().domain([0, 5]).range([height - padding, padding]);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0, ${height - padding})`)
        .call(d3.axisBottom(xScale).ticks(5));

    svg.append("g")
        .attr("transform", `translate(${padding}, 0)`)
        .call(d3.axisLeft(yScale).ticks(5));

    // Étiquettes
    svg.append("text").text("Passif → Transformateur")
        .attr("x", width / 2)
        .attr("y", height - 10)
        .attr("text-anchor", "middle");

    svg.append("text").text("Institutionnel → Autonome")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 15)
        .attr("text-anchor", "middle");

    // Points
    if (discoursLayer) {
    // Récupérer les zones sélectionnées
    const activeZones = Array.from(document.querySelectorAll('.filter-zone:checked')).map(cb => cb.value);

    discoursLayer.eachLayer(layer => {
        const props = layer.feature.properties;
        const id = props.id || '';

        // Filtrage Montreuil / Mirail
        const isMontreuil = id.startsWith('N');
        const isMirail = id.startsWith('M');
        const zoneAccepted = (isMontreuil && activeZones.includes('montreuil')) || 
                             (isMirail && activeZones.includes('mirail'));

        if (!zoneAccepted) return;

        const x = +props.passif_transformateur;
        const y = +props.istit_autonome;
        const positionsTaken = {};
        const key = `${x}-${y}`;
        let cx = xScale(x);
        let cy = yScale(y);

        // Si déjà pris, on applique un léger offset
        if (positionsTaken[key]) {
            cx += Math.random() * 10 - 5;
            cy += Math.random() * 10 - 5;
        }
        positionsTaken[key] = true;


            const color = id.startsWith("N") ? "red" : "blue";

            if (typeof x === 'number' && typeof y === 'number') {
                const xKey = `${x}`;
const yKey = `${y}`;
const key = `${xKey},${yKey}`;

const baseX = xScale(x);
const baseY = yScale(y);

if (!positionCounter[key]) {
    positionCounter[key] = 0;
}
const index = positionCounter[key]++;
const angle = index * 30 * Math.PI / 180; // 30°, 60°, etc.

const cx = baseX + spacing * index * Math.cos(angle);
const cy = baseY + spacing * index * Math.sin(angle);

const group = svg.append("g").attr("transform", `translate(${cx},${cy})`);

                group.append("circle")
                    .attr("r", 10)
                    .attr("fill", color)
                    .style("cursor", "pointer")
                    .on("click", () => showDetails(props));

                const fullText = props.acteur || '';
const maxCharsPerLine = 20;  // tu peux ajuster selon largeur souhaitée

const lines = [];
let currentLine = '';

fullText.split(' ').forEach(word => {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine += ' ' + word;
    } else {
        lines.push(currentLine.trim());
        currentLine = word;
    }
});
if (currentLine) lines.push(currentLine.trim());

const text = group.append("text")
    .attr("x", 0)
    .attr("y", -15)
    .style("font-size", "12px")
    .style("fill", "#000")
    .style("text-anchor", "middle")
    .style("font-family", "Consolas, monospace");

lines.forEach((line, i) => {
    text.append("tspan")
        .text(line)
        .attr("x", 0)
        .attr("dy", i === 0 ? "0" : "1.2em");
});
            }
        });
    }
}

// ============================
// GESTION DU CHANGEMENT DE VUE
// ============================

function setView(viewId) {
    currentView = viewId;  // <– nouvelle ligne

    const views = {
        map: document.getElementById('map'),
        proxemic: document.getElementById('proxemic-view'),
        gallery: document.getElementById('gallery-view'),
        critical: document.getElementById('critical-view'),
    };

    Object.entries(views).forEach(([key, el]) => {
        el.style.display = key === viewId ? 'block' : 'none';
    });

    if (viewId === 'proxemic') showProxemicView();
    if (viewId === 'gallery') showGalleryView();
    if (viewId === 'critical') showCriticalView();

    updateInterfaceElements(viewId);
}



function updateInterfaceElements(viewId) {
  const legendBtn = document.getElementById('toggle-legend-btn');
  const locationBtn = document.getElementById('toggle-location-btn');

  // Légende visible uniquement en proxémique
  legendBtn.style.display = viewId === 'proxemic' ? 'block' : 'none';

// Bouton "voir Toulouse/Montreuil" sur Fragments, Patterns-carte ET Unité
locationBtn.style.display = (viewId === 'map' || viewId === 'patterns-map' || viewId === 'unit') ? 'block' : 'none';
}


// ---- NAVIGATION NOUVELLE STRUCTURE ----

// Éléments
const topTabs = document.querySelectorAll('.top-tab');
const subnav = document.getElementById('subnav-patterns');
const subTabs = document.querySelectorAll('.sub-tab');

// Vues (ids dans le DOM)
const VIEWS = {
  fragments: 'map',          // ta carte existante
  unit: 'unit-view',         // vue vide pour l’instant
  sub: {
    'patterns-map': 'patterns-map',   // vide pour l’instant
    'proxemic': 'proxemic-view',      // ta proxémie existante
    'gallery': 'gallery-view'         // ta galerie existante
  }
};

// Affiche une vue par id (et masque les autres)
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => {
    if (!v) return;
    v.style.display = (v.id === viewId) ? 'block' : 'none';
  });

  if (viewId === 'map' && typeof window.map !== 'undefined' && window.map) {
    setTimeout(() => window.map.invalidateSize(), 0);
  }

  // >>> AJOUT :
  if (viewId === 'unit-view' && unitMap) {
    setTimeout(() => unitMap.invalidateSize(), 0);
  }
}


function setTopTab(name) {
  topTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.top === name));

  // Always show the bar; just toggle its inactive state
  if (name === 'patterns') {
    subnav.classList.remove('subnav--inactive');
    const currentActiveSub = document.querySelector('.sub-tab.active')?.dataset.sub || 'proxemic';
    setSubTab(currentActiveSub);
  } else {
    subnav.classList.add('subnav--inactive');
    subTabs.forEach(btn => btn.classList.remove('active'));

    if (name === 'fragments') {
      currentView = 'map';
      showView(VIEWS.fragments);
    }
    if (name === 'unit') {
      currentView = 'unit';
      showView(VIEWS.unit);
      ensureUnitMap();
      renderAllUnits();
    }
    updateInterfaceElements(currentView);
  }

  // Si on quitte "patterns", on annule le mode création
if (unitCreation.active && name !== 'patterns') stopUnitCreation();



  // Slider only visible on Patterns
  const similarityControls = document.getElementById('similarity-controls');
  similarityControls.style.display = (name === 'patterns') ? 'block' : 'none';
}



// Active un sous-onglet de "Patterns"
function setSubTab(subName) {

// Si on n'est plus sur "patterns-map", on annule
if (unitCreation.active && subName !== 'patterns-map') stopUnitCreation();


  // --- synchronise currentView avec le sous-onglet actif ---
  if (subName === 'proxemic') currentView = 'proxemic';
  else if (subName === 'gallery') currentView = 'gallery';
  else if (subName === 'patterns-map') currentView = 'patterns-map';


  // activer visuel du sous-onglet
  subTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.sub === subName));

  // afficher le conteneur ciblé
  const viewId = VIEWS.sub[subName];
  showView(viewId);

    if (subName === 'patterns-map') {
    initPatternMapOnce();
    // Important si le conteneur était caché
    setTimeout(() => patternMap.invalidateSize(), 0);

    // Base grise + contours courants
    renderPatternBaseGrey();
    refreshPatternsMap();
  }


  // rendre la vue + ajuster l'UI
  if (subName === 'proxemic') {
    showProxemicView();
  } else if (subName === 'gallery') {
    showGalleryView();
  }
  updateInterfaceElements(currentView);
}

function maybeHideTabbedOnViewChange() {
  if (currentView !== 'patterns-map' && Tabbed?.el) {
    // vider proprement
    Tabbed.openTabs?.forEach((_rec, id) => closeTab(id));
    Tabbed.el.style.display = 'none';
  }
}


// Listeners
topTabs.forEach(btn => {
  btn.addEventListener('click', () => setTopTab(btn.dataset.top));
});

subTabs.forEach(btn => {
  btn.addEventListener('click', () => setSubTab(btn.dataset.sub));
});

// Bouton "Créer une Unité de Projet" — activation du mode sélection
// Bouton "Créer une Unité de Projet" — toggle on/off
const createUnitBtn = document.getElementById('create-unit-btn');
if (createUnitBtn) {
  createUnitBtn.addEventListener('click', () => {
    if (unitCreation.active) {
      // Un 2e clic annule
      stopUnitCreation();
    } else {
      // 1er clic active
      startUnitCreation();
    }
  });
}



// État initial : Fragments (carte)
setTopTab('fragments');
currentView = 'map';
updateInterfaceElements('map');


// ============================
// INFO-BULLE "À PROPOS"
// ============================


document.addEventListener('DOMContentLoaded', () => {
  const infoBtn = document.getElementById('info-btn');
  const aboutBox = document.getElementById('about');

  function toggleAbout() {
    const isOpen = aboutBox.style.display === 'block';
    aboutBox.style.display = isOpen ? 'none' : 'block';
    // accessibilité
    if (infoBtn) infoBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
  }

  if (infoBtn) infoBtn.addEventListener('click', toggleAbout);

  // (optionnel) fermer avec Échap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aboutBox.style.display === 'block') toggleAbout();
  });
});





// ============================
// SLIDER POUR AJUSTER LE NIVEAU DE SIMILARITÉ DES PATTERNS
// ============================


function debounce(fn, delay = 160) {
  let t;
  return function (...args) {
    const ctx = this;                 // on conserve le this du listener
    clearTimeout(t);
    t = setTimeout(() => fn.apply(ctx, args), delay);
  };
}

const sliderEl = document.getElementById('similarity-slider');

sliderEl.addEventListener('input', debounce(function (e) {
  const value = parseInt(e.target.value, 10);
  patternThreshold = value;
  document.getElementById('slider-value').textContent = value;

  // 1) Recalcule toujours sur les éléments visibles selon les zones (hors discours)
  const visible = [...(dataGeojson || []), ...(datamGeojson || [])]
    .filter(f => isFeatureInActiveZones ? isFeatureInActiveZones(f) : true)
    .filter(f => !f.properties?.isDiscourse);

  patterns = identifyPatterns(visible);

  // 2) Rafraîchir la vue courante (suivant ce que ton code expose)
  if (currentView === 'gallery') {
    showGalleryView();
  } else if (currentView === 'proxemic') {
    showProxemicView();
  } else if (currentView === 'patterns-map') {
    // si tu as ces fonctions (carte des patterns)
    if (typeof renderPatternBaseGrey === 'function') renderPatternBaseGrey();
    if (typeof refreshPatternsMap === 'function')    refreshPatternsMap();
  }
}, 160));



// ========== NOUVELLE CARTE "PATTERNS" ==========
let patternMap = null;
let patternBaseLayer = null;        // couches grises (fragments)
let patternOverlayGroup = null;     // tous les contours colorés
let patternPanes = new Map();       // pane par pattern (z-index)
let combinedFeatures = [];          // dataGeojson + datamGeojson (mise à jour après le chargement)

// --- Couleurs fixes par pattern (ajoute/ajuste si besoin) ---

// --- 100 couleurs très distinctes (P1..P100) ---
// Teinte = pas du "golden angle" (≈137.508°) pour espacer fortement les couleurs
// + cycles de saturation/luminance pour maximiser le contraste sur fond sombre
const SAT_SEQ = [95, 85, 90, 80];   // % (très vives → plus lisibles sur fond dark)
const LIT_SEQ = [58, 70, 50, 64];   // % (on alterne clair/sombre pour casser la ressemblance)

const PATTERN_COLORS = Object.fromEntries(
  Array.from({ length: 100 }, (_, i) => {
    const hue = Math.round((i * 137.508) % 360);          // 0..359 (golden angle)
    const sat = SAT_SEQ[i % SAT_SEQ.length];              // 95,85,90,80...
    const lit = LIT_SEQ[(Math.floor(i / 4)) % LIT_SEQ.length]; // 58,70,50,64...
    return [`P${i + 1}`, `hsl(${hue}, ${sat}%, ${lit}%)`];
  })
);

// Utilitaire : couleur par nom de pattern (stable >100 aussi)
function colorForPattern(pName) {
  if (PATTERN_COLORS[pName]) return PATTERN_COLORS[pName];
  const n = parseInt(String(pName).replace(/^P/i, ''), 10);
  if (Number.isFinite(n)) {
    const idx = ((n - 1) % 100) + 1;
    return PATTERN_COLORS[`P${idx}`];
  }
  let h = 0; for (const c of String(pName)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 90%, 55%)`;
}

// → optionnel mais pratique si un jour tu modules ton script
window.colorForPattern = colorForPattern;

function labelColorForPattern(pName) {
  const hsl = colorForPattern(pName);            // ex: "hsl(123, 90%, 58%)"
  const m = hsl.match(/hsl\(\s*\d+,\s*\d+%?,\s*(\d+)%\s*\)/);
  const L = m ? parseInt(m[1], 10) : 55;        // Luminance en %
  return (L >= 62) ? '#000' : '#fff';           // seuil simple : si clair → texte noir
}

// Helpers zones actives (même logique que tes checkboxes)
function getActiveZones() {
  return Array.from(document.querySelectorAll('.filter-zone:checked')).map(cb => cb.value);
}
function isFeatureInActiveZones(f) {
  const zones = getActiveZones();
  // règle simple : Montreuil = id commence par 'N' ; Mirail = 'M'
  const id = f.properties?.id || '';
  const isN = id.startsWith('N');
  const isM = id.startsWith('M');
  return (isN && zones.includes('montreuil')) || (isM && zones.includes('mirail'));
}

// Renvoie la liste triée ['P1','P3',...] des patterns auxquels appartient un fragment donné
function getPatternsForFragment(fragmentId) {
  const result = [];
  Object.entries(patterns || {}).forEach(([pName, pData]) => {
    if ((pData.elements || []).includes(fragmentId)) result.push(pName);
  });
  // tri stable par numéro
  result.sort((a, b) => parseInt(a.replace('P','')) - parseInt(b.replace('P','')));
  return result;
}

// Handler de clic utilisé UNIQUEMENT sur la carte patterns
function onPatternsMapFragmentClick(feature) {
  // --- NOUVEAU : si on est en mode création d’unité, on capture et on sort ---
  if (unitCreation.active) {
    handleUnitSelection(feature);
    return;
  }

  // Comportement normal (ouverture d’onglets)
  if (currentView !== 'patterns-map') {
    return showDetails(feature.properties);
  }

  clearAllTabbedTabs();
  closeSidebars(); // masque les sidebars "spatiale/discours" classiques

  // 1) Ouvre l'onglet "fragment"
  const fProps = feature.properties || {};
  const fragId = fProps.id || Math.random().toString(36).slice(2);
  openTab({
    id: `frag-${fragId}`,
    title: fProps.id || 'Fragment',
    kind: 'fragment',
    render: (panel) => renderFragmentPanel(panel, fProps)
  });

  // 2) Ouvre un onglet par pattern associé
  const pList = getPatternsForFragment(fragId);
  pList.forEach(pName => {
    const pData = patterns[pName];
    if (!pData) return;
    openTab({
      id: `pattern-${pName}`,
      title: pName,
      kind: 'pattern',
      render: (panel) => renderPatternPanel(panel, pName, pData)
    });
  });
}

function handleUnitSelection(feature) {
  // 1) On arrête le mode création (on ré-affiche les anneaux, etc.)
  stopUnitCreation();

  // 2) On enregistre localement (localStorage) une "unité" minimale
  const unit = {
    id: `UP-${Date.now()}`,     // id simple unique
    sourceFragmentId: feature?.properties?.id || null,
    geometry: feature.geometry,  // on reprend la géométrie du fragment
    props: {
      name: feature?.properties?.name || feature?.properties?.id || 'Fragment sélectionné'
    },
    createdAt: new Date().toISOString()
  };
  saveUnitLocal(unit);

// 3) Bascule onglet + affiche TOUTES les unités, puis zoom sur la nouvelle
setTopTab('unit');
showView('unit-view');
setTimeout(() => {
  renderAllUnits();
  zoomToUnit(unit);
}, 0);
}

// Sauvegarde cumulée : un tableau "units"
function saveUnitLocal(unit) {
  try {
    const key = 'units';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.push(unit);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    console.warn('Impossible d’enregistrer localement l’unité :', e);
  }
}

function loadUnitsLocal() {
  try {
    return JSON.parse(localStorage.getItem('units') || '[]');
  } catch(e) {
    return [];
  }
}





function ensureUnitMap() {
  if (unitMap) {
    setTimeout(() => unitMap.invalidateSize(), 0);
    return unitMap;
  }

  // Crée la carte
  unitMap = L.map('unit-view', {
    zoomControl: true,
    attributionControl: true
  }).setView(montreuilView, montreuilZoom);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors, © CartoDB'
  }).addTo(unitMap);

  // Groupes
  unitContextGroup = L.layerGroup().addTo(unitMap); // contexte (contours…)
  unitLayerGroup   = L.layerGroup().addTo(unitMap); // unités

  // Ajoute les contours Montreuil/Mirail (même fichier que sur les autres cartes)
  fetch('data/contour.geojson')
    .then(r => r.json())
    .then(contour => {
      L.geoJSON(contour, {
        style: { color: '#919090', weight: 2, opacity: 0.8, fillOpacity: 0 }
      }).addTo(unitContextGroup);
    });

  return unitMap;
}


function renderAllUnits() {
  const mapU = ensureUnitMap();
  unitLayerGroup.clearLayers();

  const whiteStyle = { color:'#fff', weight:2, opacity:1, fillColor:'#fff', fillOpacity:0.25 };
  const units = loadUnitsLocal();
  let unionBounds = null;

  units.forEach(u => {
    const layer = L.geoJSON(
      { type:'Feature', geometry:u.geometry, properties:u.props },
      {
        pointToLayer: (_f, latlng) => L.circleMarker(latlng, { ...whiteStyle, radius: 6 }),
        style: () => whiteStyle
      }
    ).addTo(unitLayerGroup);

    if (layer.getBounds) {
      const b = layer.getBounds();
      unionBounds = unionBounds ? unionBounds.extend(b) : b;
    }
  });

  // si tu veux auto-zoomer sur l’ensemble existant :
  if (unionBounds && unionBounds.isValid && unionBounds.isValid()) {
    mapU.fitBounds(unionBounds.pad(0.3));
  }
}

function zoomToUnit(unit) {
  const mapU = ensureUnitMap();
  try {
    // si Polygon/LineString : bbox
    const tmp = L.geoJSON({ type:'Feature', geometry:unit.geometry });
    const b = tmp.getBounds?.();
    if (b && b.isValid && b.isValid()) {
      mapU.fitBounds(b.pad(0.3));
      return;
    }
  } catch(e) {}

  // sinon (Point), on centre/zoom
  const center = getFeatureCenter({ geometry: unit.geometry });
  if (center) mapU.setView(center, 17);
}


function showUnitOnMap(unit) {
  const mapU = ensureUnitMap();

  // On n'efface plus rien : on AJOUTE dans le groupe
  const whiteStyle = { color:'#fff', weight:2, opacity:1, fillColor:'#fff', fillOpacity:0.25 };

  const layer = L.geoJSON(
    { type:'Feature', geometry:unit.geometry, properties:unit.props },
    {
      pointToLayer: (_f, latlng) => L.circleMarker(latlng, { ...whiteStyle, radius: 6 }),
      style: () => whiteStyle
    }
  ).addTo(unitLayerGroup);

  // Zoom sympa sur la dernière créée
  try {
    const b = layer.getBounds?.();
    if (b && b.isValid && b.isValid()) {
      mapU.fitBounds(b.pad(0.3));
    } else {
      const center = getFeatureCenter({ geometry: unit.geometry });
      if (center) mapU.setView(center, 17);
    }
  } catch(e) {
    console.warn('Fit bounds unité :', e);
  }
}




