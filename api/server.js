// Load env vars if dotenv is present (optional in prod)
try { await import('dotenv/config'); } catch {}

import express from 'express';
import helmet from 'helmet';
import Database from 'better-sqlite3';

// ---- Express app & middleware ----
const app = express();
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// ---- DB init ----
const DB_PATH = process.env.DB_PATH || '/data/reject.db';
const db = new Database(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS systems (
  id INTEGER PRIMARY KEY,
  jcode TEXT UNIQUE NOT NULL,
  ransom_isk INTEGER NOT NULL,
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

function parseISK(x) {
  if (typeof x === 'number' && isFinite(x)) return Math.round(x);
  const s = String(x ?? '').trim().toLowerCase().replace(/[, _]/g, '');
  if (!s) return 0;
  const m = s.match(/^(\d+(?:\.\d+)?)([kmb])?$/); // 1.2m, 900k, 1b
  let n;
  if (m) {
    n = parseFloat(m[1]);
    const suf = m[2];
    if (suf === 'k') n *= 1e3;
    if (suf === 'm') n *= 1e6;
    if (suf === 'b') n *= 1e9;
  } else {
    n = Number(s); // raw digits like 1200000
  }
  if (!isFinite(n)) return 0;
  return Math.round(n);
}

function getSystem(jcode) {
  const sys = db.prepare('SELECT * FROM systems WHERE jcode = ?').get(jcode);
  if (!sys) return null;
  const rows = db
    .prepare(
      'SELECT kind, fit_text AS fitText, estimated_value_isk AS estimatedISK FROM structures WHERE system_id = ?'
    )
    .all(sys.id);
  const totalStructuresISK = rows.reduce((a, r) => a + parseISK(r.estimatedISK), 0)
  return {
    jcode: sys.jcode,
    ransomISK: parseISK(sys.ransom_isk),
    totalStructuresISK,
    structures: rows,
    pilot: 'Leshak Pilot 1',
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

app.post('/contact', async (req, res) => {
  const { jcode, ign, message } = req.body || {};
  if (!jcode || !ign || !message) return res.status(400).json({ error: 'Missing fields' });
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return res.status(500).json({ error: 'Webhook not configured' });

  const payload = { content: `**Eviction contact**\nJ-code: ${jcode}\nIGN: ${ign}\nMessage: ${message}` };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
app.post('/admin/systems', requireAdmin, (req, res) => {
  const { jcode, ransomISK, structures } = req.body || {};
  const J = (jcode || '').toUpperCase();
  if (!/^J\d{6}$/.test(J)) return res.status(400).json({ error: 'Invalid J-code' });

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO systems (jcode, ransom_isk)
      VALUES (?, ?)
      ON CONFLICT(jcode) DO UPDATE SET
        ransom_isk = excluded.ransom_isk,
        updated_at = CURRENT_TIMESTAMP
    `).run(J, parseISK(ransomISK));

    const { id } = db.prepare('SELECT id FROM systems WHERE jcode = ?').get(J);
    db.prepare('DELETE FROM structures WHERE system_id = ?').run(id);
    const ins = db.prepare(`
      INSERT INTO structures (system_id, kind, fit_text, estimated_value_isk)
      VALUES (?,?,?,?)
    `);
    for (const s of structures || []) {
      ins.run(id, s.kind, s.fitText, parseISK(s.estimatedISK));
    }
  });

  try { tx(); res.sendStatus(201); } catch { res.status(500).json({ error: 'Upsert failed' }); }
});


app.put('/admin/systems/:jcode', requireAdmin, (req, res) => {
  const J = (req.params.jcode || '').toUpperCase();
  const { ransomISK, structures } = req.body || {};
  const sys = db.prepare('SELECT id FROM systems WHERE jcode = ?').get(J);
  if (!sys) return res.sendStatus(404);

  const tx = db.transaction(() => {
    db.prepare('UPDATE systems SET ransom_isk = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(parseISK(ransomISK), sys.id);
    db.prepare('DELETE FROM structures WHERE system_id = ?').run(sys.id);
    const stmt = db.prepare(
      'INSERT INTO structures (system_id, kind, fit_text, estimated_value_isk) VALUES (?,?,?,?)'
    );
    for (const s of structures || [])
      stmt.run(sys.id, s.kind, s.fitText, parseISK(s.estimatedISK));
  });

  try { tx(); res.sendStatus(204); } catch { res.status(500).json({ error: 'Update failed' }); }
});

app.get('/admin/systems/:jcode', requireAdmin, (req, res) => {
  const data = getSystem((req.params.jcode || '').toUpperCase());
  if (!data) return res.sendStatus(404);
  res.json(data);
});

app.delete('/admin/systems/:jcode', requireAdmin, (req, res) => {
  const J = (req.params.jcode || '').toUpperCase();
  const r = db.prepare('DELETE FROM systems WHERE jcode = ?').run(J);
  if (!r.changes) return res.sendStatus(404);
  res.sendStatus(204);
});

// GET /api/admin/systems?search=J12  (optional search)
app.get('/admin/systems', requireAdmin, (req, res) => {
  const search = (req.query.search || '').toString().trim().toUpperCase();
  const like = `%${search}%`;

  const rows = search
    ? db.prepare(`
        SELECT s.jcode,
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

  res.json(rows);
});

// ---- Start server ----
const port = 4000;
app.listen(port, () => console.log(`API listening on ${port}`));
