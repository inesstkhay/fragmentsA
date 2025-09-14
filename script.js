/***************************************************
 * backdoorurbanism — script.js 
 ***************************************************/

/*---------------------------------------
  1) BOUTON : TOGGLE LÉGENDE
---------------------------------------*/
document.getElementById('toggle-legend-btn').addEventListener('click', () => {
  const legend = document.getElementById('criteria-legend');
  legend.style.display = (legend.style.display === 'none' || legend.style.display === '') ? 'block' : 'none';
});


/*---------------------------------------
  2) CONSTANTES / ÉTAT GLOBAL / DOM
---------------------------------------*/
let currentView = 'map';                   // vue active globale
const montreuilView = [48.8710, 2.4330];
const montreuilZoom = 15;
const toulouseView  = [43.5675824, 1.4000176];
const toulouseZoom  = 15;
let currentLocation = 'montreuil';         // localisation initiale
let patternsVersion = 0;                   // (NOTE: compteur; non utilisé ailleurs)
let patternThreshold = 5;                  // nb de critères communs pour former un pattern

// Références DOM fréquentes
const proxemicView  = document.getElementById('proxemic-view');

// État de données
let allLayers      = [];   // toutes couches cliquables (fragments & discours)
let dataGeojson    = [];   // fragments Montreuil
let datamGeojson   = [];   // fragments Mirail
let patterns       = {};   // { P1: {name,elements[],criteria{}}, ... }
let patternNames   = {};   // { P1:'P1', ... } (alias si besoin)
let discoursLayer  = null; // couche de points "discours" (pane dédié)
let combinedFeatures = []; // concat Montreuil + Mirail (utile patterns-map)

// Panne "discours" au-dessus
let map = L.map('map').setView(montreuilView, montreuilZoom);
map.createPane('pane-discours');
map.getPane('pane-discours').style.zIndex = 650; // > autres couches

// Fond de carte (dark)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors, © CartoDB'
}).addTo(map);

/*---------------------------------------
ÉTAT CRÉATION D’UNITÉ (patterns-map)
  (la logique détaillée arrive en Partie 2)
---------------------------------------*/
let unitCreation = {
  active: false,
  ringsVisible: true,
  mouseMoveHandler: null
};
let unitMap = null;             // carte dédiée "Unité de projet" (Partie 2)
let unitLayerGroup = null;      // toutes les unités dessinées
let unitContextGroup = null;    // contexte (contours, base grise, etc.)



/* ------------ Helpers images : nettoyage & création d'<img> ------------- */
function cleanPhotoUrl(u) {
  if (!u) return null;
  // trim + force https
  let s = String(u).trim().replace(/^http:\/\//i, 'https://');
  // garde uniquement l'URL (si du HTML a été collé)
  const m = s.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}

function normalizePhotos(p) {
  if (!p) return [];
  if (Array.isArray(p)) return p;
  if (typeof p === 'string') {
    // accepte séparateur virgule ou point-virgule
    return p.split(/[;,]\s*/).filter(Boolean);
  }
  return [];
}

function makeImg(src, alt = 'photo') {
  const url = cleanPhotoUrl(src);
  if (!url) return null;
  const img = document.createElement('img');
  img.src = url;
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  // Certains hébergeurs n'aiment pas le referrer : on l'enlève
  img.referrerPolicy = 'no-referrer';
  // Si l'image échoue, on la masque pour éviter un gros carré cassé
  img.onerror = () => { img.style.display = 'none'; };
  return img;
}





/*---------------------------------------
  CARTE PRINCIPALE (Fragments)
  (déjà initialisée ci-dessus)
---------------------------------------*/



/*---------------------------------------
  BASCULE TOULOUSE / MONTREUIL
---------------------------------------*/
function toggleLocation() {
  const locationButton = document.getElementById('toggle-location-btn');

  // Choisir/initialiser la carte cible selon la vue courante
  let targetMap = map; // défaut: carte "Fragments"

  if (currentView === 'patterns-map') {
    // S'assure que la carte patterns existe
    initPatternMapOnce?.();
    if (patternMap) targetMap = patternMap;            // << plus de window.
  } else if (currentView === 'unit' || currentView === 'unit-view') {
    // S'assure que la carte unité existe
    ensureUnitMap?.();
    if (unitMap) targetMap = unitMap;                  // << plus de window.
  }

  // Bascule de localisation
  if (currentLocation === 'montreuil') {
    targetMap.setView([43.5675824, 1.4000176], 15); // Toulouse
    if (locationButton) locationButton.textContent = 'Voir Montreuil';
    currentLocation = 'toulouse';
  } else {
    targetMap.setView([48.8710, 2.4330], 15);       // Montreuil
    if (locationButton) locationButton.textContent = 'Voir Toulouse';
    currentLocation = 'montreuil';
  }
}


/*---------------------------------------
 SIDEBARS CLASSIQUES (spatial/discours)
  (les panneaux riches sont gérés par les onglets — Partie 2)
---------------------------------------*/
function openSidebar(el) {
  if (!el) return;
  el.style.display   = 'block';
  el.style.position  = 'fixed';
  el.style.top       = '90px';
  el.style.right     = '10px';
  el.style.maxHeight = 'calc(100vh - 120px)';
  el.style.overflowY = 'auto';
  el.style.zIndex    = '4001'; // au-dessus du footer & panes
}

// Helper central qui route vers les bons panneaux (Partie 2)
function showDetails(props) {
  clearAllTabbedTabs(); // exclusif : 1 clic = 1 set d’infos (fonction en Partie 2)

  if (props.isPattern) {
    const key = props.patternKey || 'Pattern';
    openTab({                         // openTab / renderPatternPanel en Partie 2
      id: `pattern-${key}`,
      title: key,
      kind: 'pattern',
      render: (panel) => renderPatternPanel(panel, key, {
        criteria: props.criteria || {},
        elements: props.elements || []
      })
    });
  } else if (props.isDiscourse) {
    openTab({                         // renderDiscoursePanel en Partie 2
      id: `disc-${props.id || Math.random().toString(36).slice(2)}`,
      title: props.id || 'Discours',
      kind: 'discourse',
      render: (panel) => renderDiscoursePanel(panel, props)
    });
  } else {
    const fid = props.id || Math.random().toString(36).slice(2);
    openTab({                         // renderFragmentPanel en Partie 2
      id: `frag-${fid}`,
      title: props.id || 'Fragment',
      kind: 'fragment',
      render: (panel) => renderFragmentPanel(panel, props)
    });
  }

  // masque les anciennes sidebars (sécurité)
  const sb1 = document.getElementById('spatial-sidebar');
  const sb2 = document.getElementById('discourse-sidebar');
  if (sb1) sb1.style.display = 'none';
  if (sb2) sb2.style.display = 'none';
}

function closeSidebars() {
  const sb1 = document.getElementById('spatial-sidebar');
  const sb2 = document.getElementById('discourse-sidebar');
  if (sb1) sb1.style.display = 'none';
  if (sb2) sb2.style.display = 'none';
  clearAllTabbedTabs(); // (Partie 2)
}


/*---------------------------------------
  8) FILTRES + RECALCUL PATTERNS
---------------------------------------*/
function applyFilters() {
  const showDiscourses = true; // aujourd’hui: on affiche tjs les discours
  const activeZones = Array.from(document.querySelectorAll('.filter-zone:checked')).map(cb => cb.value);

  allLayers.forEach(layer => {
    const props = layer.feature.properties;
    const isDiscourse = props.isDiscourse;

    const showLayer = isDiscourse ? showDiscourses : activeZones.includes(layer.zone);
    if (showLayer) {
      if (!map.hasLayer(layer)) layer.addTo(map);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  });

  // recalcul patterns sur les éléments visibles (hors discours)
  const visibleFeatures = allLayers
    .filter(layer => map.hasLayer(layer))
    .map(layer => layer.feature)
    .filter(f => !f.properties.isDiscourse);

  patterns = identifyPatterns(visibleFeatures);

  // rafraîchit autres vues selon currentView (les fonctions sont en Partie 2)
  if (currentView === 'proxemic')       showProxemicView();
  else if (currentView === 'gallery')   showGalleryView();

  // discours au premier plan si nécessaire
  if (discoursLayer) discoursLayer.bringToFront();
}

// écoute modifications des checkboxes de zones
document.querySelectorAll('.filter-zone').forEach(cb => {
  cb.addEventListener('change', () => {
    applyFilters();

    if (currentView === 'proxemic' || currentView === 'gallery') {
      const visibleFeatures = allLayers.filter(layer => map.hasLayer(layer)).map(layer => layer.feature);
      patterns = identifyPatterns(visibleFeatures);
      if (currentView === 'gallery')      showGalleryView();
      else if (currentView === 'proxemic') showProxemicView();
    } else if (currentView === 'critical') {
      showCriticalView(); // (Partie 2)
    }

    if (currentView === 'patterns-map') {
      renderPatternBaseGrey(); // (Partie 2)
      const visible = [...dataGeojson, ...datamGeojson].filter(f => isFeatureInActiveZones(f) && !f.properties.isDiscourse);
      patterns = identifyPatterns(visible);
      refreshPatternsMap();   // (Partie 2)
    }
  });
});


/*---------------------------------------
  9) BITMASKS CRITÈRES (perf + utils)
---------------------------------------*/
let patternCounter = 1; // (NOTE: non utilisé directement ici; conservé)

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

function criteriaDictToMask(dict) {
  let mask = 0;
  CRITERIA_KEYS.forEach((key, idx) => { if (dict && dict[key]) mask |= (1 << idx); });
  return mask;
}

function diffCriteria(patternMask, fragMask) {
  const shared    = patternMask & fragMask;     // communs
  const different = fragMask   & ~patternMask;  // dans fragment mais pas pattern
  return { shared, different };
}

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


/*---------------------------------------
 10) DÉTECTION DES PATTERNS (similarité)
---------------------------------------*/
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

      // Ajoute tous les f_k qui incluent strictement ces critères partagés
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


/*---------------------------------------
 11) CHARGEMENT DES DONNÉES GEOJSON
---------------------------------------*/
// Contours (non interactifs)
fetch('data/contour.geojson')
  .then(r => r.json())
  .then(data => {
    L.geoJSON(data, {
      style: { color:'#919090', weight:2, opacity:0.8, fillOpacity:0 },
      interactive: false
    }).addTo(map);
  });

// Fragments Montreuil + Mirail
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

  // Calcul initial des patterns (toutes zones)
  const allSpatialFeatures = [...dataGeojson, ...datamGeojson].filter(f => !f.properties.isDiscourse);
  patterns = identifyPatterns(allSpatialFeatures);
  patternsVersion++;
  combinedFeatures = [...dataGeojson, ...datamGeojson];

  // Si la carte patterns est déjà affichée, force un 1er rendu (Partie 2)
  if (currentView === 'patterns-map') {
    initPatternMapOnce();
    renderPatternBaseGrey();
    refreshPatternsMap();
  }
});

