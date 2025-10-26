import express from 'express';
import fetch from 'node-fetch';

export default function publicRouter({ getSystem, formatISKShort }) {
  const r = express.Router();

  r.get('/lookup/:jcode', (req, res) => {
    const j = (req.params.jcode || '').trim().toUpperCase();
    if (!/^J\d{6}$/.test(j)) return res.status(400).json({ error: 'Invalid J-code' });
    const data = getSystem(j);
    if (!data) return res.sendStatus(404);
    res.json(data);
  });

  r.post('/contact', async (req, res) => {
    const { jcode, ign, message } = req.body || {};
    if (!jcode || !ign || !message) return res.status(400).json({ error: 'Missing fields' });
    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) return res.status(500).json({ error: 'Webhook not configured' });

    const J = String(jcode).toUpperCase();
    const sys = getSystem(J); // may be null

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
      const r0 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'SALT MINER WOOOO', embeds: [embed] }),
      });
      if (!r0.ok) throw new Error(`Webhook ${r0.status}`);
      res.sendStatus(204);
    } catch {
      res.status(502).json({ error: 'Webhook failed' });
    }
  });

  return r;
}
