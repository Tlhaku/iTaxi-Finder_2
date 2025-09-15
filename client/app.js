async function init() {
  const config = await fetch('/config').then(r => r.json());
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}`;
  script.onload = initMap;
  document.head.appendChild(script);
}

function initMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  if (mapElement !== document.body.firstElementChild) {
    document.body.insertBefore(mapElement, document.body.firstElementChild);
  }

  const map = new google.maps.Map(mapElement, {
    center: { lat: -26.2041, lng: 28.0473 },
    zoom: 12,
    mapTypeControl: true,
    fullscreenControl: true,
    streetViewControl: false,
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setCenter(p);
    });
  }

  const repositionControls = () => {
    const mapTypeControl = mapElement.querySelector('.gm-style-mtc');
    if (mapTypeControl) {
      mapTypeControl.style.top = '60px';
    }

    const fullscreenControl = mapElement.querySelector('.gm-fullscreen-control');
    if (fullscreenControl) {
      fullscreenControl.style.top = '60px';
    }
  };

  google.maps.event.addListenerOnce(map, 'idle', repositionControls);
  google.maps.event.addListener(map, 'maptypeid_changed', repositionControls);
  google.maps.event.addListener(map, 'zoom_changed', repositionControls);
}

document.addEventListener('DOMContentLoaded', init);
