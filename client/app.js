const AUTH_STORAGE_KEY = 'itaxiFinderUser';

let menuToggleButton = null;
let menuBackdrop = null;
let menuCloseButton = null;
let menuContainer = null;
let accountContainer = null;
let submenuControllers = [];

let mapInstance = null;
let mapMarkers = [];
let mapRouteLine = null;
let cachedRoutes = null;

const communityTownships = [
  { name: 'Community Overview', href: '/community.html' },
  { name: 'Soweto', href: '/community/soweto.html' },
  { name: 'Tembisa', href: '/community/tembisa.html' },
  { name: 'Khayelitsha', href: '/community/khayelitsha.html' },
  { name: 'Umlazi', href: '/community/umlazi.html' },
  { name: 'Soshanguve', href: '/community/soshanguve.html' },
  { name: 'Mamelodi', href: '/community/mamelodi.html' },
  { name: 'Katlehong', href: '/community/katlehong.html' },
  { name: 'Sebokeng', href: '/community/sebokeng.html' },
  { name: 'Mdantsane', href: '/community/mdantsane.html' },
  { name: 'Mitchells Plain', href: '/community/mitchells-plain.html' },
  { name: 'Alexandra', href: '/community/alexandra.html' },
  { name: 'Daveyton', href: '/community/daveyton.html' },
  { name: 'KwaMashu', href: '/community/kwamashu.html' },
  { name: 'Vosloorus', href: '/community/vosloorus.html' },
  { name: 'Orange Farm', href: '/community/orange-farm.html' },
  { name: 'Langa', href: '/community/langa.html' },
  { name: 'Gugulethu', href: '/community/gugulethu.html' },
  { name: 'Nyanga', href: '/community/nyanga.html' },
  { name: 'Delft', href: '/community/delft.html' },
  { name: 'Philippi', href: '/community/philippi.html' },
  { name: 'Thokoza', href: '/community/thokoza.html' },
  { name: 'Tsakane', href: '/community/tsakane.html' },
  { name: 'KwaThema', href: '/community/kwathema.html' },
  { name: 'Reiger Park', href: '/community/reiger-park.html' },
  { name: 'Atteridgeville', href: '/community/atteridgeville.html' },
  { name: 'Ga-Rankuwa', href: '/community/ga-rankuwa.html' },
  { name: 'Kagiso', href: '/community/kagiso.html' },
  { name: 'Zwide', href: '/community/zwide.html' },
  { name: 'KwaZakhele', href: '/community/kwazakhele.html' },
  { name: 'Motherwell', href: '/community/motherwell.html' },
  { name: 'New Brighton', href: '/community/new-brighton.html' },
  { name: 'Zwelitsha', href: '/community/zwelitsha.html' },
  { name: 'Duncan Village', href: '/community/duncan-village.html' },
  { name: 'Botshabelo', href: '/community/botshabelo.html' },
  { name: 'Thaba Nchu', href: '/community/thaba-nchu.html' },
  { name: 'Seshego', href: '/community/seshego.html' },
  { name: 'Mankweng', href: '/community/mankweng.html' },
  { name: 'Lebowakgomo', href: '/community/lebowakgomo.html' },
  { name: 'Galeshewe', href: '/community/galeshewe.html' },
  { name: 'Ikageng', href: '/community/ikageng.html' },
  { name: 'Boitekong', href: '/community/boitekong.html' },
  { name: 'Phokeng', href: '/community/phokeng.html' },
  { name: 'Boipatong', href: '/community/boipatong.html' },
  { name: 'Sharpeville', href: '/community/sharpeville.html' },
  { name: 'Bophelong', href: '/community/bophelong.html' },
  { name: 'Edendale', href: '/community/edendale.html' },
  { name: 'Imbali', href: '/community/imbali.html' },
  { name: 'KwaNobuhle', href: '/community/kwanobuhle.html' },
  { name: 'Thembalethu', href: '/community/thembalethu.html' },
  { name: 'KwaNonqaba', href: '/community/kwanonqaba.html' },
];

