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

// Permet de basculer entre les deux localisations géographiques
function toggleLocation() {
    const locationButton = document.getElementById('toggle-location-btn');
    if (currentLocation === 'montreuil') {
        map.setView(toulouseView, toulouseZoom);
        locationButton.textContent = 'Voir Montreuil';
        currentLocation = 'toulouse';
    } else {
        map.setView(montreuilView, montreuilZoom);
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

// ============================
// AFFICHAGE DES DÉTAILS DANS LES SIDEBARS
// ============================
function showDetails(props) {
    closeSidebars(); // Toujours fermer les deux avant

    if (props.isPattern) {
        // C'est un pattern
        document.getElementById('spatial-name').textContent = patternNames[props.patternKey] || 'Pattern sans nom'; 

        const spatialIdElement = document.getElementById('spatial-id');
        spatialIdElement.textContent = props.elements.join(', '); 
        spatialIdElement.parentElement.querySelector('strong').textContent = 'Fragments:'; 

        const spatialDescriptionElement = document.getElementById('spatial-description');
        spatialDescriptionElement.textContent = `Basé sur les critères communs : ${Object.keys(props.criteria).filter(key => props.criteria[key]).join(', ')}`;

        const spatialPhotosElement = document.getElementById('spatial-photos');
        spatialPhotosElement.innerHTML = ''; // Effacer les anciennes photos

    
        [...dataGeojson, ...datamGeojson].forEach(feature => {
            if (props.elements.includes(feature.properties.id)) {
                const elementDiv = document.createElement('div');
                elementDiv.style.display = 'flex';
                elementDiv.style.alignItems = 'center';
                elementDiv.style.marginBottom = '5px';

                const img = document.createElement('div');
            img.style.width = '80px';
            img.style.height = '60px';
            img.style.marginRight = '8px';
            img.style.flexShrink = '0';

                if (feature.properties.photos && feature.properties.photos.length > 0) {
            img.style.backgroundImage = `url(${feature.properties.photos[0]})`;
            img.style.backgroundSize = 'cover';
            img.style.backgroundPosition = 'center';
            img.style.border = '1px solid #aaa';
                } else {
             img.style.backgroundColor = '#ffffff';
            img.style.border = '1px solid #ddd';
}

elementDiv.appendChild(img);

                const nameSpan = document.createElement('span');
                nameSpan.textContent = feature.properties.name || feature.properties.id;
                elementDiv.appendChild(nameSpan);

                spatialPhotosElement.appendChild(elementDiv);
            }
        });

        document.getElementById('spatial-sidebar').style.display = 'block';

    } else if (props.isDiscourse) {
        // C'est un discours 
        document.getElementById('discourse-name').textContent = props.id || 'Discours';
     document.getElementById('discourse-author').textContent = props.auteur || '';
    document.getElementById('discourse-date').textContent = props.date || '';
    const sourceContainer = document.getElementById('discourse-source');
    const sourceText = props.source || '';

    if (sourceText.startsWith('http')) {
    sourceContainer.innerHTML = `<a href="${sourceText}" target="_blank" style="color: blue; text-decoration: underline;">${sourceText}</a>`;
    } else {
    sourceContainer.textContent = sourceText;
    }
    document.getElementById('discourse-text').textContent = props.contenu || '';
    document.getElementById('discourse-sidebar').style.display = 'block';
    } else {
        // C'est un élément spatial 
        document.getElementById('spatial-name').textContent = props.name || '';
        document.getElementById('spatial-id').textContent = props.id || '';
        document.getElementById('spatial-description').textContent = props.description || '';
        const photos = document.getElementById('spatial-photos');
        photos.innerHTML = '';
        if (props.photos && props.photos.length) {
            props.photos.forEach(photo => {
                const img = document.createElement('img');
                img.src = photo;
                img.className = 'photo';
                photos.appendChild(img);
            });
        }
        document.getElementById('spatial-sidebar').style.display = 'block';
    }
}

// Ferme toutes les barres latérales (sidebar)
function closeSidebars() {
    document.getElementById('spatial-sidebar').style.display = 'none';
    document.getElementById('discourse-sidebar').style.display = 'none';
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

// ============================
// DÉTECTION DES PATTERNS PAR SIMILARITÉ DE CRITÈRES
// ============================
// Identifie les patterns : groupes d’éléments partageant exactement X critères communs
function identifyPatterns(features) {
    const criteriaKeys = [
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

    const requiredCount = patternThreshold;
    const usedIds = new Set();
    const groups = [];
    let groupIndex = 1;

    for (let i = 0; i < features.length; i++) {
        const f1 = features[i];
        const f1Id = f1.properties.id;
        if (usedIds.has(f1Id)) continue;

        for (let j = i + 1; j < features.length; j++) {
            const f2 = features[j];
            const f2Id = f2.properties.id;
            if (usedIds.has(f2Id)) continue;

            let sharedCount = 0;
            const sharedCriteria = {};

            for (const key of criteriaKeys) {
                if (f1.properties[key] === true && f2.properties[key] === true) {
                    sharedCount++;
                    sharedCriteria[key] = true;
                }
            }

            if (sharedCount === requiredCount) {
                const group = {
                    name: `P${groupIndex++}`,
                    elements: [f1Id, f2Id],
                    criteria: sharedCriteria
                };

                for (let k = 0; k < features.length; k++) {
                    const f3 = features[k];
                    const f3Id = f3.properties.id;
                    if (group.elements.includes(f3Id)) continue;

                    const sharesAll = Object.keys(sharedCriteria).every(key => f3.properties[key] === true);
                    if (sharesAll) {
                        group.elements.push(f3Id);
                    }
                }

                group.elements.forEach(id => usedIds.add(id));
                groups.push(group);
            }
        }
    }

    const result = {};
    patternNames = {};
    groups.forEach(g => {
        const key = g.name;
        result[key] = {
            name: key,
            elements: g.elements,
            criteria: g.criteria
        };
        patternNames[key] = key;
    });

    return result;
}

// ============================
// CHARGEMENT DES DONNÉES GEOJSON
// ============================


fetch('data/contour.geojson')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            style: {
                color: '#919090',
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0
            }
        }).addTo(map);
    });

    // Chargement des données de Montreuil, puis de celles du Mirail

    fetch('data/data.geojson')
    .then(res => res.json())
    .then(data => {
        dataGeojson = data.features;
        patterns = identifyPatterns(dataGeojson); 

        L.geoJSON(data, {
            
            pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
  radius: 4,
  color: 'red', 
  weight: 1,
  opacity: 1,
  fillColor: 'red', 
  fillOpacity: 0.8
 }),
style: feature => ({
    color: 'red',      
    weight: 0.9,       
    fillOpacity: 0.3   
}),
            onEachFeature: (feature, layer) => {
    layer.zone = 'montreuil'; 
    allLayers.push(layer);
    layer.on('click', () => showDetails(feature.properties));
}
        }).addTo(map);
        
        fetch('data/datam.geojson')
            .then(res => res.json())
            .then(dataM => {
                datamGeojson = dataM.features;

                L.geoJSON(dataM, {
                    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
                        radius: 4,
                        color: 'blue', 
                        weight: 1,
                        opacity: 1,
                        fillColor: 'blue',
                        fillOpacity: 0.8
                    }),
                    style: feature => ({
                    color: 'blue',
                    weight: 0.9,
                    fillOpacity: 0.3
}), 
                    onEachFeature: (feature, layer) => {
                    layer.zone = 'mirail'; 
                    allLayers.push(layer);
                    layer.on('click', () => showDetails(feature.properties));
}
                }).addTo(map);

                // Identifier les patterns une fois que les deux bases de données spatiales sont chargées
                const allSpatialFeatures = [...dataGeojson, ...datamGeojson].filter(feature => !feature.properties.isDiscourse);
                patterns = identifyPatterns(allSpatialFeatures);

                // Mise à jour de la vue proxémique
                if (!isMapView) {
                    showProxemicView();
                }
            });
    });


