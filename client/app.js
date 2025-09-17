let mapInstance;
let routeEditorState;
let resizeListenerAttached = false;
let routeFinderState;
let adminRouteFinderState;

const STORAGE_KEYS = {
  driverProfile: 'itaxiFinderDriverProfile',
  ownerProfile: 'itaxiFinderOwnerProfile',
};

function safeStorageGet(key, fallback = null) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn('Unable to read stored data', error);
    return fallback;
  }
}

function safeStorageSet(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Unable to persist data', error);
  }
}

function safeStorageRemove(key) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn('Unable to remove stored data', error);
  }
}

function generateId(prefix = 'id') {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

function getDriverProfile() {
  return safeStorageGet(STORAGE_KEYS.driverProfile, null);
}

function setDriverProfile(profile) {
  if (!profile) {
    safeStorageRemove(STORAGE_KEYS.driverProfile);
  } else {
    safeStorageSet(STORAGE_KEYS.driverProfile, profile);
  }
  notifyAdminDataChanged();
}

function getOwnerProfile() {
  return safeStorageGet(STORAGE_KEYS.ownerProfile, null);
}

function setOwnerProfile(profile) {
  if (!profile) {
    safeStorageRemove(STORAGE_KEYS.ownerProfile);
  } else {
    safeStorageSet(STORAGE_KEYS.ownerProfile, profile);
  }
  notifyAdminDataChanged();
}

function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          accuracy: Number(position.coords.accuracy),
          timestamp: Date.now(),
        });
      },
      error => {
        reject(new Error((error && error.message) || 'Unable to retrieve your location.'));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

function enableDriverLiveLocation() {
  const profile = getDriverProfile();
  if (!profile) {
    return Promise.reject(new Error('Register as a taxi driver before enabling live location.'));
  }
  return requestCurrentPosition().then(location => {
    const updated = { ...profile, sharingEnabled: true, lastKnownLocation: location };
    setDriverProfile(updated);
    return updated;
  });
}

function disableDriverLiveLocation() {
  const profile = getDriverProfile();
  if (!profile) {
    return Promise.reject(new Error('Register as a taxi driver before disabling live location.'));
  }
  const updated = { ...profile, sharingEnabled: false };
  setDriverProfile(updated);
  return Promise.resolve(updated);
}

function refreshDriverLocation() {
  const profile = getDriverProfile();
  if (!profile) {
    return Promise.reject(new Error('Register as a taxi driver before refreshing your location.'));
  }
  if (!profile.sharingEnabled) {
    return Promise.reject(new Error('Enable live location before refreshing your position.'));
  }
  return requestCurrentPosition().then(location => {
    const updated = { ...profile, sharingEnabled: true, lastKnownLocation: location };
    setDriverProfile(updated);
    return updated;
  });
}

function updateOwnerTaxiLocation(taxiId) {
  const owner = getOwnerProfile();
  if (!owner || !Array.isArray(owner.taxis)) {
    return Promise.reject(new Error('Register your taxis before updating their locations.'));
  }
  const index = owner.taxis.findIndex(taxi => taxi.id === taxiId);
  if (index === -1) {
    return Promise.reject(new Error('Taxi not found. Refresh the Admin Route Finder and try again.'));
  }
  return requestCurrentPosition().then(location => {
    const updatedTaxi = { ...owner.taxis[index], lastKnownLocation: location };
    const updatedOwner = { ...owner, taxis: owner.taxis.slice() };
    updatedOwner.taxis[index] = updatedTaxi;
    setOwnerProfile(updatedOwner);
    return updatedTaxi;
  });
}

function formatRelativeTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) return 'Not updated yet';
  const diff = Date.now() - timestamp;
  if (diff < 30 * 1000) return 'Moments ago';
  if (diff < 90 * 1000) return 'About a minute ago';
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.round(diff / (60 * 1000));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.round(diff / (60 * 60 * 1000));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  return new Date(timestamp).toLocaleString('en-ZA');
}

function formatLocationSummary(location) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return 'No live position recorded yet.';
  }
  return `${formatCoordinate(location.lat)}, ${formatCoordinate(location.lng)}`;
}

function notifyAdminDataChanged() {
  if (!adminRouteFinderState) return;
  renderAdminDriverSection();
  renderAdminOwnerSection();
  updateAdminMarkers();
  fitAdminMapToEntities();
  if (adminRouteFinderState.map) {
    repositionMapControls(adminRouteFinderState.map.getDiv());
  }
}

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
        if (banner) {
          banner.remove();
          const mapElement = document.getElementById('map');
          if (mapElement) repositionMapControls(mapElement);
        }
      });
    });

    applyLayoutOffsets(getControlOffset());
    setupDraggableOverlays();

    if (document.body.classList.contains('page-registration')) {
      setupRegistration();
    }

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

  if (document.body.classList.contains('page-route-adder')) {
    setupRouteAdder(mapInstance);
  }

  if (document.body.classList.contains('page-route-finder')) {
    setupRouteFinder(mapInstance);
  }

  if (document.body.classList.contains('page-admin-route-finder')) {
    setupAdminRouteFinder(mapInstance);
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

function getControlOffset() {
  const topbar = document.getElementById('topbar');
  const navHeight = topbar ? topbar.getBoundingClientRect().height : 56;
  let offset = navHeight + 12;
  const banner = document.querySelector('.delivery-banner');
  if (banner && banner.isConnected) {
    offset += banner.getBoundingClientRect().height + 12;
  }
  return Math.round(offset);
}

function applyLayoutOffsets(offset) {
  const root = document.documentElement;
  const clampedOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  const overlayTop = clampedOffset + 24;
  root.style.setProperty('--map-control-offset', `${clampedOffset}px`);
  root.style.setProperty('--overlay-panel-top', `${overlayTop}px`);
  const viewportHeight = window.innerHeight || 0;
  if (viewportHeight > 0) {
    const maxHeight = Math.max(viewportHeight - overlayTop - 32, 180);
    root.style.setProperty('--overlay-panel-max-height', `${maxHeight}px`);
  } else {
    root.style.setProperty('--overlay-panel-max-height', `calc(100vh - ${overlayTop}px - 32px)`);
  }
}

function repositionMapControls(mapElement) {
  if (!mapElement) return;
  const offset = getControlOffset();
  applyLayoutOffsets(offset);
  const offsetPx = `${offset}px`;
  const mapTypeControl = mapElement.querySelector('.gm-style-mtc');
  if (mapTypeControl) {
    mapTypeControl.style.top = offsetPx;
  }

  const fullscreenControl = mapElement.querySelector('.gm-fullscreen-control');
  if (fullscreenControl) {
    let fullscreenTop = offset;
    const tools = document.getElementById('editor-tools');
    if (tools) {
      const rect = tools.getBoundingClientRect();
      if (rect && Number.isFinite(rect.bottom)) {
        fullscreenTop = Math.max(fullscreenTop, Math.round(rect.bottom + 16));
      }
    }
    fullscreenControl.style.top = `${fullscreenTop}px`;
    fullscreenControl.style.right = '16px';
  }
}

function styleControls(mapElement, map) {
  const repositionControls = () => repositionMapControls(mapElement);

  google.maps.event.addListenerOnce(map, 'idle', repositionControls);
  google.maps.event.addListener(map, 'maptypeid_changed', repositionControls);
  google.maps.event.addListener(map, 'zoom_changed', repositionControls);
  if (!resizeListenerAttached) {
    window.addEventListener('resize', repositionControls);
    resizeListenerAttached = true;
  }
  repositionControls();
}

function setupDraggableOverlays() {
  const overlays = document.querySelectorAll('[data-draggable-overlay]');
  overlays.forEach(overlay => {
    if (!overlay || overlay.dataset.draggableBound === 'true') return;

    const handle = overlay.querySelector('[data-drag-handle]') || overlay;
    if (!handle) return;

    const handlePointerDown = event => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      event.preventDefault();

      const rect = overlay.getBoundingClientRect();
      if (!overlay.dataset.dragConverted) {
        overlay.dataset.dragConverted = 'true';
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.right = 'auto';
        overlay.style.bottom = 'auto';
        overlay.style.transform = 'none';
      }

      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = parseFloat(overlay.style.left) || rect.left;
      const startTop = parseFloat(overlay.style.top) || rect.top;
      const width = rect.width;
      const height = rect.height;
      const pointerId = event.pointerId;

      const updatePosition = moveEvent => {
        if (moveEvent.pointerId !== pointerId) return;
        moveEvent.preventDefault();

        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || width;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || height;
        const margin = 12;

        let nextLeft = startLeft + deltaX;
        let nextTop = startTop + deltaY;

        const minLeft = margin;
        const minTop = margin;
        const maxLeft = Math.max(minLeft, viewportWidth - width - margin);
        const maxTop = Math.max(minTop, viewportHeight - height - margin);

        nextLeft = Math.min(Math.max(nextLeft, minLeft), maxLeft);
        nextTop = Math.min(Math.max(nextTop, minTop), maxTop);

        overlay.style.left = `${Math.round(nextLeft)}px`;
        overlay.style.top = `${Math.round(nextTop)}px`;
      };

      const endDrag = () => {
        if (typeof handle.releasePointerCapture === 'function') {
          try {
            handle.releasePointerCapture(pointerId);
          } catch (error) {
            // no-op
          }
        }
        handle.removeEventListener('pointermove', updatePosition);
        handle.removeEventListener('pointerup', endDrag);
        handle.removeEventListener('pointercancel', endDrag);

        const mapElement = document.getElementById('map');
        if (mapElement) {
          repositionMapControls(mapElement);
        }
      };

      if (typeof handle.setPointerCapture === 'function') {
        try {
          handle.setPointerCapture(pointerId);
        } catch (error) {
          // ignore capture errors
        }
      }

      handle.addEventListener('pointermove', updatePosition);
      handle.addEventListener('pointerup', endDrag);
      handle.addEventListener('pointercancel', endDrag);
    };

    handle.style.cursor = 'move';
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', handlePointerDown);
    overlay.dataset.draggableBound = 'true';
  });
}

