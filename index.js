/**
 * ==========================================
 * 1. MAP & BASEMAPS
 * ==========================================
 */
const map = L.map('map', {
    zoomControl: false // custom position below
}).setView([32.294577425170004, -6.7027966781581165], 10);

L.control.zoom({ position: 'bottomleft' }).addTo(map);

const BASEMAPS = [
    {
        id: 'osm',
        label: 'OSM',
        layer: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        })
    },
    {
        id: 'satellite',
        label: 'Satellite',
        layer: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri',
            maxZoom: 19
        })
    },
    {
        id: 'none',
        label: 'Aucun',
        layer: null // blank background
    }
];


let activeBasemap = BASEMAPS[0];
activeBasemap.layer.addTo(map);

/**
 * ==========================================
 * 2. OVERLAY LAYERS (single source of truth)
 * ==========================================
 */
const pDataGroup = L.layerGroup().addTo(map);
const sDataGroup = L.layerGroup().addTo(map);

/**
 * One entry per image. Each gets its own toggle in the layers panel.
 * Give the position in ONE of two ways:
 *   - bounds:   [[south, west], [north, east]] in lat/lng (what dxf2png.py writes to *_bounds.json)
 *   - mercator: { xMin, yMin, xMax, yMax } in Web Mercator (EPSG:3857) metres
 * Optional: opacity (default 1), visible (default true).
 * Images later in the list are drawn on top of earlier ones.
 */
const IMAGE_OVERLAYS = [
    {
        id: 'M8M9',
        label: 'Plan de M8/M9',
        url: './Reference-map-M8M9.png',
        mercator: { xMin: -766932.573, yMin: 3796308.928, xMax: -756549.053, yMax: 3805209.088 }
    },
    {
        id: 'M10M14',
        label: 'Plan de M10/M14',
        url: "Reseau d'irrigation M10M14.png",
        mercator: {
            xMin: -777680.9256618655, yMin: 3794148.0903488477, xMax: -763000.9335410759, yMax: 3802467.6990362583
        }
    },
].map((img) => ({ ...img, group: L.layerGroup(), image: true }));

const OVERLAYS = [
    ...IMAGE_OVERLAYS,
    { id: 'primaires', label: 'Canaux Primaires', group: pDataGroup, color: 'blue', file: 'primaires.geojson' },
    { id: 'secondaires', label: 'Canaux Secondaires', group: sDataGroup, color: 'purple', file: 'secondaires.geojson' },
];

/**
 * ==========================================
 * 3. IMAGE OVERLAY (WEB MERCATOR)
 * ==========================================
 */
function getImageBounds({ bounds, mercator }) {
    if (bounds) return bounds;
    if (mercator) {
        const topLeft = L.CRS.EPSG3857.unproject(L.point(mercator.xMin, mercator.yMax));
        const bottomRight = L.CRS.EPSG3857.unproject(L.point(mercator.xMax, mercator.yMin));
        return [[topLeft.lat, topLeft.lng], [bottomRight.lat, bottomRight.lng]];
    }
    throw new Error('Image needs "bounds" or "mercator"');
}

function addImageOverlay(img) {
    try {
        L.imageOverlay(img.url, getImageBounds(img), {
            opacity: img.opacity ?? 1,
            interactive: false
        }).addTo(img.group);

        if (img.visible !== false) img.group.addTo(map);
    } catch (error) {
        console.error(`Error adding image ${img.id}:`, error);
        setTimeout(() => showToast(`Impossible de charger ${img.label}.`)); // toast is defined further down
    }
}

IMAGE_OVERLAYS.forEach(addImageOverlay);

/**
 * ==========================================
 * 4. GEOJSON LAYERS
 * ==========================================
 */
async function loadGeoJSONLayer({ file, color, group }) {
    try {
        const response = await fetch(file);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        L.geoJSON(data, { style: { weight: 1.5, color } }).addTo(group);
    } catch (error) {
        console.error(`Error loading ${file}:`, error);
        showToast(`Impossible de charger ${file}.`);
    }
}

OVERLAYS.filter((o) => o.file).forEach(loadGeoJSONLayer);

/**
 * ==========================================
 * 5. LAYERS PANEL UI
 * ==========================================
 */
const layersToggle = document.getElementById('layers-toggle');
const layersPanel = document.getElementById('layers-panel');
const basemapList = document.getElementById('basemap-list');
const layerList = document.getElementById('layer-list');

