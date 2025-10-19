try { await import('dotenv/config'); } catch { }

import express from 'express';
import helmet from 'helmet';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import fetch from 'node-fetch';

// ---- Express app & middleware ----
const app = express();
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// ---- DB init ----
const DB_PATH = process.env.DB_PATH || '/data/reject.db';
const db = new Database(DB_PATH);

// ---- DB init ----
db.exec(`
CREATE TABLE IF NOT EXISTS systems (
  id INTEGER PRIMARY KEY,
  jcode TEXT UNIQUE NOT NULL,
  ransom_isk INTEGER NOT NULL,
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS structures (
  id INTEGER PRIMARY KEY,
  system_id INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  fit_text TEXT NOT NULL,
  estimated_value_isk INTEGER NOT NULL
);
`);

try {
  const cols = db.prepare(`PRAGMA table_info(systems)`).all().map(c => c.name);
  if (!cols.includes('notes')) db.exec(`ALTER TABLE systems ADD COLUMN notes TEXT DEFAULT ''`);
} catch { }

try {
  const cols = db.prepare(`PRAGMA table_info(systems)`).all().map(c => c.name);
  if (!cols.includes('evicted')) {
    db.exec(`ALTER TABLE systems ADD COLUMN evicted INTEGER NOT NULL DEFAULT 0`);
  }
} catch { }
try {
  const cols = db.prepare(`PRAGMA table_info(systems)`).all().map(c => c.name);
  if (!cols.includes('ransomed')) {
    db.exec(`ALTER TABLE systems ADD COLUMN ransomed INTEGER NOT NULL DEFAULT 0`);
  }
} catch {}

// -------- Watchlist storage --------
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const WATCHLIST_PATH = path.join(DATA_DIR, 'watchlist.json');
const SEEN_CORPS_PATH = path.join(DATA_DIR, 'watchlist_seen_corps.json'); // { [J]: { [corpId]: true } }

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function getWatchlist() {
  return readJSON(WATCHLIST_PATH, []); // [{ jcode, systemId, addedAt }]
}
function setWatchlist(list) {
  writeJSON(WATCHLIST_PATH, list);
}
function getSeenCorps() {
  return readJSON(SEEN_CORPS_PATH, {}); // { JCODE: { '12345': true, ... } }
}
function setSeenCorps(map) {
  writeJSON(SEEN_CORPS_PATH, map);
}

// --- ESI + zKill helpers ---
async function resolveSystemId(jcode) {
  const m = String(jcode || "").toUpperCase().match(/J\d{6}/);
  if (!m) return null;
  const J = m[0];

  try {
    // Preferred: POST /universe/ids (ESI returns { systems: [...] })
    let r = await fetch(
      "https://esi.evetech.net/latest/universe/ids/?datasource=tranquility",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify([J]),
      }
    );
    if (r.ok) {
      const d = await r.json();
      const arr = d.systems || d.solar_systems || []; // some libs used the old key
      const hit = arr.find(s => String(s.name).toUpperCase() === J);
      if (hit?.id) return hit.id;
    }

    // Fallback: strict search
    const qs = new URLSearchParams({
      categories: "solar_system",
      search: J,
      strict: "true",
      datasource: "tranquility",
    }).toString();
    r = await fetch(`https://esi.evetech.net/latest/search/?${qs}`);
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j?.solar_system) && j.solar_system.length) return j.solar_system[0];
    }
  } catch {
    // ignore
  }
  return null;
}


const zkill = (parts) => `https://zkillboard.com/api/${parts.join('/')}/`;

async function killsLast24h(systemId) {
  const r = await fetch(zkill([`solarSystemID`, String(systemId), `pastSeconds`, `86400`]));
  if (!r.ok) return { count: 0, rows: [] };
  const rows = await r.json();
  return { count: rows.length, rows };
}