const navItems = [
  { label: 'Route Finder', href: '/' },
  { label: 'Route Adder', href: '/route-adder.html' },
  { label: 'Delivery', href: '/delivery.html' },
  { label: 'Community', submenu: communityTownships },
  { label: 'Registration', href: '/registration.html' },
  { label: 'About', href: '/about.html' },
];

const roleFieldConfig = {
  collector: [
    { name: 'collectionArea', label: 'Collection area focus', type: 'text', required: true },
    { name: 'operatingHours', label: 'Operating hours', type: 'text' },
  ],
  'taxi driver': [
    { name: 'vehicleRegistration', label: 'Vehicle registration', type: 'text', required: true },
    { name: 'primaryRoute', label: 'Primary route', type: 'text', required: true },
  ],
  'spaza owner': [
    { name: 'businessName', label: 'Business name', type: 'text', required: true },
    { name: 'tradingAddress', label: 'Trading address', type: 'text' },
  ],
  'taxi rank depot/depot shop': [
    { name: 'depotName', label: 'Depot or rank name', type: 'text', required: true },
    { name: 'services', label: 'Services offered', type: 'text' },
  ],
  'monthly subscriber': [
    { name: 'employer', label: 'Employer / organisation', type: 'text' },
    { name: 'commuteRoute', label: 'Primary commute route', type: 'text', required: true },
  ],
  'taxi owner': [
    { name: 'fleetSize', label: 'Fleet size', type: 'number', min: 1, required: true },
    { name: 'association', label: 'Association or forum', type: 'text' },
  ],
};

function getCurrentUser() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed && parsed.token) {
      return parsed;
    }
  } catch (err) {
    console.warn('Unable to read auth state', err);
  }
  return null;
}

function setCurrentUser(user) {
  if (user && user.token) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent('authchange', { detail: user && user.token ? user : null }));
}

function clearCurrentUser() {
  setCurrentUser(null);
}

