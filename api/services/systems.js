export function makeSystems(db) {
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
  return { formatISKShort, parseISK, getSystemRow, getSystem };
}