// Fetch detailed killmails (victim + attackers) to learn corp IDs.
// We keep it modestly parallel; last 24h in WH space is usually small.
async function expandKillmail(k) {
  try {
    const esi = `https://esi.evetech.net/latest/killmails/${k.killmail_id}/${k.zkb.hash}/`;
    const r = await fetch(esi);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function codeHeat(value) { // simple 3-shade block for discord code blocks
  if (value <= 0) return '·';
  if (value <= 2) return '░';
  if (value <= 5) return '▒';
  return '▓';
}

// Render a tiny 7×24 ascii heatmap text (Sun..Sat rows).
function toAsciiHeatmap(activityMatrix /* number[7][24] */) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const lines = ['Killboard activity (UTC)'];
  for (let d = 0; d < 7; d++) {
    let row = days[d].padEnd(3, ' ') + ' ';
    for (let h = 0; h < 24; h++) row += codeHeat(activityMatrix[d]?.[h] || 0);
    lines.push(row);
  }
  return '```\n' + lines.join('\n') + '\n```';
}

async function discordWebhook(payload) {
  const url = process.env.WATCHLIST_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}


function formatISKShort(n) {
  const x = Number(n || 0);
  if (x >= 1e9) return (x / 1e9).toFixed(2).replace(/\.00$/, '') + 'b';
  if (x >= 1e6) return (x / 1e6).toFixed(2).replace(/\.00$/, '') + 'm';
  if (x >= 1e3) return (x / 1e3).toFixed(2).replace(/\.00$/, '') + 'k';
  return x.toLocaleString();
}

function parseISK(x) {
  if (typeof x === 'number' && isFinite(x)) return Math.round(x);
  const s = String(x ?? '').trim().toLowerCase().replace(/[, _]/g, '');
  if (!s) return 0;
  const m = s.match(/^(\d+(?:\.\d+)?)([kmb])?$/); 
  let n;
  if (m) {
    n = parseFloat(m[1]);
    const suf = m[2];
    if (suf === 'k') n *= 1e3;
    if (suf === 'm') n *= 1e6;
    if (suf === 'b') n *= 1e9;
  } else {
    n = Number(s); 
  }
  if (!isFinite(n)) return 0;
  return Math.round(n);
}

function getSystemRow(jcode) {
  return db.prepare('SELECT * FROM systems WHERE jcode = ?').get(jcode);
}

function getSystem(jcode) {
  const sys = getSystemRow(jcode);
  if (!sys) return null;
  const rows = db.prepare(
    'SELECT kind, fit_text AS fitText, estimated_value_isk AS estimatedISK FROM structures WHERE system_id = ?'
  ).all(sys.id);
  const totalStructuresISK = rows.reduce((a, r) => a + parseISK(r.estimatedISK), 0);
  return {
    jcode: sys.jcode,
    ransomISK: parseISK(sys.ransom_isk),
    totalStructuresISK,
    structures: rows,
    pilot: 'Leshak Pilot 1',
    notes: sys.notes || '',
    evicted: !!sys.evicted,
    ransomed: !!Number(sys.ransomed),
  };
}

// ---- Public endpoints ----
app.get('/lookup/:jcode', (req, res) => {
  const j = (req.params.jcode || '').trim().toUpperCase();
  if (!/^J\d{6}$/.test(j)) return res.status(400).json({ error: 'Invalid J-code' });
  const data = getSystem(j);
  if (!data) return res.sendStatus(404);
  res.json(data);
});

// /contact → send a rich Discord embed
app.post('/contact', async (req, res) => {
  const { jcode, ign, message } = req.body || {};
  if (!jcode || !ign || !message) return res.status(400).json({ error: 'Missing fields' });
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return res.status(500).json({ error: 'Webhook not configured' });

  const J = String(jcode).toUpperCase();
  const sys = getSystem(J); // may be null if not in DB

  const embed = {
    title: "Negotiation Request",
    color: 0x00ff66,
    fields: [
      { name: "J-Code", value: J, inline: true },
      { name: "Pilot", value: ign, inline: true },
      { name: "Quoted Amount", value: sys ? `${formatISKShort(sys.ransomISK)} ISK` : "N/A", inline: true },
    ],
    description: message,
    timestamp: new Date().toISOString(),
  };

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SALT MINER WOOOO', embeds: [embed] }),
    });
    if (!r.ok) throw new Error(`Webhook ${r.status}`);
    res.sendStatus(204);
  } catch {
    res.status(502).json({ error: 'Webhook failed' });
  }
});


