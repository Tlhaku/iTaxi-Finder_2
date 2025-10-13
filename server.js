import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import crypto from 'crypto';

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
const usersPath = path.join(process.cwd(), 'data', 'users.json');

let routes = [];
let users = [];
const sessions = new Map();
const ALLOWED_ROLES = new Set([
  'taxi-manager',
  'taxi-owner',
  'taxi-rider',
  'rank-manager',
  'collector',
  'spaza-owner',
  'monthly-subscriber',
]);
try {
  routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
} catch (e) {
  console.warn('No routes data, using empty list');
}
try {
  users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  if (!Array.isArray(users)) {
    users = [];
  }
} catch (e) {
  console.warn('No users data, starting with an empty user list');
  users = [];
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

function persistRoutes() {
  return fsp.writeFile(routesPath, JSON.stringify(routes, null, 2));
}

function persistUsers() {
  return fsp.writeFile(usersPath, JSON.stringify(users, null, 2));
}

const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = 'sha512';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST);
  return {
    salt,
    hash: derived.toString('hex'),
    iterations: PASSWORD_ITERATIONS,
    keyLength: PASSWORD_KEY_LENGTH,
    digest: PASSWORD_DIGEST,
  };
}

function verifyPassword(password, user) {
  if (!user || !password || typeof password !== 'string') {
    return false;
  }
  const {
    passwordSalt: salt,
    passwordHash: hash,
    passwordIterations: iterations = PASSWORD_ITERATIONS,
    passwordKeyLength: keyLength = PASSWORD_KEY_LENGTH,
    passwordDigest: digest = PASSWORD_DIGEST,
  } = user;
  if (!salt || !hash) {
    return false;
  }
  try {
    const derived = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);
    const storedBuffer = Buffer.from(hash, 'hex');
    if (derived.length !== storedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(derived, storedBuffer);
  } catch (error) {
    console.error('Failed to verify password', error);
    return false;
  }
}

function sanitizeUserRecord(user) {
  if (!user) return null;
  const metadata = user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
  const rawRoles = Array.isArray(user.roles)
    ? user.roles
    : ensureString(user.role).trim()
    ? [ensureString(user.role).trim()]
    : [];
  const roles = Array.from(
    new Set(
      rawRoles
        .map(role => ensureString(role).trim().toLowerCase())
        .filter(role => role && ALLOWED_ROLES.has(role)),
    ),
  );
  return {
    id: user.id,
    username: ensureString(user.username).trim(),
    firstName: ensureString(user.firstName).trim(),
    lastName: ensureString(user.lastName).trim(),
    homeTown: ensureString(user.homeTown).trim(),
    roles,
    email: ensureString(user.email).trim(),
    phone: ensureString(user.phone).trim(),
    routes: ensureString(user.routes).trim(),
    metadata,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null,
  };
}

function getNextUserId() {
  return users.reduce((max, user) => Math.max(max, Number(user.id) || 0), 0) + 1;
}

function extractSessionToken(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim()) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1].trim();
    }
  }

  const headerToken = req.headers['x-session-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  return null;
}

function getSession(req) {
  const token = extractSessionToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  const user = users.find(entry => entry.id === session.userId);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return { token, user };
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    token,
    userId: user.id,
    username: user.username,
    createdAt: Date.now(),
  });
  return token;
}

function destroySession(req) {
  const token = extractSessionToken(req);
  if (!token) return false;
  return sessions.delete(token);
}

function ensureString(value) {
  return typeof value === 'string' ? value : '';
}

function truncate(value, maxLength) {
  if (typeof value !== 'string') return '';
  if (!Number.isFinite(maxLength) || maxLength <= 0) return value.trim();
  return value.trim().slice(0, maxLength);
}

function findUserByIdentity(username, homeTown) {
  const usernameValue = ensureString(username).trim();
  const homeTownValue = ensureString(homeTown).trim();
  if (!usernameValue || !homeTownValue) {
    return null;
  }
  const usernameLower = usernameValue.toLowerCase();
  const homeTownLower = homeTownValue.toLowerCase();
  return users.find(user => {
    const userNameLower = ensureString(user.username).trim().toLowerCase();
    const userTownLower = ensureString(user.homeTown).trim().toLowerCase();
    return userNameLower === usernameLower && userTownLower === homeTownLower;
  }) || null;
}