async function apiRequest(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth) {
    const user = getCurrentUser();
    if (!user || !user.token) {
      throw new Error('LOGIN_REQUIRED');
    }
    headers['X-Auth-Token'] = user.token;
  }
  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const data = await response.json();
      if (data && data.message) message = data.message;
    } catch (err) {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

async function fetchRoutes({ force = false } = {}) {
  if (!force && Array.isArray(cachedRoutes)) {
    return cachedRoutes;
  }
  const routes = await apiRequest('/api/routes');
  cachedRoutes = Array.isArray(routes) ? routes : [];
  return cachedRoutes;
}

function loadMap() {
  fetch('/config')
    .then(r => r.json())
    .then(config => {
      return new Promise(resolve => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}`;
        script.onload = resolve;
        document.head.appendChild(script);
      });
    })
    .then(() => initMap())
    .catch(err => console.error('Unable to load map', err));
}

function initMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement || typeof google === 'undefined') return;

  mapInstance = new google.maps.Map(mapElement, {
    center: { lat: -26.2041, lng: 28.0473 },
    zoom: 12,
    disableDefaultUI: true,
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapInstance.setCenter(position);
      },
      () => {
        /* ignore geolocation errors */
      },
      { enableHighAccuracy: true, maximumAge: 60000 }
    );
  }
}

function clearMapOverlays() {
  mapMarkers.forEach(marker => marker.setMap(null));
  mapMarkers = [];
  if (mapRouteLine) {
    mapRouteLine.setMap(null);
    mapRouteLine = null;
  }
}

function showRouteOnMap(route) {
  if (!mapInstance || !route) return;
  clearMapOverlays();

  const bounds = new google.maps.LatLngBounds();

  const stops = Array.isArray(route.stops) ? route.stops : [];
  stops.forEach(stop => {
    if (typeof stop.lat === 'number' && typeof stop.lng === 'number') {
      const marker = new google.maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map: mapInstance,
        title: stop.name || 'Stop',
      });
      mapMarkers.push(marker);
      bounds.extend(marker.getPosition());
    }
  });

  const pathPoints = Array.isArray(route.snappedPath) && route.snappedPath.length
    ? route.snappedPath
    : Array.isArray(route.path) && route.path.length
      ? route.path
      : stops;

  if (Array.isArray(pathPoints) && pathPoints.length > 1) {
    mapRouteLine = new google.maps.Polyline({
      path: pathPoints.map(p => ({ lat: p.lat, lng: p.lng })),
      strokeColor: '#134074',
      strokeOpacity: 0.9,
      strokeWeight: 4,
      map: mapInstance,
    });
    pathPoints.forEach(point => {
      if (typeof point.lat === 'number' && typeof point.lng === 'number') {
        bounds.extend(point);
      }
    });
  }

  if (!bounds.isEmpty()) {
    mapInstance.fitBounds(bounds, 60);
  }
}

function updateMenuState(isOpen) {
  document.body.classList.toggle('menu-open', isOpen);
  if (menuToggleButton) {
    menuToggleButton.setAttribute('aria-expanded', String(isOpen));
  }
  if (menuCloseButton) {
    menuCloseButton.setAttribute('aria-expanded', String(isOpen));
  }
  if (menuContainer) {
    menuContainer.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen) {
      menuContainer.focus({ preventScroll: true });
    }
  }
  if (!isOpen && menuToggleButton) {
    menuToggleButton.focus({ preventScroll: true });
  }
  if (!isOpen) {
    collapseSubmenus();
  }
}

function openMenu() {
  updateMenuState(true);
}

function closeMenu() {
  updateMenuState(false);
}

function toggleMenu(force) {
  const shouldOpen = typeof force === 'boolean'
    ? force
    : !document.body.classList.contains('menu-open');
  updateMenuState(shouldOpen);
}

window.toggleUI = toggleMenu;

function collapseSubmenus() {
  submenuControllers.forEach(controller => {
    controller.button.setAttribute('aria-expanded', 'false');
    controller.panel.hidden = true;
  });
}

function buildMenuNavigation(navRoot, currentPath) {
  submenuControllers = [];
  navRoot.textContent = '';

  navItems.forEach(item => {
    if (item.submenu) {
      const wrapper = document.createElement('div');
      wrapper.className = 'menu-submenu';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'menu-link menu-link--submenu';
      toggle.textContent = item.label;
      toggle.setAttribute('aria-expanded', 'false');

      const panel = document.createElement('div');
      panel.className = 'menu-submenu-panel';
      panel.hidden = true;

      item.submenu.forEach(linkItem => {
        const link = document.createElement('a');
        link.href = linkItem.href;
        link.textContent = linkItem.name;
        link.className = 'menu-submenu-link';
        if (currentPath === linkItem.href) {
          link.setAttribute('aria-current', 'page');
        }
        panel.appendChild(link);
      });

      toggle.addEventListener('click', () => {
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        collapseSubmenus();
        toggle.setAttribute('aria-expanded', String(!isExpanded));
        panel.hidden = isExpanded;
      });

      submenuControllers.push({ button: toggle, panel });

      wrapper.appendChild(toggle);
      wrapper.appendChild(panel);
      navRoot.appendChild(wrapper);
    } else {
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.label;
      link.className = 'menu-link';
      if (currentPath === item.href) {
        link.setAttribute('aria-current', 'page');
      }
      navRoot.appendChild(link);
    }
  });
}

function updateAccountDisplay() {
  if (!accountContainer) return;
  const user = getCurrentUser();
  accountContainer.textContent = '';
  accountContainer.className = 'menu-account';

  if (user) {
    const greeting = document.createElement('div');
    greeting.className = 'menu-account__summary';
    greeting.innerHTML = `<strong>${user.name}</strong><span>${user.role}</span>`;

    const logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'menu-account__logout';
    logout.textContent = 'Log out';
    logout.addEventListener('click', () => {
      clearCurrentUser();
    });

    accountContainer.appendChild(greeting);
    accountContainer.appendChild(logout);
  } else {
    const prompt = document.createElement('div');
    prompt.className = 'menu-account__summary';
    prompt.innerHTML = '<strong>Guest</strong><span>Sign in to save routes</span>';

    const loginLink = document.createElement('a');
    loginLink.href = '/registration.html';
    loginLink.className = 'menu-account__login';
    loginLink.textContent = 'Register or log in';

    accountContainer.appendChild(prompt);
    accountContainer.appendChild(loginLink);
  }
}

function relocatePanels() {
  if (!menuContainer) return;
  const panels = Array.from(document.querySelectorAll('[data-panel]'));
  panels.forEach(panel => {
    if (panel === menuContainer) return;
    if (panel.parentElement === menuContainer) return;
    panel.classList.add('menu-section');
    menuContainer.appendChild(panel);
  });
}

function buildMenu() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  topbar.setAttribute('role', 'dialog');
  topbar.setAttribute('aria-modal', 'false');
  topbar.setAttribute('aria-label', 'iTaxi-Finder navigation');
  topbar.setAttribute('aria-hidden', 'true');
  if (!topbar.hasAttribute('tabindex')) {
    topbar.setAttribute('tabindex', '-1');
  }
  topbar.textContent = '';
  menuContainer = topbar;

  menuToggleButton = document.createElement('button');
  menuToggleButton.type = 'button';
  menuToggleButton.className = 'menu-toggle';
  menuToggleButton.setAttribute('aria-label', 'Open navigation menu');
  menuToggleButton.setAttribute('aria-controls', topbar.id || 'topbar');
  menuToggleButton.setAttribute('aria-expanded', 'false');
  menuToggleButton.innerHTML = '<span></span><span></span><span></span>';
  document.body.appendChild(menuToggleButton);

  menuBackdrop = document.createElement('div');
  menuBackdrop.className = 'menu-backdrop';
  document.body.appendChild(menuBackdrop);

  menuCloseButton = document.createElement('button');
  menuCloseButton.type = 'button';
  menuCloseButton.className = 'menu-close';
  menuCloseButton.setAttribute('aria-controls', topbar.id || 'topbar');
  menuCloseButton.setAttribute('aria-expanded', 'false');
  menuCloseButton.setAttribute('aria-label', 'Close navigation menu');
  menuCloseButton.textContent = 'Close menu';
  topbar.appendChild(menuCloseButton);

  const brandLink = document.createElement('a');
  brandLink.href = '/';
  brandLink.textContent = 'iTaxi-Finder';
  brandLink.className = 'menu-brand';
  topbar.appendChild(brandLink);

  accountContainer = document.createElement('div');
  accountContainer.className = 'menu-account';
  topbar.appendChild(accountContainer);
  updateAccountDisplay();

  const nav = document.createElement('nav');
  nav.className = 'menu-links';
  nav.setAttribute('aria-label', 'Site sections');
  topbar.appendChild(nav);
  buildMenuNavigation(nav, window.location.pathname);

  relocatePanels();

  menuToggleButton.addEventListener('click', () => toggleMenu());
  menuCloseButton.addEventListener('click', () => closeMenu());
  menuBackdrop.addEventListener('click', () => closeMenu());

  topbar.addEventListener('click', event => {
    if (event.target instanceof HTMLElement && event.target.matches('a')) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('menu-open')) {
      closeMenu();
    }
  });

  window.addEventListener('authchange', () => updateAccountDisplay());
}

function detectPage() {
  const explicit = document.body.dataset.page;
  if (explicit) return explicit;
  const path = window.location.pathname;
  if (path === '/' || path.endsWith('/index.html')) return 'finder';
  if (path.includes('route-adder')) return 'adder';
  if (path.includes('registration')) return 'registration';
  if (path.includes('/community/')) return 'community';
  return 'default';
}

function renderRouteList(routes, container, activeId) {
  container.textContent = '';
  if (!routes.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No routes are available yet.';
    container.appendChild(empty);
    return;
  }

  routes.forEach(route => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'route-list__item';
    button.dataset.routeId = route.routeId;
    button.innerHTML = `<span class="route-list__name">${route.name}</span>` +
      (route.gesture ? `<span class="route-list__gesture">${route.gesture}</span>` : '');
    if (String(route.routeId) === String(activeId)) {
      button.classList.add('is-active');
    }
    container.appendChild(button);
  });
}

function renderRouteDetails(route, container) {
  if (!route) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.querySelector('[data-route-title]').textContent = route.name;
  container.querySelector('[data-route-gesture]').textContent = route.gesture || '—';
  const fare = route.fare || {};
  const fareText = typeof fare.min === 'number' && typeof fare.max === 'number'
    ? `${fare.currency || 'ZAR'} ${fare.min.toFixed(2)} - ${fare.max.toFixed(2)}`
    : 'Not specified';
  container.querySelector('[data-route-fare]').textContent = fareText;

  const stopsList = container.querySelector('[data-route-stops]');
  stopsList.textContent = '';
  const stops = Array.isArray(route.stops) ? route.stops : [];
  if (!stops.length) {
    const li = document.createElement('li');
    li.textContent = 'No stops have been captured yet.';
    stopsList.appendChild(li);
  } else {
    stops.forEach(stop => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${stop.name || 'Stop'}</strong><span>${stop.lat ?? ''} ${stop.lng ?? ''}</span>`;
      stopsList.appendChild(li);
    });
  }
}