function setupSavedRoutesManager() {
  const panel = document.getElementById('saved-routes-panel');
  if (!panel) return null;

  if (panel.dataset.savedRoutesBound === 'true') {
    return routeEditorState ? routeEditorState.savedRoutes || null : null;
  }

  const deleteSelect = document.querySelector('[data-route-delete-select]');

  const state = {
    panel,
    list: panel.querySelector('[data-saved-routes-list]'),
    refreshButton: panel.querySelector('[data-saved-routes-refresh]'),
    feedback: document.getElementById('saved-routes-feedback'),
    deleteSelect,
    routes: [],
    isLoading: false,
    collator: new Intl.Collator('en', { sensitivity: 'base' }),
  };

  if (state.refreshButton) {
    state.refreshButton.addEventListener('click', () => {
      loadSavedRoutesForEditor(state, { message: 'Saved routes refreshed.' });
    });
  }

  if (state.list) {
    state.list.addEventListener('click', handleSavedRoutesListClick);
  }

  if (state.deleteSelect && state.deleteSelect.dataset.deleteSelectBound !== 'true') {
    state.deleteSelect.addEventListener('change', handleDeleteSelectChange);
    state.deleteSelect.dataset.deleteSelectBound = 'true';
  }

  panel.dataset.savedRoutesBound = 'true';
  loadSavedRoutesForEditor(state, { initial: true });
  return state;
}

function setSavedRoutesLoading(state, isLoading) {
  if (!state) return;
  state.isLoading = Boolean(isLoading);
  if (state.list) {
    state.list.setAttribute('aria-busy', state.isLoading ? 'true' : 'false');
  }
  if (state.refreshButton) {
    state.refreshButton.disabled = state.isLoading;
  }
  if (state.deleteSelect) {
    const hasRoutes = state.deleteSelect.dataset.hasRoutes === 'true';
    state.deleteSelect.disabled = state.isLoading || !hasRoutes;
  }
  if (state.panel) {
    if (state.isLoading) {
      state.panel.classList.add('is-loading');
    } else {
      state.panel.classList.remove('is-loading');
    }
  }
}

async function loadSavedRoutesForEditor(state, options = {}) {
  if (!state) return;
  const { silent = false, initial = false, force = false, message = '' } = options;
  if (state.isLoading && !force) return;

  setSavedRoutesLoading(state, true);

  try {
    const response = await fetch('/api/routes');
    if (!response.ok) {
      throw new Error(`Routes request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const routes = Array.isArray(payload) ? payload.map(normalizeRouteRecord).filter(Boolean) : [];
    state.routes = routes;
    renderSavedRoutesList(state);

    if (initial) {
      if (!silent) {
        if (routes.length === 0) {
          showSavedRoutesFeedback(
            state,
            'No routes saved yet. Draw a corridor and choose Save to add it to the list.',
          );
        } else {
          showSavedRoutesFeedback(state, 'Use the tools panel dropdown to remove a saved route.');
        }
      }
    } else if (!silent) {
      const feedbackMessage = message || 'Saved routes refreshed.';
      showSavedRoutesFeedback(state, feedbackMessage);
    } else {
      showSavedRoutesFeedback(state, '');
    }
  } catch (error) {
    console.error('Failed to load saved routes for editor', error);
    state.routes = [];
    renderSavedRoutesList(state);
    showSavedRoutesFeedback(state, 'Unable to load saved routes right now. Try refreshing in a moment.', true);
  } finally {
    setSavedRoutesLoading(state, false);
  }
}

function renderSavedRoutesList(state) {
  if (!state || !state.list) return;
  const list = state.list;
  list.innerHTML = '';

  if (!Array.isArray(state.routes) || state.routes.length === 0) {
    populateRouteDeleteSelect(state, []);
    const empty = document.createElement('li');
    empty.className = 'route-adder-saved__empty';
    empty.textContent = 'No routes saved yet. Use the Route Adder to capture your first corridor.';
    list.appendChild(empty);
    return;
  }

  const sortedRoutes = sortRoutesForManager(state.routes, state.collator);
  populateRouteDeleteSelect(state, sortedRoutes);

  sortedRoutes.forEach(route => {
    const item = document.createElement('li');
    item.className = 'route-adder-saved__item';

    const text = document.createElement('div');
    text.className = 'route-adder-saved__item-text';

    const name = document.createElement('span');
    name.className = 'route-adder-saved__item-name';
    name.textContent = route.name || 'Saved route';
    text.appendChild(name);

    const meta = document.createElement('span');
    meta.className = 'route-adder-saved__item-meta';
    const city = route.city || 'Unspecified city';
    const province = route.province || 'Unspecified province';
    meta.textContent = `${city}, ${province}`;
    text.appendChild(meta);

    item.appendChild(text);
    list.appendChild(item);
  });
}

function showSavedRoutesFeedback(state, message, isError = false) {
  if (!state || !state.feedback) return;
  state.feedback.textContent = message || '';
  state.feedback.hidden = !message;
  state.feedback.classList.toggle('error', Boolean(isError));
}

function populateRouteDeleteSelect(state, routes) {
  if (!state || !state.deleteSelect) return;

  const select = state.deleteSelect;
  const hasRoutes = Array.isArray(routes) && routes.length > 0;
  const previousValue = select.value;
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = hasRoutes
    ? 'Select a saved route to delete…'
    : 'No saved routes available';
  select.appendChild(placeholder);

  if (hasRoutes) {
    routes.forEach(route => {
      const option = document.createElement('option');
      option.value = route.routeId;
      const city = route.city || 'Unspecified city';
      const province = route.province || 'Unspecified province';
      option.textContent = `${route.name || 'Saved route'} — ${city}, ${province}`;
      select.appendChild(option);
    });
  }

  select.dataset.hasRoutes = hasRoutes ? 'true' : 'false';
  if (hasRoutes && routes.some(route => route.routeId === previousValue)) {
    select.value = previousValue;
  } else {
    select.value = '';
  }

  select.disabled = state.isLoading || !hasRoutes;
}

function handleSavedRoutesListClick(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest('[data-route-action]') : null;
  if (!target) return;
  const action = target.dataset.routeAction;
  const routeId = target.dataset.routeId;
  if (action === 'delete' && routeId) {
    const savedState = routeEditorState ? routeEditorState.savedRoutes : null;
    if (!savedState) return;
    const route = savedState.routes.find(entry => entry.routeId === routeId);
    if (route) {
      deleteSavedRouteRecord(route, target, savedState);
    }
  }
}

function handleDeleteSelectChange(event) {
  const select = event.target instanceof HTMLSelectElement ? event.target : null;
  if (!select) return;
  const routeId = select.value;
  if (!routeId) return;

  const state = routeEditorState ? routeEditorState.savedRoutes : null;
  if (!state) {
    select.value = '';
    return;
  }

  const route = state.routes.find(entry => entry.routeId === routeId);
  if (!route) {
    select.value = '';
    return;
  }

  const confirmDelete = window.confirm(`Delete "${route.name || 'this route'}" from saved routes? This cannot be undone.`);
  if (!confirmDelete) {
    select.value = '';
    return;
  }

  deleteSavedRouteRecord(route, null, state, { skipPrompt: true }).finally(() => {
    select.value = '';
  });
}

async function deleteSavedRouteRecord(route, triggerButton, state, options = {}) {
  if (!route || !state) return;
  const skipPrompt = Boolean(options.skipPrompt);
  if (!skipPrompt) {
    const confirmDelete = window.confirm(`Delete "${route.name || 'this route'}" from saved routes? This cannot be undone.`);
    if (!confirmDelete) return;
  }

  const button = triggerButton instanceof HTMLButtonElement ? triggerButton : null;
  const originalLabel = button ? button.textContent : '';

  try {
    if (button) button.disabled = true;
    if (button) button.textContent = 'Deleting…';
    setSavedRoutesLoading(state, true);

    const response = await fetch(`/api/routes/${encodeURIComponent(route.routeId)}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`Delete failed with status ${response.status}`);
    }

    await loadSavedRoutesForEditor(state, { silent: true, force: true });
    showSavedRoutesFeedback(state, `Route "${route.name}" deleted.`);
    if (routeEditorState) {
      setEditorStatus(routeEditorState, `Removed "${route.name}" from saved routes.`);
    }
    if (routeFinderState && typeof loadRoutesForFinder === 'function') {
      loadRoutesForFinder();
    }
  } catch (error) {
    console.error('Failed to delete saved route', error);
    showSavedRoutesFeedback(state, 'Unable to delete this route right now. Please try again.', true);
  } finally {
    setSavedRoutesLoading(state, false);
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || 'Delete';
    }
  }
}

