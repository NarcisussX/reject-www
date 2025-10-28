import fs from 'fs';
import path from 'path';
import express from 'express';
import fetch from 'node-fetch';
import cron from 'node-cron';
import dayjs from 'dayjs';
import requireAdmin from '../middleware/requireAdmin.js';

const UA_HEADERS = { Accept: 'application/json', 'User-Agent': 'RejectWatchlist/1.0 (+reject.app)' };

const compact = (o) => JSON.parse(JSON.stringify(o));
const clampNote = (s) => { const t = String(s ?? '').trim(); return t ? t.slice(0, 50) : ''; };

function readJSON(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }
function writeJSON(p, obj) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }

async function fetchJSON(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
async function fetchZkillArray(url) {
  try {
    const r = await fetch(url, { headers: UA_HEADERS });
    if (!r.ok) return [];
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) { await r.text().catch(() => ''); return []; }
    const j = await r.json().catch(() => null);
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}
async function getRecent(systemId, s) {
  let rows = await fetchZkillArray(`https://zkillboard.com/api/solarSystemID/${systemId}/pastSeconds/${s}/`);
  if (rows.length) return { rows, haveTimes: false };
  rows = await fetchZkillArray(`https://zkillboard.com/api/kills/solarSystemID/${systemId}/pastSeconds/${s}/`);
  if (rows.length) return { rows, haveTimes: false };

  const base = (await fetchZkillArray(`https://zkillboard.com/api/solarSystemID/${systemId}/`)) || [];
  if (!base.length) return { rows: [], haveTimes: false };
  const cutoff = Date.now() - s * 1000;
  const filtered = base.filter(k => Number.isFinite(Date.parse(k?.killmail_time)) && Date.parse(k.killmail_time) >= cutoff);
  return { rows: filtered, haveTimes: true };
}
async function resolveSystemId(jcode) {
  const J = String(jcode || '').toUpperCase().match(/J\d{6}/)?.[0];
  if (!J) return null;

  try {
    const r = await fetch('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify([J]),
    });
    if (r.ok) {
      const d = await r.json();
      const arr = d.systems || d.solar_systems || [];
      const hit = arr.find(s => String(s.name).toUpperCase() === J);
      if (hit?.id) return hit.id;
    }
  } catch {}
  try {
    const qs = new URLSearchParams({ categories: 'solar_system', search: J, strict: 'true', datasource: 'tranquility' }).toString();
    const r = await fetch(`https://esi.evetech.net/latest/search/?${qs}`, { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j?.solar_system) && j.solar_system.length) return j.solar_system[0];
    }
  } catch {}
  return null;
}

function asciiHeat(m) {
  const code = (v) => (v <= 0 ? '·' : v <= 2 ? '░' : v <= 5 ? '▒' : '▓');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const lines = ['Killboard activity (UTC)'];
  for (let d = 0; d < 7; d++) lines.push(days[d].padEnd(3, ' ') + ' ' + m[d].map(code).join(''));
  return '```\n' + lines.join('\n') + '\n```';
}

