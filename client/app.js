async function init() {
  const config = await fetch('/config').then(r => r.json());
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}`;
  script.onload = initMap;

  document.head.appendChild(script);
}

function initMap() {
  const map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: -26.2041, lng: 28.0473 },
    zoom: 12,
  });
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setCenter(p);
    });
  }
}

function toggleUI() {
  document.getElementById('topbar').classList.toggle('hidden');
  document.getElementById('search').classList.toggle('hidden');
}

document.addEventListener('DOMContentLoaded', init);

