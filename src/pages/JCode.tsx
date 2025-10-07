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
  notes?: string; // ← new
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
      <div className="min-h-dvh bg-black text-green-400 font-mono grid place-items-center p-6">
        <div className="max-w-xl text-center">
          <h2 className="text-3xl">We aren't in your hole... yet!</h2>
          <p className="mt-4 text-green-300/80">
            No active eviction for {jcode}. Check back later.
          </p>
          <Link
            to="/"
            className="inline-block mt-6 px-4 py-2 bg-green-600 text-black font-bold rounded"
          >
            Go Home
          </Link>
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
    <div className="min-h-dvh bg-black text-green-400 font-mono p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl">{data.jcode} — Eviction Appraisal</h1>

        {/* SUMMARY (moved to the top) */}
        <div className="mt-4 border border-green-500/40 rounded p-4 bg-black">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <span className="text-green-300/80">Total Structure Value:</span>{" "}
              <span className="font-bold">
                {data.totalStructuresISK.toLocaleString()} ISK
              </span>
            </div>
            <div>
              <span className="text-green-300/80">Ransom to withdraw:</span>{" "}
              <span className="font-bold">
                {data.ransomISK.toLocaleString()} ISK
              </span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setPayOpen(true)}
              className="px-4 py-2 bg-green-600 text-black font-bold rounded"
            >
              Pay Ransom
            </button>
            <button
              onClick={() => setNegOpen(true)}
              className="px-4 py-2 border border-green-500/50 rounded hover:bg-green-600/10"
            >
              Negotiate
            </button>
          </div>
        </div>

        {/* STRUCTURES */}
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          {data.structures.map((s, i) => (
            <div key={i} className="border border-green-500/40 rounded p-4 bg-black">
              <div className="flex items-center justify-between">
                <h3 className="text-xl">{s.kind}</h3>
                <div className="text-green-300/90">
                  ~{s.estimatedISK.toLocaleString()} ISK
                </div>
              </div>
              <pre className="mt-3 whitespace-pre-wrap text-green-200/90 text-sm bg-black/20 p-3 rounded border border-green-500/20">
                {s.fitText}
              </pre>
            </div>
          ))}
        </div>

        {/* NOTES (optional) */}
        {data.notes?.trim() && (
          <div className="mt-6 border border-green-500/30 rounded p-4">
            <h3 className="text-lg mb-2">Notes</h3>
            <pre className="whitespace-pre-wrap text-green-300/90">
              {data.notes}
            </pre>
          </div>
        )}

        {/* PAY MODAL */}
        {payOpen && data && (
          <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 z-50">
            <div className="w-full max-w-md bg-black border border-green-500/50 rounded p-4">
              <h3 className="text-xl mb-3">Pay Ransom — {data.jcode}</h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-green-300/80 text-sm">Pay this character</div>
                    <div className="text-lg">Leshak Pilot 1</div>
                  </div>
                  <button
                    onClick={() => copy("Leshak Pilot 1")}
                    className="px-3 py-1.5 border border-green-500/40 rounded hover:bg-green-600/10"
                  >
                    Copy Name
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-green-300/80 text-sm">Amount</div>
                    <div className="text-lg">
                      {data.ransomISK.toLocaleString()} ISK
                    </div>
                  </div>
                  <button
                    onClick={() => copy(String(data.ransomISK))}
                    className="px-3 py-1.5 border border-green-500/40 rounded hover:bg-green-600/10"
                  >
                    Copy Amount
                  </button>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setPayOpen(false)}
                  className="px-3 py-2 border border-green-500/40 rounded"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NEGOTIATE MODAL */}
        {negOpen && (
          <NegotiateModal jcode={data.jcode} onClose={() => setNegOpen(false)} />
        )}
      </div>
    </div>
  );
}

function NegotiateModal({
  jcode,
  onClose,
}: {
  jcode: string;
  onClose: () => void;
}) {
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
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 z-50">
      <div className="w-full max-w-lg bg-black border border-green-500/50 rounded p-4">
        <h3 className="text-xl">Negotiate — {jcode}</h3>

        {status === "ok" ? (
          <div className="mt-4 text-green-300">
            Sent. We’ll be in touch.
            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                className="px-3 py-2 border border-green-500/40 rounded"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3 space-y-3">
            <input
              value={ign}
              onChange={(e) => setIgn(e.target.value)}
              placeholder="In-game name"
              className="w-full bg-black border border-green-500/40 rounded px-3 py-2"
            />
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Your message"
              rows={5}
              className="w-full bg-black border border-green-500/40 rounded px-3 py-2"
            />

            {status === "err" && (
              <div className="mt-3 text-red-300">
                Failed to send. Check webhook config.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 border border-green-500/40 rounded"
              >
                Close
              </button>
              <button className="px-3 py-2 bg-green-600 text-black font-bold rounded">
                Send
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
