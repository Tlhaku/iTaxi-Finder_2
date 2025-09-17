import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';

<<<<<<< HEAD
const fsp = fs.promises;

=======
>>>>>>> origin/main
// simple .env parser
try {
  const envData = fs.readFileSync('.env', 'utf8');
  envData.split(/\r?\n/).forEach(line => {
    const m = line.match(/^([^#=]+)=([\s\S]+)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
} catch (e) {
  console.warn('No .env file found');
}

const PORT = process.env.PORT || 3000;

const routesPath = path.join(process.cwd(), 'data', 'routes.json');
let routes = [];
try {
  routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
} catch (e) {
  console.warn('No routes data, using empty list');
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    let type = 'text/plain';
    if (ext === '.html') type = 'text/html';
    else if (ext === '.css') type = 'text/css';
    else if (ext === '.js') type = 'application/javascript';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

<<<<<<< HEAD
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeCoordinate(point) {
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function sanitizeCoordinateList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(sanitizeCoordinate)
    .filter(Boolean)
    .map(point => ({
      lat: Number(point.lat.toFixed(6)),
      lng: Number(point.lng.toFixed(6)),
    }));
}

function sanitizeStops(stops) {
  if (!Array.isArray(stops)) return [];
  return stops
    .map(stop => {
      const coords = sanitizeCoordinate(stop);
      if (!coords) return null;
      const name = typeof stop.name === 'string' && stop.name.trim() ? stop.name.trim() : 'Stop';
      return { name, lat: coords.lat, lng: coords.lng };
    })
    .filter(Boolean);
}

function sanitizeRegion(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function sanitizeFare(fare = {}) {
  const min = Number.isFinite(Number(fare.min)) ? Number(fare.min) : 0;
  const maxCandidate = Number.isFinite(Number(fare.max)) ? Number(fare.max) : min;
  const currency = typeof fare.currency === 'string' && fare.currency.trim() ? fare.currency.trim() : 'ZAR';
  return { min, max: maxCandidate, currency };
}

const EARTH_RADIUS_METERS = 6371000;
const MAX_SNAP_POINTS_PER_REQUEST = 100;
const SNAP_SEGMENT_LENGTH_METERS = 15;
const SNAP_API_URL = 'https://roads.googleapis.com/v1/snapToRoads';

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function coordinatesApproximatelyEqual(a, b, tolerance = 1e-5) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) <= tolerance && Math.abs(a.lng - b.lng) <= tolerance;
}

function segmentDistanceMeters(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function densifyPath(path, maxSegmentLengthMeters = SNAP_SEGMENT_LENGTH_METERS) {
  if (!Array.isArray(path) || path.length < 2) return Array.isArray(path) ? path.slice() : [];
  const densified = [path[0]];
  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1];
    const curr = path[i];
    const distance = segmentDistanceMeters(prev, curr);
    if (!Number.isFinite(distance) || distance === 0) {
      continue;
    }
    const segments = Math.max(1, Math.ceil(distance / maxSegmentLengthMeters));
    for (let step = 1; step < segments; step += 1) {
      const ratio = step / segments;
      const lat = prev.lat + (curr.lat - prev.lat) * ratio;
      const lng = prev.lng + (curr.lng - prev.lng) * ratio;
      densified.push({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
    }
    densified.push(curr);
  }
  return densified;
}

async function requestSnapChunk(points, apiKey) {
  const searchParams = new URLSearchParams();
  searchParams.set('key', apiKey);
  searchParams.set('interpolate', 'true');
  searchParams.set('path', points.map(point => `${point.lat},${point.lng}`).join('|'));
  const requestUrl = `${SNAP_API_URL}?${searchParams.toString()}`;
  const response = await fetch(requestUrl);
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Snap to Roads request failed with status ${response.status}: ${details}`);
  }
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload.snappedPoints) ? payload.snappedPoints : [];
}

async function snapPathToRoads(basePath, apiKey) {
  const densified = densifyPath(basePath);
  if (densified.length < 2) return [];
  const snapped = [];
  const step = MAX_SNAP_POINTS_PER_REQUEST - 1;
  for (let start = 0; start < densified.length; start += step) {
    const chunk = densified.slice(start, Math.min(densified.length, start + MAX_SNAP_POINTS_PER_REQUEST));
    if (chunk.length === 0) continue;
    const snappedPoints = await requestSnapChunk(chunk, apiKey);
    snappedPoints.forEach(point => {
      if (!point || !point.location) return;
      const lat = Number(point.location.latitude);
      const lng = Number(point.location.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const coord = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
      const last = snapped[snapped.length - 1];
      if (!last || Math.abs(last.lat - coord.lat) > 1e-6 || Math.abs(last.lng - coord.lng) > 1e-6) {
        snapped.push(coord);
      }
    });
  }
  if (!snapped.length) {
    return [];
  }
  const firstBase = basePath[0];
  const lastBase = basePath[basePath.length - 1];
  if (!coordinatesApproximatelyEqual(snapped[0], firstBase)) {
    snapped.unshift(firstBase);
  }
  if (!coordinatesApproximatelyEqual(snapped[snapped.length - 1], lastBase)) {
    snapped.push(lastBase);
  }
  return snapped;
}

function persistRoutes() {
  return fsp.writeFile(routesPath, JSON.stringify(routes, null, 2));
}

function handleCreateRoute(req, res) {
  parseJsonBody(req)
    .then(payload => {
      const basePath = sanitizeCoordinateList(payload.path);
      const snappedPath = sanitizeCoordinateList(payload.snappedPath);
      if (!basePath.length && !snappedPath.length) {
        sendJson(res, { message: 'Route path is required' }, 400);
        return;
      }

      const nextId = routes.reduce((max, route) => Math.max(max, Number(route.routeId) || 0), 0) + 1;
      const route = {
        routeId: nextId,
        name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : `Route ${nextId}`,
        fare: sanitizeFare(payload.fare),
        gesture: typeof payload.gesture === 'string' ? payload.gesture.trim() : '',
        province: sanitizeRegion(payload.province),
        city: sanitizeRegion(payload.city),
        stops: sanitizeStops(payload.stops),
        frequencyPerHour: payload.frequencyPerHour || null,
        firstLoad: payload.firstLoad || '',
        lastLoad: payload.lastLoad || '',
        rushHours: Array.isArray(payload.rushHours) ? payload.rushHours : [],
        quietHours: Array.isArray(payload.quietHours) ? payload.quietHours : [],
        path: basePath,
        snappedPath: snappedPath.length ? snappedPath : basePath,
        variations: Array.isArray(payload.variations) ? payload.variations : [],
      };

      routes.push(route);
      persistRoutes()
        .then(() => sendJson(res, route, 201))
        .catch(error => {
          console.error('Failed to persist route', error);
          routes = routes.filter(r => r.routeId !== route.routeId);
          sendJson(res, { message: 'Failed to save route' }, 500);
        });
    })
    .catch(error => {
      sendJson(res, { message: error.message || 'Invalid request payload' }, 400);
    });
}

function handleUpdateRoute(req, res, id) {
  const index = routes.findIndex(route => String(route.routeId) === id);
  if (index === -1) {
    sendJson(res, { message: 'Not found' }, 404);
    return;
  }

  parseJsonBody(req)
    .then(payload => {
      const target = routes[index];
      const basePath = sanitizeCoordinateList(payload.path || target.path);
      const snappedPath = sanitizeCoordinateList(payload.snappedPath || target.snappedPath || basePath);
      routes[index] = {
        ...target,
        ...payload,
        name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : target.name,
        gesture: typeof payload.gesture === 'string' ? payload.gesture.trim() : target.gesture,
        province: sanitizeRegion(payload.province !== undefined ? payload.province : target.province),
        city: sanitizeRegion(payload.city !== undefined ? payload.city : target.city),
        fare: sanitizeFare(payload.fare || target.fare),
        stops: sanitizeStops(payload.stops || target.stops),
        path: basePath,
        snappedPath: snappedPath.length ? snappedPath : basePath,
      };

      persistRoutes()
        .then(() => sendJson(res, routes[index]))
        .catch(error => {
          console.error('Failed to persist updated route', error);
          sendJson(res, { message: 'Failed to update route' }, 500);
        });
    })
    .catch(error => {
      sendJson(res, { message: error.message || 'Invalid request payload' }, 400);
    });
}

function handleDeleteRoute(req, res, id) {
  const index = routes.findIndex(route => String(route.routeId) === id);
  if (index === -1) {
    sendJson(res, { message: 'Not found' }, 404);
    return;
  }

  const [removed] = routes.splice(index, 1);
  persistRoutes()
    .then(() => {
      sendJson(res, { routeId: removed.routeId, message: 'Route deleted' });
    })
    .catch(error => {
      console.error('Failed to persist route deletion', error);
      if (removed) {
        routes.splice(index, 0, removed);
      }
      sendJson(res, { message: 'Failed to delete route' }, 500);
    });
}

async function handleSnapRequest(req, res) {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, { message: error.message || 'Invalid request payload' }, 400);
    return;
  }

  const basePath = sanitizeCoordinateList(payload.path);
  if (basePath.length < 2) {
    sendJson(res, { message: 'At least two points are required' }, 400);
    return;
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    sendJson(res, { message: 'Snap to Roads requires a configured API key' }, 500);
    return;
  }

  try {
    const snappedPath = await snapPathToRoads(basePath, apiKey);
    sendJson(res, { snappedPath });
  } catch (error) {
    console.error('Snap to Roads request failed', error);
    sendJson(res, { message: 'Failed to snap route to nearby roads' }, 502);
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (pathname === '/config' && req.method === 'GET') {
    sendJson(res, { mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
    return;
  }

  if (pathname === '/api/routes' && req.method === 'GET') {
    sendJson(res, routes);
    return;
  }

  if (pathname === '/api/routes' && req.method === 'POST') {
    handleCreateRoute(req, res);
    return;
  }

  if (pathname.startsWith('/api/routes/') && req.method === 'GET') {
    const id = pathname.split('/').pop();
    const route = routes.find(r => String(r.routeId) === id);
    if (route) sendJson(res, route); else sendJson(res, { message: 'Not found' }, 404);
    return;
  }

  if (pathname.startsWith('/api/routes/') && req.method === 'PUT') {
    const id = pathname.split('/').pop();
    handleUpdateRoute(req, res, id);
    return;
  }

  if (pathname.startsWith('/api/routes/') && req.method === 'DELETE') {
    const id = pathname.split('/').pop();
    handleDeleteRoute(req, res, id);
    return;
  }

  if (pathname === '/api/roads/snap' && req.method === 'POST') {
    handleSnapRequest(req, res);
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname;
  const filePath = path.join('client', relativePath);
  if (!filePath.startsWith('client')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  serveStatic(res, filePath);
=======
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === '/config') {
    sendJson(res, { mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
  } else if (parsed.pathname === '/api/routes') {
    sendJson(res, routes);
  } else if (parsed.pathname.startsWith('/api/routes/')) {
    const id = parsed.pathname.split('/').pop();
    const route = routes.find(r => String(r.routeId) === id);
    if (route) sendJson(res, route); else sendJson(res, { message: 'Not found' }, 404);
  } else {
    let filePath = path.join('client', parsed.pathname === '/' ? 'index.html' : parsed.pathname);
    // prevent directory traversal
    if (!filePath.startsWith('client')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    serveStatic(res, filePath);
  }
>>>>>>> origin/main
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
<<<<<<< HEAD
=======

>>>>>>> origin/main
});
