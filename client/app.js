let mapInstance;

async function init() {
  try {
    document.querySelectorAll('form[data-static-form]').forEach(form => {
      form.addEventListener('submit', event => event.preventDefault());
    });

    document.querySelectorAll('[data-static-link]').forEach(link => {
      link.addEventListener('click', event => event.preventDefault());
    });

    document.querySelectorAll('[data-dismiss-banner]').forEach(button => {
      button.addEventListener('click', () => {
        const banner = button.closest('.delivery-banner');
        if (banner) banner.remove();
      });
    });

    const response = await fetch('/config');
    if (!response.ok) throw new Error(`Config request failed: ${response.status}`);
    const config = await response.json();
    loadMapsScript(config.mapsApiKey);
  } catch (error) {
    console.error('Unable to initialise Google Maps', error);
  }
}

function loadMapsScript(apiKey) {
  if (!apiKey) {
    console.error('Google Maps API key is missing');
    return;
  }

  if (window.google && window.google.maps) {
    initMap();
    return;
  }

  const existing = document.querySelector('script[data-google-maps="true"]');
  if (existing) {
    existing.addEventListener('load', initMap, { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
  script.async = true;
  script.defer = true;
  script.dataset.googleMaps = 'true';
  script.addEventListener('load', initMap, { once: true });
  script.addEventListener('error', () => console.error('Google Maps script failed to load'));
  document.head.appendChild(script);
}

function ensureMapElement() {
  let mapElement = document.getElementById('map');
  if (!mapElement) {
    mapElement = document.createElement('div');
    mapElement.id = 'map';
    document.body.appendChild(mapElement);
  }

  const firstElement = document.body.firstElementChild;
  if (firstElement && firstElement !== mapElement) {
    document.body.insertBefore(mapElement, firstElement);
  }

  mapElement.classList.add('map-ready');
  return mapElement;
}

function initMap() {
  const mapElement = ensureMapElement();
  if (!mapElement) return;

  const initialCenter = { lat: -26.2041, lng: 28.0473 };
  const initialOptions = {
    center: initialCenter,
    zoom: 12,
    mapTypeControl: true,
    fullscreenControl: true,
    streetViewControl: false,
    backgroundColor: '#dbeafe',
  };

  if (!mapInstance) {
    mapInstance = new google.maps.Map(mapElement, initialOptions);
  }

  requestUserLocation(mapInstance);
  styleControls(mapElement, mapInstance);

  if (document.body.classList.contains('map-background')) {
    mapElement.classList.add('map-muted');
  } else {
    mapElement.classList.remove('map-muted');
  }
}

function requestUserLocation(map) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      position => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        map.setCenter(coords);
      },
      () => fallbackToIpLocation(map),
    );
  } else {
    fallbackToIpLocation(map);
  }
}

async function fallbackToIpLocation(map) {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) return;
    const data = await response.json();
    if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      map.setCenter({ lat: data.latitude, lng: data.longitude });
    }
  } catch (error) {
    console.warn('IP geolocation fallback unavailable', error);
  }
}

function styleControls(mapElement, map) {
  const repositionControls = () => {
    const mapTypeControl = mapElement.querySelector('.gm-style-mtc');
    if (mapTypeControl) {
      mapTypeControl.style.top = '56px';
    }

    const fullscreenControl = mapElement.querySelector('.gm-fullscreen-control');
    if (fullscreenControl) {
      fullscreenControl.style.top = '56px';
    }
  };

  google.maps.event.addListenerOnce(map, 'idle', repositionControls);
  google.maps.event.addListener(map, 'maptypeid_changed', repositionControls);
  google.maps.event.addListener(map, 'zoom_changed', repositionControls);
}

document.addEventListener('DOMContentLoaded', init);
