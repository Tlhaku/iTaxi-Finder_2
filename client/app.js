let mapInstance;
let routeEditorState;

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

function repositionMapControls(mapElement) {
  if (!mapElement) return;
  const offsetPx = `${getControlOffset()}px`;
  const mapTypeControl = mapElement.querySelector('.gm-style-mtc');
  if (mapTypeControl) {
    mapTypeControl.style.top = offsetPx;
  }

  const fullscreenControl = mapElement.querySelector('.gm-fullscreen-control');
  if (fullscreenControl) {
    fullscreenControl.style.top = offsetPx;
  }
}

function styleControls(mapElement, map) {
  const repositionControls = () => repositionMapControls(mapElement);

  google.maps.event.addListenerOnce(map, 'idle', repositionControls);
  google.maps.event.addListener(map, 'maptypeid_changed', repositionControls);
  google.maps.event.addListener(map, 'zoom_changed', repositionControls);
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
  const minFareInput = window.prompt('Minimum fare (ZAR)', '10');
  const maxFareInput = window.prompt('Maximum fare (ZAR)', minFareInput || '12');
  const gesture = window.prompt('Hand signal / gesture', '') || '';

  const fareMin = Number.parseFloat(minFareInput);
  const fareMax = Number.parseFloat(maxFareInput);

  const payload = {
    name,
    gesture,
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

document.addEventListener('DOMContentLoaded', init);
