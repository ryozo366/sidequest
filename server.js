'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const store = require('./lib/store');
const { haversineKm, isValidLat, isValidLng } = require('./lib/geo');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// HTML is always revalidated so deploys show up immediately; assets get an hour.
function cacheControlFor(ext) {
  if (ext === '.html') return 'no-cache';
  if (ext === '.png' || ext === '.svg' || ext === '.ico') return 'public, max-age=86400';
  return 'public, max-age=3600';
}

const CATEGORIES = ['Garden', 'Pets', 'Moving', 'Errands', 'Repairs', 'Tech', 'Other'];
const MAX_TEXT = { title: 120, description: 2000, locationName: 120, postedBy: 60 };

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function cleanText(value, maxLen) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function validateQuestInput(body) {
  const errors = [];
  const quest = {};

  for (const field of ['title', 'description', 'locationName', 'postedBy']) {
    const value = cleanText(body[field], MAX_TEXT[field]);
    if (!value) errors.push(`${field} is required (max ${MAX_TEXT[field]} chars)`);
    else quest[field] = value;
  }

  const pay = body.pay == null || body.pay === '' ? NaN : Number(body.pay);
  if (!Number.isFinite(pay) || pay < 0 || pay > 100000) errors.push('pay must be a number between 0 and 100000');
  else quest.pay = Math.round(pay * 100) / 100;

  const duration = cleanText(body.duration, 60);
  if (!duration) errors.push('duration is required (e.g. "~3 hours")');
  else quest.duration = duration;

  if (body.completeBy == null || body.completeBy === '') {
    quest.completeBy = null;
  } else if (typeof body.completeBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.completeBy)) {
    quest.completeBy = body.completeBy;
  } else {
    errors.push('completeBy must be a YYYY-MM-DD date or empty');
  }

  quest.category = CATEGORIES.includes(body.category) ? body.category : 'Other';

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!isValidLat(lat)) errors.push('lat must be between -90 and 90');
  if (!isValidLng(lng)) errors.push('lng must be between -180 and 180');
  if (errors.length === 0) {
    quest.lat = lat;
    quest.lng = lng;
  }

  return { quest, errors };
}

// GET /api/quests?lat=..&lng=..&radius=<km>&category=..&status=..
function handleListQuests(req, res, url) {
  const params = url.searchParams;
  let quests = store.all().slice();

  const status = params.get('status');
  if (status && status !== 'all') quests = quests.filter((q) => q.status === status);

  const category = params.get('category');
  if (category && category !== 'all') quests = quests.filter((q) => q.category === category);

  const hasLat = params.has('lat');
  const hasLng = params.has('lng');
  if (hasLat !== hasLng) {
    return sendJson(res, 400, { error: 'lat and lng must be provided together' });
  }

  if (hasLat && hasLng) {
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    if (!isValidLat(lat) || !isValidLng(lng)) {
      return sendJson(res, 400, { error: 'invalid lat/lng' });
    }

    quests = quests.map((q) => ({
      ...q,
      distanceKm: Math.round(haversineKm(lat, lng, q.lat, q.lng) * 10) / 10,
    }));

    if (params.has('radius')) {
      const radius = Number(params.get('radius'));
      if (!Number.isFinite(radius) || radius <= 0) {
        return sendJson(res, 400, { error: 'radius must be a positive number of kilometers' });
      }
      quests = quests.filter((q) => q.distanceKm <= radius);
    }

    quests.sort((a, b) => a.distanceKm - b.distanceKm);
  } else if (params.has('radius')) {
    return sendJson(res, 400, { error: 'radius requires lat and lng' });
  }

  sendJson(res, 200, { quests, count: quests.length });
}

async function handleCreateQuest(req, res) {
  const body = await readBody(req);
  const { quest, errors } = validateQuestInput(body);
  if (errors.length) return sendJson(res, 400, { error: 'validation_failed', details: errors });
  sendJson(res, 201, { quest: store.add(quest) });
}

async function handleAcceptQuest(req, res, id) {
  const body = await readBody(req);
  const acceptedBy = cleanText(body.acceptedBy, MAX_TEXT.postedBy) || 'Anonymous adventurer';
  const result = store.accept(id, acceptedBy);
  if (result.error === 'not_found') return sendJson(res, 404, { error: 'quest not found' });
  if (result.error === 'not_open') return sendJson(res, 409, { error: 'quest is no longer open' });
  sendJson(res, 200, { quest: result.quest });
}

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    return sendJson(res, 403, { error: 'forbidden' });
  }
  fs.readFile(filePath, (err, content) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': content.length,
      'Cache-Control': cacheControlFor(ext),
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  try {
    if (pathname === '/api/quests' && req.method === 'GET') {
      return handleListQuests(req, res, url);
    }
    if (pathname === '/api/quests' && req.method === 'POST') {
      return await handleCreateQuest(req, res);
    }
    const acceptMatch = pathname.match(/^\/api\/quests\/([0-9a-f-]{36})\/accept$/);
    if (acceptMatch && req.method === 'POST') {
      return await handleAcceptQuest(req, res, acceptMatch[1]);
    }
    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'unknown endpoint' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'method not allowed' });
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    if (err.message === 'invalid_json') return sendJson(res, 400, { error: 'body must be valid JSON' });
    if (err.message === 'payload_too_large') return sendJson(res, 413, { error: 'payload too large' });
    console.error(err);
    return sendJson(res, 500, { error: 'internal error' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`⚔️  Sidequest board running at http://localhost:${PORT}`);
  });
}

module.exports = { server };