function sortRoutesForManager(routes, collator) {
  const comparer = collator || new Intl.Collator('en', { sensitivity: 'base' });
  return routes
    .slice()
    .sort((a, b) => {
      const provinceCompare = comparer.compare(a.province || '', b.province || '');
      if (provinceCompare !== 0) return provinceCompare;
      const cityCompare = comparer.compare(a.city || '', b.city || '');
      if (cityCompare !== 0) return cityCompare;
      return comparer.compare(a.name || '', b.name || '');
    });
}

function setupRouteAdder(map) {
  if (routeEditorState) return;

  const tools = document.getElementById('editor-tools');
  if (!tools) return;

  if (map && typeof map.setOptions === 'function') {
    map.setOptions({
      gestureHandling: 'greedy',
      scrollwheel: true,
    });
  }

  const statusElement = document.getElementById('editor-status');
  const actions = {
    draw: tools.querySelector('[data-editor-action="draw"]'),
    snap: tools.querySelector('[data-editor-action="snap"]'),
    edit: tools.querySelector('[data-editor-action="edit"]'),
    undo: tools.querySelector('[data-editor-action="undo"]'),
    redo: tools.querySelector('[data-editor-action="redo"]'),
    save: tools.querySelector('[data-editor-action="save"]'),
    exit: tools.querySelector('[data-editor-action="exit"]'),
  };

  routeEditorState = {
    map,
    tools,
    statusElement,
    actions,
    mode: 'idle',
    isBusy: false,
    path: [],
    snappedPath: [],
    history: [],
    redoStack: [],
    pathListeners: [],
    savedRoutes: null,
    polyline: new google.maps.Polyline({
      map,
      strokeColor: '#2563eb',
      strokeOpacity: 0.9,
      strokeWeight: 4,
      clickable: true,
      visible: false,
      zIndex: 900,
    }),
    snappedPolyline: new google.maps.Polyline({
      map,
      strokeColor: '#16a34a',
      strokeOpacity: 0.85,
      strokeWeight: 4,
      visible: false,
      zIndex: 905,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: 4,
          },
          offset: '0',
          repeat: '24px',
        },
      ],
    }),
    mapClickListener: null,
  };

  const savedRoutesState = setupSavedRoutesManager();
  if (savedRoutesState) {
    routeEditorState.savedRoutes = savedRoutesState;
  }

  routeEditorState.mapClickListener = map.addListener('click', event => {
    if (!routeEditorState || routeEditorState.mode !== 'draw') return;
    addPointToDraftRoute(routeEditorState, event.latLng);
  });

  Object.entries(actions).forEach(([action, button]) => {
    if (!button) return;
    button.addEventListener('click', () => handleRouteEditorAction(action));
  });

  initialiseRouteHistory(routeEditorState);
  updateEditorControls(routeEditorState);
  repositionMapControls(map.getDiv());
}

function handleRouteEditorAction(action) {
  if (!routeEditorState) return;
  const handlers = {
    draw: startDrawingRoute,
    snap: snapRouteToRoad,
    edit: enableRouteEditing,
    undo: undoRouteStep,
    redo: redoRouteStep,
    save: saveCurrentRoute,
    exit: exitRouteEditing,
  };

  const handler = handlers[action];
  if (typeof handler === 'function') {
    handler(routeEditorState);
  }
}

function initialiseRouteHistory(state) {
  state.history = [
    [],
  ];
  state.redoStack = [];
}

function addPointToDraftRoute(state, latLng) {
  const point = { lat: latLng.lat(), lng: latLng.lng() };
  state.path.push(point);
  state.snappedPath = [];
  commitRouteHistory(state);
  updateDraftPolyline(state);
  updateSnappedPolyline(state);
  setEditorStatus(state, `Plotted ${state.path.length} point${state.path.length === 1 ? '' : 's'}. Continue clicking or choose Snap to Road when ready.`);
  updateEditorControls(state);
}

function startDrawingRoute(state) {
  state.mode = 'draw';
  state.path = [];
  state.snappedPath = [];
  initialiseRouteHistory(state);
  updateDraftPolyline(state);
  updateSnappedPolyline(state);
  setEditorStatus(state, 'Drawing mode enabled. Click along the taxi corridor to sketch your route.');
  updateEditorControls(state);
}

function enableRouteEditing(state) {
  if (state.path.length < 2) {
    setEditorStatus(state, 'Add at least two points before editing segments.');
    return;
  }
  state.mode = 'edit';
  updateDraftPolyline(state);
  attachEditableListeners(state);
  setEditorStatus(state, 'Drag the route vertices to refine alignment, then snap again to clean it up.');
  updateEditorControls(state);
}

function undoRouteStep(state) {
  if (!state.history || state.history.length <= 1) {
    setEditorStatus(state, 'Nothing to undo yet.');
    return;
  }

  const current = state.history.pop();
  if (current) state.redoStack.push(current);
  const previous = state.history[state.history.length - 1] || [];
  state.path = cloneCoordinateList(previous);
  updateDraftPolyline(state);
  updateSnappedPolyline(state);
  setEditorStatus(state, 'Reverted the last change.');
  updateEditorControls(state);
}

function redoRouteStep(state) {
  if (!state.redoStack || state.redoStack.length === 0) {
    setEditorStatus(state, 'Nothing to redo.');
    return;
  }

  const next = state.redoStack.pop();
  if (!next) return;
  state.path = cloneCoordinateList(next);
  commitRouteHistory(state, true);
  updateDraftPolyline(state);
  updateSnappedPolyline(state);
  setEditorStatus(state, 'Reapplied the previous change.');
  updateEditorControls(state);
}

function deleteCurrentRoute(state) {
  state.mode = 'idle';
  state.path = [];
  state.snappedPath = [];
  initialiseRouteHistory(state);
  updateDraftPolyline(state);
  updateSnappedPolyline(state);
  setEditorStatus(state, 'Cleared the editor. Choose Draw to sketch a new route.');
  updateEditorControls(state);
}

function exitRouteEditing(state) {
  deleteCurrentRoute(state);
}

function updateDraftPolyline(state) {
  detachEditableListeners(state);
  const path = state.path.map(point => ({ lat: point.lat, lng: point.lng }));
  state.polyline.setPath(path);
  state.polyline.setVisible(path.length > 0);
  state.polyline.setEditable(state.mode === 'edit');
  if (state.mode === 'edit') {
    attachEditableListeners(state);
  }
}

function updateSnappedPolyline(state) {
  const path = (state.snappedPath || []).map(point => ({ lat: point.lat, lng: point.lng }));
  state.snappedPolyline.setPath(path);
  state.snappedPolyline.setVisible(path.length > 0);
}

function attachEditableListeners(state) {
  detachEditableListeners(state);
  const path = state.polyline.getPath();
  if (!path) return;
  const update = () => {
    state.path = path.getArray().map(latLng => ({ lat: latLng.lat(), lng: latLng.lng() }));
    commitRouteHistory(state);
    updateEditorControls(state);
  };
  state.pathListeners = [
    path.addListener('insert_at', update),
    path.addListener('set_at', update),
    path.addListener('remove_at', update),
  ];
}

function detachEditableListeners(state) {
  if (!state.pathListeners) {
    state.pathListeners = [];
    return;
  }
  state.pathListeners.forEach(listener => listener.remove());
  state.pathListeners = [];
}

function commitRouteHistory(state, skipRedoReset = false) {
  if (!state.history) state.history = [];
  const snapshot = cloneCoordinateList(state.path);
  const last = state.history[state.history.length - 1];
  if (!pathsMatch(last, snapshot)) {
    state.history.push(snapshot);
    if (state.history.length > 100) state.history.shift();
    if (!skipRedoReset) {
      state.redoStack = [];
    }
  }
}

function cloneCoordinateList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(point => ({ lat: Number(point.lat), lng: Number(point.lng) }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function pathsMatch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i].lat - b[i].lat) > 1e-9 || Math.abs(a[i].lng - b[i].lng) > 1e-9) {
      return false;
    }
  }
  return true;
}

function updateEditorControls(state) {
  const { actions } = state;
  const hasPath = state.path.length > 0;
  const hasMultiplePoints = state.path.length > 1;
  const hasHistory = state.history && state.history.length > 1;
  const hasRedo = state.redoStack && state.redoStack.length > 0;
  const hasSnapped = state.snappedPath && state.snappedPath.length > 1;

  setDisabled(actions.draw, state.isBusy);
  setDisabled(actions.snap, !hasMultiplePoints || state.isBusy);
  setDisabled(actions.edit, !hasMultiplePoints || state.isBusy);
  setDisabled(actions.undo, !hasHistory || state.isBusy);
  setDisabled(actions.redo, !hasRedo || state.isBusy);
  setDisabled(actions.save, (!hasMultiplePoints && !hasSnapped) || state.isBusy);
  setDisabled(actions.exit, state.isBusy || (!hasPath && !hasSnapped && state.mode === 'idle'));
}

function setDisabled(button, disabled) {
  if (!button) return;
  button.disabled = Boolean(disabled);
}

function setEditorStatus(state, message) {
  if (state.statusElement) {
    state.statusElement.textContent = message;
  }
}

function setEditorBusy(state, busy) {
  state.isBusy = Boolean(busy);
  updateEditorControls(state);
}

