import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';

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

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === '/config') {
    const fallbackKey = 'AIzaSyCYxFkL9vcvbaFz-Ut1Lm2Vge5byodujfk';
    sendJson(res, {
      mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || fallbackKey,
    });
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
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);

});
