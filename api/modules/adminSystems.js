import express from 'express';
import requireAdmin from '../middleware/requireAdmin.js';

export default function adminSystemsRouter({ db, parseISK }) {
  const r = express.Router();

  // POST upsert system
  r.post('/systems', requireAdmin, (req, res) => {
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

  // GET one
  r.get('/systems/:jcode', requireAdmin, (req, res) => {
    const J = String(req.params.jcode || '').toUpperCase();
    const sys = db.prepare(
      'SELECT id, jcode, ransom_isk AS ransomISK, COALESCE(notes, \'\') AS notes FROM systems WHERE jcode = ?'
    ).get(J);
    if (!sys) return res.sendStatus(404);

    const structures = db.prepare(
      'SELECT kind, fit_text AS fitText, estimated_value_isk AS estimatedISK FROM structures WHERE system_id = ?'
    ).all(sys.id);

    const totalStructuresISK = structures.reduce((a, s) => a + (Number(s.estimatedISK) || 0), 0);
    res.json({ jcode: sys.jcode, ransomISK: Number(sys.ransomISK), notes: sys.notes || '', totalStructuresISK, structures });
  });

  // PUT update
  r.put('/systems/:jcode', requireAdmin, (req, res) => {
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

  // DELETE
  r.delete('/systems/:jcode', requireAdmin, (req, res) => {
    const J = (req.params.jcode || '').toUpperCase();
    const r2 = db.prepare('DELETE FROM systems WHERE jcode = ?').run(J);
    if (!r2.changes) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // LIST 
  r.get('/systems', requireAdmin, (req, res) => {
    const search = (req.query.search || '').toString().trim().toUpperCase();
    const like = `%${search}%`;
    const rows = search
      ? db.prepare(`
          SELECT s.jcode, s.evicted AS evicted, s.ransomed AS ransomed,
                 s.ransom_isk AS ransomISK, s.created_at, s.updated_at,
                 COUNT(t.id) AS structuresCount,
                 COALESCE(SUM(t.estimated_value_isk), 0) AS totalStructuresISK
          FROM systems s
          LEFT JOIN structures t ON t.system_id = s.id
          WHERE s.jcode LIKE ?
          GROUP BY s.id
          ORDER BY s.updated_at DESC, s.created_at DESC
        `).all(like)
      : db.prepare(`
          SELECT s.jcode, s.evicted AS evicted, s.ransomed AS ransomed,
                 s.ransom_isk AS ransomISK, s.created_at, s.updated_at,
                 COUNT(t.id) AS structuresCount,
                 COALESCE(SUM(t.estimated_value_isk), 0) AS totalStructuresISK
          FROM systems s
          LEFT JOIN structures t ON t.system_id = s.id
          GROUP BY s.id
          ORDER BY s.updated_at DESC, s.created_at DESC
        `).all();

    res.json(rows.map(r => ({
      jcode: r.jcode,
      ransomISK: Number(r.ransomISK) || 0,
      structuresCount: Number(r.structuresCount) || 0,
      totalStructuresISK: Number(r.totalStructuresISK) || 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
      evicted: !!Number(r.evicted),
      ransomed: !!Number(r.ransomed),
    })));
  });

  // Flags (patch)
  r.patch('/systems/:jcode/evicted', requireAdmin, (req, res) => {
    const J = String(req.params.jcode || '').toUpperCase();
    const next = req.body && (req.body.evicted ? 1 : 0);
    const r2 = db.prepare('UPDATE systems SET evicted = ?, updated_at = CURRENT_TIMESTAMP WHERE jcode = ?').run(next, J);
    if (r2.changes === 0) return res.sendStatus(404);
    res.sendStatus(204);
  });

  r.patch('/systems/:jcode/ransomed', requireAdmin, (req, res) => {
    const J = String(req.params.jcode || '').toUpperCase();
    const next = req.body && (req.body.ransomed ? 1 : 0);
    const r2 = db.prepare('UPDATE systems SET ransomed = ?, updated_at = CURRENT_TIMESTAMP WHERE jcode = ?').run(next, J);
    if (r2.changes === 0) return res.sendStatus(404);
    res.sendStatus(204);
  });

  return r;
}