async function snapRouteToRoad(state) {
  if (state.path.length < 2) {
    setEditorStatus(state, 'Plot at least two points before snapping to roads.');
    return;
  }

  setEditorBusy(state, true);
  setEditorStatus(state, 'Snapping route to nearby roads...');

  try {
    const response = await fetch('/api/roads/snap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: state.path }),
    });
    if (!response.ok) throw new Error(`Snap failed with status ${response.status}`);
    const data = await response.json();
    const snappedPath = cloneCoordinateList(data.snappedPath);
    if (!snappedPath.length) {
      setEditorStatus(state, 'Snap-to-Roads returned no results. Try refining the path and retry.');
    } else {
      state.snappedPath = snappedPath;
      updateSnappedPolyline(state);
      setEditorStatus(state, 'Route snapped. Review the green overlay before saving.');
    }
  } catch (error) {
    console.error('Snap to Roads failed', error);
    setEditorStatus(state, 'Could not snap the route right now. Please try again in a moment.');
  } finally {
    setEditorBusy(state, false);
  }
}

async function saveCurrentRoute(state) {
  const workingPath = state.snappedPath.length > 1 ? state.snappedPath : state.path;
  if (workingPath.length < 2) {
    setEditorStatus(state, 'Snap and refine the route before saving.');
    return;
  }

  const name = window.prompt('Route name', 'New Taxi Route');
  if (!name) {
    setEditorStatus(state, 'Route save cancelled. Provide a name to save the route.');
    return;
  }
  const provinceInput = window.prompt('Province', '');
  const cityInput = window.prompt('City or Town', '');
  const minFareInput = window.prompt('Minimum fare (ZAR)', '10');
  const maxFareInput = window.prompt('Maximum fare (ZAR)', minFareInput || '12');
  const gesture = window.prompt('Hand signal / gesture', '') || '';

  const fareMin = Number.parseFloat(minFareInput);
  const fareMax = Number.parseFloat(maxFareInput);

  const payload = {
    name,
    gesture,
    province: typeof provinceInput === 'string' ? provinceInput.trim() : '',
    city: typeof cityInput === 'string' ? cityInput.trim() : '',
    fare: {
      min: Number.isFinite(fareMin) ? fareMin : 0,
      max: Number.isFinite(fareMax) ? fareMax : Number.isFinite(fareMin) ? fareMin : 0,
      currency: 'ZAR',
    },
    stops: buildStopsFromPath(workingPath),
    path: cloneCoordinateList(state.path),
    snappedPath: cloneCoordinateList(state.snappedPath.length ? state.snappedPath : state.path),
    variations: [],
  };

  setEditorBusy(state, true);
  setEditorStatus(state, 'Saving route...');

  try {
    const response = await fetch('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Save failed with status ${response.status}`);
    const saved = await response.json();
    setEditorStatus(state, `Route "${saved.name || name}" saved successfully.`);
    state.mode = 'idle';
    state.path = [];
    state.snappedPath = [];
    initialiseRouteHistory(state);
    updateDraftPolyline(state);
    updateSnappedPolyline(state);
    updateEditorControls(state);
  } catch (error) {
    console.error('Unable to save route', error);
    setEditorStatus(state, 'Unable to save the route right now. Please try again.');
  } finally {
    setEditorBusy(state, false);
  }
}

function buildStopsFromPath(path) {
  if (!Array.isArray(path) || path.length === 0) return [];
  const stops = [];
  const first = path[0];
  const last = path[path.length - 1];
  if (first) {
    stops.push({ name: 'Start', lat: first.lat, lng: first.lng });
  }
  if (last && (last.lat !== first.lat || last.lng !== first.lng)) {
    stops.push({ name: 'End', lat: last.lat, lng: last.lng });
  }
  return stops;
}

function setupRegistration() {
  const form = document.querySelector('[data-registration-form]');
  if (!form || form.dataset.registrationBound === 'true') return;

  form.dataset.registrationBound = 'true';

  const roleSelect = form.querySelector('select[name="role"]');
  const dynamicContainer = form.querySelector('[data-role-fields]');
  const errorElement = form.querySelector('[data-registration-error]');
  const successPanel = document.getElementById('registration-success');
  const successMessage = successPanel ? successPanel.querySelector('[data-registration-success-message]') : null;
  const successActions = successPanel ? successPanel.querySelector('[data-registration-success-actions]') : null;
  const successFeedback = successPanel ? successPanel.querySelector('[data-registration-feedback]') : null;

  const state = {
    ownerTaxiList: null,
  };

  function clearError() {
    if (errorElement) {
      errorElement.hidden = true;
      errorElement.textContent = '';
    }
  }

  function showError(message) {
    if (!errorElement) return;
    errorElement.textContent = message;
    errorElement.hidden = false;
    if (successPanel) {
      successPanel.hidden = true;
    }
  }

  function resetSuccessPanel() {
    if (!successPanel) return;
    successPanel.hidden = true;
    if (successMessage) successMessage.textContent = '';
    if (successActions) successActions.innerHTML = '';
    if (successFeedback) {
      successFeedback.textContent = '';
      successFeedback.classList.remove('error');
    }
  }

  function showSuccess(message, actions = []) {
    if (!successPanel) return;
    if (successMessage) {
      successMessage.textContent = message;
    }
    if (successActions) {
      successActions.innerHTML = '';
      actions.forEach(action => successActions.appendChild(action));
    }
    if (successFeedback) {
      successFeedback.textContent = '';
      successFeedback.classList.remove('error');
    }
    successPanel.hidden = false;
    if (typeof successPanel.scrollIntoView === 'function') {
      successPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (typeof successPanel.focus === 'function') {
      successPanel.focus({ preventScroll: true });
    }
  }

  function createOwnerTaxiFieldset(initial = {}) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'registration-owner-taxi';
    fieldset.dataset.ownerTaxi = 'true';
    fieldset.dataset.taxiId = initial.id || generateId('taxi');

    const legend = document.createElement('legend');
    legend.textContent = 'Taxi';
    fieldset.appendChild(legend);

    const header = document.createElement('div');
    header.className = 'registration-owner-taxi__header';
    const title = document.createElement('h3');
    title.textContent = initial.name || 'Taxi';
    header.appendChild(title);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'registration-owner-taxi__remove';
    removeButton.setAttribute('aria-label', 'Remove taxi');
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => {
      fieldset.remove();
      refreshOwnerTaxiTitles();
    });
    header.appendChild(removeButton);

    fieldset.appendChild(header);

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Taxi name or nickname';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.name = 'taxi-name';
    nameInput.placeholder = 'e.g. Soweto CBD Express';
    if (initial.name) nameInput.value = initial.name;
    nameInput.addEventListener('input', refreshOwnerTaxiTitles);
    nameLabel.appendChild(nameInput);
    fieldset.appendChild(nameLabel);

    const regLabel = document.createElement('label');
    regLabel.textContent = 'Registration / Fleet number (optional)';
    const regInput = document.createElement('input');
    regInput.type = 'text';
    regInput.name = 'taxi-registration';
    regInput.placeholder = 'e.g. CA 123-456';
    if (initial.registration) regInput.value = initial.registration;
    regLabel.appendChild(regInput);
    fieldset.appendChild(regLabel);

    return fieldset;
  }

  function refreshOwnerTaxiTitles() {
    if (!state.ownerTaxiList) return;
    const groups = Array.from(state.ownerTaxiList.querySelectorAll('[data-owner-taxi]'));
    groups.forEach((fieldset, index) => {
      const title = fieldset.querySelector('.registration-owner-taxi__header h3');
      const nameInput = fieldset.querySelector('input[name="taxi-name"]');
      if (title) {
        const fallback = `Taxi ${index + 1}`;
        title.textContent = nameInput && nameInput.value.trim() ? nameInput.value.trim() : fallback;
      }
      const legend = fieldset.querySelector('legend');
      if (legend) {
        legend.textContent = `Taxi ${index + 1}`;
      }
    });
  }

  function collectOwnerTaxiEntries() {
    if (!state.ownerTaxiList) return [];
    const rows = Array.from(state.ownerTaxiList.querySelectorAll('[data-owner-taxi]'));
    return rows
      .map(row => {
        const id = row.dataset.taxiId || generateId('taxi');
        row.dataset.taxiId = id;
        const nameInput = row.querySelector('input[name="taxi-name"]');
        const regInput = row.querySelector('input[name="taxi-registration"]');
        const name = nameInput ? nameInput.value.trim() : '';
        const registration = regInput ? regInput.value.trim() : '';
        if (!name && !registration) return null;
        return {
          id,
          name,
          registration,
          lastKnownLocation: null,
        };
      })
      .filter(Boolean);
  }

  function renderRoleFields(role) {
    if (!dynamicContainer) return;
    dynamicContainer.innerHTML = '';
    state.ownerTaxiList = null;

    if (role === 'driver') {
      const note = document.createElement('div');
      note.className = 'registration-driver-note';
      note.innerHTML =
        '<strong>Enable live visibility</strong>After submitting, share your location to appear on the Admin Route Finder.';
      dynamicContainer.appendChild(note);

      const vehicleLabel = document.createElement('label');
      vehicleLabel.textContent = 'Vehicle nickname or association (optional)';
      const vehicleInput = document.createElement('input');
      vehicleInput.type = 'text';
      vehicleInput.name = 'driverVehicle';
      vehicleInput.placeholder = 'e.g. Soweto — Sandton Quantum';
      vehicleLabel.appendChild(vehicleInput);
      dynamicContainer.appendChild(vehicleLabel);
      return;
    }

    if (role === 'owner') {
      const note = document.createElement('div');
      note.className = 'registration-driver-note';
      note.innerHTML =
        '<strong>Map your fleet</strong>List each taxi you manage. Update live positions later from the Admin Route Finder.';
      dynamicContainer.appendChild(note);

      const list = document.createElement('div');
      list.className = 'registration-owner-fleet';
      list.dataset.ownerTaxiList = 'true';
      dynamicContainer.appendChild(list);
      state.ownerTaxiList = list;

      list.appendChild(createOwnerTaxiFieldset());
      refreshOwnerTaxiTitles();

      const actions = document.createElement('div');
      actions.className = 'registration-owner-actions';
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'cta secondary';
      addButton.textContent = 'Add another taxi';
      addButton.addEventListener('click', () => {
        list.appendChild(createOwnerTaxiFieldset());
        refreshOwnerTaxiTitles();
      });
      actions.appendChild(addButton);
      dynamicContainer.appendChild(actions);
      return;
    }

    const info = document.createElement('p');
    info.className = 'registration-feedback';
    info.textContent =
      'Complete your registration. Taxi drivers and owners unlock live tracking inside the Admin Route Finder.';
    dynamicContainer.appendChild(info);
  }

  function renderDriverSuccessPanel() {
    const profile = getDriverProfile();
    if (!profile) return;
    const message = profile.sharingEnabled
      ? `${profile.name || 'Taxi driver'}, your live location is active. Refresh it whenever you need to update the Admin Route Finder.`
      : `Thanks ${profile.name || 'Taxi driver'}! Enable live location to appear on the Admin Route Finder.`;
    const actions = [];

    const enableButton = document.createElement('button');
    enableButton.type = 'button';
    enableButton.className = 'cta';
    enableButton.textContent = profile.sharingEnabled ? 'Refresh live location' : 'Enable live location now';
    enableButton.addEventListener('click', () => {
      if (successFeedback) {
        successFeedback.textContent = 'Requesting your current position...';
        successFeedback.classList.remove('error');
      }
      const actionPromise = profile.sharingEnabled ? refreshDriverLocation() : enableDriverLiveLocation();
      actionPromise
        .then(() => {
          if (successFeedback) {
            successFeedback.textContent = 'Live location updated. Open the Admin Route Finder to view your marker.';
            successFeedback.classList.remove('error');
          }
          renderDriverSuccessPanel();
        })
        .catch(error => {
          if (successFeedback) {
            successFeedback.textContent = error.message || 'Unable to update your location.';
            successFeedback.classList.add('error');
          }
        });
    });
    actions.push(enableButton);

    const adminLink = document.createElement('a');
    adminLink.href = '/admin-route-finder.html';
    adminLink.className = 'cta secondary';
    adminLink.textContent = 'Open Admin Route Finder';
    actions.push(adminLink);

    showSuccess(message, actions);
  }

  function renderOwnerSuccessPanel() {
    const profile = getOwnerProfile();
    if (!profile) return;
    const total = Array.isArray(profile.taxis) ? profile.taxis.length : 0;
    const message =
      total > 0
        ? `${profile.name || 'Taxi owner'}, ${total} taxi${total === 1 ? '' : 's'} are ready to display on the Admin Route Finder.`
        : `${profile.name || 'Taxi owner'}, your profile is saved. Add taxis to manage their live visibility.`;
    const actions = [];

    const adminLink = document.createElement('a');
    adminLink.href = '/admin-route-finder.html';
    adminLink.className = 'cta';
    adminLink.textContent = 'Open Admin Route Finder';
    actions.push(adminLink);

    showSuccess(message, actions);
  }

  function renderGenericSuccess(role, name) {
    const message = `Thanks ${name || 'for registering'}! We'll follow up with activation details for the ${role} workspace.`;
    const actions = [];
    const adminLink = document.createElement('a');
    adminLink.href = '/admin-route-finder.html';
    adminLink.className = 'cta secondary';
    adminLink.textContent = 'Visit Admin Route Finder';
    actions.push(adminLink);
    showSuccess(message, actions);
  }

  if (roleSelect) {
    renderRoleFields(roleSelect.value || 'collector');
    roleSelect.addEventListener('change', event => {
      clearError();
      resetSuccessPanel();
      const nextRole = event.target ? event.target.value : 'collector';
      renderRoleFields(nextRole || 'collector');
    });
  } else if (dynamicContainer) {
    dynamicContainer.innerHTML = '';
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    clearError();
    resetSuccessPanel();

    const formData = new FormData(form);
    const role = (formData.get('role') || 'collector').toString();
    const name = (formData.get('name') || '').trim();
    if (!name) {
      showError('Please provide your full name so we can personalise your workspace.');
      return;
    }

    const email = (formData.get('email') || '').trim();
    const phone = (formData.get('phone') || '').trim();
    const routes = (formData.get('routes') || '').trim();

    if (role === 'driver') {
      const vehicle = (formData.get('driverVehicle') || '').trim();
      const profile = {
        id: generateId('driver'),
        role,
        name,
        email,
        phone,
        routes,
        vehicle,
        sharingEnabled: false,
        lastKnownLocation: null,
        timestamp: Date.now(),
      };
      setDriverProfile(profile);
      renderDriverSuccessPanel();
    } else if (role === 'owner') {
      const taxis = collectOwnerTaxiEntries();
      if (!taxis.length) {
        showError('Add at least one taxi so that your fleet can appear on the Admin Route Finder.');
        return;
      }
      const profile = {
        id: generateId('owner'),
        role,
        name,
        email,
        phone,
        routes,
        taxis,
        timestamp: Date.now(),
      };
      setOwnerProfile(profile);
      renderOwnerSuccessPanel();
    } else {
      renderGenericSuccess(role, name);
    }

    form.reset();
    if (roleSelect) {
      roleSelect.value = role;
      renderRoleFields(role);
    } else {
      renderRoleFields('collector');
    }
  });

  const storedDriver = getDriverProfile();
  const storedOwner = getOwnerProfile();
  if (storedDriver) {
    renderDriverSuccessPanel();
  } else if (storedOwner) {
    renderOwnerSuccessPanel();
  }
}