function initRouteFinder() {
  const listContainer = document.getElementById('route-results');
  const detailsContainer = document.getElementById('route-details');
  if (!listContainer || !detailsContainer) return;

  const searchInput = document.getElementById('route-search-input');
  const searchStatus = document.getElementById('route-search-status');
  let activeRouteId = null;

  function filterRoutes(query, routes) {
    if (!query) return routes;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return routes.filter(route => {
      const haystack = [
        route.name || '',
        route.gesture || '',
        ...(Array.isArray(route.stops) ? route.stops.map(stop => stop.name || '') : []),
      ]
        .join(' ')
        .toLowerCase();
      return terms.every(term => haystack.includes(term));
    });
  }

  function updateList(query) {
    fetchRoutes()
      .then(routes => {
        const filtered = filterRoutes(query, routes);
        renderRouteList(filtered, listContainer, activeRouteId);
        if (!filtered.find(route => String(route.routeId) === String(activeRouteId))) {
          activeRouteId = null;
          renderRouteDetails(null, detailsContainer);
        }
        searchStatus.textContent = filtered.length ? `${filtered.length} route(s)` : 'No routes match your search';
      })
      .catch(err => {
        searchStatus.textContent = err.message;
      });
  }

  listContainer.addEventListener('click', event => {
    const target = event.target instanceof HTMLElement && event.target.closest('.route-list__item');
    if (!target) return;
    const routeId = target.dataset.routeId;
    fetchRoutes()
      .then(routes => routes.find(route => String(route.routeId) === String(routeId)))
      .then(route => {
        if (!route) return;
        activeRouteId = route.routeId;
        renderRouteList(filterRoutes(searchInput.value, cachedRoutes || []), listContainer, activeRouteId);
        renderRouteDetails(route, detailsContainer);
        showRouteOnMap(route);
        closeMenu();
      })
      .catch(err => {
        searchStatus.textContent = err.message;
      });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => updateList(searchInput.value));
  }

  updateList('');
}

