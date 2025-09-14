function loadMap(apiKey) {
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`;
  script.async = true;
  document.head.appendChild(script);
}

function initMap() {
  const defaultPos = { lat: -30.5595, lng: 22.9375 }; // South Africa center
  const map = new google.maps.Map(document.getElementById('map'), {
    zoom: 10,
    center: defaultPos,
  });

  function setPosition(pos) {
    map.setCenter(pos);
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPosition({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        fetch('https://ipapi.co/json')
          .then(r => r.json())
          .then(data => setPosition({ lat: data.latitude, lng: data.longitude }))
          .catch(() => setPosition(defaultPos));
      }
    );
  } else {
    setPosition(defaultPos);
  }
}

fetch('/config')
  .then(r => r.json())
  .then(cfg => loadMap(cfg.googleMapsApiKey));

function toggleUI() {
  document.body.classList.toggle('overlay-hidden');
}
