const AUTH_STORAGE_KEY = 'itaxiFinderUser';

let menuToggleButton = null;
let menuBackdrop = null;
let menuCloseButton = null;
let menuContainer = null;
let submenuControllers = [];

let accountOverlayContainer = null;
let accountOverlayLogout = null;
let accountOverlayRegister = null;
let accountOverlayAdder = null;

const panelRegistry = new Map();
const initialisedPanels = new Set();
let panelScrim = null;
let activePanelId = null;

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

const communityMenuItems = communityTownships.map(item => {
  if (item.name === 'Community Overview') {
    return { ...item, panelId: 'community-directory' };
  }
  const href = item.href || '';
  const match = href.match(/\/([^/]+)\.html$/);
  const slug = match ? match[1] : item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { ...item, panelId: `community-${slug}` };
});

const menuItems = [
  { id: 'website-header', label: 'Website Header', action: { type: 'overlay', panelId: 'website-header' } },
  { id: 'login-status', label: 'Login status', action: { type: 'overlay', panelId: 'login-status' } },
  { id: 'route-finder', label: 'Route Finder', action: { type: 'right', panelId: 'route-finder' } },
  { id: 'route-adder', label: 'Route Adder', action: { type: 'right', panelId: 'route-adder' } },
  { id: 'delivery', label: 'Delivery', action: { type: 'overlay', panelId: 'delivery' } },
  {
    id: 'community',
    label: 'Community',
    type: 'expand',
    children: communityMenuItems.map(item => ({
      id: item.panelId,
      label: item.name,
      action: { type: 'overlay', panelId: item.panelId, src: item.href },
    })),
  },
  { id: 'registration', label: 'Registration', action: { type: 'overlay', panelId: 'registration' } },
  { id: 'about', label: 'About', action: { type: 'overlay', panelId: 'about' } },
];

const panelProviders = {
  'website-header': createWebsiteHeaderPanel,
  'login-status': createLoginStatusPanel,
  'route-finder': createRouteFinderPanel,
  'route-adder': createRouteAdderPanel,
  delivery: createDeliveryPanel,
  registration: createRegistrationPanel,
  about: createAboutPanel,
  'community-directory': createCommunityDirectoryPanel,
};

const panelInitialisers = {
  'route-finder': initRouteFinder,
  'route-adder': initRouteAdder,
  registration: initRegistration,
  'login-status': initLoginStatusPanel,
};

function appendPanelElement(element) {
  const mapElement = document.getElementById('map');
  if (mapElement && mapElement.parentElement === document.body) {
    document.body.insertBefore(element, mapElement);
  } else {
    document.body.appendChild(element);
  }
}

function registerPanelElement(element) {
  if (!(element instanceof HTMLElement)) return;
  const id = element.dataset.panelId;
  if (!id || panelRegistry.has(id)) return;
  const type = element.dataset.panelType || 'overlay';
  element.classList.add('ui-panel');
  element.dataset.panelType = type;
  element.setAttribute('aria-hidden', 'true');
  if (!element.hasAttribute('tabindex')) {
    element.setAttribute('tabindex', '-1');
  }
  panelRegistry.set(id, { element, type });
}

function registerExistingPanels() {
  document.querySelectorAll('[data-panel-id]').forEach(registerPanelElement);
}

function ensurePanelScrim() {
  if (panelScrim) return panelScrim;
  panelScrim = document.createElement('div');
  panelScrim.className = 'panel-scrim';
  panelScrim.setAttribute('aria-hidden', 'true');
  panelScrim.addEventListener('click', () => closeActivePanel());
  document.body.appendChild(panelScrim);
  return panelScrim;
}

