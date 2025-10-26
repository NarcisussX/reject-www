import express from 'express';
import fetch from 'node-fetch';
import dayjs from 'dayjs';

function fetchJSON(url, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RejectIntel/1.0 (+reject.app)',
      ...(init.headers || {})
    }
  }).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  });
}

const corpCache = new Map();
const systemCache = new Map();

export default function createIntelRouter() {
  const r = express.Router();

  // Corp name → corp id (cached)
  r.get(['/api/corp-id', '/corp-id'], async (req, res) => {
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'missing name' });

    const key = name.toLowerCase();
    if (corpCache.has(key)) return res.json({ name, id: corpCache.get(key), cached: true });

    try {
      let id = null;

      // Preferred: POST /universe/ids
      const idsRes = await fetch('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify([name]),
      });
      if (idsRes.ok) {
        const j = await idsRes.json();
        if (Array.isArray(j?.corporations) && j.corporations.length) {
          id = j.corporations[0].id;
        }
      }

      // Fallback: GET /search strict/loose
      if (!id) {
        const strict = new URLSearchParams({
          categories: 'corporation',
          datasource: 'tranquility',
          search: name,
          strict: 'true',
        }).toString();
        let r0 = await fetch(`https://esi.evetech.net/latest/search/?${strict}`);
        let j0 = await r0.json();
        if (Array.isArray(j0?.corporation) && j0.corporation.length) {
          id = j0.corporation[0];
        } else {
          const loose = new URLSearchParams({
            categories: 'corporation',
            datasource: 'tranquility',
            search: name,
            strict: 'false',
          }).toString();
          r0 = await fetch(`https://esi.evetech.net/latest/search/?${loose}`);
          j0 = await r0.json();
          if (Array.isArray(j0?.corporation) && j0.corporation.length) {
            id = j0.corporation[0];
          }
        }
      }

      if (!id) return res.status(404).json({ name, id: null });

      corpCache.set(key, id);
      return res.json({ name, id });
    } catch {
      return res.status(502).json({ error: 'esi lookup failed' });
    }
  });

  // J-code → systemId (cached)
  r.get(['/api/system-id/:jcode', '/system-id/:jcode'], async (req, res) => {
    const raw = String(req.params.jcode || '').toUpperCase();
    const m = raw.match(/J\d{6}/);
    if (!m) return res.status(400).json({ error: 'bad jcode' });
    const j = m[0];

    if (systemCache.has(j)) return res.json({ jcode: j, id: systemCache.get(j), cached: true });

    try {
      const idsResp = await fetch('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify([j]),
      });

      if (idsResp.ok) {
        const d = await idsResp.json();
        const arr = (d.systems || d.solar_systems || []);
        const hit = arr.find(s => String(s.name).toUpperCase() === j);
        if (hit?.id) {
          systemCache.set(j, hit.id);
          return res.json({ jcode: j, id: hit.id, name: hit.name });
        }
      }

      const qs = new URLSearchParams({
        categories: 'solar_system',
        datasource: 'tranquility',
        search: j,
        strict: 'true',
      }).toString();
      const sResp = await fetch(`https://esi.evetech.net/latest/search/?${qs}`, {
        headers: { Accept: 'application/json' },
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
    } catch {
      return res.status(502).json({ error: 'esi resolve failed' });
    }
  });

  // System killboard summary
  r.get(['/api/killboard-summary/:systemId', '/killboard-summary/:systemId'], async (req, res) => {
    try {
      const systemId = String(req.params.systemId);
      const MAX_AGE_DAYS = 60;
      const BATCH_SIZE = 20;
      const now = dayjs();

      const killmails = await fetchJSON(`https://zkillboard.com/api/solarSystemID/${systemId}/`);

      const corpNameCache = new Map();
      const corpName = async (cid) => {
        const id = String(cid);
        if (corpNameCache.has(id)) return corpNameCache.get(id);

        const get = typeof fetchJSON === 'function' ? fetchJSON : async (url) => {
          const r0 = await fetch(url); if (!r0.ok) throw new Error('ESI fail');
          return r0.json();
        };

        try {
          const j = await get(`https://esi.evetech.net/latest/corporations/${id}/?datasource=tranquility`);
          const name = (j && j.name) ? j.name : `Corporation ${id}`;
          corpNameCache.set(id, name);
          return name;
        } catch {
          const fallback = `Corporation ${id}`;
          corpNameCache.set(id, fallback);
          return fallback;
        }
      };

      const corpActivity = new Map();
      let totalKills = 0;
      let mostRecent = null;
      let oldest = null;

      for (let i = 0; i < killmails.length; i += BATCH_SIZE) {
        const batch = killmails.slice(i, i + BATCH_SIZE);
        const details = await Promise.allSettled(
          batch.map(k => fetchJSON(`https://esi.evetech.net/latest/killmails/${k.killmail_id}/${k.zkb.hash}/?datasource=tranquility`))
        );

        for (const rr of details) {
          if (rr.status !== 'fulfilled') continue;
          const kill = rr.value;
          if (!kill?.killmail_time) continue;

          const t = dayjs(kill.killmail_time);
          mostRecent = !mostRecent || t.isAfter(mostRecent) ? t : mostRecent;
          oldest = !oldest || t.isBefore(oldest) ? t : oldest;

          const age = now.diff(t, 'day');
          if (age > MAX_AGE_DAYS) { i = killmails.length; break; }

          totalKills++;
          const involved = [kill.victim, ...(kill.attackers || [])];
          for (const ent of involved) {
            const cid = ent?.corporation_id;
            if (!cid) continue;
            const id = String(cid);
            const prev = corpActivity.get(id);
            const days = prev?.days || new Set();
            days.add(t.format('YYYY-MM-DD'));
            const lastSeen = Math.min(prev?.lastSeen ?? Infinity, age);
            corpActivity.set(id, { lastSeen, days });
          }
        }
      }

      const corps = await Promise.all(
        Array.from(corpActivity.entries()).map(async ([id, v]) => ({
          id,
          name: await corpName(id),
          lastSeenDaysAgo: v.lastSeen,
          activeDays: v.days.size,
        }))
      );

      return res.json({
        systemId,
        totalKills,
        daysCovered: oldest ? now.diff(oldest, 'day') : 0,
        mostRecentKillDaysAgo: mostRecent ? now.diff(mostRecent, 'day') : null,
        activeCorporations: corps.sort((a, b) => a.lastSeenDaysAgo - b.lastSeenDaysAgo),
      });
    } catch {
      return res.status(502).json({ error: 'killboard summary failed' });
    }
  });

  // zKill system activity (proxy)
  r.get(['/api/zkill-activity/:systemId', '/zkill-activity/:systemId'], async (req, res) => {
    try {
      const systemId = String(req.params.systemId);
      const data = await fetchJSON(`https://zkillboard.com/api/stats/solarSystemID/${systemId}/`);
      return res.json(data.activity || null);
    } catch {
      return res.status(502).json({ error: 'zkill stats failed' });
    }
  });

  // zKill corp activity (proxy)
  r.get(['/api/zkill-corp-activity/:corpId', '/zkill-corp-activity/:corpId'], async (req, res) => {
    try {
      const corpId = String(req.params.corpId);
      const stats = await fetchJSON(`https://zkillboard.com/api/stats/corporationID/${corpId}/`);
      return res.json(stats?.activity || null);
    } catch {
      return res.status(502).json({ error: 'zkill corp stats failed' });
    }
  });

  return r;
}