function setPanelOpen(open) {
    layersPanel.hidden = !open;
    layersToggle.setAttribute('aria-expanded', String(open));
}

layersToggle.addEventListener('click', () => setPanelOpen(layersPanel.hidden));
map.on('click', () => setPanelOpen(false));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !layersPanel.hidden) {
        setPanelOpen(false);
        layersToggle.focus();
    }
});

// Keep taps inside the panel from reaching the map
L.DomEvent.disableClickPropagation(layersPanel);
L.DomEvent.disableScrollPropagation(layersPanel);

// Basemap radio buttons
BASEMAPS.forEach((base) => {
    const label = document.createElement('label');
    label.innerHTML = `
        <input type="radio" name="basemap" value="${base.id}" ${base === activeBasemap ? 'checked' : ''}>
        <span>${base.label}</span>`;
    label.querySelector('input').addEventListener('change', () => {
        if (activeBasemap.layer) map.removeLayer(activeBasemap.layer);
        activeBasemap = base;
        if (base.layer) base.layer.addTo(map).bringToBack();
    });
    basemapList.appendChild(label);
});

// Overlay toggles
function addOverlayRow(overlay) {
    const li = document.createElement('li');
    const swatchClass = 'layer-row__swatch' +
        (overlay.image ? ' layer-row__swatch--image' : '') +
        (overlay.dot ? ' layer-row__swatch--dot' : '') +
        (overlay.iconHtml ? ' layer-row__swatch--icon' : '');
    const swatch = overlay.swatch || overlay.color;
    const swatchStyle = swatch ? `style="--swatch:${swatch}"` : '';

    li.innerHTML = `
        <label class="layer-row">
            <span class="${swatchClass}" ${swatchStyle}>${overlay.iconHtml || ''}</span>
            <span class="layer-row__label">${overlay.label}</span>
            <span class="switch">
                <input type="checkbox" ${overlay.visible === false ? '' : 'checked'}>
                <span class="switch__track"></span>
            </span>
        </label>`;

    const checkbox = li.querySelector('input[type="checkbox"]');

    checkbox.addEventListener('change', () => {
        if (checkbox.checked) map.addLayer(overlay.group);
        else map.removeLayer(overlay.group);
    });

    layerList.appendChild(li);
}

OVERLAYS.forEach(addOverlayRow);

/**
 * ==========================================
 * 5b. POINTS (points.geojson)
 * ==========================================
 * Appearance is defined per category in POINT_STYLES below.
 *   - No icon  -> round dot (default), colored from the file's "color" property.
 *   - icon set -> SVG (or image) marker instead of the dot.
 * Each category also gets its own toggle in the layers panel.
 */

// Defaults applied to every category (override any of them per category).
const POINT_DEFAULT = {
    color: null,        // null = use the "color" property from the file
    radius: 6,          // dot radius in px (used when there is no icon)
    icon: null,         // inline SVG string, or an image URL like './icons/valve.svg'
    size: 20,           // icon size in px
    anchor: 'center',   // 'center' or 'bottom' (use 'bottom' for pin-shaped icons)
    labels: true        // show the name label at zoom >= ZOOM_THRESHOLD
};

// One entry per category. Anything omitted falls back to POINT_DEFAULT.
// Example: 'Station de filtration': { icon: ICONS.station, size: 30, color: '#4285F4' }
const POINT_STYLES = {
    'Stations de filtration': { icon: './icons/house-fill.svg', color: '#4285F4' },
    'Prises de préfiltration': { icon: './icons/jail-prison.svg', color: '#4285F4' },
    'Vannes de régulation et de sectionnement': { color: '#F4B400' },
    'Départs & Décharges': { color: '#795548' },
    'Prises Secondaires': { color: '#673AB7' },
};

// Order of the toggles in the panel (categories not listed go last).
const POINT_CATEGORY_ORDER = Object.keys(POINT_STYLES);

function resolvePointStyle(properties) {
    const style = { ...POINT_DEFAULT, ...(POINT_STYLES[properties.category] || {}) };
    style.color = style.color || properties.color || '#444444';
    return style;
}

// ----- Online / external SVG icons -----
const svgCache = new Map(); // url -> sanitized SVG markup

const isInlineSvg = (icon) => icon.trim().startsWith('<');

function wantsInline(style) {
    return Boolean(style.icon)
        && !isInlineSvg(style.icon)
        && style.inline !== false
        && /\.svg(\?.*)?$/i.test(style.icon.trim());
}

