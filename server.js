import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import crypto from 'crypto';

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
const routes = [];
try {
  const existingRoutes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  if (Array.isArray(existingRoutes)) {
    routes.push(...existingRoutes);
  }
} catch (e) {
  console.warn('No routes data, using empty list');
}

const usersPath = path.join(process.cwd(), 'data', 'users.json');
const users = [];
try {
  const existingUsers = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  if (Array.isArray(existingUsers)) {
    users.push(...existingUsers);
  }
} catch (e) {
  console.warn('No users data, starting fresh');
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
    else if (ext === '.json') type = 'application/json';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function persist(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req
      .on('data', chunk => chunks.push(chunk))
      .on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (!raw) {
            resolve({});
            return;
          }
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

function nextRouteId() {
  const maxId = routes.reduce((max, route) => Math.max(max, Number(route.routeId) || 0), 0);
  return maxId + 1;
}

function sanitizeRoute(route) {
  if (!route || typeof route !== 'object') return null;
  const {
    routeId,
    name,
    fare = {},
    gesture = '',
    stops = [],
    frequencyPerHour,
    firstLoad,
    lastLoad,
    rushHours,
    quietHours,
    path,
    snappedPath,
    encodedPolyline,
    distanceMeters,
    durationSeconds,
    variations,
  } = route;

  return {
    routeId,
    name,
    fare,
    gesture,
    stops,
    frequencyPerHour,
    firstLoad,
    lastLoad,
    rushHours,
    quietHours,
    path,
    snappedPath,
    encodedPolyline,
    distanceMeters,
    durationSeconds,
    variations,
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  const { id, name, email, phone, role, profile, token } = user;
  return { id, name, email, phone, role, profile, token };
}

function getAuthUser(req, res) {
  const token = req.headers['x-auth-token'];
  if (!token) {
    sendJson(res, { message: 'Authentication required' }, 401);
    return null;
  }
  const user = users.find(u => u.token === token);
  if (!user) {
    sendJson(res, { message: 'Invalid token' }, 401);
    return null;
  }
  return user;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Auth-Token',
    });
    res.end();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Auth-Token');

  if (parsed.pathname === '/config') {
    const fallbackKey = 'AIzaSyCYxFkL9vcvbaFz-Ut1Lm2Vge5byodujfk';
    sendJson(res, {
      mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || fallbackKey,
    });
  } else if (parsed.pathname === '/api/routes' && req.method === 'GET') {
    sendJson(res, routes.map(sanitizeRoute));
  } else if (parsed.pathname === '/api/routes' && req.method === 'POST') {
    const user = getAuthUser(req, res);
    if (!user) return;
    parseBody(req)
      .then(body => {
        if (!body || !body.name) {
          sendJson(res, { message: 'Route name is required' }, 400);
          return;
        }
        const route = {
          routeId: nextRouteId(),
          name: body.name,
          fare: body.fare || {},
          gesture: body.gesture || '',
          stops: Array.isArray(body.stops) ? body.stops : [],
          frequencyPerHour: body.frequencyPerHour,
          firstLoad: body.firstLoad,
          lastLoad: body.lastLoad,
          rushHours: body.rushHours,
          quietHours: body.quietHours,
          path: body.path,
          snappedPath: body.snappedPath,
          encodedPolyline: body.encodedPolyline,
          distanceMeters: body.distanceMeters,
          durationSeconds: body.durationSeconds,
          variations: body.variations,
          updatedBy: user.id,
          updatedAt: new Date().toISOString(),
        };
        routes.push(route);
        persist(routesPath, routes);
        sendJson(res, sanitizeRoute(route), 201);
      })
      .catch(() => sendJson(res, { message: 'Invalid JSON body' }, 400));
  } else if (parsed.pathname.startsWith('/api/routes/') && req.method === 'GET') {
    const id = parsed.pathname.split('/').pop();
    const route = routes.find(r => String(r.routeId) === id);
    if (route) sendJson(res, sanitizeRoute(route)); else sendJson(res, { message: 'Not found' }, 404);
  } else if (parsed.pathname.startsWith('/api/routes/') && req.method === 'PUT') {
    const user = getAuthUser(req, res);
    if (!user) return;
    const id = parsed.pathname.split('/').pop();
    const index = routes.findIndex(r => String(r.routeId) === id);
    if (index === -1) {
      sendJson(res, { message: 'Not found' }, 404);
      return;
    }
    parseBody(req)
      .then(body => {
        if (!body || !body.name) {
          sendJson(res, { message: 'Route name is required' }, 400);
          return;
        }
        const existing = routes[index];
        routes[index] = {
          ...existing,
          name: body.name,
          fare: body.fare || {},
          gesture: body.gesture || '',
          stops: Array.isArray(body.stops) ? body.stops : [],
          frequencyPerHour: body.frequencyPerHour,
          firstLoad: body.firstLoad,
          lastLoad: body.lastLoad,
          rushHours: body.rushHours,
          quietHours: body.quietHours,
          path: body.path,
          snappedPath: body.snappedPath,
          encodedPolyline: body.encodedPolyline,
          distanceMeters: body.distanceMeters,
          durationSeconds: body.durationSeconds,
          variations: body.variations,
          updatedBy: user.id,
          updatedAt: new Date().toISOString(),
        };
        persist(routesPath, routes);
        sendJson(res, sanitizeRoute(routes[index]));
      })
      .catch(() => sendJson(res, { message: 'Invalid JSON body' }, 400));
  } else if (parsed.pathname.startsWith('/api/routes/') && req.method === 'DELETE') {
    const user = getAuthUser(req, res);
    if (!user) return;
    const id = parsed.pathname.split('/').pop();
    const index = routes.findIndex(r => String(r.routeId) === id);
    if (index === -1) {
      sendJson(res, { message: 'Not found' }, 404);
      return;
    }
    const [removed] = routes.splice(index, 1);
    persist(routesPath, routes);
    sendJson(res, sanitizeRoute(removed));
  } else if (parsed.pathname === '/api/register' && req.method === 'POST') {
    parseBody(req)
      .then(body => {
        if (!body || !body.name || !body.email || !body.password || !body.role) {
          sendJson(res, { message: 'Missing required fields' }, 400);
          return;
        }
        const email = String(body.email).trim().toLowerCase();
        if (users.some(u => u.email === email)) {
          sendJson(res, { message: 'Email already registered' }, 409);
          return;
        }
        const passwordHash = crypto.createHash('sha256').update(String(body.password)).digest('hex');
        const user = {
          id: crypto.randomUUID(),
          name: String(body.name).trim(),
          email,
          phone: body.phone ? String(body.phone).trim() : '',
          role: String(body.role).trim(),
          profile: body.profile && typeof body.profile === 'object' ? body.profile : {},
          passwordHash,
          token: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
        users.push(user);
        persist(usersPath, users);
        sendJson(res, sanitizeUser(user), 201);
      })
      .catch(() => sendJson(res, { message: 'Invalid JSON body' }, 400));
  } else if (parsed.pathname === '/api/login' && req.method === 'POST') {
    parseBody(req)
      .then(body => {
        const email = body && body.email ? String(body.email).trim().toLowerCase() : '';
        const password = body && body.password ? String(body.password) : '';
        if (!email || !password) {
          sendJson(res, { message: 'Email and password required' }, 400);
          return;
        }
        const user = users.find(u => u.email === email);
        if (!user) {
          sendJson(res, { message: 'Invalid credentials' }, 401);
          return;
        }
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        if (user.passwordHash !== passwordHash) {
          sendJson(res, { message: 'Invalid credentials' }, 401);
          return;
        }
        if (!user.token) {
          user.token = crypto.randomUUID();
          persist(usersPath, users);
        }
        sendJson(res, sanitizeUser(user));
      })
      .catch(() => sendJson(res, { message: 'Invalid JSON body' }, 400));
  } else {
    let filePath = path.join('client', parsed.pathname === '/' ? 'index.html' : parsed.pathname);
    // prevent directory traversal
    if (!filePath.startsWith('client')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    serveStatic(res, filePath);
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

