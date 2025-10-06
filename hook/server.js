import express from "express";

const WEBHOOK = process.env.DISCORD_WEBHOOK;
if (!WEBHOOK) {
  console.error("DISCORD_WEBHOOK env var is required");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "100kb" }));

app.post("/negotiation", async (req, res) => {
  const { jcode = "", pilot = "", message = "", amount = "" } = req.body || {};

  const payload = {
    username: "Reject.App Bot",
    embeds: [
      {
        title: "Negotiation Request",
        color: 0x00ff66,
        fields: [
          { name: "J-Code", value: jcode || "—", inline: true },
          { name: "Pilot", value: pilot || "—", inline: true },
          { name: "Quoted Amount", value: amount || "—", inline: true },
          { name: "Message", value: message || "—" },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const r = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`Discord HTTP ${r.status}`);
    return res.status(204).end();
  } catch (e) {
    console.error("Webhook error:", e);
    return res.status(502).json({ ok: false, error: "Upstream send failed" });
  }
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () =>
  console.log(`hook listening on :${port}`)
);