// Remote SVG is injected into the page, so strip anything executable.
function sanitizeSvg(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
        throw new Error('Not a valid SVG');
    }

    svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove());
    [svg, ...svg.querySelectorAll('*')].forEach((el) => {
        [...el.attributes].forEach((attr) => {
            const unsafeHref = /href/i.test(attr.name) && /^\s*javascript:/i.test(attr.value);
            if (/^on/i.test(attr.name) || unsafeHref) el.removeAttribute(attr.name);
        });
    });

    // Let CSS control the size
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    if (!svg.hasAttribute('viewBox') && w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');

    // Icon has no color information at all -> let it follow the point color
    if (!/currentColor|fill=|stroke=/i.test(text)) svg.setAttribute('fill', 'currentColor');

    return svg.outerHTML;
}

async function preloadSvgIcons() {
    const urls = new Set(Object.values(POINT_STYLES).filter(wantsInline).map((st) => st.icon));

    await Promise.all([...urls].map(async (url) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            svgCache.set(url, sanitizeSvg(await response.text()));
        } catch (error) {
            // Falls back to a plain <img> (own colors, no tinting)
            console.warn(`SVG icon not inlined (${url}):`, error);
        }
    }));
}

function iconMarkup(style) {
    if (isInlineSvg(style.icon)) return style.icon;
    return svgCache.get(style.icon)
        || `<img src="${style.icon.trim()}" alt="" draggable="false">`;
}

function buildPointIcon(style) {
    const half = style.size / 2;
    const atBottom = style.anchor === 'bottom';
    return L.divIcon({
        className: 'point-icon',
        html: `<span style="color:${style.color}">${iconMarkup(style)}</span>`,
        iconSize: [style.size, style.size],
        iconAnchor: [half, atBottom ? style.size : half],
        popupAnchor: [0, atBottom ? -style.size : -half]
    });
}

function createPointLayer(feature, latlng) {
    const style = resolvePointStyle(feature.properties);

    if (style.icon) {
        return L.marker(latlng, { icon: buildPointIcon(style), keyboard: false });
    }

    return L.circleMarker(latlng, {
        radius: style.radius,
        weight: 2,
        color: '#ffffff',
        fillColor: style.color,
        fillOpacity: 1
    });
}

function labelOffset(style) {
    if (!style.icon) return [style.radius + 3, 0];
    return [style.size / 2 + 4, style.anchor === 'bottom' ? -style.size / 2 : 0];
}

function buildPopup({ name, category }) {
    const wrap = document.createElement('div');
    wrap.className = 'point-popup';
    const title = document.createElement('strong');
    title.textContent = name;
    const sub = document.createElement('span');
    sub.textContent = category;
    wrap.append(title, sub);
    return wrap;
}

