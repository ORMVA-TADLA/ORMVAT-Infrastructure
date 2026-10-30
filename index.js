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
const imageOverlayGroup = L.layerGroup().addTo(map);
const pDataGroup = L.layerGroup().addTo(map);
const sDataGroup = L.layerGroup().addTo(map);

let referenceImage = null; // set in addImageOverlay()

const OVERLAYS = [
    { id: 'image', label: 'Plan de M8/M9', group: imageOverlayGroup, image: true },
    { id: 'primaires', label: 'Canaux Primaires', group: pDataGroup, color: 'blue', file: 'primaires.geojson' },
    { id: 'secondaires', label: 'Canaux Secondaires', group: sDataGroup, color: 'purple', file: 'secondaires.geojson' },
];

/**
 * ==========================================
 * 3. IMAGE OVERLAY (WEB MERCATOR)
 * ==========================================
 */
function addImageOverlay() {
    const imageUrl = './Reference-map-M8M9.png';

    // Web Mercator bounding box
    const xMin = -766932.573;
    const yMin = 3796308.928;
    const xMax = -756549.053;
    const yMax = 3805209.088;

    const topLeft = L.CRS.EPSG3857.unproject(L.point(xMin, yMax));
    const bottomRight = L.CRS.EPSG3857.unproject(L.point(xMax, yMin));

    referenceImage = L.imageOverlay(
        imageUrl,
        [[topLeft.lat, topLeft.lng], [bottomRight.lat, bottomRight.lng]],
        { opacity: 1 }
    ).addTo(imageOverlayGroup);
}
addImageOverlay();

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
                <input type="checkbox" checked>
                <span class="switch__track"></span>
            </span>
        </label>
        ${overlay.image ? `
        <div class="opacity" data-disabled="false">
            <span>Opacité</span>
            <input type="range" min="0" max="1" step="0.05" value="1" aria-label="Opacité du plan de référence">
        </div>` : ''}`;

    const checkbox = li.querySelector('input[type="checkbox"]');
    const opacityBox = li.querySelector('.opacity');

    checkbox.addEventListener('change', () => {
        if (checkbox.checked) map.addLayer(overlay.group);
        else map.removeLayer(overlay.group);
        if (opacityBox) opacityBox.dataset.disabled = String(!checkbox.checked);
    });

    if (opacityBox) {
        opacityBox.querySelector('input').addEventListener('input', (e) => {
            referenceImage?.setOpacity(Number(e.target.value));
        });
    }

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
    'Station de filtration': { icon: './icons/house-fill.svg',color: '#4285F4' },
    'Prises de préfiltration': {icon: './icons/jail-prison.svg',color: '#4285F4' },
    'Vannes de régulation et de sectionnement': {color: '#F4B400'},
    'Départs & Décharges': {},
    'Prises Secondaires': { color: 'purple'},
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