function setupRouteFinder(map) {
  if (!map) return;

  const dropdown = document.getElementById('route-select');
  const detailsElement = document.getElementById('route-details');
  const searchForm = document.getElementById('search');

  if (!routeFinderState) {
    routeFinderState = {
      map,
      dropdown,
      detailsElement,
      searchForm,
      infoWindow: new google.maps.InfoWindow({ maxWidth: 320 }),
      routes: [],
      routeById: new Map(),
      overlays: [],
      polylineById: new Map(),
      collator: new Intl.Collator('en', { sensitivity: 'base' }),
      selectedRouteId: '',
    };
  } else {
    routeFinderState.map = map;
    routeFinderState.dropdown = dropdown;
    routeFinderState.detailsElement = detailsElement;
    routeFinderState.searchForm = searchForm;
    if (!routeFinderState.infoWindow) {
      routeFinderState.infoWindow = new google.maps.InfoWindow({ maxWidth: 320 });
    }
    if (!routeFinderState.collator) {
      routeFinderState.collator = new Intl.Collator('en', { sensitivity: 'base' });
    }
  }

  attachRouteFinderEventListeners();
  renderRouteDetails(null);
  loadRoutesForFinder();
  repositionMapControls(map.getDiv());
}

function attachRouteFinderEventListeners() {
  if (!routeFinderState) return;
  const { dropdown, searchForm } = routeFinderState;

  if (dropdown && !dropdown.dataset.routeFinderBound) {
    dropdown.addEventListener('change', event => {
      focusRouteById(event.target.value || '', { updateDropdown: false });
    });
    dropdown.dataset.routeFinderBound = 'true';
  }

  if (searchForm && !searchForm.dataset.routeFinderBound) {
    searchForm.addEventListener('submit', event => {
      event.preventDefault();
      const input = searchForm.querySelector('input[name="q"], input[type="search"]');
      const query = input ? input.value.trim() : '';
      handleRouteSearch(query);
    });
    searchForm.dataset.routeFinderBound = 'true';
  }
}