function resolveContributor(contributor, sessionUser) {
  if (sessionUser) {
    const username = truncate(ensureString(sessionUser.username).trim(), 80);
    const homeTown = truncate(ensureString(sessionUser.homeTown).trim(), 120);
    if (!username || !homeTown) {
      return { error: 'Registered accounts must include a home town before saving routes.' };
    }
    return {
      addedBy: {
        username,
        name: truncate(username, 120),
        homeTown,
      },
      user: sessionUser,
    };
  }

  if (!contributor) {
    return { error: 'Provide a registered username and home town to save a route.' };
  }

  const username = truncate(ensureString(contributor.username).trim(), 80);
  const homeTown = truncate(ensureString(contributor.homeTown).trim(), 120);

  if (!username || !homeTown) {
    return { error: 'Provide a registered username and home town to save a route.' };
  }

  const matchedUser = findUserByIdentity(username, homeTown);
  if (!matchedUser) {
    return {
      error: 'No registration found for that username and home town. Register first before saving routes.',
    };
  }

  return {
    addedBy: {
      username: truncate(matchedUser.username || username, 80),
      name: truncate(matchedUser.username || username, 120),
      homeTown: truncate(matchedUser.homeTown || homeTown, 120),
    },
    user: matchedUser,
  };
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }

  if (Array.isArray(metadata)) {
    return metadata.map(entry => (typeof entry === 'object' ? sanitizeMetadata(entry) : entry));
  }

  const result = {};
  Object.keys(metadata).forEach(key => {
    const value = metadata[key];
    if (value === undefined) {
      return;
    }
    if (value === null) {
      result[key] = null;
      return;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
      return;
    }
    if (Array.isArray(value)) {
      result[key] = value.map(item => (typeof item === 'object' ? sanitizeMetadata(item) : item));
      return;
    }
    if (typeof value === 'object') {
      result[key] = sanitizeMetadata(value);
    }
  });
  return result;
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

const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';
const MAX_REGION_SAMPLES = 5;
const geocodeCache = new Map();

function sampleRoutePoints(path, maxSamples = MAX_REGION_SAMPLES) {
  if (!Array.isArray(path) || path.length === 0) {
    return [];
  }
  if (path.length <= maxSamples) {
    return path.slice();
  }
  const samples = [];
  const used = new Set();
  const step = (path.length - 1) / (maxSamples - 1);
  for (let i = 0; i < maxSamples; i += 1) {
    const rawIndex = Math.round(i * step);
    const index = Math.min(path.length - 1, rawIndex);
    const point = path[index];
    if (!point) continue;
    const key = `${Number(point.lat).toFixed(5)},${Number(point.lng).toFixed(5)}`;
    if (used.has(key)) continue;
    used.add(key);
    samples.push(point);
  }
  if (!used.has(`${Number(path[0].lat).toFixed(5)},${Number(path[0].lng).toFixed(5)}`)) {
    samples.unshift(path[0]);
  }
  if (!used.has(`${Number(path[path.length - 1].lat).toFixed(5)},${Number(path[path.length - 1].lng).toFixed(5)}`)) {
    samples.push(path[path.length - 1]);
  }
  return samples;
}