// ---- Admin auth ----
function requireAdmin(req, res, next) {
  const hdr = req.headers.authorization || '';
  if (!hdr.startsWith('Basic '))
    return res.set('WWW-Authenticate', 'Basic realm="admin"').status(401).end();
  const [user, pass] = Buffer.from(hdr.slice(6), 'base64').toString().split(':');
  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) return next();
  return res.status(403).end();
}

// ---- Admin CRUD ----
// POST upsert: include notes
app.post('/admin/systems', requireAdmin, (req, res) => {
  const { jcode, ransomISK, structures, notes = '' } = req.body || {};
  const J = (jcode || '').toUpperCase();
  if (!/^J\d{6}$/.test(J)) return res.status(400).json({ error: 'Invalid J-code' });

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO systems (jcode, ransom_isk, notes)
      VALUES (?, ?, ?)
      ON CONFLICT(jcode) DO UPDATE SET
        ransom_isk = excluded.ransom_isk,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `).run(J, parseISK(ransomISK), String(notes));

    const { id } = db.prepare('SELECT id FROM systems WHERE jcode = ?').get(J);
    db.prepare('DELETE FROM structures WHERE system_id = ?').run(id);
    const ins = db.prepare(
      'INSERT INTO structures (system_id, kind, fit_text, estimated_value_isk) VALUES (?,?,?,?)'
    );
    for (const s of structures || []) ins.run(id, s.kind, s.fitText, parseISK(s.estimatedISK));
  });

  try { tx(); res.sendStatus(201); } catch { res.status(500).json({ error: 'Upsert failed' }); }
});


// GET one system for Admin (requires basic auth)
app.get('/admin/systems/:jcode', requireAdmin, (req, res) => {
  const J = String(req.params.jcode || '').toUpperCase();

  // Pull the system and its structures
  const sys = db.prepare(
    'SELECT id, jcode, ransom_isk AS ransomISK, COALESCE(notes, \'\') AS notes FROM systems WHERE jcode = ?'
  ).get(J);

  if (!sys) return res.sendStatus(404);

  const structures = db.prepare(
    'SELECT kind, fit_text AS fitText, estimated_value_isk AS estimatedISK FROM structures WHERE system_id = ?'
  ).all(sys.id);

  const totalStructuresISK = structures.reduce((a, s) => a + (Number(s.estimatedISK) || 0), 0);

  // Shape the JSON exactly how the Admin editor expects
  res.json({
    jcode: sys.jcode,
    ransomISK: Number(sys.ransomISK),
    notes: sys.notes || '',
    totalStructuresISK,
    structures
  });
});

// PUT update: include notes
app.put('/admin/systems/:jcode', requireAdmin, (req, res) => {
  const J = (req.params.jcode || '').toUpperCase();
  const { ransomISK, structures, notes = '' } = req.body || {};
  const sys = db.prepare('SELECT id FROM systems WHERE jcode = ?').get(J);
  if (!sys) return res.sendStatus(404);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE systems
      SET ransom_isk = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(parseISK(ransomISK), String(notes), sys.id);

    db.prepare('DELETE FROM structures WHERE system_id = ?').run(sys.id);
    const ins = db.prepare(
      'INSERT INTO structures (system_id, kind, fit_text, estimated_value_isk) VALUES (?,?,?,?)'
    );
    for (const s of structures || []) ins.run(sys.id, s.kind, s.fitText, parseISK(s.estimatedISK));
  });

  try { tx(); res.sendStatus(204); } catch { res.status(500).json({ error: 'Update failed' }); }
});


app.delete('/admin/systems/:jcode', requireAdmin, (req, res) => {
  const J = (req.params.jcode || '').toUpperCase();
  const r = db.prepare('DELETE FROM systems WHERE jcode = ?').run(J);
  if (!r.changes) return res.sendStatus(404);
  res.sendStatus(204);
});

// GET /api/admin/systems?search=J12 
app.get('/admin/systems', requireAdmin, (req, res) => {
  const search = (req.query.search || '').toString().trim().toUpperCase();
  const like = `%${search}%`;

  const rows = search
    ? db.prepare(`
        SELECT s.jcode,
               s.evicted AS evicted,
               s.ransomed AS ransomed,
               s.ransom_isk AS ransomISK,
               s.created_at,
               s.updated_at,
               COUNT(t.id) AS structuresCount,
               COALESCE(SUM(t.estimated_value_isk), 0) AS totalStructuresISK
        FROM systems s
        LEFT JOIN structures t ON t.system_id = s.id
        WHERE s.jcode LIKE ?
        GROUP BY s.id
        ORDER BY s.updated_at DESC, s.created_at DESC
      `).all(like)
    : db.prepare(`
        SELECT s.jcode,
               s.evicted AS evicted,
               s.ransomed AS ransomed,
               s.ransom_isk AS ransomISK,
               s.created_at,
               s.updated_at,
               COUNT(t.id) AS structuresCount,
               COALESCE(SUM(t.estimated_value_isk), 0) AS totalStructuresISK
        FROM systems s
        LEFT JOIN structures t ON t.system_id = s.id
        GROUP BY s.id
        ORDER BY s.updated_at DESC, s.created_at DESC
      `).all();

  res.json(
    rows.map(r => ({
      jcode: r.jcode,
      ransomISK: Number(r.ransomISK) || 0,
      structuresCount: Number(r.structuresCount) || 0,
      totalStructuresISK: Number(r.totalStructuresISK) || 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
      evicted: !!Number(r.evicted),    
      ransomed: !!Number(r.ransomed), 
    }))
  );
});

app.patch('/admin/systems/:jcode/evicted', requireAdmin, (req, res) => {
  const J = String(req.params.jcode || '').toUpperCase();
  const next = req.body && (req.body.evicted ? 1 : 0);
  const r = db.prepare('UPDATE systems SET evicted = ?, updated_at = CURRENT_TIMESTAMP WHERE jcode = ?').run(next, J);
  if (r.changes === 0) return res.sendStatus(404);
  res.sendStatus(204);
});
// PATCH /api/admin/systems/:jcode/ransomed  { ransomed: true|false }
app.patch('/admin/systems/:jcode/ransomed', requireAdmin, (req, res) => {
  const J = String(req.params.jcode || '').toUpperCase();
  const next = req.body && (req.body.ransomed ? 1 : 0);
  const r = db.prepare(
    'UPDATE systems SET ransomed = ?, updated_at = CURRENT_TIMESTAMP WHERE jcode = ?'
  ).run(next, J);
  if (r.changes === 0) return res.sendStatus(404);
  res.sendStatus(204);
});

// ==== Structure Age Index (load once, then answer in O(log N)) ====
import fs from 'fs';
import path from 'path';

// CONFIG
const AGE_CSV_PATH = process.env.A4E_AGE_CSV || path.join(process.cwd(), 'data', 'a4e_first_seen_monotone.csv');

let AGE_IDS = [];      
let AGE_EPOCHS = [];   

// CSV reader
function loadAgeCSV(p) {
  const text = fs.readFileSync(p, 'utf8').trim();
  const lines = text.split(/\r?\n/);
  // detect header
  const start = /^\d+$/.test(lines[0]?.split(',')[0]) ? 0 : 1;
  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const [idStr, iso] = lines[i].split(',');
    if (!idStr || !iso) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    rows.push({ id: BigInt(idStr.trim()), ts: Math.floor(t / 1000) });
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  AGE_IDS = rows.map(r => r.id);
  AGE_EPOCHS = rows.map(r => r.ts);
  console.log(`[age] Loaded ${rows.length} rows from ${p}`);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Binary search
function bsearchBigInt(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo; // insertion index
}

// Core estimation
function estimateAgeRange(structIdBigInt) {
  if (!AGE_IDS.length) return null;

  const i = bsearchBigInt(AGE_IDS, structIdBigInt);

  // Exact hit
  if (i < AGE_IDS.length && AGE_IDS[i] === structIdBigInt) {
    const ts = AGE_EPOCHS[i];
    // Narrow range on exact point; if neighboring points equal, pad a few days
    const padDays = 3;
    const low = ts - padDays * 86400;
    const high = ts + padDays * 86400;
    return { method: 'exact', ts, low, high };
  }

  // Determine bracketing points
  const hasLo = i > 0;
  const hasHi = i < AGE_IDS.length;
  if (!hasLo && !hasHi) return null;

  // If only one neighbor, extrapolate with average global slope
  if (!hasLo || !hasHi) {
    const aIdx = hasLo ? AGE_IDS.length - 2 : 0;
    const bIdx = hasLo ? AGE_IDS.length - 1 : 1;
    const did = Number(AGE_IDS[bIdx] - AGE_IDS[aIdx]);
    const dts = AGE_EPOCHS[bIdx] - AGE_EPOCHS[aIdx];
    const slope = did ? (dts / did) : 0; 
    const base = hasLo ? AGE_EPOCHS[bIdx] : AGE_EPOCHS[aIdx];
    const off = Number(structIdBigInt - (hasLo ? AGE_IDS[bIdx] : AGE_IDS[aIdx]));
    const ts = Math.round(base + slope * off);
    const pad = 7 * 86400; 
    return { method: hasLo ? 'extrapolate-tail' : 'extrapolate-head', ts, low: ts - pad, high: ts + pad };
  }

  // Interpolate between neighbors
  const loId = AGE_IDS[i - 1], hiId = AGE_IDS[i];
  const loTs = AGE_EPOCHS[i - 1], hiTs = AGE_EPOCHS[i];

  const did = Number(hiId - loId);
  const alpha = did ? Number(structIdBigInt - loId) / did : 0.5;
  const ts = Math.round(loTs + alpha * (hiTs - loTs));

  // Uncertainty heuristic:
  const gap = Math.abs(hiTs - loTs);
  const half = Math.round(gap * 0.25);             
  const pad = clamp(half, 2 * 86400, 7 * 86400);    
  return { method: 'interpolate', ts, low: ts - pad, high: ts + pad };
}

// Load at startup
try {
  loadAgeCSV(AGE_CSV_PATH);
} catch (e) {
  console.warn(`[age] Failed to load ${AGE_CSV_PATH}: ${e.message}`);
}

// API: GET /age/:id → { id, method, midISO, lowISO, highISO, daysWide }
app.get('/age/:id', (req, res) => {
  const raw = (req.params.id || '').trim();
  if (!/^\d{10,}$/.test(raw)) return res.status(400).json({ error: 'Invalid structure ID' });

  if (!AGE_IDS.length) return res.status(503).json({ error: 'Age index not loaded' });

  const r = estimateAgeRange(BigInt(raw));
  if (!r) return res.status(404).json({ error: 'Not estimable' });

  const toISO = s => new Date(s * 1000).toISOString();
  res.json({
    id: raw,
    method: r.method,
    midISO: toISO(r.ts),
    lowISO: toISO(r.low),
    highISO: toISO(r.high),
    daysWide: ((r.high - r.low) / 86400).toFixed(1)
  });
});

// --- Corp name -> corp ID via ESI search (cached) ---
const corpCache = new Map(); 

app.get(["/api/corp-id", "/corp-id"], async (req, res) => {
  const name = String(req.query.name || "").trim();
  if (!name) return res.status(400).json({ error: "missing name" });

  const key = name.toLowerCase();
  if (corpCache.has(key)) {
    return res.json({ name, id: corpCache.get(key), cached: true });
  }

  try {
    // Prefer exact resolver
    let id = null;
    const idsRes = await fetch(
      "https://esi.evetech.net/latest/universe/ids/?datasource=tranquility",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify([name]),
      }
    );
    if (idsRes.ok) {
      const j = await idsRes.json();
      if (Array.isArray(j?.corporations) && j.corporations.length) {
        id = j.corporations[0].id;
      }
    }

    // Fallback: search API
    if (!id) {
      const strict = new URLSearchParams({
        categories: "corporation",
        datasource: "tranquility",
        search: name,
        strict: "true",
      }).toString();
      let r = await fetch(`https://esi.evetech.net/latest/search/?${strict}`);
      let j = await r.json();
      if (Array.isArray(j?.corporation) && j.corporation.length) {
        id = j.corporation[0];
      } else {
        const loose = new URLSearchParams({
          categories: "corporation",
          datasource: "tranquility",
          search: name,
          strict: "false",
        }).toString();
        r = await fetch(`https://esi.evetech.net/latest/search/?${loose}`);
        j = await r.json();
        if (Array.isArray(j?.corporation) && j.corporation.length) {
          id = j.corporation[0];
        }
      }
    }

    if (!id) return res.status(404).json({ name, id: null });

    corpCache.set(key, id);
    res.json({ name, id });
  } catch (e) {
    res.status(502).json({ error: "esi lookup failed" });
  }
});