async function loadRoutesForFinder() {
  if (!routeFinderState) return;

  try {
    const response = await fetch('/api/routes');
    if (!response.ok) {
      throw new Error(`Routes request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const routes = Array.isArray(payload) ? payload.map(normalizeRouteRecord).filter(Boolean) : [];

    routeFinderState.routes = routes;
    if (!routeFinderState.routeById) {
      routeFinderState.routeById = new Map();
    } else {
      routeFinderState.routeById.clear();
    }
    routes.forEach(route => {
      routeFinderState.routeById.set(route.routeId, route);
    });

    updateRouteDropdown();
    drawRoutesOnMap();

    if (routeFinderState.selectedRouteId && routeFinderState.routeById.has(routeFinderState.selectedRouteId)) {
      focusRouteById(routeFinderState.selectedRouteId, { fit: false, updateDropdown: true });
    } else {
      routeFinderState.selectedRouteId = '';
      if (routeFinderState.dropdown) {
        routeFinderState.dropdown.value = '';
      }
      if (routes.length === 0) {
        renderRouteDetails(null, {
          message: 'No routes have been saved yet. Use the Route Adder to capture your first corridor.',
        });
      } else {
        renderRouteDetails(null);
      }
      if (routeFinderState.infoWindow) {
        routeFinderState.infoWindow.close();
      }
      highlightRoutes('');
    }
  } catch (error) {
    console.error('Failed to load routes', error);
    routeFinderState.routes = [];
    if (routeFinderState.routeById) {
      routeFinderState.routeById.clear();
    }
    updateRouteDropdown();
    clearRouteOverlays();
    if (routeFinderState.infoWindow) {
      routeFinderState.infoWindow.close();
    }
    renderRouteDetails(null, {
      message: 'Unable to load saved routes right now. Please refresh the page to try again.',
    });
  }
}

function drawRoutesOnMap() {
  if (!routeFinderState || !routeFinderState.map) return;

  clearRouteOverlays();
  routeFinderState.polylineById = new Map();

  routeFinderState.routes.forEach(route => {
    const path = getRoutePath(route);
    if (!Array.isArray(path) || path.length < 2) return;

    const strokeColor = getRouteColor(route.frequencyPerHour);
    const polyline = new google.maps.Polyline({
      map: routeFinderState.map,
      path: path.map(point => ({ lat: point.lat, lng: point.lng })),
      strokeColor,
      strokeOpacity: 0.6,
      strokeWeight: 4,
      zIndex: 500,
    });

    const entry = {
      routeId: route.routeId,
      polyline,
      strokeColor,
      listeners: [],
    };

    entry.listeners.push(
      polyline.addListener('click', event => {
        focusRouteById(route.routeId, { eventPosition: event.latLng, updateDropdown: true });
      }),
      polyline.addListener('mouseover', () => {
        applyRouteStyle(entry, {
          isHover: true,
          isSelected: routeFinderState.selectedRouteId === route.routeId,
        });
      }),
      polyline.addListener('mouseout', () => {
        applyRouteStyle(entry, { isSelected: routeFinderState.selectedRouteId === route.routeId });
      }),
    );

    routeFinderState.overlays.push(entry);
    routeFinderState.polylineById.set(route.routeId, entry);
    applyRouteStyle(entry, { isSelected: routeFinderState.selectedRouteId === route.routeId });
  });

  repositionMapControls(routeFinderState.map.getDiv());
}

function clearRouteOverlays() {
  if (!routeFinderState) return;
  if (Array.isArray(routeFinderState.overlays)) {
    routeFinderState.overlays.forEach(entry => {
      if (entry.listeners) {
        entry.listeners.forEach(listener => listener.remove());
      }
      if (entry.polyline) {
        entry.polyline.setMap(null);
      }
    });
  }
  routeFinderState.overlays = [];
  if (routeFinderState.polylineById) {
    routeFinderState.polylineById.clear();
  }
}

function applyRouteStyle(entry, { isSelected = false, isHover = false } = {}) {
  if (!entry || !entry.polyline) return;
  const strokeOpacity = isSelected ? 1 : isHover ? 0.85 : 0.55;
  const strokeWeight = isSelected ? 6 : isHover ? 5 : 4;
  const zIndex = isSelected ? 1100 : isHover ? 900 : 500;
  entry.polyline.setOptions({
    strokeOpacity,
    strokeWeight,
    zIndex,
    strokeColor: entry.strokeColor,
  });
}

function highlightRoutes(routeId) {
  if (!routeFinderState) return;
  const selectedId = routeId ? String(routeId) : '';
  routeFinderState.overlays.forEach(entry => {
    applyRouteStyle(entry, { isSelected: entry.routeId === selectedId });
  });
}

function focusRouteById(routeId, options = {}) {
  if (!routeFinderState) return;
  const id = routeId ? String(routeId) : '';

  if (!id) {
    routeFinderState.selectedRouteId = '';
    highlightRoutes('');
    if (options.updateDropdown !== false && routeFinderState.dropdown) {
      routeFinderState.dropdown.value = '';
    }
    renderRouteDetails(null);
    if (routeFinderState.infoWindow) {
      routeFinderState.infoWindow.close();
    }
    return;
  }

  const route = routeFinderState.routeById ? routeFinderState.routeById.get(id) : null;
  if (!route) {
    renderRouteDetails(null, { message: 'The selected route could not be found.' });
    return;
  }

  routeFinderState.selectedRouteId = id;
  highlightRoutes(id);

  if (options.updateDropdown !== false && routeFinderState.dropdown && routeFinderState.dropdown.value !== id) {
    routeFinderState.dropdown.value = id;
  }

  renderRouteDetails(route);

  if (options.fit !== false) {
    fitMapToRoute(route);
  }

  if (routeFinderState.infoWindow) {
    const anchor = options.eventPosition || getRouteMidpoint(route);
    if (anchor) {
      routeFinderState.infoWindow.setContent(buildRouteInfoWindow(route));
      routeFinderState.infoWindow.setPosition(anchor);
      routeFinderState.infoWindow.open({ map: routeFinderState.map });
    } else {
      routeFinderState.infoWindow.close();
    }
  }
}

function fitMapToRoute(route) {
  if (!routeFinderState || !routeFinderState.map) return;
  const path = getRoutePath(route);
  if (!Array.isArray(path) || path.length === 0) return;

  const bounds = new google.maps.LatLngBounds();
  path.forEach(point => bounds.extend(point));
  try {
    routeFinderState.map.fitBounds(bounds, getRouteFitPadding());
  } catch (error) {
    console.warn('Unable to fit map to route bounds', error);
  }
}

function getRouteFitPadding() {
  const topPadding = getControlOffset() + 80;
  return { top: topPadding, bottom: 64, left: 80, right: 80 };
}

function getRoutePath(route) {
  if (!route) return [];
  if (Array.isArray(route.snappedPath) && route.snappedPath.length > 1) {
    return route.snappedPath;
  }
  if (Array.isArray(route.path)) {
    return route.path;
  }
  return [];
}

function getRouteColor(frequencyPerHour) {
  const value = Number(frequencyPerHour);
  if (!Number.isFinite(value)) {
    return '#2563eb';
  }
  if (value >= 25) return '#b91c1c';
  if (value >= 18) return '#ea580c';
  if (value >= 12) return '#f59e0b';
  if (value >= 6) return '#0ea5e9';
  return '#2563eb';
}

function normalizeRouteRecord(rawRoute) {
  if (!rawRoute || rawRoute.routeId === undefined || rawRoute.routeId === null) return null;
  const routeId = String(rawRoute.routeId);
  const name = typeof rawRoute.name === 'string' && rawRoute.name.trim() ? rawRoute.name.trim() : `Route ${routeId}`;
  const province = typeof rawRoute.province === 'string' && rawRoute.province.trim()
    ? rawRoute.province.trim()
    : 'Unspecified province';
  const city = typeof rawRoute.city === 'string' && rawRoute.city.trim() ? rawRoute.city.trim() : 'Unspecified city';
  const path = cloneCoordinateList(Array.isArray(rawRoute.path) ? rawRoute.path : []);
  const snappedPath = cloneCoordinateList(Array.isArray(rawRoute.snappedPath) ? rawRoute.snappedPath : []);
  const stops = Array.isArray(rawRoute.stops)
    ? rawRoute.stops
        .map(stop => ({
          name: typeof stop.name === 'string' && stop.name.trim() ? stop.name.trim() : 'Stop',
          lat: Number(stop.lat),
          lng: Number(stop.lng),
        }))
        .filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
    : [];
  const fare = rawRoute.fare
    ? {
        min: Number(rawRoute.fare.min),
        max: Number(rawRoute.fare.max),
        currency:
          typeof rawRoute.fare.currency === 'string' && rawRoute.fare.currency.trim()
            ? rawRoute.fare.currency.trim()
            : 'ZAR',
      }
    : null;
  const frequency = Number(rawRoute.frequencyPerHour);

  return {
    ...rawRoute,
    routeId,
    name,
    province,
    city,
    path,
    snappedPath,
    stops,
    fare,
    frequencyPerHour: Number.isFinite(frequency) ? frequency : null,
    nameLower: name.toLowerCase(),
    provinceLower: province.toLowerCase(),
    cityLower: city.toLowerCase(),
  };
}

function updateRouteDropdown() {
  if (!routeFinderState || !routeFinderState.dropdown) return;
  const select = routeFinderState.dropdown;
  const previousValue = select.value;
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = routeFinderState.routes.length ? 'Select a saved route' : 'No routes saved yet';
  placeholder.selected = true;
  select.appendChild(placeholder);

  if (routeFinderState.routes.length === 0) {
    select.disabled = true;
    return;
  }

  select.disabled = false;
  const groups = groupRoutesByProvinceCity(routeFinderState.routes, routeFinderState.collator);
  groups.forEach(group => {
    const optGroup = document.createElement('optgroup');
    optGroup.label = group.province;
    group.cities.forEach(cityGroup => {
      cityGroup.routes.forEach(route => {
        const option = document.createElement('option');
        option.value = route.routeId;
        option.textContent = `${cityGroup.name} — ${route.name}`;
        option.dataset.province = route.province;
        option.dataset.city = route.city;
        optGroup.appendChild(option);
      });
    });
    select.appendChild(optGroup);
  });

  if (previousValue && routeFinderState.routeById && routeFinderState.routeById.has(previousValue)) {
    select.value = previousValue;
  } else {
    select.value = '';
  }
}

function groupRoutesByProvinceCity(routes, collator) {
  const provinceMap = new Map();
  routes.forEach(route => {
    const province = route.province || 'Unspecified province';
    const city = route.city || 'Unspecified city';
    if (!provinceMap.has(province)) {
      provinceMap.set(province, new Map());
    }
    const cityMap = provinceMap.get(province);
    if (!cityMap.has(city)) {
      cityMap.set(city, []);
    }
    cityMap.get(city).push(route);
  });

  const comparer = collator || new Intl.Collator('en', { sensitivity: 'base' });
  return Array.from(provinceMap.entries())
    .sort((a, b) => comparer.compare(a[0], b[0]))
    .map(([province, cityMap]) => ({
      province,
      cities: Array.from(cityMap.entries())
        .sort((a, b) => comparer.compare(a[0], b[0]))
        .map(([city, cityRoutes]) => ({
          name: city,
          routes: cityRoutes.slice().sort((a, b) => comparer.compare(a.name, b.name)),
        })),
    }));
}

function renderRouteDetails(route, options = {}) {
  if (!routeFinderState || !routeFinderState.detailsElement) return;
  const container = routeFinderState.detailsElement;

  if (options.message) {
    container.innerHTML = `<p class="route-details__empty">${escapeHtml(options.message)}</p>`;
    return;
  }

  if (!route) {
    container.innerHTML = '<p class="route-details__empty">Select a saved route to see its details.</p>';
    return;
  }

  const fareText = escapeHtml(formatFare(route.fare));
  const serviceWindow = escapeHtml(formatServiceWindow(route.firstLoad, route.lastLoad));
  const frequencyMarkup = Number.isFinite(route.frequencyPerHour)
    ? `<span class="route-frequency-chip">${escapeHtml(`${route.frequencyPerHour} trips/hour`)}</span>`
    : escapeHtml('Frequency data unavailable');
  const gestureText = route.gesture ? escapeHtml(route.gesture) : 'Not specified';
  const stopsMarkup = buildStopsMarkup(route.stops);
  const variationsCount = Array.isArray(route.variations) ? route.variations.length : 0;

  container.innerHTML = `
    <h2>${escapeHtml(route.name)}</h2>
    <ul class="route-details__meta">
      <li><strong>Province:</strong> ${escapeHtml(route.province || 'Unspecified')}</li>
      <li><strong>City:</strong> ${escapeHtml(route.city || 'Unspecified')}</li>
      <li><strong>Fare:</strong> ${fareText}</li>
      <li><strong>Gesture:</strong> ${gestureText}</li>
      <li><strong>Frequency:</strong> ${frequencyMarkup}</li>
      <li><strong>Service window:</strong> ${serviceWindow}</li>
      <li><strong>Variations:</strong> ${variationsCount}</li>
    </ul>
    ${stopsMarkup}
  `;
}

function buildStopsMarkup(stops) {
  if (!Array.isArray(stops) || stops.length === 0) {
    return '<p class="route-details__empty">No stops recorded yet.</p>';
  }

  const items = stops.map(stop => {
    const name = escapeHtml(stop.name || 'Stop');
    const lat = escapeHtml(formatCoordinate(stop.lat));
    const lng = escapeHtml(formatCoordinate(stop.lng));
    return `<li><strong>${name}</strong> — ${lat}, ${lng}</li>`;
  });

  return `
    <div>
      <strong>Stops</strong>
      <ul class="route-details__stops">
        ${items.join('')}
      </ul>
    </div>
  `;
}

function buildRouteInfoWindow(route) {
  const fare = escapeHtml(formatFare(route.fare));
  const frequency = escapeHtml(
    Number.isFinite(route.frequencyPerHour) ? `${route.frequencyPerHour} trips/hour` : 'Frequency data unavailable',
  );
  const city = escapeHtml(route.city || 'Unspecified city');
  const province = escapeHtml(route.province || 'Unspecified province');
  return `
    <div class="route-info-window">
      <strong>${escapeHtml(route.name)}</strong><br />
      <span>${city}, ${province}</span><br />
      <span>${fare}</span><br />
      <span>${frequency}</span>
    </div>
  `;
}

function formatFare(fare) {
  if (!fare) return 'Not recorded';
  const currency = typeof fare.currency === 'string' && fare.currency.trim() ? fare.currency.trim().toUpperCase() : 'ZAR';
  const min = Number(fare.min);
  const max = Number(fare.max);

  if (Number.isFinite(min) && Number.isFinite(max)) {
    const minFormatted = formatCurrencyValue(min, currency);
    const maxFormatted = formatCurrencyValue(max, currency);
    if (Math.abs(max - min) < 0.01) {
      return minFormatted;
    }
    return `${minFormatted} – ${maxFormatted}`;
  }

  if (Number.isFinite(min)) return formatCurrencyValue(min, currency);
  if (Number.isFinite(max)) return formatCurrencyValue(max, currency);
  return 'Not recorded';
}

function formatCurrencyValue(amount, currency) {
  if (!Number.isFinite(amount)) return '';
  const normalizedCurrency = currency && currency.length === 3 ? currency.toUpperCase() : 'ZAR';
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    const symbol = normalizedCurrency === 'ZAR' ? 'R' : `${normalizedCurrency} `;
    return `${symbol}${amount.toFixed(2)}`;
  }
}

function formatServiceWindow(firstLoad, lastLoad) {
  const start = typeof firstLoad === 'string' && firstLoad.trim() ? firstLoad.trim() : '';
  const end = typeof lastLoad === 'string' && lastLoad.trim() ? lastLoad.trim() : '';
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start} onward`;
  if (end) return `Until ${end}`;
  return 'Not recorded';
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function handleRouteSearch(query) {
  if (!routeFinderState) return;
  const trimmed = (query || '').trim();
  if (!trimmed) {
    focusRouteById('', { updateDropdown: false });
    renderRouteDetails(null);
    return;
  }

  const lower = trimmed.toLowerCase();
  const match = routeFinderState.routes.find(route =>
    route.nameLower.includes(lower) || route.cityLower.includes(lower) || route.provinceLower.includes(lower),
  );

  if (match) {
    focusRouteById(match.routeId, { fit: true, updateDropdown: true });
    if (routeFinderState.dropdown) {
      routeFinderState.dropdown.value = match.routeId;
    }
  } else {
    renderRouteDetails(null, { message: `No routes found for “${trimmed}”.` });
    if (routeFinderState.dropdown) {
      routeFinderState.dropdown.value = '';
    }
    if (routeFinderState.infoWindow) {
      routeFinderState.infoWindow.close();
    }
    highlightRoutes('');
  }
}

function setupAdminRouteFinder(map) {
  if (!map) return;

  if (!adminRouteFinderState) {
    adminRouteFinderState = {
      map,
      markers: new Map(),
      driverStatus: document.querySelector('[data-driver-status]'),
      driverEnableButton: document.querySelector('[data-driver-enable]'),
      driverRefreshButton: document.querySelector('[data-driver-refresh]'),
      driverFeedback: document.querySelector('[data-driver-feedback]'),
      driverSummary: document.querySelector('[data-driver-summary]'),
      driverLastUpdate: document.querySelector('[data-driver-last-update]'),
      driverPosition: document.querySelector('[data-driver-position]'),
      ownerStatus: document.querySelector('[data-owner-status]'),
      ownerFeedback: document.querySelector('[data-owner-feedback]'),
      ownerList: document.querySelector('[data-owner-taxi-list]'),
      ownerEmpty: document.querySelector('[data-owner-empty]'),
    };
  } else {
    adminRouteFinderState.map = map;
  }

  if (!adminRouteFinderState.markers) {
    adminRouteFinderState.markers = new Map();
  }

  attachAdminEventListeners();
  renderAdminDriverSection();
  renderAdminOwnerSection();
  updateAdminMarkers();
  fitAdminMapToEntities();
  repositionMapControls(map.getDiv());
}

function attachAdminEventListeners() {
  if (!adminRouteFinderState) return;
  const { driverEnableButton, driverRefreshButton } = adminRouteFinderState;

  if (driverEnableButton && !driverEnableButton.dataset.adminBound) {
    driverEnableButton.addEventListener('click', handleDriverEnableToggle);
    driverEnableButton.dataset.adminBound = 'true';
  }

  if (driverRefreshButton && !driverRefreshButton.dataset.adminBound) {
    driverRefreshButton.addEventListener('click', handleDriverRefresh);
    driverRefreshButton.dataset.adminBound = 'true';
  }
}

function renderAdminDriverSection() {
  if (!adminRouteFinderState) return;
  const {
    driverStatus,
    driverEnableButton,
    driverRefreshButton,
    driverSummary,
    driverLastUpdate,
    driverPosition,
  } = adminRouteFinderState;

  const profile = getDriverProfile();

  if (!profile) {
    if (driverStatus) {
      driverStatus.textContent = 'Register as a taxi driver to manage live visibility here.';
    }
    if (driverEnableButton) {
      driverEnableButton.disabled = true;
      driverEnableButton.textContent = 'Enable live location';
    }
    if (driverRefreshButton) {
      driverRefreshButton.disabled = true;
    }
    if (driverSummary) {
      driverSummary.hidden = true;
    }
    return;
  }

  if (driverStatus) {
    driverStatus.textContent = profile.sharingEnabled
      ? `${profile.name || 'Taxi driver'} is broadcasting a live location. Refresh to capture the latest point.`
      : `${profile.name || 'Taxi driver'} is registered but live location is disabled.`;
  }

  if (driverEnableButton) {
    driverEnableButton.disabled = false;
    driverEnableButton.textContent = profile.sharingEnabled ? 'Disable live location' : 'Enable live location';
  }

  if (driverRefreshButton) {
    driverRefreshButton.disabled = !profile.sharingEnabled;
  }

  if (driverSummary) {
    const hasLocation =
      profile.sharingEnabled &&
      profile.lastKnownLocation &&
      Number.isFinite(profile.lastKnownLocation.lat) &&
      Number.isFinite(profile.lastKnownLocation.lng);
    driverSummary.hidden = !hasLocation;
    if (hasLocation) {
      if (driverLastUpdate) {
        driverLastUpdate.textContent = formatRelativeTimestamp(profile.lastKnownLocation.timestamp);
      }
      if (driverPosition) {
        driverPosition.textContent = formatLocationSummary(profile.lastKnownLocation);
      }
    }
  }
}

function handleDriverEnableToggle() {
  if (!adminRouteFinderState) return;
  const { driverFeedback } = adminRouteFinderState;
  const profile = getDriverProfile();
  if (!profile) {
    if (driverFeedback) {
      driverFeedback.textContent = 'No taxi driver registration found. Submit the driver form first.';
      driverFeedback.classList.add('error');
    }
    return;
  }

  if (driverFeedback) {
    driverFeedback.classList.remove('error');
    driverFeedback.textContent = profile.sharingEnabled
      ? 'Disabling live location...'
      : 'Requesting your current position...';
  }

  const action = profile.sharingEnabled ? disableDriverLiveLocation() : enableDriverLiveLocation();
  action
    .then(updated => {
      if (driverFeedback) {
        driverFeedback.textContent = updated.sharingEnabled
          ? 'Live location enabled. Refresh it any time to keep dispatchers informed.'
          : 'Live location disabled.';
        driverFeedback.classList.remove('error');
      }
    })
    .catch(error => {
      if (driverFeedback) {
        driverFeedback.textContent = error.message || 'Unable to update driver visibility.';
        driverFeedback.classList.add('error');
      }
    });
}

function handleDriverRefresh() {
  if (!adminRouteFinderState) return;
  const { driverFeedback } = adminRouteFinderState;
  if (driverFeedback) {
    driverFeedback.textContent = 'Refreshing driver location...';
    driverFeedback.classList.remove('error');
  }

  refreshDriverLocation()
    .then(() => {
      if (driverFeedback) {
        driverFeedback.textContent = 'Driver location refreshed.';
        driverFeedback.classList.remove('error');
      }
    })
    .catch(error => {
      if (driverFeedback) {
        driverFeedback.textContent = error.message || 'Unable to refresh driver location.';
        driverFeedback.classList.add('error');
      }
    });
}

function renderAdminOwnerSection() {
  if (!adminRouteFinderState) return;
  const { ownerStatus, ownerFeedback, ownerList, ownerEmpty } = adminRouteFinderState;
  const profile = getOwnerProfile();

  if (!profile) {
    if (ownerStatus) {
      ownerStatus.textContent = 'Register as a taxi owner to capture your fleet and track live positions.';
    }
    if (ownerList) {
      ownerList.innerHTML = '';
      ownerList.hidden = true;
    }
    if (ownerEmpty) {
      ownerEmpty.hidden = false;
    }
    if (ownerFeedback) {
      ownerFeedback.textContent = '';
      ownerFeedback.classList.remove('error');
    }
    return;
  }

  const total = Array.isArray(profile.taxis) ? profile.taxis.length : 0;
  if (ownerStatus) {
    ownerStatus.textContent =
      total > 0
        ? `${profile.name || 'Taxi owner'} has ${total} taxi${total === 1 ? '' : 's'} registered.`
        : `${profile.name || 'Taxi owner'} has no taxis captured yet.`;
  }

  if (ownerList) {
    ownerList.innerHTML = '';
    if (total > 0) {
      ownerList.hidden = false;
      profile.taxis.forEach(taxi => {
        const card = document.createElement('article');
        card.className = 'admin-taxi';

        const title = document.createElement('h3');
        title.textContent = taxi.name || 'Taxi';
        card.appendChild(title);

        const meta = document.createElement('p');
        meta.className = 'admin-taxi__meta';
        meta.textContent = taxi.registration ? `Fleet: ${taxi.registration}` : 'Registration not provided';
        card.appendChild(meta);

        const location = document.createElement('p');
        location.className = 'admin-taxi__location';
        const summary = formatLocationSummary(taxi.lastKnownLocation);
        if (taxi.lastKnownLocation && Number.isFinite(taxi.lastKnownLocation.timestamp)) {
          location.textContent = `${summary} • ${formatRelativeTimestamp(taxi.lastKnownLocation.timestamp)}`;
        } else {
          location.textContent = summary;
        }
        card.appendChild(location);

        const actions = document.createElement('div');
        actions.className = 'admin-taxi__actions';
        const updateButton = document.createElement('button');
        updateButton.type = 'button';
        updateButton.className = 'cta';
        updateButton.textContent = 'Update location';
        updateButton.addEventListener('click', () => handleOwnerTaxiUpdate(taxi.id));
        actions.appendChild(updateButton);
        card.appendChild(actions);

        ownerList.appendChild(card);
      });
    } else {
      ownerList.hidden = true;
    }
  }

  if (ownerEmpty) {
    ownerEmpty.hidden = total > 0;
  }

  if (ownerFeedback && !ownerFeedback.textContent) {
    ownerFeedback.classList.remove('error');
  }
}

function handleOwnerTaxiUpdate(taxiId) {
  if (!adminRouteFinderState) return;
  const { ownerFeedback } = adminRouteFinderState;
  if (ownerFeedback) {
    ownerFeedback.textContent = 'Capturing taxi location...';
    ownerFeedback.classList.remove('error');
  }

  updateOwnerTaxiLocation(taxiId)
    .then(taxi => {
      if (ownerFeedback) {
        ownerFeedback.textContent = `${taxi.name || 'Taxi'} location updated.`;
        ownerFeedback.classList.remove('error');
      }
    })
    .catch(error => {
      if (ownerFeedback) {
        ownerFeedback.textContent = error.message || 'Unable to update taxi location.';
        ownerFeedback.classList.add('error');
      }
    });
}

function updateAdminMarkers() {
  if (!adminRouteFinderState || !adminRouteFinderState.map || !window.google || !window.google.maps) return;
  if (!adminRouteFinderState.markers) {
    adminRouteFinderState.markers = new Map();
  }

  adminRouteFinderState.markers.forEach(marker => marker.setMap(null));
  adminRouteFinderState.markers.clear();

  const map = adminRouteFinderState.map;

  const driverProfile = getDriverProfile();
  if (driverProfile && driverProfile.sharingEnabled && driverProfile.lastKnownLocation) {
    const { lat, lng } = driverProfile.lastKnownLocation;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const driverMarker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: `${driverProfile.name || 'Taxi driver'} (live)`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#2563eb',
          fillOpacity: 0.9,
          strokeColor: '#1d4ed8',
          strokeWeight: 2,
        },
      });
      adminRouteFinderState.markers.set('driver', driverMarker);
    }
  }

  const ownerProfile = getOwnerProfile();
  if (ownerProfile && Array.isArray(ownerProfile.taxis)) {
    ownerProfile.taxis.forEach(taxi => {
      if (!taxi.lastKnownLocation) return;
      const { lat, lng } = taxi.lastKnownLocation;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const taxiMarker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: `${taxi.name || 'Taxi'}${taxi.registration ? ` (${taxi.registration})` : ''}`.trim(),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#f59e0b',
          fillOpacity: 0.9,
          strokeColor: '#b45309',
          strokeWeight: 2,
        },
      });
      adminRouteFinderState.markers.set(`taxi-${taxi.id}`, taxiMarker);
    });
  }
}

function fitAdminMapToEntities() {
  if (!adminRouteFinderState || !adminRouteFinderState.map || !adminRouteFinderState.markers) return;
  const markers = Array.from(adminRouteFinderState.markers.values()).filter(marker => !!marker.getPosition);
  if (!markers.length) return;

  const bounds = new google.maps.LatLngBounds();
  markers.forEach(marker => {
    const position = marker.getPosition();
    if (position) {
      bounds.extend(position);
    }
  });

  if (!bounds.isEmpty()) {
    try {
      adminRouteFinderState.map.fitBounds(bounds, getRouteFitPadding());
    } catch (error) {
      console.warn('Unable to fit admin map to markers', error);
    }
  }
}

function getRouteMidpoint(route) {
  const path = getRoutePath(route);
  if (!Array.isArray(path) || path.length === 0) return null;
  const index = Math.floor(path.length / 2);
  const point = path[index];
  return point ? { lat: point.lat, lng: point.lng } : null;
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? Number(value).toFixed(5) : 'n/a';
}

document.addEventListener('DOMContentLoaded', init);