async function reverseGeocodePoint(point, apiKey) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !apiKey) {
    return null;
  }
  const cacheKey = `${Number(point.lat).toFixed(5)},${Number(point.lng).toFixed(5)}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  const params = new URLSearchParams({
    latlng: `${point.lat},${point.lng}`,
    key: apiKey,
    result_type: 'locality|postal_town|administrative_area_level_2|administrative_area_level_1|sublocality',
  });

  const response = await fetch(`${GEOCODE_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Reverse geocode failed with status ${response.status}: ${detail}`);
  }

  const payload = await response.json().catch(() => null);
  if (!payload || !Array.isArray(payload.results) || payload.results.length === 0) {
    geocodeCache.set(cacheKey, null);
    return null;
  }

  const components = Array.isArray(payload.results[0].address_components)
    ? payload.results[0].address_components
    : [];

  let province = '';
  let locality = '';
  let postalTown = '';
  let adminArea = '';
  let sublocality = '';

  components.forEach(component => {
    const types = Array.isArray(component.types) ? component.types : [];
    if (types.includes('administrative_area_level_1') && !province) {
      province = component.long_name || component.short_name || '';
    }
    if (types.includes('locality') && !locality) {
      locality = component.long_name || component.short_name || '';
    }
    if (types.includes('postal_town') && !postalTown) {
      postalTown = component.long_name || component.short_name || '';
    }
    if (types.includes('administrative_area_level_2') && !adminArea) {
      adminArea = component.long_name || component.short_name || '';
    }
    if ((types.includes('sublocality') || types.includes('sublocality_level_1')) && !sublocality) {
      sublocality = component.long_name || component.short_name || '';
    }
  });

  const result = {
    province: sanitizeRegion(province),
    locality: sanitizeRegion(locality),
    postalTown: sanitizeRegion(postalTown),
    adminArea: sanitizeRegion(adminArea),
    sublocality: sanitizeRegion(sublocality),
  };

  geocodeCache.set(cacheKey, result);
  return result;
}

function selectMostFrequent(countMap, fallback = '') {
  if (!countMap || countMap.size === 0) {
    return fallback;
  }
  let bestKey = fallback;
  let bestCount = 0;
  for (const [key, count] of countMap.entries()) {
    if (!key) continue;
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return bestKey || fallback;
}

async function inferRouteRegion(path, apiKey) {
  if (!apiKey || !Array.isArray(path) || path.length === 0) {
    return { province: '', city: '' };
  }

  const samples = sampleRoutePoints(path, MAX_REGION_SAMPLES);
  if (!samples.length) {
    return { province: '', city: '' };
  }

  const provinceCounts = new Map();
  const cityCounts = new Map();
  let fallbackProvince = '';
  let fallbackCity = '';

  for (const point of samples) {
    try {
      const result = await reverseGeocodePoint(point, apiKey);
      if (!result) continue;
      if (result.province) {
        fallbackProvince = fallbackProvince || result.province;
        provinceCounts.set(result.province, (provinceCounts.get(result.province) || 0) + 1);
      }
      const cityCandidate = result.locality || result.postalTown || result.adminArea || result.sublocality;
      if (cityCandidate) {
        fallbackCity = fallbackCity || cityCandidate;
        cityCounts.set(cityCandidate, (cityCounts.get(cityCandidate) || 0) + 1);
      }
    } catch (error) {
      console.warn('Reverse geocode lookup failed', error);
    }
  }

  return {
    province: sanitizeRegion(selectMostFrequent(provinceCounts, fallbackProvince)),
    city: sanitizeRegion(selectMostFrequent(cityCounts, fallbackCity)),
  };
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

async function handleCreateRoute(req, res) {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, { message: error.message || 'Invalid request payload' }, 400);
    return;
  }

  const basePath = sanitizeCoordinateList(payload.path);
  const snappedPath = sanitizeCoordinateList(payload.snappedPath);
  if (!basePath.length && !snappedPath.length) {
    sendJson(res, { message: 'Route path is required' }, 400);
    return;
  }

  const nextId = routes.reduce((max, route) => Math.max(max, Number(route.routeId) || 0), 0) + 1;
  const sessionInfo = getSession(req);
  const sessionUser = sessionInfo ? sessionInfo.user : null;
  const contributorResult = resolveContributor(payload.addedBy, sessionUser || null);
  if (!contributorResult || contributorResult.error) {
    const message = contributorResult && contributorResult.error
      ? contributorResult.error
      : 'Contributor details must match a registered user.';
    sendJson(res, { message }, 400);
    return;
  }

  const addedBy = contributorResult.addedBy;
  const contributorUser = contributorResult.user;
  const timestamp = new Date().toISOString();

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
    addedBy,
    addedByUserId: contributorUser ? contributorUser.id : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey && route.snappedPath.length) {
    try {
      const region = await inferRouteRegion(route.snappedPath, apiKey);
      if (region.province) {
        route.province = sanitizeRegion(region.province);
      }
      if (region.city) {
        route.city = sanitizeRegion(region.city);
      }
    } catch (error) {
      console.warn('Failed to infer route region', error);
    }
  }

  routes.push(route);
  try {
    await persistRoutes();
    sendJson(res, route, 201);
  } catch (error) {
    console.error('Failed to persist route', error);
    routes = routes.filter(r => r.routeId !== route.routeId);
    sendJson(res, { message: 'Failed to save route' }, 500);
  }
}

async function handleUpdateRoute(req, res, id) {
  const index = routes.findIndex(route => String(route.routeId) === id);
  if (index === -1) {
    sendJson(res, { message: 'Not found' }, 404);
    return;
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, { message: error.message || 'Invalid request payload' }, 400);
    return;
  }

  const target = routes[index];
  const basePath = sanitizeCoordinateList(payload.path !== undefined ? payload.path : target.path);
  const snappedPath = sanitizeCoordinateList(payload.snappedPath !== undefined ? payload.snappedPath : target.snappedPath || basePath);
  const sessionInfo = getSession(req);
  const sessionUser = sessionInfo ? sessionInfo.user : null;
  const addedByProvided = Object.prototype.hasOwnProperty.call(payload, 'addedBy');
  const contributorSource = addedByProvided ? payload.addedBy : target.addedBy;
  let addedBy = target.addedBy || { username: '', name: '', homeTown: '' };
  let addedByUserId = target.addedByUserId || null;

  if (sessionUser || addedByProvided) {
    const contributorResult = resolveContributor(contributorSource, sessionUser || null);
    if (!contributorResult || contributorResult.error) {
      const message = contributorResult && contributorResult.error
        ? contributorResult.error
        : 'Contributor details must match a registered user.';
      sendJson(res, { message }, 400);
      return;
    }
    addedBy = contributorResult.addedBy;
    if (contributorResult.user && contributorResult.user.id !== undefined) {
      addedByUserId = contributorResult.user.id;
    }
  }

  const updatedAt = new Date().toISOString();
  const updatedRoute = {
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
    addedBy,
    addedByUserId,
    updatedAt,
  };

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const pathChanged = Object.prototype.hasOwnProperty.call(payload, 'path')
    || Object.prototype.hasOwnProperty.call(payload, 'snappedPath');
  const missingRegion = !updatedRoute.province || !updatedRoute.city;

  if (apiKey && updatedRoute.snappedPath.length && (pathChanged || missingRegion)) {
    try {
      const region = await inferRouteRegion(updatedRoute.snappedPath, apiKey);
      if (region.province) {
        updatedRoute.province = sanitizeRegion(region.province);
      }
      if (region.city) {
        updatedRoute.city = sanitizeRegion(region.city);
      }
    } catch (error) {
      console.warn('Failed to refresh route region', error);
    }
  }

  routes[index] = updatedRoute;

  try {
    await persistRoutes();
    sendJson(res, routes[index]);
  } catch (error) {
    console.error('Failed to persist updated route', error);
    sendJson(res, { message: 'Failed to update route' }, 500);
  }
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

async function handleUserRegister(req, res) {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, { message: error.message || 'Invalid request payload' }, 400);
    return;
  }

  const username = truncate(ensureString(payload.username).trim(), 80);
  const password = typeof payload.password === 'string' ? payload.password : '';
  const firstName = truncate(ensureString(payload.firstName).trim(), 80);
  const lastName = truncate(ensureString(payload.lastName).trim(), 80);
  const homeTown = truncate(ensureString(payload.homeTown).trim(), 120);
  const rolesInput = Array.isArray(payload.roles)
    ? payload.roles
    : typeof payload.roles === 'string'
    ? payload.roles.split(',')
    : [];
  const roles = Array.from(
    new Set(
      rolesInput
        .map(role => ensureString(role).trim().toLowerCase())
        .filter(role => role && ALLOWED_ROLES.has(role)),
    ),
  ).sort();
  const email = truncate(ensureString(payload.email).trim(), 160);
  const phone = truncate(ensureString(payload.phone).trim(), 60);
  const routesField = truncate(ensureString(payload.routes).trim(), 500);
  const metadata = sanitizeMetadata(payload.metadata);

  if (!username) {
    sendJson(res, { message: 'Username is required.' }, 400);
    return;
  }

  if (username.length < 3) {
    sendJson(res, { message: 'Username must be at least 3 characters long.' }, 400);
    return;
  }

  if (!firstName) {
    sendJson(res, { message: 'First name is required.' }, 400);
    return;
  }

  if (!lastName) {
    sendJson(res, { message: 'Last name is required.' }, 400);
    return;
  }

  if (!homeTown) {
    sendJson(res, { message: 'Home town is required.' }, 400);
    return;
  }

  if (!Array.isArray(roles) || roles.length === 0) {
    sendJson(res, { message: 'Select at least one role from the provided list.' }, 400);
    return;
  }

  if (!password || password.length < 4) {
    sendJson(res, { message: 'Password must be at least 4 characters long.' }, 400);
    return;
  }

  const existing = users.find(
    user => typeof user.username === 'string' && user.username.toLowerCase() === username.toLowerCase(),
  );
  if (existing) {
    sendJson(res, { message: 'That username is already registered.' }, 409);
    return;
  }

  const passwordData = hashPassword(password);
  const now = new Date().toISOString();
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();

  const user = {
    id: getNextUserId(),
    username,
    roles,
    firstName,
    lastName,
    homeTown,
    name: displayName,
    email,
    phone,
    routes: routesField,
    metadata,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    passwordSalt: passwordData.salt,
    passwordHash: passwordData.hash,
    passwordIterations: passwordData.iterations,
    passwordKeyLength: passwordData.keyLength,
    passwordDigest: passwordData.digest,
  };

  users.push(user);
  persistUsers()
    .then(() => {
      const token = createSession(user);
      sendJson(res, { user: sanitizeUserRecord(user), token }, 201);
    })
    .catch(error => {
      console.error('Failed to persist user registration', error);
      users = users.filter(entry => entry.id !== user.id);
      sendJson(res, { message: 'Failed to register user. Please try again.' }, 500);
    });
}

async function handleUserLogin(req, res) {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, { message: error.message || 'Invalid request payload' }, 400);
    return;
  }

  const username = ensureString(payload.username).trim();
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (!username || !password) {
    sendJson(res, { message: 'Provide both username and password.' }, 400);
    return;
  }

  const user = users.find(
    entry => typeof entry.username === 'string' && entry.username.toLowerCase() === username.toLowerCase(),
  );

  if (!user || !verifyPassword(password, user)) {
    sendJson(res, { message: 'Invalid username or password.' }, 401);
    return;
  }

  const now = new Date().toISOString();
  user.lastLoginAt = now;
  user.updatedAt = now;
  persistUsers().catch(error => {
    console.warn('Failed to persist login metadata', error);
  });

  const token = createSession(user);
  sendJson(res, { user: sanitizeUserRecord(user), token });
}

function handleUserSession(req, res) {
  const sessionInfo = getSession(req);
  if (!sessionInfo) {
    sendJson(res, { message: 'Not authenticated' }, 401);
    return;
  }

  sendJson(res, { user: sanitizeUserRecord(sessionInfo.user) });
}

function handleUserLogout(req, res) {
  destroySession(req);
  res.writeHead(204);
  res.end();
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (pathname === '/config' && req.method === 'GET') {
    sendJson(res, { mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
    return;
  }

  if (pathname === '/api/users/register' && req.method === 'POST') {
    handleUserRegister(req, res);
    return;
  }

  if (pathname === '/api/users/login' && req.method === 'POST') {
    handleUserLogin(req, res);
    return;
  }

  if (pathname === '/api/users/session' && req.method === 'GET') {
    handleUserSession(req, res);
    return;
  }

  if (pathname === '/api/users/logout' && req.method === 'POST') {
    handleUserLogout(req, res);
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

  const relativePath = pathname === '/' ? 'route-finder.html' : pathname;
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