async function discordWebhook(payload) {
  const url = process.env.WATCHLIST_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

export function createWatchlistRouter({ dataDir }) {
  const r = express.Router();
  const WATCHLIST_PATH = path.join(dataDir, 'watchlist.json');
  const SEEN_CORPS_PATH = path.join(dataDir, 'watchlist_seen_corps.json');

  const getWatchlist = () => readJSON(WATCHLIST_PATH, []);
  const setWatchlist = (list) => writeJSON(WATCHLIST_PATH, list);
  const getSeenCorps = () => readJSON(SEEN_CORPS_PATH, {});
  const setSeenCorps = (m) => writeJSON(SEEN_CORPS_PATH, m);

  // GET list
  r.get(['/api/watchlist', '/watchlist'], (_req, res) => res.json(getWatchlist()));

  // POST add
  r.post(['/api/watchlist', '/watchlist'], requireAdmin, async (req, res) => {
    const J = String(req.body?.jcode || '').toUpperCase();
    if (!/^J\d{6}$/.test(J)) return res.status(400).json({ error: 'Invalid J-code' });
    const note = clampNote(req.body?.note);
    let list = getWatchlist();
    if (list.some(x => x.jcode === J)) return res.status(200).json({ ok: true });

    const systemId = await resolveSystemId(J);
    if (!systemId) return res.status(404).json({ error: 'System not found' });

    const item = { jcode: J, systemId, addedAt: new Date().toISOString(), ...(note ? { note } : {}) };
    list.push(item); setWatchlist(list);

    // quick intel snapshot (<= last 60d, capped batch)
    const MAX_AGE_DAYS = 60, BATCH_SIZE = 20, now = dayjs();
    const killmails = await fetchJSON(`https://zkillboard.com/api/solarSystemID/${systemId}/`);
    const mat = Array.from({ length: 7 }, () => Array(24).fill(0));
    let totalKills = 0, mostRecent = null;
    const cutoff = now.subtract(MAX_AGE_DAYS, 'day');

    for (let i = 0; i < killmails.length; i += BATCH_SIZE) {
      const batch = killmails.slice(i, i + BATCH_SIZE);
      const details = await Promise.allSettled(
        batch.map(k => fetchJSON(`https://esi.evetech.net/latest/killmails/${k.killmail_id}/${k.zkb.hash}/?datasource=tranquility`))
      );
      for (const r of details) {
        if (r.status !== 'fulfilled') continue;
        const kill = r.value; if (!kill?.killmail_time) continue;
        const t = dayjs(kill.killmail_time); if (t.isBefore(cutoff)) { i = killmails.length; break; }
        totalKills++; if (!mostRecent || t.isAfter(mostRecent)) mostRecent = t;
        const d = t.toDate(); mat[d.getUTCDay()][d.getUTCHours()]++;
      }
    }

    const lastKillAgo = mostRecent ? now.diff(mostRecent, 'day') : null;
    await discordWebhook({
      username: 'Watchlist',
      embeds: [compact({
        title: `${J} added to watchlist`,
        url: `https://zkillboard.com/system/${systemId}/`,
        description: note ? `**Note:** ${note}` : undefined,
        color: 0x00ff88,
        fields: [
          { name: 'Kills / Recent Kill', value: `${totalKills} kill${totalKills === 1 ? '' : 's'} in last 60 days, the last one was ${lastKillAgo ?? 'N/A'} days ago`, inline: false },
          { name: 'Heatmap (UTC)', value: asciiHeat(mat).slice(0, 1024), inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'reject.app watchlist' },
      })]
    });

    res.status(201).json(item);
  });

  // DELETE
  r.delete(['/api/watchlist/:jcode', '/watchlist/:jcode'], requireAdmin, (req, res) => {
    const J = String(req.params.jcode || '').toUpperCase();
    const list = getWatchlist();
    const next = list.filter(x => x.jcode !== J);
    if (next.length === list.length) return res.sendStatus(404);
    setWatchlist(next); res.sendStatus(204);
  });

  // Manual digest trigger 
  r.all(['/api/admin/watchlist/_run', '/admin/watchlist/_run'], requireAdmin, async (req, res) => {
    try {
      const dry = req.query.dry === '1' || req.body?.dryRun === true;
      const s = req.query.s ? Number(req.query.s) : (Number.isFinite(req.body?.seconds) ? Number(req.body.seconds) : undefined);
      const j = req.query.j ? String(req.query.j).toUpperCase() : (req.body?.jcode ? String(req.body.jcode).toUpperCase() : undefined);
      const out = await runWatchlistDigest({ dataDir, dryRun: dry, seconds: s, jcode: j });
      res.status(200).json(out);
    } catch (e) {
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  return r;
}

// Digest + cron
export async function runWatchlistDigest({ dataDir, dryRun = false, seconds, jcode } = {}) {
  const WATCHLIST_PATH = path.join(dataDir, 'watchlist.json');
  const SEEN_CORPS_PATH = path.join(dataDir, 'watchlist_seen_corps.json');
  const getWatchlist = () => readJSON(WATCHLIST_PATH, []);
  const setSeenCorps = (m) => writeJSON(SEEN_CORPS_PATH, m);
  const getSeenCorps = () => readJSON(SEEN_CORPS_PATH, {});

  const hook = process.env.WATCHLIST_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  const listAll = getWatchlist();
  const list = jcode ? listAll.filter(it => it.jcode === String(jcode).toUpperCase()) : listAll;
  const seen = getSeenCorps();

  const now = dayjs();
  const post = async (payload) => {
    if (dryRun || !hook) return;
    await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  };

  const activeEmbeds = []; const inactiveEmbeds = []; const reports = [];
  const corpNameCache = new Map();
  const corpName = async (cid) => {
    const id = String(cid);
    if (corpNameCache.has(id)) return corpNameCache.get(id);
    try {
      const j = await fetchJSON(`https://esi.evetech.net/latest/corporations/${id}/?datasource=tranquility`);
      const name = (j && j.name) ? j.name : `Corporation ${id}`;
      corpNameCache.set(id, name); return name;
    } catch { const fallback = `Corporation ${id}`; corpNameCache.set(id, fallback); return fallback; }
  };

  for (const item of list) {
    const addedAtMs = Date.parse(item.addedAt) || Date.now();
    const sinceAdded = Math.max(0, Math.floor((Date.now() - addedAtMs) / 1000));
    const s = Math.max(60, Math.min(Number.isFinite(seconds) ? seconds : (sinceAdded || 86400), 86400));
    const cutoff = Date.now() - s * 1000;
    const windowHours = Math.max(1, Math.floor(s / 3600));
    const cutoffUnix = Math.floor(cutoff / 1000);

    const { rows: recent } = await getRecent(item.systemId, s);
    const count = recent.length;

    if (count === 0) {
      inactiveEmbeds.push({
        title: `${item.jcode} — No activity`,
        url: `https://zkillboard.com/system/${item.systemId}/`,
        description: item.note ? `**Note:** ${item.note}` : undefined,
        color: 0x6b7280,
        fields: [
          { name: 'Window', value: `Last ${windowHours}h • since <t:${cutoffUnix}:R>`, inline: true },
          { name: 'Kills', value: '0', inline: true },
        ],
        footer: { text: 'reject.app watchlist' },
        timestamp: new Date().toISOString(),
      });
      reports.push({ jcode: item.jcode, systemId: item.systemId, count, seconds: s, newCorps: 0 });
      continue;
    }

    // expand subset to find new corps
    const details = await Promise.allSettled(
      recent.slice(0, 40).map(k => fetchJSON(`https://esi.evetech.net/latest/killmails/${k.killmail_id}/${k.zkb.hash}/?datasource=tranquility`))
    );
    const corps24h = new Set();
    for (const r of details) {
      if (r.status !== 'fulfilled') continue;
      const km = r.value;
      if (km?.victim?.corporation_id) corps24h.add(String(km.victim.corporation_id));
      for (const a of km?.attackers || []) if (a?.corporation_id) corps24h.add(String(a.corporation_id));
    }

    const seenForJ = seen[item.jcode] || {};
    const newCorps = [...corps24h].filter(cid => !seenForJ[cid]);
    newCorps.forEach(cid => (seenForJ[cid] = true));
    seen[item.jcode] = seenForJ;

    const topNew = newCorps.slice(0, 8);
    const named = await Promise.all(topNew.map(async cid => ({ id: cid, name: await corpName(cid) })));
    const newCorpsLinks = named.map(({ id, name }) => `[${name}](https://zkillboard.com/corporation/${id}/)`).join('\n');
    const moreNote = newCorps.length > 8 ? `\n…and ${newCorps.length - 8} more` : '';

    activeEmbeds.push({
      title: `${item.jcode} — Daily digest`,
      url: `https://zkillboard.com/system/${item.systemId}/`,
      description: item.note ? `**Note:** ${item.note}` : undefined,
      color: 0x00ff88,
      fields: [
        { name: 'Window', value: `Last ${windowHours}h • since <t:${cutoffUnix}:R>`, inline: true },
        { name: 'Kills', value: String(count), inline: true },
        { name: 'New corps', value: String(newCorps.length), inline: true },
        ...(newCorps.length ? [{ name: 'New corps', value: (newCorpsLinks + moreNote).slice(0, 1024), inline: false }] : []),
      ],
      footer: { text: 'reject.app watchlist' },
      timestamp: new Date().toISOString(),
    });

    reports.push({ jcode: item.jcode, systemId: item.systemId, count, seconds: s, newCorps: newCorps.length });
  }

  // persist seen corps
  setSeenCorps(seen);

  if (!dryRun && hook) {
    for (let i = 0; i < activeEmbeds.length; i += 10) await post({ username: 'Watchlist', embeds: activeEmbeds.slice(i, i + 10) });
    for (let i = 0; i < inactiveEmbeds.length; i += 10) await post({ username: 'Watchlist', embeds: inactiveEmbeds.slice(i, i + 10) });
  }

  return { ok: true, reports, postedActive: activeEmbeds.length, postedInactive: inactiveEmbeds.length };
}

export function scheduleWatchlistCron({ dataDir, enabled = true } = {}) {
  if (!enabled) return;
  cron.schedule('0 23 * * *', async () => {
    console.log('[watchlist/cron] tick 00:00 UTC', new Date().toISOString());
    try {
      const res = await runWatchlistDigest({ dataDir });
      console.log('[watchlist/cron] done', JSON.stringify(res));
      if ((res?.postedActive ?? 0) === 0 && (res?.postedInactive ?? 0) === 0) {
        setTimeout(async () => {
          console.log('[watchlist/cron] retry 00:05 UTC', new Date().toISOString());
          try { const r2 = await runWatchlistDigest({ dataDir }); console.log('[watchlist/cron] retry done', JSON.stringify(r2)); }
          catch (e) { console.error('[watchlist/cron] retry error', e?.stack || e); }
        }, 5 * 60 * 1000);
      }
    } catch (e) {
      console.error('[watchlist/cron] error', e?.stack || e);
    }
  }, { timezone: 'UTC' });
}