let discoursLayer = null;

// Assure que le pane est bien créé AVANT le fetch
map.createPane('pane-discours');
map.getPane('pane-discours').style.zIndex = 650;

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
  });
});


let isGalleryView = false;

// ============================
// VUE GALERIE (Affichage des patterns sous forme de photos)
// ============================

function showGalleryView() {
    const gallery = document.getElementById('gallery-view');
    gallery.innerHTML = ''; // reset

    Object.entries(patterns).forEach(([key, pattern]) => {
        const container = document.createElement('div');
        container.style.padding = '20px';
        container.style.borderBottom = '1px solid #ccc';

        const title = document.createElement('h3');
        title.textContent = `${key} — Critères : ${Object.keys(pattern.criteria).map(c => c.replace(/_/g, ' ')).join(', ')}`;
        container.appendChild(title);

        const photoRow = document.createElement('div');
        photoRow.style.display = 'flex';
        photoRow.style.flexWrap = 'wrap';
        photoRow.style.gap = '10px';

        [...dataGeojson, ...datamGeojson].forEach(feature => {
            if (pattern.elements.includes(feature.properties.id) && feature.properties.photos?.length) {
                feature.properties.photos.forEach(photo => {
    const img = document.createElement('img');
    img.src = photo;
    img.style.width = '200px';
    img.style.height = 'auto';
    img.style.border = '1px solid #999';
    img.style.cursor = 'pointer';
    img.onclick = () => showDetails(feature.properties); 
    photoRow.appendChild(img);
});
            }
        });

        container.appendChild(photoRow);
        gallery.appendChild(container);
    });
}