function getRouteFormData(form) {
  const formData = new FormData(form);
  const routeId = formData.get('routeId') || null;
  const name = String(formData.get('name') || '').trim();
  const gesture = String(formData.get('gesture') || '').trim();
  const fareMin = formData.get('fareMin');
  const fareMax = formData.get('fareMax');
  const fareCurrency = String(formData.get('fareCurrency') || 'ZAR').trim() || 'ZAR';

  const stopRows = Array.from(form.querySelectorAll('[data-stop-row]'));
  const stops = stopRows
    .map(row => {
      const stopName = String(row.querySelector('[name="stopName"]').value || '').trim();
      const lat = parseFloat(row.querySelector('[name="stopLat"]').value);
      const lng = parseFloat(row.querySelector('[name="stopLng"]').value);
      if (!stopName && Number.isNaN(lat) && Number.isNaN(lng)) {
        return null;
      }
      return {
        name: stopName || 'Unnamed stop',
        lat: Number.isNaN(lat) ? undefined : lat,
        lng: Number.isNaN(lng) ? undefined : lng,
      };
    })
    .filter(Boolean);

  const fare = {};
  if (fareMin !== null && fareMin !== '') fare.min = Number(fareMin);
  if (fareMax !== null && fareMax !== '') fare.max = Number(fareMax);
  if (fareCurrency) fare.currency = fareCurrency;

  return {
    routeId: routeId ? Number(routeId) : null,
    name,
    gesture,
    fare,
    stops,
  };
}

