import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

const copy = (t: string) => navigator.clipboard.writeText(t);

type Structure = { kind: string; fitText: string; estimatedISK: number };

type Data = {
  jcode: string;
  ransomISK: number;
  totalStructuresISK: number;
  structures: Structure[];
  pilot: string;
  notes?: string;
  evicted?: boolean;
  ransomed?: boolean;
};

export default function JCode() {
  const { jcode } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [negOpen, setNegOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/lookup/${jcode}`)
      .then(async (r) => {
        if (r.status === 404) {
          setMissing(true);
          return;
        }
        const d = await r.json();
        setData(d);
      })
      .catch(() => setMissing(true));
  }, [jcode]);

  if (missing)
    return (
      <div className="screen bg-black text-green-400 font-mono">
        <div className="wrap">
          <div className="container content">
            <main className="min-h-full flex items-center justify-center">
              <div className="panel max-w-xl text-center">
                <h2 className="glow text-3xl mb-2">We aren't in your hole... yet!</h2>
                <p className="text-green-300/80">
                  No active eviction for {jcode}. Check back later.
                </p>
                <Link to="/" className="inline-block mt-6">
                  <button>Go Home</button>
                </Link>
              </div>
            </main>
          </div>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="min-h-dvh bg-black text-green-400 font-mono grid place-items-center">
        Loading…
      </div>
    );

  return (
    <div className="bg-black text-green-400 font-mono">
      {data.evicted && <div className="evicted-stamp">EVICTED</div>}
      {data.ransomed && <div className="ransomed-stamp">RANSOMED</div>}
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-8">
        <div className="text-sm text-green-300/75 mb-3">{data.jcode} — Eviction Appraisal</div>
        <div className="space-y-6 md:space-y-8">
          <section className="panel panel-solid ransom">
            <div className="kv">
              <div className="text-green-300/80">Total Value</div>
              <div className="font-bold">{data.totalStructuresISK.toLocaleString()} ISK</div>
              <div className="text-green-300/80">Ransom to withdraw</div>
              <div className="font-bold">{data.ransomISK.toLocaleString()} ISK</div>
            </div>
            <div className="btns">
              <button onClick={() => setPayOpen(true)}>Pay Ransom</button>
              <button className="ghost" onClick={() => setNegOpen(true)}>Negotiate</button>
            </div>
          </section>

          {!!data.notes?.trim() && (
            <section className="panel panel-solid ">
              <h2 className="mb-2 glow text-lg">Notes</h2>
              <pre className="whitespace-pre-wrap text-green-300/90">{data.notes}</pre>
            </section>
          )}

          <section className="grid md:grid-cols-2 gap-6 md:gap-8">
            {data.structures.map((s, i) => (
              <div key={i} className="panel panel-solid ">
                <div className="flex items-center justify-between">
                  <h3 className="glow text-xl">{s.kind}</h3>
                  <div className="text-green-300/90">~{s.estimatedISK.toLocaleString()} ISK</div>
                </div>
                <pre className="mt-3 whitespace-pre-wrap text-green-200/90 text-sm bg-black/20 p-3 rounded border border-green-500/20">
                  {s.fitText}
                </pre>
              </div>
            ))}
          </section>
        </div>
      </div>

      {/* Pay modal */}
      {payOpen && (
        <div className="modalOverlay">
          <div className="modal">
            <header><h3 className="text-xl">Pay Ransom — {data.jcode}</h3></header>
            <div className="grid2">
              <div>
                <div className="text-green-300/80 text-sm">Pay this character</div>
                <div className="text-lg">Leshak Pilot 1</div>
              </div>
              <div className="flex items-end justify-end">
                <button onClick={() => copy("Leshak Pilot 1")}>Copy Name</button>
              </div>

              <div>
                <div className="text-green-300/80 text-sm">Amount</div>
                <div className="text-lg">{data.ransomISK.toLocaleString()} ISK</div>
              </div>
              <div className="flex items-end justify-end">
                <button onClick={() => copy(String(data.ransomISK))}>Copy Amount</button>
              </div>
            </div>
            <footer>
              <button onClick={() => setPayOpen(false)}>Close</button>
            </footer>
          </div>
        </div>
      )}

      {/* Negotiate modal */}
      {negOpen && (
        <NegotiateModal jcode={data.jcode} onClose={() => setNegOpen(false)} />
      )}
    </div>
  );
}

function NegotiateModal({ jcode, onClose }: { jcode: string; onClose: () => void }) {
  const [ign, setIgn] = useState("");
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jcode, ign, message: msg }),
    });
    setStatus(r.ok ? "ok" : "err");
  }

  return (
    <div className="modalOverlay">
      <div className="modal">
        <header><h3 className="text-xl">Negotiate — {jcode}</h3></header>

        {status === "ok" ? (
          <div className="text-green-300">
            Sent. We’ll be in touch.
            <footer>
              <button onClick={onClose}>Close</button>
            </footer>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              value={ign}
              onChange={(e) => setIgn(e.target.value)}
              placeholder="In-game name"
            />
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Your message"
              rows={5}
            />

            {status === "err" && (
              <div className="text-red-300">Failed to send. Check webhook config.</div>
            )}

            <footer>
              <button type="button" className="ghost" onClick={onClose}>Close</button>
              <button>Send</button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
