try { await import('dotenv/config'); } catch { }

import express from 'express';
import helmet from 'helmet';
import Database from 'better-sqlite3';
import path from 'node:path';

import publicRouter from './modules/public.js';
import { inspectDb, createIfEmpty, logSchemaReport } from './modules/dbInit.js';
import { makeSystems } from './services/systems.js';
import createIntelRouter from './modules/intel.js';
import { createAgeRouter } from './modules/age.js';
import adminSystemsRouter from './modules/adminSystems.js';
import { createWatchlistRouter, scheduleWatchlistCron } from './modules/watchlist.js';

// ---- Express app & middleware ----
const app = express();
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// ---- DB init ----
const DB_PATH = process.env.DB_PATH || '/data/reject.db';
const db = new Database(DB_PATH);

const report = inspectDb(db); 
logSchemaReport(report);

if (process.env.DB_BOOTSTRAP_IF_EMPTY === '1') {
  const res = createIfEmpty(db, { allowCreate: true }); 
  console.log('[db] bootstrap:', res);
}

const { formatISKShort, parseISK, getSystem } = makeSystems(db);

app.use(publicRouter({ getSystem, formatISKShort }));
app.use('/admin', adminSystemsRouter({ db, parseISK }));           // Admin CRUD routes
app.use(createWatchlistRouter({ dataDir: process.env.DATA_DIR || '/app/data' })); // Watchlist + _run
app.use(createIntelRouter());
app.use(createAgeRouter({csvPath: path.join(process.cwd(), 'seed', 'a4e_first_seen_monotone.csv')}));

scheduleWatchlistCron({ dataDir: process.env.DATA_DIR || '/app/data', enabled: true });

// ---- Start server ----
const port = 4000;
app.listen(port, () => console.log(`API listening on ${port}`));