let patternThreshold = 5; // seuil pour former les patterns

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
    .style("fill", "#333")
    .style("stroke", "black")
    .style("cursor", "pointer")
    .on("click", function(event, d) {
        showDetails({ isPattern: true, patternKey: d.id, elements: d.elements, criteria: d.criteria });
    });

    patternNodes.append("text")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .style("fill", "#fff")
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
    const similarityControls = document.getElementById('similarity-controls');
    const locationBtn = document.getElementById('toggle-location-btn');

    // Légende visible uniquement en vue proxémique
    legendBtn.style.display = viewId === 'proxemic' ? 'block' : 'none';

    // Sliders visibles en proxémique et galerie
    similarityControls.style.display = (viewId === 'proxemic' || viewId === 'gallery') ? 'block' : 'none';

    // Bouton "voir Toulouse" uniquement sur la carte
    locationBtn.style.display = viewId === 'map' ? 'block' : 'none';
}


document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        setView(view);
    });
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Changer la vue
        const view = btn.dataset.view;
        setView(view);

        // Mettre à jour l'apparence des onglets
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});


// ============================
// INFO-BULLE "À PROPOS"
// ============================


  document.addEventListener('DOMContentLoaded', () => {
    const infoBtn = document.getElementById('info-btn');
    const aboutBox = document.getElementById('about');
    const closeAbout = document.getElementById('close-about');

    infoBtn.addEventListener('click', () => {
      aboutBox.style.display = 'block';
    });

    closeAbout.addEventListener('click', () => {
      aboutBox.style.display = 'none';
    });
    applyFilters(); 
  });


// ============================
// SLIDER POUR AJUSTER LE NIVEAU DE SIMILARITÉ DES PATTERNS
// ============================

document.getElementById('similarity-slider').addEventListener('input', function() {
    const value = parseInt(this.value);
    patternThreshold = value; 
    document.getElementById('slider-value').textContent = value;

    if (currentView !== 'map') {
        const visibleFeatures = allLayers.filter(layer => map.hasLayer(layer)).map(layer => layer.feature);
        patterns = identifyPatterns(visibleFeatures);

        if (currentView === 'gallery') {
            showGalleryView();
        } else if (currentView === 'proxemic') {
            showProxemicView();
        }
    }
});
