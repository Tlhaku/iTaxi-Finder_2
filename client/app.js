let mapInstance;
let routeEditorState;
let resizeListenerAttached = false;
let routeFinderState;

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

function setupRouteAdder(map) {
  if (routeEditorState) return;

  const tools = document.getElementById('editor-tools');
  if (!tools) return;

  const statusElement = document.getElementById('editor-status');
  const actions = {
    draw: tools.querySelector('[data-editor-action="draw"]'),
    snap: tools.querySelector('[data-editor-action="snap"]'),
    edit: tools.querySelector('[data-editor-action="edit"]'),
    undo: tools.querySelector('[data-editor-action="undo"]'),
    redo: tools.querySelector('[data-editor-action="redo"]'),
    save: tools.querySelector('[data-editor-action="save"]'),
    delete: tools.querySelector('[data-editor-action="delete"]'),
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
    delete: deleteCurrentRoute,
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
  setDisabled(actions.delete, (!hasPath && !hasSnapped) || state.isBusy);
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