function closeActivePanel() {
  if (activePanelId && panelRegistry.has(activePanelId)) {
    const activeEntry = panelRegistry.get(activePanelId);
    if (activeEntry) {
      activeEntry.element.classList.remove('is-active');
      activeEntry.element.setAttribute('aria-hidden', 'true');
    }
  }
  activePanelId = null;
  if (panelScrim) {
    panelScrim.classList.remove('is-active');
    panelScrim.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('panel-open');
  document.body.classList.remove('panel-right-active');
}

function maybeInitialisePanel(panelId) {
  if (!panelId || initialisedPanels.has(panelId)) return;
  const initialiser = panelInitialisers[panelId];
  if (typeof initialiser === 'function') {
    initialiser();
  }
  initialisedPanels.add(panelId);
}

function showPanel(panelId) {
  if (!panelRegistry.has(panelId)) return;
  const entry = panelRegistry.get(panelId);
  ensurePanelScrim();
  closeActivePanel();
  entry.element.classList.add('is-active');
  entry.element.setAttribute('aria-hidden', 'false');
  panelScrim.classList.add('is-active');
  panelScrim.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
  activePanelId = panelId;
  requestAnimationFrame(() => {
    entry.element.focus({ preventScroll: false });
  });
}

async function ensurePanelAvailability(action) {
  if (!action || !action.panelId) return null;
  const { panelId, src } = action;
  if (!panelRegistry.has(panelId)) {
    if (panelProviders[panelId]) {
      const element = panelProviders[panelId]();
      if (element) {
        appendPanelElement(element);
        registerPanelElement(element);
      }
    } else if (src) {
      const response = await fetch(src, { credentials: 'same-origin' });
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const panel = doc.querySelector(`[data-panel-id="${panelId}"]`);
      if (panel) {
        const clone = panel.cloneNode(true);
        appendPanelElement(clone);
        registerPanelElement(clone);
      }
    }
    maybeInitialisePanel(panelId);
  } else {
    maybeInitialisePanel(panelId);
  }
  return panelRegistry.get(panelId) || null;
}

async function openPanelAction(action) {
  if (!action) return;
  if (action.type === 'overlay' || action.type === 'right') {
    const entry = await ensurePanelAvailability(action);
    if (entry) {
      showPanel(action.panelId);
      if (action.type === 'right') {
        document.body.classList.add('panel-right-active');
      } else {
        document.body.classList.remove('panel-right-active');
      }
    }
  } else if (action.type === 'navigate' && action.href) {
    window.location.href = action.href;
  }
}

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

function createWebsiteHeaderPanel() {
  const section = document.createElement('section');
  section.className = 'panel panel--website';
  section.dataset.panelId = 'website-header';
  section.dataset.panelType = 'overlay';
  section.innerHTML = `
    <h1>iTaxi-Finder</h1>
    <p class="help-text">South Africa’s minibus-taxi routes, mapped. Use the menus to find, add, and manage routes while the live Google Map stays in the background.</p>
    <ul class="bullet-list">
      <li><strong>Discover routes:</strong> Search gestures, fares, and stops to plan your next commute.</li>
      <li><strong>Contribute updates:</strong> Registered members can add and edit official route records.</li>
      <li><strong>Community voices:</strong> Township partners share news, offers, and alerts alongside the map.</li>
    </ul>
  `;
  return section;
}

function createLoginStatusPanel() {
  const section = document.createElement('section');
  section.className = 'panel panel--account';
  section.dataset.panelId = 'login-status';
  section.dataset.panelType = 'overlay';
  section.innerHTML = `
    <h1>Account status</h1>
    <div class="account-overlay" data-account-summary></div>
    <div class="account-overlay__actions">
      <button type="button" class="button-primary" data-account-register>Register or log in</button>
      <button type="button" class="button-secondary" data-account-adder>Open Route Adder</button>
      <button type="button" class="button-danger" data-account-logout>Log out</button>
    </div>
  `;
  return section;
}

function createRouteFinderPanel() {
  const section = document.createElement('section');
  section.className = 'panel panel--finder';
  section.dataset.panelId = 'route-finder';
  section.dataset.panelType = 'right';
  section.innerHTML = `
    <h1>Route Finder</h1>
    <p class="help-text">Search the live database of shared taxi routes, view fare estimates, and see stop locations without leaving the map.</p>
    <label class="form-field">
      <span>Search by route name, gesture, or stop</span>
      <input id="route-search-input" type="search" placeholder="e.g. Bree to Alexandra" autocomplete="off" />
    </label>
    <div id="route-search-status" class="help-text">Loading routes…</div>
    <div id="route-results" class="route-list" role="list"></div>
    <article id="route-details" class="route-details" hidden>
      <h2 data-route-title>Route name</h2>
      <dl>
        <div>
          <dt>Gesture</dt>
          <dd data-route-gesture>—</dd>
        </div>
        <div>
          <dt>Fare</dt>
          <dd data-route-fare>—</dd>
        </div>
      </dl>
      <h3>Stops</h3>
      <ul data-route-stops class="route-stops"></ul>
    </article>
  `;
  return section;
}

function createRouteAdderPanel() {
  const section = document.createElement('section');
  section.className = 'panel panel--adder';
  section.dataset.panelId = 'route-adder';
  section.dataset.panelType = 'right';
  section.innerHTML = `
    <h1>Route Adder</h1>
    <p class="help-text">Capture new shared taxi routes or update the ones already in our database. Every change is saved against your profile for accountability.</p>
    <div id="route-editor-status" class="status-text">Log in to add or edit routes.</div>
    <form id="route-login-form" class="form-card">
      <h2>Log in to start mapping</h2>
      <p class="help-text">Use the email address and password from your registration. Need an account? Register from the menu.</p>
      <label class="form-field">
        <span>Email</span>
        <input type="email" name="email" autocomplete="email" required />
      </label>
      <label class="form-field">
        <span>Password</span>
        <input type="password" name="password" autocomplete="current-password" required />
      </label>
      <button type="submit" class="button-primary">Log in</button>
    </form>
    <form id="route-editor" class="form-card" hidden>
      <input type="hidden" name="routeId" />
      <label class="form-field">
        <span>Select a saved route</span>
        <select id="route-picker" required>
          <option value="">Select a route to edit</option>
        </select>
      </label>
      <button type="button" id="route-new" class="button-secondary">Start a new route</button>
      <label class="form-field">
        <span>Route name</span>
        <input type="text" name="name" placeholder="e.g. Bree Taxi Rank to Soweto" required />
      </label>
      <label class="form-field">
        <span>Gesture (hand signal)</span>
        <input type="text" name="gesture" placeholder="Describe the hand signal" />
      </label>
      <div class="fare-grid">
        <label class="form-field">
          <span>Minimum fare</span>
          <input type="number" name="fareMin" step="0.01" min="0" />
        </label>
        <label class="form-field">
          <span>Maximum fare</span>
          <input type="number" name="fareMax" step="0.01" min="0" />
        </label>
        <label class="form-field">
          <span>Currency</span>
          <input type="text" name="fareCurrency" value="ZAR" maxlength="3" />
        </label>
      </div>
      <div class="stops-editor">
        <div class="stops-editor__header">
          <h2>Stops</h2>
          <button type="button" id="add-stop" class="button-secondary">Add stop</button>
        </div>
        <p class="help-text">Add every taxi rank, landmark, or important way-point. Coordinates are optional but help show the route on the map.</p>
        <div data-stops-container class="stops-editor__list"></div>
      </div>
      <div class="form-actions">
        <button type="submit" class="button-primary">Save route</button>
        <button type="button" id="route-delete" class="button-danger">Delete route</button>
      </div>
    </form>
  `;
  return section;
}

function createRegistrationPanel() {
  const section = document.createElement('section');
  section.className = 'panel panel--registration';
  section.dataset.panelId = 'registration';
  section.dataset.panelType = 'overlay';
  section.innerHTML = `
    <h1>Register your profile</h1>
    <p class="help-text">Join the iTaxi-Finder ecosystem as a contributor. Choose the role that best describes you, capture the essentials, and start sharing verified route information.</p>
    <form id="registration-form" class="form-card">
      <h2>Create a new account</h2>
      <label class="form-field">
        <span>Full name</span>
        <input type="text" name="name" autocomplete="name" required />
      </label>
      <label class="form-field">
        <span>Email</span>
        <input type="email" name="email" autocomplete="email" required />
      </label>
      <label class="form-field">
        <span>Mobile number</span>
        <input type="tel" name="phone" autocomplete="tel" />
      </label>
      <label class="form-field">
        <span>Password</span>
        <input type="password" name="password" autocomplete="new-password" required />
      </label>
      <label class="form-field">
        <span>Confirm password</span>
        <input type="password" name="confirmPassword" autocomplete="new-password" required />
      </label>
      <label class="form-field">
        <span>Role</span>
        <select id="registration-role" name="role" required>
          <option value="collector">Collector</option>
          <option value="taxi driver">Taxi Driver</option>
          <option value="spaza owner">Spaza Owner</option>
          <option value="taxi rank depot/depot shop">Taxi Rank Depot / Depot Shop</option>
          <option value="monthly subscriber">Monthly Subscriber</option>
          <option value="taxi owner">Taxi Owner</option>
        </select>
      </label>
      <div id="role-extra-fields" class="role-extra"></div>
      <button type="submit" class="button-primary">Register</button>
    </form>
    <div id="registration-status" class="status-text" aria-live="polite"></div>
    <form id="registration-login-form" class="form-card">
      <h2>Already registered?</h2>
      <p class="help-text">Sign in to manage your saved routes and contribute updates.</p>
      <label class="form-field">
        <span>Email</span>
        <input type="email" name="email" autocomplete="email" required />
      </label>
      <label class="form-field">
        <span>Password</span>
        <input type="password" name="password" autocomplete="current-password" required />
      </label>
      <button type="submit" class="button-primary">Log in</button>
    </form>
    <div id="login-status" class="status-text" aria-live="polite"></div>
  `;
  return section;
}

function createDeliveryPanel() {
  const section = document.createElement('section');
  section.className = 'panel panel--delivery';
  section.dataset.panelId = 'delivery';
  section.dataset.panelType = 'overlay';
  section.innerHTML = `
    <h1>Delivery Extenda</h1>
    <p class="help-text">The taxi industry already has the infrastructure and building blocks to facilitate a parcel delivery service. We overlay the same map to plan waypoints, notify riders, and coordinate pick-ups without disrupting commuter flows.</p>
    <ul class="bullet-list">
      <li><strong>Near-route parcel drop-offs:</strong> Drivers can accept parcel legs that closely match their passenger routes.</li>
      <li><strong>Community collection points:</strong> Partner spaza shops, ranks, and depots serve as trusted exchange hubs.</li>
      <li><strong>Live tracking:</strong> WhatsApp live locations and driver check-ins keep senders updated every step of the way.</li>
    </ul>
    <p class="help-text">Use the map behind this panel to visualise delivery corridors, then close the panel to continue browsing routes.</p>
  `;
  return section;
}

function createAboutPanel() {
  const section = document.createElement('section');
  section.className = 'panel panel--about';
  section.dataset.panelId = 'about';
  section.dataset.panelType = 'overlay';
  section.innerHTML = `
    <h1>About iTaxi-Finder</h1>
    <p class="help-text">iTaxi-Finder is a live mapping and analytics platform for South Africa’s minibus-taxi ecosystem. Our mission is to make everyday commutes clearer for passengers while helping operators grow demand and profitability.</p>
    <ul class="bullet-list">
      <li><strong>Route intelligence:</strong> Capture and search gestures, fares, and stop details for common and emerging routes.</li>
      <li><strong>Operational analytics:</strong> Fleet owners and associations can monitor vehicle usage to spot efficiency gains.</li>
      <li><strong>Community storytelling:</strong> Township partners share updates, offers, and safety alerts alongside mapped routes.</li>
      <li><strong>Delivery pilot:</strong> A parcel module leverages taxi infrastructure for low-cost, near-route deliveries.</li>
    </ul>
    <p class="help-text">Close this overlay to keep exploring the live map experience.</p>
  `;
  return section;
}

function createCommunityDirectoryPanel() {
  const section = document.createElement('section');
  section.className = 'panel panel--community-directory';
  section.dataset.panelId = 'community-directory';
  section.dataset.panelType = 'overlay';
  section.innerHTML = `
    <h1>Community Townships</h1>
    <p class="help-text">Choose a township to see local updates, partners, and route-specific notices with the iTaxi-Finder map always in the background.</p>
    <div class="grid community-grid"></div>
  `;

  const grid = section.querySelector('.community-grid');
  if (grid) {
    communityMenuItems
      .filter(item => item.panelId !== 'community-directory')
      .forEach(item => {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'community-grid__link';
        link.textContent = item.name;
        link.addEventListener('click', () => {
          const action = findMenuAction(item.panelId) || { type: 'overlay', panelId: item.panelId, src: item.href };
          openPanelAction(action);
        });
        grid.appendChild(link);
      });
  }

  return section;
}

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

function collapseSubmenus(exceptController = null) {
  submenuControllers.forEach(controller => {
    if (controller === exceptController) return;
    controller.button.setAttribute('aria-expanded', 'false');
    controller.list.classList.remove('is-open');
    controller.list.setAttribute('aria-hidden', 'true');
  });
}

function buildMenuList(listElement, items) {
  items.forEach(item => {
    const listItem = document.createElement('li');
    listItem.className = 'menu-list__item';

    if (item.type === 'expand' && Array.isArray(item.children)) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'menu-link menu-link--expand';
      toggle.textContent = item.label;
      toggle.setAttribute('aria-expanded', 'false');

      const sublist = document.createElement('ul');
      sublist.className = 'menu-sublist';
      sublist.setAttribute('aria-hidden', 'true');

      submenuControllers.push({ button: toggle, list: sublist });

      toggle.addEventListener('click', () => {
        const controller = submenuControllers.find(entry => entry.button === toggle);
        const willOpen = toggle.getAttribute('aria-expanded') !== 'true';
        collapseSubmenus(controller);
        toggle.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) {
          sublist.classList.add('is-open');
          sublist.setAttribute('aria-hidden', 'false');
        } else {
          sublist.classList.remove('is-open');
          sublist.setAttribute('aria-hidden', 'true');
        }
      });

      buildMenuList(sublist, item.children);
      listItem.appendChild(toggle);
      listItem.appendChild(sublist);
    } else if (item.action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-link';
      button.textContent = item.label;
      button.addEventListener('click', async () => {
        closeMenu();
        await openPanelAction(item.action);
      });
      listItem.appendChild(button);
    }

    listElement.appendChild(listItem);
  });
}