// ---- System intel: J-code → systemId, killboard summary, zKill heatmap ----
import dayjs from "dayjs";

async function fetchJSON(url, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: {
      "Accept": "application/json",
      "User-Agent": "RejectIntel/1.0 (+reject.app)", // be polite to zKill/ESI
      ...(init.headers || {})
    }
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// Resolve J-code to systemId
const systemCache = new Map(); 

app.get(["/api/system-id/:jcode", "/system-id/:jcode"], async (req, res) => {
  const raw = String(req.params.jcode || "").toUpperCase();
  const m = raw.match(/J\d{6}/);
  if (!m) return res.status(400).json({ error: "bad jcode" });
  const j = m[0];

  if (systemCache.has(j)) return res.json({ jcode: j, id: systemCache.get(j), cached: true });

  try {
    // Preferred: POST /universe/ids
    const idsResp = await fetch(
      "https://esi.evetech.net/latest/universe/ids/?datasource=tranquility",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify([j]),
      }
    );

    if (idsResp.ok) {
      const d = await idsResp.json();
      const arr = (d.systems || d.solar_systems || []); // <-- ESI uses "systems"
      const hit = arr.find((s) => String(s.name).toUpperCase() === j);
      if (hit?.id) {
        systemCache.set(j, hit.id);
        return res.json({ jcode: j, id: hit.id, name: hit.name });
      }
    }

    // Fallback: GET /search?categories=solar_system
    const qs = new URLSearchParams({
      categories: "solar_system",
      datasource: "tranquility",
      search: j,
      strict: "true",
    }).toString();
    const sResp = await fetch(`https://esi.evetech.net/latest/search/?${qs}`, {
      headers: { Accept: "application/json" },
    });
    if (sResp.ok) {
      const sj = await sResp.json();
      const id = Array.isArray(sj?.solar_system) && sj.solar_system.length ? sj.solar_system[0] : null;
      if (id) {
        systemCache.set(j, id);
        return res.json({ jcode: j, id });
      }
    }

    return res.status(404).json({ jcode: j, id: null });
  } catch (e) {
    return res.status(502).json({ error: "esi resolve failed" });
  }
});