// Discours (pane dédié + grande zone cliquable transparente)
fetch('data/discours.geojson')
  .then(res => res.json())
  .then(data => {
    discoursLayer = L.geoJSON(data, {
      pane: 'pane-discours',
      pointToLayer: (feature, latlng) => {
        const visible = L.circleMarker(latlng, {
          radius: 5, fillColor: 'white', color: 'white', weight: 1, opacity: 1, fillOpacity: 0.8, pane: 'pane-discours'
        });
        const clickableArea = L.circle(latlng, {
          radius: 30, color: 'transparent', fillColor: 'transparent', weight: 0, fillOpacity: 0, pane: 'pane-discours'
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
    applyFilters(); // pour respecter l’état des checkboxes
  });


/*==================================================
=                SIDEBAR À ONGLETS                 =
==================================================*/
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
  Array.from(Tabbed.openTabs.keys()).forEach(id => closeTab(id));
  Tabbed.tabsBar.innerHTML = '';
  Tabbed.content.innerHTML = '';
  Tabbed.activeId = null;
  Tabbed.el.style.display = 'none';
}

function focusTab(id) {
  if (!Tabbed.openTabs.has(id)) return;
  Tabbed.activeId = id;
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
  if (Tabbed.openTabs.has(id)) { focusTab(id); return; }

  const btn   = makeTabButton(title, id);
  const panel = makePanelContainer(id);

  // ➜ D'abord attacher au DOM
  Tabbed.tabsBar.appendChild(btn);
  Tabbed.content.appendChild(panel);

  // ➜ Ensuite rendre le contenu (les IDs existent dans le document)
  render(panel);

  Tabbed.openTabs.set(id, { btn, panel, kind });
  showTabbedSidebar();
  focusTab(id);
}



/*==================================================
=    MÉTADONNÉES LOCALES PAR FRAGMENT (usage+discours) (texte)      =
==================================================*/
function getFragMetaKey(id){ return `fragmeta:${id}`; }
function loadFragmentMeta(fragmentId) {
  try {
    return JSON.parse(localStorage.getItem(getFragMetaKey(fragmentId)) || 'null') || { usages: [], discours: [] };
  } catch(e) { return { usages: [], discours: [] }; }
}
function saveFragmentMeta(fragmentId, meta) {
  localStorage.setItem(getFragMetaKey(fragmentId), JSON.stringify(meta));
  window.dispatchEvent(new CustomEvent('fragmeta:updated', { detail: { fragmentId, meta } }));
}
function uid(){ return Math.random().toString(36).slice(2,9); }


/*==================================================
=                PANNEAU FRAGMENT                  =
==================================================*/
function renderFragmentPanel(panel, props) {
  panel.innerHTML = '';

  const fragId = props.id || '—';
  const h2 = document.createElement('h2'); h2.textContent = props.name || fragId || 'Fragment';
  const pId = document.createElement('p'); pId.innerHTML = `<strong>ID :</strong> ${fragId}`;
  const pDesc = document.createElement('p'); pDesc.textContent = props.description || '';
  const photos = document.createElement('div');
  const photoList = normalizePhotos(props.photos);
  if (photoList.length) {
    photoList.forEach(src => {
      const img = makeImg(src, props.name || fragId || 'photo');
      if (img) {
        img.style.width = '100%';
        img.style.marginBottom = '8px';
        photos.appendChild(img);
      }
    });
  }
  panel.append(h2, pId, pDesc, photos);

  // Actions 3D
  const actions = document.createElement('div');
  actions.className = 'btn-row';
  const btnOpen3D = document.createElement('button');
  btnOpen3D.className = 'tab-btn btn-sm primary';
  btnOpen3D.textContent = hasFragment3D(fragId) ? 'Voir la 3D' : 'Importer 3D';
  btnOpen3D.addEventListener('click', () => openThreeModalForFragment(fragId));
  actions.append(btnOpen3D);
  if (hasFragment3D(fragId)) {
    const btnImport3D = document.createElement('button');
    btnImport3D.className = 'tab-btn btn-sm';
    btnImport3D.textContent = 'Remplacer 3D';
    btnImport3D.addEventListener('click', () => promptImport3DForFragment(fragId, true));
    actions.append(btnImport3D);
  }
  panel.append(actions);

  // Blocs Usages / Discours
  const meta = loadFragmentMeta(fragId);
  function makeEditorBlock(title, listKey, placeholder) {
    const box = document.createElement('div'); box.className = 'meta-box';
    const head = document.createElement('div'); head.className = 'meta-head'; head.innerHTML = `<strong>${title}</strong>`;
    box.appendChild(head);
    const addRow = document.createElement('div'); addRow.className = 'meta-add-row';
    const ta = document.createElement('textarea'); ta.className = 'meta-ta'; ta.rows = 3; ta.placeholder = placeholder;
    const addBtn = document.createElement('button'); addBtn.className = 'tab-btn btn-sm'; addBtn.textContent = 'Ajouter';
    addBtn.addEventListener('click', () => {
      const txt = ta.value.trim(); if (!txt) return;
      meta[listKey].push({ id: uid(), text: txt });
      saveFragmentMeta(fragId, meta); ta.value = ''; renderList();
    });
    addRow.append(ta, addBtn); box.appendChild(addRow);
    const list = document.createElement('div'); list.className = 'meta-list'; box.appendChild(list);

    function renderList() {
      list.innerHTML = '';
      meta[listKey].forEach(item => {
        const row = document.createElement('div'); row.className = 'meta-item';
        const left = document.createElement('div'); left.className = 'meta-item-left';
        const txt = document.createElement('div'); txt.className = 'meta-item-text'; txt.textContent = item.text; txt.title = 'Cliquer pour éditer';
        txt.addEventListener('click', () => {
          if (row.querySelector('textarea')) return;
          const editor = document.createElement('textarea'); editor.className = 'meta-edit'; editor.value = item.text; editor.rows = Math.max(2, Math.ceil(item.text.length / 60));
          const saveBtn = document.createElement('button'); saveBtn.className = 'tab-btn btn-xs primary'; saveBtn.textContent = 'OK';
          const cancelBtn = document.createElement('button'); cancelBtn.className = 'tab-btn btn-xs'; cancelBtn.textContent = 'Annuler';
          const editRow = document.createElement('div'); editRow.className = 'meta-edit-row'; editRow.append(editor, saveBtn, cancelBtn);
          left.replaceChild(editRow, txt);
          saveBtn.addEventListener('click', () => {
            const newTxt = editor.value.trim(); if (newTxt) { item.text = newTxt; saveFragmentMeta(fragId, meta); }
            renderList();
          });
          cancelBtn.addEventListener('click', renderList);
        });
        left.appendChild(txt);
        const right = document.createElement('div'); right.className = 'meta-item-right';
        const delBtn = document.createElement('button'); delBtn.className = 'tab-btn btn-xs danger'; delBtn.textContent = 'Suppr.'; delBtn.title = 'Supprimer';
        delBtn.addEventListener('click', () => {
          meta[listKey] = meta[listKey].filter(x => x.id !== item.id);
          saveFragmentMeta(fragId, meta);
          renderList();
        });
        right.appendChild(delBtn);
        row.append(left, right);
        list.appendChild(row);
      });
      if (!meta[listKey].length) {
        const empty = document.createElement('div'); empty.className = 'meta-empty'; empty.textContent = '— Aucun élément pour le moment.';
        list.appendChild(empty);
      }
    }
    renderList();
    return box;
  }
  const usagesBlock   = makeEditorBlock('Usages',   'usages',   'Ex : « Lieu de réunion… »');
  const discoursBlock = makeEditorBlock('Discours', 'discours', 'Ex : « L’institution prévoit… »');
  panel.append(usagesBlock, discoursBlock);
}


/*==================================================
=                PANNEAU PATTERN                   =
==================================================*/
function renderPatternPanel(panel, patternKey, patternData) {
  panel.innerHTML = '';
  const h2 = document.createElement('h2');
  h2.textContent = `${patternKey} — Pattern`;
  const crits = Object.keys(patternData.criteria || {}).map(c => c.replace(/_/g, ' ')).join(', ');
  const pCrit = document.createElement('p'); pCrit.innerHTML = `<strong>Critères communs du pattern :</strong> ${crits || '—'}`;
  const legend = document.createElement('div');
  legend.className = 'crit-legend';
  legend.innerHTML = `
    <span class="crit-badge badge-shared">partagés</span>
    <span class="crit-badge badge-different">différents</span>
  `;

  const list = document.createElement('div'); list.className = 'pattern-members';
  const all = [...(dataGeojson || []), ...(datamGeojson || [])];
  const byId = new Map(all.map(f => [f.properties.id, f]));
  const patternMask = criteriaDictToMask(patternData.criteria || {});
  (patternData.elements || []).forEach(id => {
    const f = byId.get(id);
    const row = document.createElement('div'); row.className = 'member-row';
    const thumb = document.createElement('div'); thumb.className = 'member-thumb';
    const first = cleanPhotoUrl(normalizePhotos(f?.properties?.photos)[0]);
if (first) thumb.style.backgroundImage = `url("${first}")`;

    const title = document.createElement('div'); title.className = 'member-title'; title.textContent = f?.properties?.name || id;
    const why = document.createElement('div'); why.className = 'member-why';
    const fragMask = buildMaskFor(f || { properties: { id } });
    const { shared, different } = diffCriteria(patternMask, fragMask);
    const rowShared = document.createElement('div'); rowShared.className = 'crit-row'; rowShared.innerHTML = `<span class="crit-label">Partagés</span>`;
    rowShared.appendChild(badgesFromMask(shared, 'badge-shared'));
    const rowDifferent = document.createElement('div'); rowDifferent.className = 'crit-row'; rowDifferent.innerHTML = `<span class="crit-label">Différents</span>`;
    rowDifferent.appendChild(badgesFromMask(different, 'badge-different'));
    row.addEventListener('click', () => showDetails(f?.properties || { id }));
    why.append(rowShared, rowDifferent);
    const right = document.createElement('div'); right.className = 'member-right'; right.append(title, why);
    row.append(thumb, right); list.appendChild(row);
  });

  panel.append(h2, pCrit, legend, list);
}


/*==================================================
=                PANNEAU DISCOURS                  =
==================================================*/
function renderDiscoursePanel(panel, props) {
  panel.innerHTML = '';
  const h2 = document.createElement('h2'); h2.textContent = props.id || 'Discours';
  const pA = document.createElement('p'); pA.innerHTML = `<strong>Auteur :</strong> ${props.auteur || ''}`;
  const pD = document.createElement('p'); pD.innerHTML = `<strong>Date :</strong> ${props.date || ''}`;
  const pS = document.createElement('p');
  const src = props.source || '';
  pS.innerHTML = `<strong>Source :</strong> ${ src && String(src).startsWith('http') ? `<a href="${src}" target="_blank">${src}</a>` : src }`;
  const pT = document.createElement('p'); pT.textContent = props.contenu || '';
  panel.append(h2, pA, pD, pS, pT);
}


/*==================================================
=                    VUE GALERIE                   =
==================================================*/
function showGalleryView() {
  const gallery = document.getElementById('gallery-view');
  gallery.innerHTML = '';
  const wrapper = document.createElement('div'); wrapper.className = 'gallery-wrapper'; gallery.appendChild(wrapper);

  Object.entries(patterns).forEach(([key, pattern]) => {
    const block = document.createElement('section'); block.className = 'pattern-block';
    const title = document.createElement('h3');
    const crits = Object.keys(pattern.criteria).map(c => c.replace(/_/g, ' ')).join(', ');
    title.className = 'pattern-title'; title.textContent = `${key} — Critères : ${crits}`;
    const grid = document.createElement('div'); grid.className = 'photo-grid';
    [...dataGeojson, ...datamGeojson].forEach(feature => {
      if (pattern.elements.includes(feature.properties.id) && feature.properties.photos?.length) {
        feature.properties.photos.forEach(photo => {
          const cell = document.createElement('div'); cell.className = 'photo-cell';
                    const img = makeImg(photo, feature.properties.name || feature.properties.id || 'photo');
          if (img) {
            img.onclick = () => showDetails(feature.properties);
            cell.appendChild(img);
          }

          img.loading = 'lazy'; img.decoding = 'async';
          img.src = photo; img.alt = feature.properties.name || feature.properties.id || 'photo';
          img.onclick = () => showDetails(feature.properties);
          cell.appendChild(img); grid.appendChild(cell);
        });
      }
    });
    block.append(title, grid); wrapper.appendChild(block);
  });
}


/*==================================================
=                  VUE PROXÉMIQUE                  =
==================================================*/
function showProxemicView() {
  proxemicView.innerHTML = '';
  const viewWidth = proxemicView.offsetWidth;
  const viewHeight = proxemicView.offsetHeight;

  const categories = {
    percu: ["frequence_usage_ponctuel","frequence_usage_regulier","frequence_usage_quotidien","mode_usage_prevu","mode_usage_detourne","mode_usage_creatif","intensite_usage_faible","intensite_usage_moyenne","intensite_usage_forte","intensite_usage_saturee"],
    concu: ["echelle_micro","echelle_meso","echelle_macro","origine_forme_institutionnelle","origine_forme_singuliere","origine_forme_collective","accessibilite_libre","accessibilite_semi_ouverte","accessibilite_fermee","visibilite_cachee","visibilite_visible","visibilite_exposee"],
    vecu:  ["acteurs_visibles_habitant","acteurs_visibles_institution","acteurs_visibles_collectif","acteurs_visibles_invisible","rapport_affectif_symbolique"]
  };
  function getDominantCategory(criteria) {
    const counts = { percu: 0, concu: 0, vecu: 0 };
    for (const key of Object.keys(criteria)) {
      if (categories.percu.includes(key)) counts.percu++;
      if (categories.concu.includes(key)) counts.concu++;
      if (categories.vecu.includes(key))  counts.vecu++;
    }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
  }

  const positions = {
    percu: { x: viewWidth * 0.25, y: viewHeight * 0.35 },
    concu: { x: viewWidth * 0.75, y: viewHeight * 0.35 },
    vecu:  { x: viewWidth * 0.50, y: viewHeight * 0.80 }
  };
  const radiusScale = d => 8 + d.elements.length * 2;
  const collisionPadding = 4;

  const patternData = Object.values(patterns).map(pattern => {
    const id = Object.keys(patterns).find(key => patterns[key] === pattern);
    const category = getDominantCategory(pattern.criteria);
    return { id, name: pattern.name, criteria: pattern.criteria, elements: pattern.elements,
             category, x: positions[category].x + (Math.random()-0.5)*50, y: positions[category].y + (Math.random()-0.5)*50 };
  });

  const svgWidth = viewWidth * 2.5;
  const svgHeight = viewHeight * 2.5;
  const svg = d3.select("#proxemic-view").append("svg")
    .attr("width", svgWidth).attr("height", svgHeight)
    .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`)
    .call(d3.zoom().on("zoom", (event) => { root.attr("transform", event.transform); }));
  const root = svg.append("g");

  const simulation = d3.forceSimulation(patternData)
    .force("x", d3.forceX(d => positions[d.category].x).strength(0.1))
    .force("y", d3.forceY(d => positions[d.category].y).strength(0.1))
    .force("collide", d3.forceCollide(d => radiusScale(d) + collisionPadding).iterations(3))
    .stop();
  for (let i=0;i<120;++i) simulation.tick();

  const patternNodes = root.selectAll(".pattern-node")
    .data(patternData).join("g").attr("class","pattern-node")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  patternNodes.append("circle")
    .attr("r", d => radiusScale(d))
    .style("fill", d => colorForPattern(d.id))
    .style("stroke", d => colorForPattern(d.id))
    .style("stroke-width", 2)
    .style("cursor", "pointer")
    .on("click", (_ev, d) => showDetails({ isPattern: true, patternKey: d.id, elements: d.elements, criteria: d.criteria }));

  patternNodes.append("text")
    .style("text-anchor","middle").style("font-size","12px").style("font-weight","bold")
    .style("fill", d => labelColorForPattern(d.id))
    .text(d => d.name);

  function addLabelWithBackground(g, x, y, textContent) {
    const group = g.append("g").attr("transform", `translate(${x}, ${y})`);
    const text = group.append("text").text(textContent)
      .attr("x",0).attr("y",0).style("fill","white").style("font-size","14px").style("font-weight","bold")
      .style("text-anchor","middle").attr("dominant-baseline","middle");
    const bbox = text.node().getBBox();
    group.insert("rect","text")
      .attr("x", bbox.x - 6).attr("y", bbox.y - 2)
      .attr("width", bbox.width + 12).attr("height", bbox.height + 4)
      .attr("fill","black").attr("rx",3).attr("ry",3);
  }
  addLabelWithBackground(root, positions.percu.x, positions.percu.y - 80, "Espace perçu (usage)");
  addLabelWithBackground(root, positions.concu.x, positions.concu.y - 80, "Espace conçu");
  addLabelWithBackground(root, positions.vecu.x, positions.vecu.y + 80, "Espace vécu (expérience)");
}


/*==================================================
=               GESTION DES VUES (UI)              =
==================================================*/
function setView(viewId) {
  currentView = viewId;
  const views = {
    map: document.getElementById('map'),
    proxemic: document.getElementById('proxemic-view'),
    gallery: document.getElementById('gallery-view'),
    critical: document.getElementById('critical-view'),
  };
  Object.entries(views).forEach(([key, el]) => { el.style.display = key === viewId ? 'block' : 'none'; });
  if (viewId === 'proxemic') showProxemicView();
  if (viewId === 'gallery')  showGalleryView();
  if (viewId === 'critical') showCriticalView();
  updateInterfaceElements(viewId);
}

function updateInterfaceElements(viewId) {
  const legendBtn = document.getElementById('toggle-legend-btn');
  const locationBtn = document.getElementById('toggle-location-btn');
  legendBtn.style.display  = viewId === 'proxemic' ? 'block' : 'none';
  locationBtn.style.display = (viewId === 'map' || viewId === 'patterns-map' || viewId === 'unit') ? 'block' : 'none';
}

const topTabs = document.querySelectorAll('.top-tab');
const subnav = document.getElementById('subnav-patterns');
const subTabs = document.querySelectorAll('.sub-tab');

const VIEWS = {
  fragments: 'map',
  unit: 'unit-view',
  sub: {
    'patterns-map': 'patterns-map',
    'proxemic': 'proxemic-view',
    'gallery': 'gallery-view',
  }
};

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => { if (!v) return; v.style.display = (v.id === viewId) ? 'block' : 'none'; });
  if (viewId === 'map' && map?.invalidateSize) setTimeout(() => map.invalidateSize(), 0);
  if (viewId === 'unit-view' && unitMap?.invalidateSize) setTimeout(() => unitMap.invalidateSize(), 0);
}

function setTopTab(name) {
  topTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.top === name));
  if (name === 'patterns') {
    subnav.classList.remove('subnav--inactive');
    const currentActiveSub = document.querySelector('.sub-tab.active')?.dataset.sub || 'proxemic';
    setSubTab(currentActiveSub);
  } else {
    subnav.classList.add('subnav--inactive');
    subTabs.forEach(btn => btn.classList.remove('active'));
    if (name === 'fragments') { currentView = 'map'; showView(VIEWS.fragments); }
    if (name === 'unit')      { currentView = 'unit'; showView(VIEWS.unit); ensureUnitMap(); renderAllUnits(); }
    updateInterfaceElements(currentView);
  }
  if (unitCreation.active && name !== 'patterns') stopUnitCreation();

  const similarityControls = document.getElementById('similarity-controls');
  similarityControls.style.display = (name === 'patterns') ? 'block' : 'none';
}

function setSubTab(subName) {
  if (unitCreation.active && subName !== 'patterns-map') stopUnitCreation();
  if (subName === 'proxemic') currentView = 'proxemic';
  else if (subName === 'gallery') currentView = 'gallery';
  else if (subName === 'patterns-map') currentView = 'patterns-map';

  subTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.sub === subName));
  const viewId = VIEWS.sub[subName]; showView(viewId);

  if (subName === 'patterns-map') {
    initPatternMapOnce();
    setTimeout(() => patternMap.invalidateSize(), 0);
    renderPatternBaseGrey();
    refreshPatternsMap();
  }
  if (subName === 'proxemic') showProxemicView();
  else if (subName === 'gallery') showGalleryView();

  updateInterfaceElements(currentView);
}

function maybeHideTabbedOnViewChange() {
  if (currentView !== 'patterns-map' && Tabbed?.el) {
    Tabbed.openTabs?.forEach((_rec, id) => closeTab(id));
    Tabbed.el.style.display = 'none';
  }
}

// Listeners onglets
topTabs.forEach(btn => btn.addEventListener('click', () => setTopTab(btn.dataset.top)));
subTabs.forEach(btn => btn.addEventListener('click', () => setSubTab(btn.dataset.sub)));

// État initial
setTopTab('fragments');
currentView = 'map';
updateInterfaceElements('map');


/*==================================================
=                  ABOUT (Info)                    =
==================================================*/
document.addEventListener('DOMContentLoaded', () => {
  const infoBtn = document.getElementById('info-btn');
  const aboutBox = document.getElementById('about');
  function toggleAbout() {
    const isOpen = aboutBox.style.display === 'block';
    aboutBox.style.display = isOpen ? 'none' : 'block';
    if (infoBtn) infoBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
  }
  if (infoBtn) infoBtn.addEventListener('click', toggleAbout);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aboutBox.style.display === 'block') toggleAbout(); });
});


/*==================================================
=          SLIDER SEUIL DE SIMILARITÉ              =
==================================================*/
function debounce(fn, delay = 160) {
  let t; return function (...args) { const ctx = this; clearTimeout(t); t = setTimeout(() => fn.apply(ctx, args), delay); };
}
const sliderEl = document.getElementById('similarity-slider');
sliderEl.addEventListener('input', debounce(function (e) {
  const value = parseInt(e.target.value, 10);
  patternThreshold = value;
  document.getElementById('slider-value').textContent = value;
  const visible = [...(dataGeojson || []), ...(datamGeojson || [])]
    .filter(f => isFeatureInActiveZones ? isFeatureInActiveZones(f) : true)
    .filter(f => !f.properties?.isDiscourse);
  patterns = identifyPatterns(visible);
  if (currentView === 'gallery')      showGalleryView();
  else if (currentView === 'proxemic') showProxemicView();
  else if (currentView === 'patterns-map') { renderPatternBaseGrey(); refreshPatternsMap(); }
}, 160));


/*==================================================
=        CARTE PATTERNS : INIT + COULEURS          =
==================================================*/
let patternMap = null;
let patternBaseLayer = null;        // fragments gris
let patternOverlayGroup = null;     // anneaux colorés
let patternPanes = new Map();       // pane par anneau

const SAT_SEQ = [95, 85, 90, 80];
const LIT_SEQ = [58, 70, 50, 64];
const PATTERN_COLORS = Object.fromEntries(
  Array.from({ length: 100 }, (_, i) => {
    const hue = Math.round((i * 137.508) % 360);
    const sat = SAT_SEQ[i % SAT_SEQ.length];
    const lit = LIT_SEQ[(Math.floor(i / 4)) % LIT_SEQ.length];
    return [`P${i + 1}`, `hsl(${hue}, ${sat}%, ${lit}%)`];
  })
);

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
window.colorForPattern = colorForPattern;

function labelColorForPattern(pName) {
  const hsl = colorForPattern(pName);
  const m = hsl.match(/hsl\(\s*\d+,\s*\d+%?,\s*(\d+)%\s*\)/);
  const L = m ? parseInt(m[1], 10) : 55;
  return (L >= 62) ? '#000' : '#fff';
}

function getActiveZones() {
  return Array.from(document.querySelectorAll('.filter-zone:checked')).map(cb => cb.value);
}
function isFeatureInActiveZones(f) {
  const zones = getActiveZones();
  const id = f.properties?.id || '';
  const isN = id.startsWith('N');
  const isM = id.startsWith('M');
  return (isN && zones.includes('montreuil')) || (isM && zones.includes('mirail'));
}
function getPatternsForFragment(fragmentId) {
  const result = [];
  Object.entries(patterns || {}).forEach(([pName, pData]) => { if ((pData.elements || []).includes(fragmentId)) result.push(pName); });
  result.sort((a, b) => parseInt(a.replace('P','')) - parseInt(b.replace('P','')));
  return result;
}

function initPatternMapOnce() {
  if (patternMap) return;
  patternMap = L.map('patterns-map', { zoomControl: true, attributionControl: true }).setView(montreuilView, montreuilZoom);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors, © CartoDB' }).addTo(patternMap);
  patternBaseLayer = L.layerGroup().addTo(patternMap);
  patternOverlayGroup = L.layerGroup().addTo(patternMap);

  fetch('data/contour.geojson').then(r => r.json()).then(contour => {
    L.geoJSON(contour, { style: { color:'#919090', weight:2, opacity:0.8, fillOpacity:0 } }).addTo(patternMap);
  });
}

function ensureRingPane(ringIndex) {
  const paneId = `pane-ring-${ringIndex}`;
  if (patternPanes.has(paneId)) return paneId;
  patternMap.createPane(paneId);
  patternMap.getPane(paneId).style.zIndex = 600 + ringIndex;
  patternPanes.set(paneId, paneId);
  return paneId;
}

function getFeatureCenter(feature) {
  if (feature.geometry?.type === 'Point') {
    const c = feature.geometry.coordinates; return L.latLng(c[1], c[0]);
  }
  const tmp = L.geoJSON(feature);
  try { return tmp.getBounds().getCenter(); }
  catch(e) {
    const c = (feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates[0]) || [0,0];
    return L.latLng(c[1] || 0, c[0] || 0);
  }
}

function renderPatternBaseGrey() {
  if (!patternMap) return;
  patternBaseLayer.clearLayers();
  const baseStyle = { color:'#777', weight:1, opacity:1, fillColor:'#777', fillOpacity:0.25 };
  const filterActiveZones = feat => isFeatureInActiveZones(feat) && !feat.properties.isDiscourse;

  if (dataGeojson?.length) {
    L.geoJSON({ type:'FeatureCollection', features: dataGeojson }, {
      filter: filterActiveZones,
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { ...baseStyle, radius: 4 }),
      style: () => baseStyle,
      onEachFeature: (feature, layer) => { layer.on('click', () => onPatternsMapFragmentClick(feature)); }
    }).addTo(patternBaseLayer);
  }
  if (datamGeojson?.length) {
    L.geoJSON({ type:'FeatureCollection', features: datamGeojson }, {
      filter: filterActiveZones,
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { ...baseStyle, radius: 4 }),
      style: () => baseStyle,
      onEachFeature: (feature, layer) => { layer.on('click', () => onPatternsMapFragmentClick(feature)); }
    }).addTo(patternBaseLayer);
  }
}

function refreshPatternsMap() {
  if (!patternMap) return;
  patternOverlayGroup.clearLayers();
  if (!combinedFeatures.length) combinedFeatures = [...(dataGeojson || []), ...(datamGeojson || [])];
  const byId = new Map(combinedFeatures.map(f => [f.properties.id, f]));
  const entries = Object.entries(patterns);
  const membersByFragment = new Map();

  entries.forEach(([pName, pData]) => {
    (pData.elements || []).forEach(id => {
      const f = byId.get(id); if (!f) return;
      if (f.properties.isDiscourse) return;
      if (!isFeatureInActiveZones(f)) return;
      if (!membersByFragment.has(id)) membersByFragment.set(id, []);
      membersByFragment.get(id).push(pName);
    });
  });

  const BASE_RADIUS  = 5;
  const RING_SPACING = 3;
  const RING_WEIGHT  = 2;

  membersByFragment.forEach((pList, id) => {
    const feature = byId.get(id); if (!feature) return;
    const rings = pList.slice().sort((a,b) => parseInt(String(a).replace('P',''),10) - parseInt(String(b).replace('P',''),10));
    const centerLatLng = getFeatureCenter(feature);

    rings.forEach((pName, idx) => {
      const color  = colorForPattern(pName);
      const radius = BASE_RADIUS + idx * RING_SPACING;
      const pane = ensureRingPane(idx);

      const fragId   = feature.properties.id || '';
      const fragName = feature.properties.name || '';
      const ringsSorted = rings.slice().sort((a,b) => parseInt(String(a).replace('P',''),10) - parseInt(String(b).replace('P',''),10)).join(', ');
      const tipHtml = `
        <div class="pt-title">${fragId}${fragName ? ' — ' + fragName : ''}</div>
        <div class="pt-sub">Appartient aux patterns : ${ringsSorted}</div>
      `;

      const marker = L.circleMarker(centerLatLng, { pane, radius, color, weight: RING_WEIGHT, fillOpacity: 0 });
      marker.on('mouseover', function () {
        if (!this._tooltip) {
          this.bindTooltip(tipHtml, { className:'pattern-tip', direction:'top', sticky:true, offset:[0,-6], opacity:1 }).openTooltip();
        }
      });
      marker.on('mouseout', function () { this.closeTooltip(); });
      marker.on('click', () => onPatternsMapFragmentClick(feature));
      marker.addTo(patternOverlayGroup);
    });
  });
}

// Clic sur fragment (carte patterns)
function onPatternsMapFragmentClick(feature) {
  if (unitCreation.active) { handleUnitSelection(feature); return; }
  if (currentView !== 'patterns-map') { return showDetails(feature.properties); }
  clearAllTabbedTabs();
  closeSidebars();
  const fProps = feature.properties || {};
  const fragId = fProps.id || Math.random().toString(36).slice(2);
  openTab({ id: `frag-${fragId}`, title: fProps.id || 'Fragment', kind: 'fragment', render: (panel) => renderFragmentPanel(panel, fProps) });
  const pList = getPatternsForFragment(fragId);
  pList.forEach(pName => {
    const pData = patterns[pName]; if (!pData) return;
    openTab({ id: `pattern-${pName}`, title: pName, kind: 'pattern', render: (panel) => renderPatternPanel(panel, pName, pData) });
  });
}


/*==================================================
=             MODE CRÉATION D’UNITÉ (UP)           =
==================================================*/
function startUnitCreation() {
  setTopTab('patterns');
  setSubTab('patterns-map');
  initPatternMapOnce();
  if (unitCreation.active) return;
  unitCreation.active = true;

  if (patternOverlayGroup && patternMap.hasLayer(patternOverlayGroup)) {
    patternMap.removeLayer(patternOverlayGroup); unitCreation.ringsVisible = false;
  }
  const btn = document.getElementById('create-unit-btn');
  if (btn) { btn.textContent = 'Annuler la création'; btn.classList.add('is-armed'); btn.setAttribute('aria-pressed','true'); }
  const cont = patternMap.getContainer(); cont.classList.add('patterns-creating');
  const hint = document.getElementById('unit-hint'); hint.style.display = 'block';
  unitCreation.mouseMoveHandler = (e) => { hint.style.left = e.clientX + 'px'; hint.style.top = e.clientY + 'px'; };
  window.addEventListener('mousemove', unitCreation.mouseMoveHandler);
}
function stopUnitCreation() {
  if (!unitCreation.active) return;
  unitCreation.active = false;
  if (!unitCreation.ringsVisible && patternOverlayGroup) { patternOverlayGroup.addTo(patternMap); unitCreation.ringsVisible = true; }
  const btn = document.getElementById('create-unit-btn');
  if (btn) { btn.textContent = 'Créer une Unité de Projet'; btn.classList.remove('is-armed'); btn.setAttribute('aria-pressed','false'); }
  const cont = patternMap.getContainer(); cont.classList.remove('patterns-creating');
  const hint = document.getElementById('unit-hint'); hint.style.display = 'none';
  if (unitCreation.mouseMoveHandler) { window.removeEventListener('mousemove', unitCreation.mouseMoveHandler); unitCreation.mouseMoveHandler = null; }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && unitCreation.active) stopUnitCreation(); });

// Bouton toggle création UP
const createUnitBtn = document.getElementById('create-unit-btn');
if (createUnitBtn) createUnitBtn.addEventListener('click', () => { unitCreation.active ? stopUnitCreation() : startUnitCreation(); });

// Sélection d’un fragment ⇒ création UP locale
function handleUnitSelection(feature) {
  stopUnitCreation();

  // ➜ on récupère le code du fragment (ex: "M12…" ou "N07…")
  const srcId = feature?.properties?.id || 'UNK';
  let unitId = `UP-${srcId}`;

  // (optionnel) si une unité avec le même ID existe déjà, on différencie
  const exists = loadUnitsLocal().some(u => u.id === unitId);
  if (exists) unitId = `UP-${srcId}-${Date.now().toString().slice(-4)}`;

  const unit = {
    id: unitId,
    sourceFragmentId: srcId,
    geometry: feature.geometry,
    // ➜ le "nom" affiché partout = l'ID voulu
    props: { name: unitId },
    createdAt: new Date().toISOString()
  };

  saveUnitLocal(unit);
  setTopTab('unit');
  showView('unit-view');
  setTimeout(() => { renderAllUnits(); zoomToUnit(unit); }, 0);
}


function saveUnitLocal(unit) {
  try {
    const key = 'units'; const arr = JSON.parse(localStorage.getItem(key) || '[]'); arr.push(unit);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) { console.warn('Impossible d’enregistrer localement l’unité :', e); }
}
function loadUnitsLocal() {
  try { return JSON.parse(localStorage.getItem('units') || '[]'); }
  catch(e) { return []; }
}

function ensureUnitMap() {
  if (unitMap) { setTimeout(() => unitMap.invalidateSize(), 0); return unitMap; }

  unitMap = L.map('unit-view', { zoomControl:true, attributionControl:true })
              .setView(montreuilView, montreuilZoom);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors, © CartoDB'
  }).addTo(unitMap);

  unitContextGroup = L.layerGroup().addTo(unitMap);
  unitLayerGroup   = L.layerGroup().addTo(unitMap);

  // ⬇️ ICI : contour non interactif + au fond
  fetch('data/contour.geojson').then(r => r.json()).then(contour => {
    const contourLayer = L.geoJSON(contour, {
      style: { color:'#919090', weight:2, opacity:0.8, fillOpacity:0 },
      interactive: false              // ✅ ne capte plus les clics
    }).addTo(unitContextGroup);
    contourLayer.bringToBack();        // ✅ passe sous les unités
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
    const gj = L.geoJSON({ type:'Feature', geometry:u.geometry, properties:u.props }, {
      pointToLayer: (_f, latlng) => L.circleMarker(latlng, { ...whiteStyle, radius: 6 }),
      style: () => whiteStyle
    }).addTo(unitLayerGroup);

    // >>> clic fiable sur chaque géométrie de l'unité
    gj.eachLayer(layer => {
  layer.on('click', () => {
    openUnitModal(u);   // ✨ nouvelle modale au lieu du panneau
  });
});


    if (gj.getBounds) {
      const b = gj.getBounds();
      unionBounds = unionBounds ? unionBounds.extend(b) : b;
    }
  });

  if (unionBounds && unionBounds.isValid && unionBounds.isValid()) mapU.fitBounds(unionBounds.pad(0.3));
}


function zoomToUnit(unit) {
  const mapU = ensureUnitMap();
  try {
    const tmp = L.geoJSON({ type:'Feature', geometry:unit.geometry });
    const b = tmp.getBounds?.();
    if (b && b.isValid && b.isValid()) { mapU.fitBounds(b.pad(0.3)); return; }
  } catch(e) {}
  const center = getFeatureCenter({ geometry: unit.geometry }); if (center) mapU.setView(center, 17);
}
function showUnitOnMap(unit) {
  const mapU = ensureUnitMap();
  const whiteStyle = { color:'#fff', weight:2, opacity:1, fillColor:'#fff', fillOpacity:0.25 };
  const layer = L.geoJSON({ type:'Feature', geometry:unit.geometry, properties:unit.props }, {
    pointToLayer: (_f, latlng) => L.circleMarker(latlng, { ...whiteStyle, radius: 6 }),
    style: () => whiteStyle
  }).addTo(unitLayerGroup);
  try {
    const b = layer.getBounds?.();
    if (b && b.isValid && b.isValid()) mapU.fitBounds(b.pad(0.3));
    else { const center = getFeatureCenter({ geometry: unit.geometry }); if (center) mapU.setView(center, 17); }
  } catch(e) { console.warn('Fit bounds unité :', e); }
}



/*==================================================
=     INSPECTEUR D’UNITÉ : V1 / V2 / COMPARER      =
==================================================*/


/* ========== MODALE UNITÉ (plein écran) ========== */
let unitModalState = {
  unit: null,
  singleViewer: null,
  v1Viewer: null,
  v2Viewer: null,
};

function openUnitModal(unit) {
  unitModalState.unit = unit;

  const modal   = document.getElementById('unit-modal');
  const titleEl = document.getElementById('unit-title');
  const btnV1   = document.getElementById('unit-btn-v1');
  const btnV2   = document.getElementById('unit-btn-v2');
  const btnCmp  = document.getElementById('unit-btn-compare');
  const btnX    = document.getElementById('unit-close');

  // titre = ID de l'unité
  titleEl.textContent = unit.props?.name || unit.id;

  // fragment source de l'unité (là où vit la V1)
  const fragId = unit.sourceFragmentId || null;
  const hasV1  = fragId ? hasFragment3D(fragId) : false;

  // --- Bouton V1 : soit "V1" (affiche), soit "Importer V1" (ouvre le file picker)
  if (hasV1) {
    btnV1.textContent = 'V1';
    btnV1.onclick = async () => {
      disposeUnitCompare();
      showUnitSingle();
      await renderUnitV1Into(document.getElementById('unit-single-host'));
    };
  } else {
    btnV1.textContent = 'Importer V1';
    btnV1.onclick = () => {
      promptImportV1ForSourceFragment(fragId, async () => {
        // une fois importée : on passe le bouton en "V1" et on affiche
        btnV1.textContent = 'V1';
        disposeUnitCompare();
        showUnitSingle();
        await renderUnitV1Into(document.getElementById('unit-single-host'));
      });
    };
  }

  // --- Bouton V2 : inchangé (import si pas encore là)
  btnV2.textContent = hasUnit3D(unit.id) ? 'V2' : 'Importer V2';
  btnV2.onclick = async () => {
    if (!hasUnit3D(unit.id)) {
      promptImport3DForUnit(unit.id, async () => {
        btnV2.textContent = 'V2';
        disposeUnitCompare();
        showUnitSingle();
        await renderUnitV2Into(document.getElementById('unit-single-host'));
      });
      return;
    }
    disposeUnitCompare();
    showUnitSingle();
    await renderUnitV2Into(document.getElementById('unit-single-host'));
  };

  // --- Bouton Comparer : inchangé (demande une V2, la V1 est lue sur le fragment)
  btnCmp.onclick = async () => {
    if (!hasUnit3D(unit.id)) {
      promptImport3DForUnit(unit.id, async () => {
        btnV2.textContent = 'V2';
        await doUnitCompare();
      });
    } else {
      await doUnitCompare();
    }
  };

  // fermeture
  document.getElementById('unit-backdrop').onclick = closeUnitModal;
  btnX.onclick = closeUnitModal;

  // on écoute les MAJ des métadonnées du fragment (labels 3D)
  function onMetaUpdated(e) {
    if (e.detail?.fragmentId !== fragId) return;
    const meta = e.detail.meta || { usages:[], discours:[] };
    unitModalState.singleViewer?.setLabelsFromMeta?.(meta);
    unitModalState.v1Viewer?.setLabelsFromMeta?.(meta);
    unitModalState.v2Viewer?.setLabelsFromMeta?.(meta);
  }
  window.addEventListener('fragmeta:updated', onMetaUpdated);
  modal.__cleanupMetaListener = onMetaUpdated;

  // afficher la modale
  modal.style.display = 'block';

  // Démarrage :
  // - si V1 existe déjà → on l’affiche
  // - sinon → on reste en vue simple, en attendant que l’utilisateur clique "Importer V1"
  showUnitSingle();
  if (hasV1) btnV1.click();
}


function closeUnitModal() {
  const modal = document.getElementById('unit-modal');
  modal.style.display = 'none';

  disposeUnitSingle();
  disposeUnitCompare();

  // nettoie l'écouteur meta
  if (modal.__cleanupMetaListener) {
    window.removeEventListener('fragmeta:updated', modal.__cleanupMetaListener);
    modal.__cleanupMetaListener = null;
  }

  unitModalState.unit = null;
}

function showUnitSingle() {
  document.getElementById('unit-single-host').style.display   = 'block';
  document.getElementById('unit-compare-host').style.display  = 'none';
}

function showUnitCompare() {
  document.getElementById('unit-single-host').style.display   = 'none';
  document.getElementById('unit-compare-host').style.display  = 'flex';
}

function disposeUnitSingle() {
  if (unitModalState.singleViewer) {
    unitModalState.singleViewer.dispose?.();
    unitModalState.singleViewer = null;
  }
}

function disposeUnitCompare() {
  if (unitModalState.v1Viewer) { unitModalState.v1Viewer.dispose?.(); unitModalState.v1Viewer = null; }
  if (unitModalState.v2Viewer) { unitModalState.v2Viewer.dispose?.(); unitModalState.v2Viewer = null; }
}

/* Renderers (réutilisent la logique existante) */
async function renderUnitV1Into(container) {
  if (!window.__ThreeFactory__) { console.error('Viewer 3D non chargé.'); return null; }
  container.innerHTML = ''; 
  const { unit } = unitModalState;
  const fragId = unit.sourceFragmentId || null;

  const viewer = window.__ThreeFactory__.createThreeViewer(container);
  const rec = fragId ? loadFragment3D(fragId) : null;
  if (rec?.dataUrl) {
    const blob = dataURLtoBlob(rec.dataUrl);
    await viewer.showBlob(blob);
  }
  const meta = fragId ? loadFragmentMeta(fragId) : { usages:[], discours:[] };
  viewer.setLabelsFromMeta?.(meta);

  unitModalState.singleViewer = viewer;
  return viewer;
}

async function renderUnitV2Into(container) {
  if (!window.__ThreeFactory__) { console.error('Viewer 3D non chargé.'); return null; }
  container.innerHTML = '';   
  const { unit } = unitModalState;

  const viewer = window.__ThreeFactory__.createThreeViewer(container);
  const rec = loadUnit3D(unit.id);
  if (rec?.dataUrl) {
    const blob = dataURLtoBlob(rec.dataUrl);
    await viewer.showBlob(blob);
  }
  const meta = unit.sourceFragmentId ? loadFragmentMeta(unit.sourceFragmentId) : { usages:[], discours:[] };
  viewer.setLabelsFromMeta?.(meta);

  unitModalState.singleViewer = viewer;
  return viewer;
}

async function doUnitCompare() {
  disposeUnitSingle();
  showUnitCompare();

  const v1 = await (async () => {
    const c = document.getElementById('unit-v1-host');
    if (!window.__ThreeFactory__) return null;
    const v = window.__ThreeFactory__.createThreeViewer(c);
    const fragId = unitModalState.unit.sourceFragmentId || null;
    const rec = fragId ? loadFragment3D(fragId) : null;
    if (rec?.dataUrl) await v.showBlob(dataURLtoBlob(rec.dataUrl));
    const meta = fragId ? loadFragmentMeta(fragId) : { usages:[], discours:[] };
    v.setLabelsFromMeta?.(meta);
    return v;
  })();

  const v2 = await (async () => {
    const c = document.getElementById('unit-v2-host');
    if (!window.__ThreeFactory__) return null;
    const v = window.__ThreeFactory__.createThreeViewer(c);
    const rec = loadUnit3D(unitModalState.unit.id);
    if (rec?.dataUrl) await v.showBlob(dataURLtoBlob(rec.dataUrl));
    const meta = unitModalState.unit.sourceFragmentId ? loadFragmentMeta(unitModalState.unit.sourceFragmentId) : { usages:[], discours:[] };
    v.setLabelsFromMeta?.(meta);
    return v;
  })();

  unitModalState.v1Viewer = v1;
  unitModalState.v2Viewer = v2;
}


/*---------------------------------------
STOCKAGE LOCAL 3D (helpers)
  (appelé par la modale 3D)
---------------------------------------*/
function saveFragment3D(fragmentId, fileName, mime, dataUrl) {
  localStorage.setItem(`frag3d:${fragmentId}`, JSON.stringify({ fileName, mime, dataUrl, savedAt: Date.now() }));
}
function loadFragment3D(fragmentId) {
  try { return JSON.parse(localStorage.getItem(`frag3d:${fragmentId}`) || 'null'); }
  catch(e){ return null; }
}
function hasFragment3D(fragmentId) { return !!localStorage.getItem(`frag3d:${fragmentId}`); }

/*==================================================
=       STOCKAGE LOCAL 3D — V2 (par Unité)         =
==================================================*/
function saveUnit3D(unitId, fileName, mime, dataUrl) {
  localStorage.setItem(`unit3dV2:${unitId}`, JSON.stringify({
    fileName, mime, dataUrl, savedAt: Date.now()
  }));
}
function loadUnit3D(unitId) {
  try { return JSON.parse(localStorage.getItem(`unit3dV2:${unitId}`) || 'null'); }
  catch(e){ return null; }
}
function hasUnit3D(unitId) { return !!localStorage.getItem(`unit3dV2:${unitId}`); }

function promptImport3DForUnit(unitId, onLoaded) {
  const input = document.getElementById('three-file-input');
  input.value = '';
  input.onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
    });
    saveUnit3D(unitId, file.name, file.type || 'model/gltf-binary', dataUrl);
    if (typeof onLoaded === 'function') onLoaded(dataUrl);
  };
  input.click();
}

// Importer une V1 pour le fragment source d'une unité (depuis la modale Unité)
function promptImportV1ForSourceFragment(fragmentId, onLoaded) {
  if (!fragmentId) return;
  const input = document.getElementById('three-file-input');
  input.value = '';
  input.onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
    });
    // ⬇️ on enregistre la V1 sur le fragment (même clé que la carte Fragments)
    saveFragment3D(fragmentId, file.name, file.type || 'model/gltf-binary', dataUrl);

    // Broadcast (si tu veux réagir ailleurs)
    window.dispatchEvent(new CustomEvent('frag3d:updated', { detail: { fragmentId } }));

    // callback local (pour recharger la vue dans la modale)
    if (typeof onLoaded === 'function') onLoaded(dataUrl);
  };
  input.click();
}


/*==================================================
=                 MODALE 3D (Three)                =
==================================================*/
let activeViewer = null;
let activeFragmentId = null;

function openThreeModalForFragment(fragmentId) {
  if (!window.__ThreeFactory__) { console.error('Viewer 3D non chargé.'); return; }
  activeFragmentId = fragmentId;
  const modal = document.getElementById('three-modal');
  const host  = document.getElementById('three-canvas-host');
  const btnClose = document.getElementById('three-close');
  const btnLoad  = document.getElementById('three-load-btn');

  modal.style.display = 'block';
  activeViewer = window.__ThreeFactory__?.createThreeViewer(host);

  const rec = loadFragment3D(fragmentId);
  if (rec?.dataUrl) {
    const blob = dataURLtoBlob(rec.dataUrl);
    activeViewer.showBlob(blob).then(() => {
      const meta = loadFragmentMeta(fragmentId);
      activeViewer.setLabelsFromMeta?.(meta);
    });
  } else {
    const meta = loadFragmentMeta(fragmentId);
    activeViewer.setLabelsFromMeta?.(meta);
  }

  document.getElementById('three-backdrop').onclick = closeThreeModal;
  btnClose.onclick = closeThreeModal;
  btnLoad.onclick  = () => promptImport3DForFragment(fragmentId, true);

  function onMetaUpdated(e){
    if (e.detail?.fragmentId === activeFragmentId && activeViewer) {
      activeViewer.setLabelsFromMeta?.(e.detail.meta);
    }
  }
  window.addEventListener('fragmeta:updated', onMetaUpdated);
  function escCloseThreeOnce(e){ if (e.key === 'Escape') closeThreeModal(); }
  document.addEventListener('keydown', escCloseThreeOnce);
  modal.__cleanupMetaListener = onMetaUpdated;
  modal.__escHandler = escCloseThreeOnce;
}

function closeThreeModal() {
  const modal = document.getElementById('three-modal');
  modal.style.display = 'none';
  if (modal.__escHandler) { document.removeEventListener('keydown', modal.__escHandler); modal.__escHandler = null; }
  if (modal.__cleanupMetaListener) { window.removeEventListener('fragmeta:updated', modal.__cleanupMetaListener); modal.__cleanupMetaListener = null; }
  if (activeViewer) { activeViewer.dispose?.(); activeViewer = null; }
  activeFragmentId = null;
}

function dataURLtoBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mime = (meta.match(/data:(.*?);base64/)||[])[1] || 'application/octet-stream';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i=0;i<bytes.length;i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function promptImport3DForFragment(fragmentId, reloadIfOpen=false) {
  const input = document.getElementById('three-file-input');
  input.value = '';
  input.onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
    });
    saveFragment3D(fragmentId, file.name, file.type || 'model/gltf-binary', dataUrl);
    if (reloadIfOpen && activeViewer) {
      await activeViewer.showBlob(dataURLtoBlob(dataUrl));
      const meta = loadFragmentMeta(fragmentId);
      activeViewer.setLabelsFromMeta?.(meta); // évite la double ligne inutile
    }
  };
  input.click();
}
