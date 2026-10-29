/** 
 * ==========================================
 * 1. MAP INITIALIZATION & TILE LAYER
 * ==========================================
 */
console.log('🗺️ Initializing map...');
const map = L.map('map').setView([32.294577425170004, -6.7027966781581165], 10);

// Assign the tile layer to a variable so we can add it to the layer control
const osmBaseMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
}).addTo(map);

console.log('✅ Map initialized');

/** 
 * ==========================================
 * 2. LAYER GROUPS & CONTROLS SETUP
 * ==========================================
 */
// Create empty layer groups for our data
const imageOverlayGroup = L.layerGroup().addTo(map);
const pDataGroup = L.layerGroup().addTo(map);
const sDataGroup = L.layerGroup().addTo(map);

// Set up the Layer Control dictionary
const baseMaps = {
    "OpenStreetMap": osmBaseMap
};

const overlayMaps = {
    "Reference Map (Image)": imageOverlayGroup,
    "P Data (Blue)": pDataGroup,
    "S Data (Purple)": sDataGroup
};

// Add the layer control menu to the map
L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);

/** 
 * ==========================================
 * 3. IMAGE OVERLAY (WEB MERCATOR)
 * ==========================================
 */
function addImageOverlay() {
    const imageUrl = './Reference-map-M8M9.png';

    // Web Mercator bounding box coordinates
    const xMin = -766932.573;
    const yMin = 3796308.928;
    const xMax = -756549.053;
    const yMax = 3805209.088;

    // Convert to Lat/Lng
    const topLeftLatLng = L.CRS.EPSG3857.unproject(L.point(xMin, yMax));
    const bottomRightLatLng = L.CRS.EPSG3857.unproject(L.point(xMax, yMin));

    const imageBounds = [
        [topLeftLatLng.lat, topLeftLatLng.lng],
        [bottomRightLatLng.lat, bottomRightLatLng.lng]
    ];

    // Add the image to the imageOverlayGroup, NOT the map directly
    L.imageOverlay(imageUrl, imageBounds, { opacity: 1 }).addTo(imageOverlayGroup);
    console.log('🖼️ Image overlay added to layer group');
}
addImageOverlay();

/** 
 * ==========================================
 * 4. GEOJSON LAYERS
 * ==========================================
 */
console.log('🌐 Loading GeoJSON layers...');

async function loadGeoJSONLayer(filename, strokeColor, targetGroup) {
    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();

        // Create the GeoJSON layer and add it to the specific target group
        L.geoJSON(data, {
            style: {
                weight: 1.5,
                color: strokeColor,
            }
        }).addTo(targetGroup);

        console.log(`✅ ${filename} loaded into layer group`);
    } catch (error) {
        console.error(`❌ Error loading ${filename}:`, error);
    }
}

// Load layers dynamically and assign them to their respective groups
loadGeoJSONLayer("P.geojson", "blue", pDataGroup);
loadGeoJSONLayer("S.geojson", "purple", sDataGroup);

/** 
 * ==========================================
 * 5. ZOOM HANDLING (OPTIMIZED)
 * ==========================================
 */
const ZOOM_THRESHOLD = 14;

function updateMarkerVisibility() {
    const currentZoom = map.getZoom();
    const mapContainer = map.getContainer();

    if (currentZoom < ZOOM_THRESHOLD) {
        mapContainer.classList.add('hide-annotations');
    } else {
        mapContainer.classList.remove('hide-annotations');
    }
}
map.on('zoomend', updateMarkerVisibility);
updateMarkerVisibility();

/** 
 * ==========================================
 * 6. GEOLOCATION & MARKER HANDLING
 * ==========================================
 */
let userMarker = null;

function updateUserLocation(lat, lon) {
    console.log('📍 Updating user location:', { lat, lon });

    if (userMarker) {
        map.removeLayer(userMarker);
    }

    userMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'user-location-marker',
            html: '<div style="background-color: #2563eb; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        })
    }).addTo(map);

    userMarker.bindPopup('Your Location').openPopup();
    map.setView([lat, lon], 15);
}

function locateUser() {
    if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'getLocation' }));
        return;
    }

    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => updateUserLocation(position.coords.latitude, position.coords.longitude),
        (error) => alert('Unable to get location: ' + error.message)
    );
}

/** 
 * ==========================================
 * 7. REACT NATIVE MESSAGING BRIDGE
 * ==========================================
 */
function handleMessage(data) {
    try {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

        switch (parsedData.type) {
            case 'locationUpdate':
                updateUserLocation(parsedData.latitude, parsedData.longitude);
                break;
            case 'locationError':
                alert('Location error: ' + parsedData.message);
                break;
        }
    } catch (error) {
        console.error('❌ Error parsing message:', error);
    }
}

document.addEventListener('message', (event) => handleMessage(event.data));
window.addEventListener('message', (event) => handleMessage(event.data));

/** 
 * ==========================================
 * 8. SERVICE WORKER REGISTRATION
 * ==========================================
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            await navigator.serviceWorker.register('./sw.js');
        } catch (err) {
            console.error('❌ Service Worker registration failed:', err);
        }
    });
}