function findMenuAction(panelId) {
  if (!panelId) return null;
  for (const item of menuItems) {
    if (item.action && item.action.panelId === panelId) {
      return item.action;
    }
    if (Array.isArray(item.children)) {
      for (const child of item.children) {
        if (child.action && child.action.panelId === panelId) {
          return child.action;
        }
      }
    }
  }
  return null;
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

  const nav = document.createElement('nav');
  nav.className = 'menu-links';
  nav.setAttribute('aria-label', 'Site sections');
  const list = document.createElement('ul');
  list.className = 'menu-list';
  nav.appendChild(list);
  topbar.appendChild(nav);

  submenuControllers = [];
  buildMenuList(list, menuItems);

  menuToggleButton.addEventListener('click', () => toggleMenu());
  menuCloseButton.addEventListener('click', () => closeMenu());
  menuBackdrop.addEventListener('click', () => closeMenu());

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (document.body.classList.contains('menu-open')) {
        closeMenu();
      } else if (activePanelId) {
        closeActivePanel();
      }
    }
  });
}

function updateAccountOverlay() {
  if (!accountOverlayContainer) return;
  const user = getCurrentUser();
  if (user) {
    const roleText = user.role ? String(user.role) : 'Contributor';
    accountOverlayContainer.innerHTML = `
      <div class="account-overlay__summary">
        <strong>${user.name}</strong>
        <span>${roleText}</span>
      </div>
      <p class="help-text">You are logged in. Use the Route Adder to update your saved routes.</p>
    `;
  } else {
    accountOverlayContainer.innerHTML = `
      <div class="account-overlay__summary">
        <strong>Guest</strong>
        <span>Not signed in</span>
      </div>
      <p class="help-text">Register an account to capture new routes or update existing ones.</p>
    `;
  }

  if (accountOverlayLogout) {
    accountOverlayLogout.hidden = !user;
  }
  if (accountOverlayRegister) {
    accountOverlayRegister.textContent = user ? 'Open registration' : 'Register or log in';
  }
}

