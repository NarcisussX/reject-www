// pages/StructureAge.tsx
import { useState } from "react";

type AgeResp = {
  id: string;
  method: "exact" | "interpolate" | "extrapolate-head" | "extrapolate-tail";
  midISO: string;
  lowISO: string;
  highISO: string;
  daysWide: string;
};

export default function StructureAge() {
  const [id, setId] = useState("");
  const [data, setData] = useState<AgeResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setData(null); setLoading(true);
    try {
      const r = await fetch(`/age/${encodeURIComponent(id.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) {
      setErr(e.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative z-10 mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold mb-4 text-green-300">Structure Age Estimate</h1>

      <form onSubmit={onSubmit} className="flex gap-2 mb-6">
        <input
          className="flex-1 bg-black/60 border border-green-500/30 rounded px-3 py-2 text-green-200 outline-none focus:border-green-400"
          placeholder="Enter structure ID"
          value={id}
          onChange={(e)=>setId(e.target.value)}
        />
        <button className="px-4 py-2 border border-green-500/50 rounded hover:bg-green-500/10">
          {loading ? "…" : "Estimate"}
        </button>
      </form>

      {err && <p className="text-red-400">{err}</p>}

      {data && (
        <div className="space-y-2 text-green-200">
          <p><span className="text-green-400/80">Estimate:</span> between <b>{new Date(data.lowISO).toUTCString()}</b> and <b>{new Date(data.highISO).toUTCString()}</b></p>
          <p><span className="text-green-400/80">Midpoint:</span> {new Date(data.midISO).toUTCString()} <span className="text-green-500/70">({data.method})</span></p>
          <p><span className="text-green-400/80">Window width:</span> {data.daysWide} days</p>
        </div>
      )}
    </div>
  );
}
