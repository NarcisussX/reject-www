const REQUIRED_TABLES = ['systems', 'structures'];

const EXPECTED_COLUMNS = {
  systems: [
    'id', 'jcode', 'ransom_isk', 'notes', 'evicted', 'ransomed', 'created_at', 'updated_at'
  ],
  structures: [
    'id', 'system_id', 'kind', 'fit_text', 'estimated_value_isk'
  ],
};

function tableList(db) {
  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all();
  return rows.map(r => r.name);
}

function columnsFor(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
}

export function inspectDb(db) {
  const presentTables = tableList(db);

  const missingTables = REQUIRED_TABLES.filter(t => !presentTables.includes(t));
  const missingColumns = {};

  for (const t of REQUIRED_TABLES) {
    if (!presentTables.includes(t)) continue;
    const cols = columnsFor(db, t);
    const expected = EXPECTED_COLUMNS[t];
    const miss = expected.filter(c => !cols.includes(c));
    if (miss.length) missingColumns[t] = miss;
  }

  const ok = missingTables.length === 0 && Object.keys(missingColumns).length === 0;

  return {
    ok,
    presentTables,
    missingTables,
    missingColumns,
  };
}

export function createIfEmpty(db, { allowCreate = false } = {}) {
  if (!allowCreate) return { created: false, reason: 'not-allowed' };

  const present = tableList(db);
  const anyRequiredPresent = REQUIRED_TABLES.some(t => present.includes(t));
  if (anyRequiredPresent) return { created: false, reason: 'already-initialized' };

  db.exec(`
    CREATE TABLE IF NOT EXISTS systems (
      id INTEGER PRIMARY KEY,
      jcode TEXT UNIQUE NOT NULL,
      ransom_isk INTEGER NOT NULL,
      notes TEXT DEFAULT '',
      evicted INTEGER NOT NULL DEFAULT 0,
      ransomed INTEGER NOT NULL DEFAULT 0,
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

    CREATE INDEX IF NOT EXISTS idx_systems_jcode ON systems(jcode);
    CREATE INDEX IF NOT EXISTS idx_structures_system_id ON structures(system_id);
  `);

  return { created: true };
}

export function logSchemaReport(report) {
  if (report.ok) {
    console.log('[db] schema OK; tables:', report.presentTables.join(', '));
    return;
  }
  if (report.missingTables.length) {
    console.warn('[db] missing tables:', report.missingTables.join(', '));
  }
  for (const [t, cols] of Object.entries(report.missingColumns)) {
    console.warn(`[db] table "${t}" missing columns: ${cols.join(', ')}`);
  }
  console.warn('[db] (No changes were made. This module is read-only by default.)');
}