function setRouteFormData(form, route) {
  form.reset();
  form.querySelector('[name="routeId"]').value = route && route.routeId ? route.routeId : '';
  form.querySelector('[name="name"]').value = route && route.name ? route.name : '';
  form.querySelector('[name="gesture"]').value = route && route.gesture ? route.gesture : '';
  form.querySelector('[name="fareMin"]').value = route && route.fare && typeof route.fare.min === 'number' ? route.fare.min : '';
  form.querySelector('[name="fareMax"]').value = route && route.fare && typeof route.fare.max === 'number' ? route.fare.max : '';
  form.querySelector('[name="fareCurrency"]').value = route && route.fare && route.fare.currency ? route.fare.currency : 'ZAR';

  const stopsContainer = form.querySelector('[data-stops-container]');
  stopsContainer.textContent = '';
  const stops = route && Array.isArray(route.stops) && route.stops.length ? route.stops : [{ name: '', lat: '', lng: '' }];
  stops.forEach(stop => addStopRow(stopsContainer, stop));
}

function addStopRow(container, stop = { name: '', lat: '', lng: '' }) {
  const row = document.createElement('div');
  row.className = 'stop-row';
  row.dataset.stopRow = 'true';
  row.innerHTML = `
    <label class="form-field">
      <span>Stop name</span>
      <input name="stopName" type="text" value="${stop.name || ''}" placeholder="e.g. Bree Taxi Rank" />
    </label>
    <label class="form-field">
      <span>Latitude</span>
      <input name="stopLat" type="number" step="0.000001" value="${stop.lat ?? ''}" />
    </label>
    <label class="form-field">
      <span>Longitude</span>
      <input name="stopLng" type="number" step="0.000001" value="${stop.lng ?? ''}" />
    </label>
    <button type="button" class="icon-button" data-remove-stop aria-label="Remove stop">&times;</button>
  `;
  container.appendChild(row);
}

