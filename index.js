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
        label: 'Plan',
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
    { id: 'image', label: 'Plan de référence', group: imageOverlayGroup, image: true },
    { id: 'p', label: 'Couche P', group: pDataGroup, color: 'blue', file: 'P.geojson' },
    { id: 's', label: 'Couche S', group: sDataGroup, color: 'purple', file: 'S.geojson' }
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
        map.removeLayer(activeBasemap.layer);
        activeBasemap = base;
        base.layer.addTo(map).bringToBack();
    });
    basemapList.appendChild(label);
});

// Overlay toggles
OVERLAYS.forEach((overlay) => {
    const li = document.createElement('li');
    const swatchClass = overlay.image ? 'layer-row__swatch layer-row__swatch--image' : 'layer-row__swatch';
    const swatchStyle = overlay.color ? `style="--swatch:${overlay.color}"` : '';

    li.innerHTML = `
        <label class="layer-row">
            <span class="${swatchClass}" ${swatchStyle}></span>
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
});

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