function initLoginStatusPanel() {
  const panelEntry = panelRegistry.get('login-status');
  const panel = panelEntry ? panelEntry.element : document.querySelector('[data-panel-id="login-status"]');
  if (!panel) return;

  accountOverlayContainer = panel.querySelector('[data-account-summary]');
  accountOverlayLogout = panel.querySelector('[data-account-logout]');
  accountOverlayRegister = panel.querySelector('[data-account-register]');
  accountOverlayAdder = panel.querySelector('[data-account-adder]');

  if (accountOverlayLogout) {
    accountOverlayLogout.addEventListener('click', () => {
      clearCurrentUser();
      closeActivePanel();
    });
  }
  if (accountOverlayRegister) {
    accountOverlayRegister.addEventListener('click', () => {
      openPanelAction({ type: 'overlay', panelId: 'registration' });
    });
  }
  if (accountOverlayAdder) {
    accountOverlayAdder.addEventListener('click', () => {
      openPanelAction({ type: 'right', panelId: 'route-adder' });
    });
  }

  updateAccountOverlay();
}

async function ensureBasePanels() {
  const coreActions = [
    findMenuAction('website-header'),
    findMenuAction('login-status'),
    findMenuAction('route-finder'),
    findMenuAction('route-adder'),
    findMenuAction('delivery'),
    findMenuAction('registration'),
    findMenuAction('about'),
    findMenuAction('community-directory'),
  ].filter(Boolean);

  for (const action of coreActions) {
    try {
      // sequential to ensure init hooks run in order
      // eslint-disable-next-line no-await-in-loop
      await ensurePanelAvailability(action);
    } catch (err) {
      console.warn('Unable to load panel', action.panelId, err);
    }
  }
}