function initRouteAdder() {
  const form = document.getElementById('route-editor');
  const loginForm = document.getElementById('route-login-form');
  const status = document.getElementById('route-editor-status');
  const select = document.getElementById('route-picker');
  const newButton = document.getElementById('route-new');
  const addStopButton = document.getElementById('add-stop');
  const deleteButton = document.getElementById('route-delete');

  if (!form || !select || !status) return;

  function updateAccess() {
    const user = getCurrentUser();
    if (user) {
      form.hidden = false;
      if (loginForm) loginForm.hidden = true;
      status.textContent = `Logged in as ${user.name}`;
    } else {
      form.hidden = true;
      if (loginForm) loginForm.hidden = false;
      status.textContent = 'Log in to add or edit routes.';
    }
  }

  window.addEventListener('authchange', () => {
    updateAccountDisplay();
    updateAccess();
    refreshRoutes();
  });

  if (loginForm) {
    loginForm.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(loginForm);
      const email = String(data.get('email') || '').trim();
      const password = String(data.get('password') || '').trim();
      if (!email || !password) {
        status.textContent = 'Email and password are required.';
        return;
      }
      apiRequest('/api/login', { method: 'POST', body: { email, password } })
        .then(user => {
          setCurrentUser(user);
          status.textContent = `Welcome back, ${user.name}!`;
        })
        .catch(err => {
          status.textContent = err.message;
        });
    });
  }

  function refreshRoutes() {
    fetchRoutes({ force: true })
      .then(routes => {
        select.textContent = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a route to edit';
        select.appendChild(placeholder);
        routes.forEach(route => {
          const option = document.createElement('option');
          option.value = route.routeId;
          option.textContent = route.name;
          select.appendChild(option);
        });
      })
      .catch(err => {
        status.textContent = err.message;
      });
  }

  select.addEventListener('change', () => {
    const id = select.value;
    if (!id) {
      setRouteFormData(form, null);
      return;
    }
    fetchRoutes()
      .then(routes => routes.find(route => String(route.routeId) === String(id)))
      .then(route => {
        if (!route) return;
        setRouteFormData(form, route);
        showRouteOnMap(route);
        status.textContent = `Editing ${route.name}`;
      })
      .catch(err => {
        status.textContent = err.message;
      });
  });

  if (newButton) {
    newButton.addEventListener('click', () => {
      select.value = '';
      setRouteFormData(form, null);
      status.textContent = 'Adding a new route';
    });
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user) {
      status.textContent = 'Please log in to save routes.';
      return;
    }
    const data = getRouteFormData(form);
    if (!data.name) {
      status.textContent = 'Route name is required.';
      return;
    }

    const payload = {
      name: data.name,
      gesture: data.gesture,
      fare: data.fare,
      stops: data.stops,
    };

    const isUpdate = Boolean(data.routeId);
    const path = isUpdate ? `/api/routes/${data.routeId}` : '/api/routes';
    const method = isUpdate ? 'PUT' : 'POST';

    apiRequest(path, { method, body: payload, auth: true })
      .then(route => {
        status.textContent = `Route ${isUpdate ? 'updated' : 'created'} successfully.`;
        setRouteFormData(form, route);
        refreshRoutes();
        fetchRoutes({ force: true });
        showRouteOnMap(route);
        closeMenu();
      })
      .catch(err => {
        status.textContent = err.message === 'LOGIN_REQUIRED' ? 'Please log in to save routes.' : err.message;
      });
  });

  if (deleteButton) {
    deleteButton.addEventListener('click', () => {
      const routeId = form.querySelector('[name="routeId"]').value;
      if (!routeId) {
        status.textContent = 'Select a route to delete.';
        return;
      }
      apiRequest(`/api/routes/${routeId}`, { method: 'DELETE', auth: true })
        .then(() => {
          status.textContent = 'Route deleted.';
          setRouteFormData(form, null);
          refreshRoutes();
          fetchRoutes({ force: true });
          closeMenu();
        })
        .catch(err => {
          status.textContent = err.message;
        });
    });
  }

  if (addStopButton) {
    addStopButton.addEventListener('click', () => {
      const container = form.querySelector('[data-stops-container]');
      addStopRow(container);
    });
  }

  const stopsContainer = form.querySelector('[data-stops-container]');
  if (stopsContainer) {
    stopsContainer.addEventListener('click', event => {
      const removeButton = event.target instanceof HTMLElement && event.target.closest('[data-remove-stop]');
      if (!removeButton) return;
      const row = removeButton.closest('[data-stop-row]');
      if (row && stopsContainer.children.length > 1) {
        row.remove();
      }
    });
  }

  updateAccess();
  refreshRoutes();
  setRouteFormData(form, null);
}

