import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';

const fsp = fs.promises;

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

function sanitizeFare(fare = {}) {
  const min = Number.isFinite(Number(fare.min)) ? Number(fare.min) : 0;
  const maxCandidate = Number.isFinite(Number(fare.max)) ? Number(fare.max) : min;
  const currency = typeof fare.currency === 'string' && fare.currency.trim() ? fare.currency.trim() : 'ZAR';
  return { min, max: maxCandidate, currency };
}

function smoothPath(path) {
  if (path.length <= 2) return path;
  const smoothed = [path[0]];
  for (let i = 1; i < path.length - 1; i += 1) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];
    const lat = (prev.lat + curr.lat + next.lat) / 3;
    const lng = (prev.lng + curr.lng + next.lng) / 3;
    smoothed.push({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
  }
  smoothed.push(path[path.length - 1]);
  return smoothed;
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

function handleSnapRequest(req, res) {
  parseJsonBody(req)
    .then(payload => {
      const basePath = sanitizeCoordinateList(payload.path);
      if (basePath.length < 2) {
        sendJson(res, { message: 'At least two points are required' }, 400);
        return;
      }
      sendJson(res, { snappedPath: smoothPath(basePath) });
    })
    .catch(error => {
      sendJson(res, { message: error.message || 'Invalid request payload' }, 400);
    });
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
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