// Killboard summary (mirrors your tiff.tools util)
app.get(["/api/killboard-summary/:systemId", "/killboard-summary/:systemId"], async (req, res) => {
  try {
    const systemId = String(req.params.systemId);
    const MAX_AGE_DAYS = 60;
    const BATCH_SIZE = 20;
    const now = dayjs();

    // zKill list of killmails for this system
    const killmails = await fetchJSON(`https://zkillboard.com/api/solarSystemID/${systemId}/`);

    // caches + accumulators
    const corpNameCache = new Map();
    async function corpName(id) {
      if (corpNameCache.has(id)) return corpNameCache.get(id);
      try {
        const j = await fetchJSON(`https://esi.evetech.net/latest/corporations/${id}/?datasource=tranquility`);
        corpNameCache.set(id, j.name || "Unknown Corp");
      } catch { corpNameCache.set(id, "Unknown Corp"); }
      return corpNameCache.get(id);
    }

    const corpActivity = new Map(); 
    let totalKills = 0;
    let mostRecent = null;
    let oldest = null;

    // Pull batches of detailed killmails from ESI
    for (let i = 0; i < killmails.length; i += BATCH_SIZE) {
      const batch = killmails.slice(i, i + BATCH_SIZE);
      const details = await Promise.allSettled(
        batch.map(k => fetchJSON(`https://esi.evetech.net/latest/killmails/${k.killmail_id}/${k.zkb.hash}/?datasource=tranquility`))
      );

      for (const r of details) {
        if (r.status !== "fulfilled") continue;
        const kill = r.value;
        if (!kill?.killmail_time) continue;

        const t = dayjs(kill.killmail_time);
        mostRecent = !mostRecent || t.isAfter(mostRecent) ? t : mostRecent;
        oldest     = !oldest     || t.isBefore(oldest)    ? t : oldest;

        const age = now.diff(t, "day");
        if (age > MAX_AGE_DAYS) {
          i = killmails.length; break;
        }

        totalKills++;
        const involved = [kill.victim, ...(kill.attackers || [])];
        for (const ent of involved) {
          const cid = ent.corporation_id;
          if (!cid) continue;
          const id = String(cid);
          const prev = corpActivity.get(id);
          const days = prev?.days || new Set();
          days.add(t.format("YYYY-MM-DD"));
          const lastSeen = Math.min(prev?.lastSeen ?? Infinity, age);
          corpActivity.set(id, { lastSeen, days });
        }
      }
    }

    // summarize 
    const corps = await Promise.all(
      Array.from(corpActivity.entries()).map(async ([id, v]) => ({
        id,
        name: await corpName(id),
        lastSeenDaysAgo: v.lastSeen,
        activeDays: v.days.size
      }))
    );

    res.json({
      systemId,
      totalKills,
      daysCovered: oldest ? now.diff(oldest, "day") : 0,
      mostRecentKillDaysAgo: mostRecent ? now.diff(mostRecent, "day") : null,
      activeCorporations: corps.sort((a,b) => a.lastSeenDaysAgo - b.lastSeenDaysAgo)
    });
  } catch (e) {
    res.status(502).json({ error: "killboard summary failed" });
  }
});