function renderRoleFields(roleSelect, container) {
  const role = roleSelect.value.toLowerCase();
  container.textContent = '';
  const fields = roleFieldConfig[role];
  if (!fields) {
    const info = document.createElement('p');
    info.className = 'help-text';
    info.textContent = 'Select a role to add more details about your work.';
    container.appendChild(info);
    return;
  }
  fields.forEach(field => {
    const wrapper = document.createElement('label');
    wrapper.className = 'form-field';
    wrapper.innerHTML = `
      <span>${field.label}</span>
      <input name="profile.${field.name}" type="${field.type || 'text'}" ${field.min ? `min="${field.min}"` : ''} ${field.required ? 'required' : ''} />
    `;
    container.appendChild(wrapper);
  });
}

function initRegistration() {
  const registrationForm = document.getElementById('registration-form');
  const registrationStatus = document.getElementById('registration-status');
  const roleSelect = document.getElementById('registration-role');
  const roleFieldContainer = document.getElementById('role-extra-fields');
  const loginForm = document.getElementById('registration-login-form');
  const loginStatus = document.getElementById('login-status');

  if (roleSelect && roleFieldContainer) {
    renderRoleFields(roleSelect, roleFieldContainer);
    roleSelect.addEventListener('change', () => renderRoleFields(roleSelect, roleFieldContainer));
  }

  if (registrationForm) {
    registrationForm.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(registrationForm);
      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        password: String(formData.get('password') || '').trim(),
        confirmPassword: String(formData.get('confirmPassword') || '').trim(),
        role: String(formData.get('role') || '').trim(),
        profile: {},
      };

      if (!payload.name || !payload.email || !payload.password || !payload.role) {
        registrationStatus.textContent = 'Name, email, password, and role are required.';
        return;
      }
      if (payload.password !== payload.confirmPassword) {
        registrationStatus.textContent = 'Passwords do not match.';
        return;
      }

      for (const [key, value] of formData.entries()) {
        if (key.startsWith('profile.')) {
          const profileKey = key.replace('profile.', '');
          payload.profile[profileKey] = value;
        }
      }

      apiRequest('/api/register', { method: 'POST', body: payload })
        .then(user => {
          registrationStatus.textContent = `Welcome aboard, ${user.name}! You can now add routes.`;
          setCurrentUser(user);
          registrationForm.reset();
          if (roleSelect) {
            roleSelect.value = 'collector';
            renderRoleFields(roleSelect, roleFieldContainer);
          }
        })
        .catch(err => {
          registrationStatus.textContent = err.message;
        });
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '').trim();
      if (!email || !password) {
        loginStatus.textContent = 'Email and password are required.';
        return;
      }
      apiRequest('/api/login', { method: 'POST', body: { email, password } })
        .then(user => {
          loginStatus.textContent = `Welcome back, ${user.name}!`;
          setCurrentUser(user);
          closeMenu();
        })
        .catch(err => {
          loginStatus.textContent = err.message;
        });
    });
  }
}

function initCommunityPage() {
  const sheet = document.querySelector('.community-sheet');
  if (sheet) {
    const title = sheet.querySelector('h1');
    if (title) {
      sheet.setAttribute('aria-labelledby', title.id || 'community-title');
      if (!title.id) {
        title.id = 'community-title';
      }
    }
  }
}

function initialisePage() {
  const page = detectPage();
  if (page === 'finder') {
    initRouteFinder();
  } else if (page === 'adder') {
    initRouteAdder();
  } else if (page === 'registration') {
    initRegistration();
  } else if (page === 'community') {
    initCommunityPage();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  buildMenu();
  loadMap();
  initialisePage();
  window.dispatchEvent(new CustomEvent('authchange', { detail: getCurrentUser() }));
});