// Single color -> that color. Several colors -> hard-stop stripes.
function swatchFor(colors) {
    if (colors.length === 1) return colors[0];
    const step = 100 / colors.length;
    const stops = colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`);
    return `conic-gradient(${stops.join(', ')})`;
}

async function loadPoints() {
    try {
        const [response] = await Promise.all([fetch('points.geojson'), preloadSvgIcons()]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const categories = new Map(); // category -> { group, colors, style }
        searchIndex.length = 0;

        L.geoJSON(data, {
            pointToLayer: createPointLayer,
            onEachFeature: (feature, layer) => {
                const { name, category } = feature.properties;
                const style = resolvePointStyle(feature.properties);

                layer.bindPopup(buildPopup(feature.properties), { closeButton: false });

                if (style.labels) {
                    layer.bindTooltip(name, {
                        permanent: true,
                        direction: 'right',
                        offset: labelOffset(style),
                        className: 'point-label custom-annotation'
                    });
                }

                if (!categories.has(category)) {
                    categories.set(category, { group: L.layerGroup().addTo(map), colors: [], style });
                }
                const entry = categories.get(category);
                entry.group.addLayer(layer);
                searchIndex.push({
                    name,
                    category,
                    color: style.color,
                    layer,
                    group: entry.group,
                    key: normalize(`${name} ${category}`)
                });
                if (!entry.colors.includes(style.color)) entry.colors.push(style.color);
            }
        });

        const rank = (name) => {
            const i = POINT_CATEGORY_ORDER.indexOf(name);
            return i === -1 ? POINT_CATEGORY_ORDER.length : i;
        };

        [...categories.entries()]
            .sort(([a], [b]) => rank(a) - rank(b))
            .forEach(([category, { group, colors, style }]) => {
                addOverlayRow({
                    id: `points-${category}`,
                    label: category,
                    group,
                    dot: !style.icon,
                    iconHtml: style.icon ? iconMarkup(style) : null,
                    swatch: swatchFor(colors)
                });
            });
    } catch (error) {
        console.error('Error loading points.geojson:', error);
        showToast('Impossible de charger points.geojson.');
    }
}
loadPoints();

/**
 * ==========================================
 * 5c. SEARCH (points)
 * ==========================================
 * Searches the name and category of every point. Only points whose
 * layer is currently switched on are suggested.
 */
const searchIndex = []; // filled in loadPoints()

const searchEl = document.getElementById('search');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const searchResults = document.getElementById('search-results');
const MAX_RESULTS = 8;

let searchMatches = [];
let activeResult = -1;

// Lower-case and strip accents so "regulation" finds "régulation"
function normalize(text) {
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Highlight the first match of the query in the name (accent-insensitive)
function highlight(name, query) {
    const at = normalize(name).indexOf(query);
    if (at === -1 || normalize(name).length !== name.length) return escapeHtml(name);
    return escapeHtml(name.slice(0, at))
        + '<mark>' + escapeHtml(name.slice(at, at + query.length)) + '</mark>'
        + escapeHtml(name.slice(at + query.length));
}

function setResultsOpen(open) {
    searchResults.hidden = !open;
    searchInput.setAttribute('aria-expanded', String(open));
    if (!open) {
        activeResult = -1;
        searchInput.removeAttribute('aria-activedescendant');
    }
}

function setActiveResult(index) {
    const options = searchResults.querySelectorAll('.search__option');
    if (!options.length) return;
    activeResult = (index + options.length) % options.length;
    options.forEach((el, i) => el.setAttribute('aria-selected', String(i === activeResult)));
    const current = options[activeResult];
    searchInput.setAttribute('aria-activedescendant', current.id);
    current.scrollIntoView({ block: 'nearest' });
}

function renderResults() {
    const query = normalize(searchInput.value.trim());
    searchClear.hidden = !searchInput.value;

    if (!query) {
        searchMatches = [];
        setResultsOpen(false);
        return;
    }

    searchMatches = searchIndex
        .filter((item) => map.hasLayer(item.group) && item.key.includes(query))
        .sort((a, b) => {
            // Names that start with the query first, then alphabetical
            const sa = normalize(a.name).startsWith(query) ? 0 : 1;
            const sb = normalize(b.name).startsWith(query) ? 0 : 1;
            return sa - sb || a.name.localeCompare(b.name, 'fr', { numeric: true });
        })
        .slice(0, MAX_RESULTS);

    if (!searchMatches.length) {
        searchResults.innerHTML = '<li class="search__empty" role="presentation">Aucun ouvrage trouvé.</li>';
    } else {
        searchResults.innerHTML = searchMatches.map((item, i) => `
            <li id="search-option-${i}" class="search__option" role="option" aria-selected="false" data-index="${i}">
                <span class="search__dot" style="--dot:${escapeHtml(item.color)}"></span>
                <span class="search__text">
                    <span class="search__name">${highlight(item.name, query)}</span>
                    <span class="search__cat">${escapeHtml(item.category)}</span>
                </span>
            </li>`).join('');
    }
    activeResult = -1;
    setResultsOpen(true);
}

function goToResult(item) {
    setResultsOpen(false);
    searchInput.value = item.name;
    searchClear.hidden = false;
    searchInput.blur();
    setPanelOpen(false);

    const target = item.layer.getLatLng();
    const zoom = Math.max(map.getZoom(), 16);
    map.once('moveend', () => item.layer.openPopup());
    map.flyTo(target, zoom, { duration: 0.8 });
}

searchInput.addEventListener('input', renderResults);
searchInput.addEventListener('focus', () => {
    setPanelOpen(false);
    if (searchInput.value.trim()) renderResults();
});

searchInput.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            if (searchResults.hidden) renderResults();
            setActiveResult(activeResult + 1);
            break;
        case 'ArrowUp':
            e.preventDefault();
            setActiveResult(activeResult - 1);
            break;
        case 'Enter':
            if (searchMatches.length) {
                e.preventDefault();
                goToResult(searchMatches[activeResult >= 0 ? activeResult : 0]);
            }
            break;
        case 'Escape':
            if (!searchResults.hidden) {
                setResultsOpen(false);
            } else {
                searchInput.value = '';
                searchClear.hidden = true;
            }
            break;
    }
});

searchResults.addEventListener('click', (e) => {
    const option = e.target.closest('.search__option');
    if (option) goToResult(searchMatches[Number(option.dataset.index)]);
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.hidden = true;
    setResultsOpen(false);
    searchInput.focus();
});

map.on('click', () => setResultsOpen(false));
layersToggle.addEventListener('click', () => setResultsOpen(false));

// Keep taps inside the search box from reaching the map
L.DomEvent.disableClickPropagation(searchEl);
L.DomEvent.disableScrollPropagation(searchEl);

/**
 * ==========================================
 * 5d. ABOUT DIALOG
 * ==========================================
 */
const aboutButton = document.getElementById('about-button');
const aboutDialog = document.getElementById('about-dialog');

aboutButton.addEventListener('click', () => {
    setPanelOpen(false);
    setResultsOpen(false);
    aboutDialog.showModal();
});

// Tap on the dimmed backdrop closes the dialog
aboutDialog.addEventListener('click', (e) => {
    if (e.target === aboutDialog) aboutDialog.close();
});

L.DomEvent.disableClickPropagation(aboutButton);

/**
 * ==========================================
 * 6. ZOOM HANDLING
 * ==========================================
 */
const ZOOM_THRESHOLD = 14;

function updateMarkerVisibility() {
    map.getContainer().classList.toggle('hide-annotations', map.getZoom() < ZOOM_THRESHOLD);
}
map.on('zoomend', updateMarkerVisibility);
updateMarkerVisibility();

/**
 * ==========================================
 * 7. TOAST
 * ==========================================
 */
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(message, duration = 3500) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), duration);
}

/**
 * ==========================================
 * 8. GEOLOCATION
 * ==========================================
 */
const locateButton = document.getElementById('locate-button');
let userMarker = null;
let accuracyCircle = null;

function setLocating(busy) {
    locateButton.classList.toggle('is-busy', busy);
    locateButton.disabled = busy;
}

function updateUserLocation(lat, lon, accuracy) {
    setLocating(false);

    if (userMarker) map.removeLayer(userMarker);
    if (accuracyCircle) map.removeLayer(accuracyCircle);

    userMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'user-location-marker',
            html: '<div class="user-dot"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        }),
        keyboard: false
    }).addTo(map);

    if (accuracy) {
        accuracyCircle = L.circle([lat, lon], {
            radius: accuracy,
            weight: 1,
            color: '#1f6feb',
            fillColor: '#1f6feb',
            fillOpacity: 0.12,
            interactive: false
        }).addTo(map);
    }

    map.setView([lat, lon], 15);
}

function locateUser() {
    // Running inside the React Native WebView: ask the native side
    if (window.ReactNativeWebView) {
        setLocating(true);
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'getLocation' }));
        return;
    }

    if (!navigator.geolocation) {
        showToast("La géolocalisation n'est pas disponible sur cet appareil.");
        return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
        ({ coords }) => updateUserLocation(coords.latitude, coords.longitude, coords.accuracy),
        (error) => {
            setLocating(false);
            showToast('Position introuvable. Vérifiez que la localisation est activée.');
            console.error('Geolocation error:', error);
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

locateButton.addEventListener('click', locateUser);
window.locateUser = locateUser; // kept for any native code calling it

/**
 * ==========================================
 * 9. REACT NATIVE MESSAGING BRIDGE
 * ==========================================
 */
function handleMessage(data) {
    try {
        const msg = typeof data === 'string' ? JSON.parse(data) : data;

        switch (msg.type) {
            case 'locationUpdate':
                updateUserLocation(msg.latitude, msg.longitude, msg.accuracy);
                break;
            case 'locationError':
                setLocating(false);
                showToast('Position introuvable : ' + msg.message);
                break;
        }
    } catch (error) {
        console.error('Error parsing message:', error);
    }
}

document.addEventListener('message', (event) => handleMessage(event.data));
window.addEventListener('message', (event) => handleMessage(event.data));

/**
 * ==========================================
 * 10. SERVICE WORKER
 * ==========================================
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            await navigator.serviceWorker.register('./sw.js');
        } catch (err) {
            console.error('Service Worker registration failed:', err);
        }
    });
}
