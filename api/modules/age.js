import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

let AGE_IDS = [];
let AGE_EPOCHS = [];
let LOADED = false;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function loadAgeCSV(p) {
  const text = fs.readFileSync(p, 'utf8').trim();
  const lines = text.split(/\r?\n/);
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

function bsearchBigInt(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo; // insertion index
}

function estimateAgeRange(structIdBigInt) {
  if (!AGE_IDS.length) return null;

  const i = bsearchBigInt(AGE_IDS, structIdBigInt);

  if (i < AGE_IDS.length && AGE_IDS[i] === structIdBigInt) {
    const ts = AGE_EPOCHS[i];
    const padDays = 3;
    const low = ts - padDays * 86400;
    const high = ts + padDays * 86400;
    return { method: 'exact', ts, low, high };
  }

  const hasLo = i > 0;
  const hasHi = i < AGE_IDS.length;
  if (!hasLo && !hasHi) return null;

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

  const loId = AGE_IDS[i - 1], hiId = AGE_IDS[i];
  const loTs = AGE_EPOCHS[i - 1], hiTs = AGE_EPOCHS[i];

  const did = Number(hiId - loId);
  const alpha = did ? Number(structIdBigInt - loId) / did : 0.5;
  const ts = Math.round(loTs + alpha * (hiTs - loTs));

  const gap = Math.abs(hiTs - loTs);
  const half = Math.round(gap * 0.25);
  const pad = clamp(half, 2 * 86400, 7 * 86400);
  return { method: 'interpolate', ts, low: ts - pad, high: ts + pad };
}

function ensureLoaded(csvPath) {
  if (LOADED) return;
  const p = csvPath || process.env.A4E_AGE_CSV || path.join(process.cwd(), 'data', 'a4e_first_seen_monotone.csv');
  try {
    loadAgeCSV(p);
  } catch (e) {
    console.warn(`[age] Failed to load ${p}: ${e.message}`);
  }
  LOADED = true;
}

export function createAgeRouter(opts = {}) {
  ensureLoaded(opts.csvPath);

  const r = express.Router();

  r.get('/age/:id', (req, res) => {
    const raw = (req.params.id || '').trim();
    if (!/^\d{10,}$/.test(raw)) return res.status(400).json({ error: 'Invalid structure ID' });

    if (!AGE_IDS.length) return res.status(503).json({ error: 'Age index not loaded' });

    const rnge = estimateAgeRange(BigInt(raw));
    if (!rnge) return res.status(404).json({ error: 'Not estimable' });

    const toISO = s => new Date(s * 1000).toISOString();
    return res.json({
      id: raw,
      method: rnge.method,
      midISO: toISO(rnge.ts),
      lowISO: toISO(rnge.low),
      highISO: toISO(rnge.high),
      // keep stringified fixed(1) width 
      daysWide: ((rnge.high - rnge.low) / 86400).toFixed(1)
    });
  });

  return r;
}

export function reloadAgeIndex(csvPath) {
  loadAgeCSV(csvPath || process.env.A4E_AGE_CSV || path.join(process.cwd(), 'data', 'a4e_first_seen_monotone.csv'));
  LOADED = true;
}