// 3) Proxy zKill heatmap 
app.get(["/api/zkill-activity/:systemId", "/zkill-activity/:systemId"], async (req, res) => {
  try {
    const systemId = String(req.params.systemId);
    const data = await fetchJSON(`https://zkillboard.com/api/stats/solarSystemID/${systemId}/`);
    res.json(data.activity || null);
  } catch (e) {
    res.status(502).json({ error: "zkill stats failed" });
  }
});

// zKill corporation stats -> activity heatmap
app.get(["/api/zkill-corp-activity/:corpId", "/zkill-corp-activity/:corpId"], async (req, res) => {
  try {
    const corpId = String(req.params.corpId);
    const stats = await fetchJSON(`https://zkillboard.com/api/stats/corporationID/${corpId}/`);
    // Return only activity block (days + hour grid)
    res.json(stats?.activity || null);
  } catch (e) {
    res.status(502).json({ error: "zkill corp stats failed" });
  }
});
// ---- Watchlist API ----

// GET list (no auth needed if you prefer, but you can add requireAdmin)
app.get(["/api/watchlist", "/watchlist"], (req, res) => {
  res.json(getWatchlist());
});

// POST add { jcode }
app.post(["/api/watchlist", "/watchlist"], requireAdmin, async (req, res) => {
  const J = String(req.body?.jcode || '').toUpperCase();
  if (!/^J\d{6}$/.test(J)) return res.status(400).json({ error: 'Invalid J-code' });

  let list = getWatchlist();
  if (list.some(x => x.jcode === J)) return res.status(200).json({ ok: true }); // already present

  // resolve system ID
  const systemId = await resolveSystemId(J);
  if (!systemId) return res.status(404).json({ error: 'System not found' });

  const item = { jcode: J, systemId, addedAt: new Date().toISOString() };
  list.push(item);
  setWatchlist(list);

  // quick “intel blurb”: last 61d kills + recent corps (best-effort)
  // re-use your existing summary util if you have it. If not, do a light version here:
  const r = await fetch(zkill(['solarSystemID', String(systemId)]));
  let total = 0, byDay = {}, corps = new Map();
  if (r.ok) {
    const data = await r.json();
    const now = Date.now();
    for (const k of data) {
      const t = new Date(k.killmail_time || k.zkb?.published || 0).getTime();
      if (!t || (now - t) / 86400000 > 61) continue;
      total++;
      const dayKey = new Date(t).toISOString().slice(0,10);
      byDay[dayKey] = (byDay[dayKey] || 0) + 1;
      if (k.victim?.corporation_id) corps.set(k.victim.corporation_id, k.victim.corporation_id);
    }
  }
  const lastKillAgo = Object.keys(byDay).length
    ? Math.round((Date.now() - new Date(Object.keys(byDay).sort().pop()).getTime())/86400000)
    : null;

  const text = [
    `**${J}** added to watchlist`,
    `[zKillboard](https://zkillboard.com/system/${item.systemId}/)`,
    '',
    `**Kills / Recent Kill**`,
    `${total} kills in last 61 days, the last one was ${lastKillAgo ?? 'N/A'} days ago`,
  ].join('\n');

  await discordWebhook({ username: 'Watchlist', content: text });

  res.status(201).json(item);
});