function detectPage() {
  const explicit = document.body.dataset.page;
  if (explicit) return explicit;
  const path = window.location.pathname;
  if (path === '/' || path.endsWith('/index.html')) return 'finder';
  if (path.includes('route-adder')) return 'adder';
  if (path.includes('registration')) return 'registration';
  if (path.includes('delivery')) return 'delivery';
  if (path.includes('about')) return 'about';
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
    updateAccountOverlay();
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

function prepareCommunityPanel(panelId) {
  if (!panelId) return;
  const entry = panelRegistry.get(panelId);
  const panel = entry ? entry.element : document.querySelector(`[data-panel-id="${panelId}"]`);
  if (!panel) return;
  const title = panel.querySelector('h1');
  if (title) {
    const labelId = title.id || `${panelId}-title`;
    title.id = labelId;
    panel.setAttribute('aria-labelledby', labelId);
  }
}

async function openDefaultPanelForPage() {
  const page = detectPage();

  if (page === 'finder') {
    const action = findMenuAction('route-finder');
    if (action) await openPanelAction(action);
  } else if (page === 'adder') {
    const action = findMenuAction('route-adder');
    if (action) await openPanelAction(action);
  } else if (page === 'registration') {
    const action = findMenuAction('registration');
    if (action) await openPanelAction(action);
  } else if (page === 'delivery') {
    const action = findMenuAction('delivery');
    if (action) await openPanelAction(action);
  } else if (page === 'about') {
    const action = findMenuAction('about');
    if (action) await openPanelAction(action);
  } else if (page === 'community') {
    let panelId = 'community-directory';
    const match = window.location.pathname.match(/community\/([^/]+)\.html$/);
    if (match) {
      panelId = `community-${match[1]}`;
    }
    const action = findMenuAction(panelId) || { type: 'overlay', panelId };
    await ensurePanelAvailability(action);
    prepareCommunityPanel(panelId);
    await openPanelAction(action);
  } else {
    const action = findMenuAction('website-header');
    if (action) await openPanelAction(action);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  registerExistingPanels();
  buildMenu();
  await ensureBasePanels();
  updateAccountOverlay();
  loadMap();
  window.addEventListener('authchange', () => updateAccountOverlay());
  try {
    await openDefaultPanelForPage();
  } catch (err) {
    console.warn('Unable to open default panel', err);
  }
  window.dispatchEvent(new CustomEvent('authchange', { detail: getCurrentUser() }));
});