// DELETE /api/watchlist/:jcode
app.delete(["/api/watchlist/:jcode", "/watchlist/:jcode"], requireAdmin, (req, res) => {
  const J = String(req.params.jcode || '').toUpperCase();
  const list = getWatchlist();
  const next = list.filter(x => x.jcode !== J);
  if (next.length === list.length) return res.sendStatus(404);
  setWatchlist(next);
  res.sendStatus(204);
});
// ---- Nightly digest 00:00 UTC ----
cron.schedule('0 0 * * *', async () => {
  const url = process.env.WATCHLIST_WEBHOOK_URL;
  if (!url) return;

  const list = getWatchlist();
  if (!list.length) return;

  const seen = getSeenCorps();

  for (const item of list) {
    try {
      const { count, rows } = await killsLast24h(item.systemId);

      // gather any new corps from detailed killmails
      const detail = await Promise.all(rows.slice(0, 40).map(expandKillmail)); // hard cap to be gentle
      const corps24h = new Set();
      for (const km of detail) {
        if (!km) continue;
        if (km.victim?.corporation_id) corps24h.add(String(km.victim.corporation_id));
        for (const a of km.attackers || []) {
          if (a?.corporation_id) corps24h.add(String(a.corporation_id));
        }
      }

      const seenForJ = seen[item.jcode] || {};
      const newCorps = [...corps24h].filter(cid => !seenForJ[cid]);
      newCorps.forEach(cid => (seenForJ[cid] = true));
      seen[item.jcode] = seenForJ;
      setSeenCorps(seen);

      // optional teeny ascii heatmap from zKill’s 61d feed (coarse)
      let heatmapText = '';
      try {
        const all = await (await fetch(zkill(['solarSystemID', String(item.systemId)]))).json();
        const mat = Array.from({ length: 7 }, () => Array(24).fill(0));
        const now = Date.now();
        for (const k of all) {
          const ts = new Date(k.killmail_time || k.zkb?.published || 0).getTime();
          if (!ts || (now - ts) > 61 * 86400000) continue;
          const d = new Date(ts);
          mat(d.getUTCDay())[d.getUTCHours()]++;
        }
        heatmapText = toAsciiHeatmap(mat);
      } catch {}

      const lines = [
        `**${item.jcode}** — new activity: **${count} kill${count===1?'':'s'}** in the last 24h`,
        `<https://zkillboard.com/system/${item.systemId}/>`,
      ];

      if (newCorps.length) {
        const corpLinks = newCorps.slice(0, 8).map(cid => `New corp: <https://zkillboard.com/corporation/${cid}/>`);
        lines.push('', ...corpLinks);
        if (newCorps.length > 8) lines.push(`…and ${newCorps.length - 8} more`);
      }

      if (heatmapText) lines.push('', heatmapText);

      await discordWebhook({ username: 'Watchlist', content: lines.join('\n') });
    } catch (e) {
      // swallow one system’s failure and continue
    }
  }
}, { timezone: 'UTC' });


// ---- Start server ----
const port = 4000;
app.listen(port, () => console.log(`API listening on ${port}`));
