// pages/StructureAge.tsx
import { useState } from "react";

const fmtUTC = (iso: string) =>
    new Date(iso).toUTCString().replace(' GMT', ' UTC');

const extractFromPaste = (raw: string) => {
    const text = raw.trim();

    // structure id: digits after `//` in showinfo, or any 10+ digit token
    const idMatch =
        text.match(/\/\/(\d{10,})>/) || text.match(/\b(\d{10,})\b/);
    const structureId = idMatch ? idMatch[1] : null;

    // J-code: J + 6 digits (case-insensitive)
    const jMatch = text.match(/\bJ\d{6}\b/i);
    const jcode = jMatch ? jMatch[0].toUpperCase() : null;

    // corp name: inside the final (...) before </url> or end of line
    let corpName: string | null = null;
    const corpInUrl = text.match(/\(([^()]+)\)\s*<\/url>/);
    if (corpInUrl) corpName = corpInUrl[1].trim();
    else {
        const corpAtEnd = text.match(/\(([^()]+)\)\s*$/);
        if (corpAtEnd) corpName = corpAtEnd[1].trim();
    }

    return { structureId, jcode, corpName };
};

function humanizeDays(days: number) {
    const abs = Math.abs(days);
    if (abs < 14) return `${abs} day${abs === 1 ? "" : "s"}`;
    const years = Math.floor(abs / 365.25);
    const months = Math.floor((abs - years * 365.25) / 30.44);
    const remDays = Math.round(abs - years * 365.25 - months * 30.44);

    const parts: string[] = [];
    if (years) parts.push(`${years}y`);
    if (months) parts.push(`${months}m`);
    // include days for small ages so it feels precise
    if (!years && remDays && months < 3) parts.push(`${remDays}d`);
    return parts.join(" ");
}

const ageDaysFromNow = (iso: string) =>
    Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);

type AgeResp = {
    id: string; method: "exact" | "interpolate" | "extrapolate-head" | "extrapolate-tail";
    midISO: string; lowISO: string; highISO: string; daysWide: string;
};

// SystemIntel.tsx
import { useEffect, useState } from "react";

type Activity = { days: string[]; max: number } & Record<number, any>; // zKill activity shape
type Summary = {
  systemId: string;
  totalKills: number;
  daysCovered: number;
  mostRecentKillDaysAgo: number | null;
  activeCorporations: { id: string; name: string; lastSeenDaysAgo: number; activeDays: number }[];
};

export default function SystemIntel({ jcode }: { jcode: string }) {
  const [systemId, setSystemId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setErr(null); setSystemId(null); setActivity(null); setSummary(null);
        if (!jcode) return;

        const sys = await fetch(`/api/system-id/${encodeURIComponent(jcode)}`).then(r => r.json());
        if (!sys?.id) { setErr("Could not resolve system ID"); return; }
        if (abort) return;
        setSystemId(String(sys.id));

        const [act, sum] = await Promise.all([
          fetch(`/api/zkill-activity/${sys.id}`).then(r => r.json()),
          fetch(`/api/killboard-summary/${sys.id}`).then(r => r.json()),
        ]);
        if (abort) return;
        setActivity(act); setSummary(sum);
      } catch (e:any) {
        if (!abort) setErr(e.message || "Failed to load system intel");
      }
    })();
    return () => { abort = true; };
  }, [jcode]);

  const renderHeatmap = () => {
    if (!activity?.days) return <div className="text-gray-400 text-sm">Loading activity…</div>;
    const days = activity.days;
    return (
      <table className="w-full text-xs text-center text-gray-300">
        <thead>
          <tr>
            <th className="text-left pr-2">Day/Hour</th>
            {[...Array(24).keys()].map(h => <th key={h} className="font-mono text-[10px]">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {days.map((day: string, dIdx: number) => (
            <tr key={day}>
              <td className="text-left pr-2">{day}</td>
              {[...Array(24).keys()].map(h => {
                const count = activity[dIdx]?.[h] || 0;
                const max = activity.max || 1;
                const color = count === 0 ? "rgb(60,60,60)" : `rgb(${100 + Math.floor((count / max) * 155)}, 0, 0)`;
                return <td key={h} style={{ backgroundColor: color, width: 18, height: 18 }} className="border border-gray-800" />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const topCorps = () =>
    (summary?.activeCorporations || [])
      .sort((a,b) => (b.activeDays - a.activeDays) || (a.lastSeenDaysAgo - b.lastSeenDaysAgo))
      .slice(0, 10);

  if (err) return <div className="mt-8 text-red-400">{err}</div>;
  if (!jcode) return null;

  return (
    <div className="mt-8 grid grid-cols-1 lg:grid-cols-[480px_1fr] gap-8">
      <div className="space-y-3">
        <div className="border border-gray-700 rounded-md p-2 bg-gray-900">
          <div className="text-sm font-bold text-white mb-1">Killboard activity calendar</div>
          {renderHeatmap()}
        </div>

        <div className="border border-gray-700 rounded-md p-3 bg-gray-900">
          <div className="font-bold text-sm text-white">Kills / Recent Kill</div>
          <div className="text-xs text-gray-400">
            {summary
              ? `${summary.totalKills} kills in last ${summary.daysCovered} days, the last one was ${summary.mostRecentKillDaysAgo ?? "?"} days ago`
              : "Loading…"}
          </div>
        </div>

        <div className="border border-gray-700 rounded-md p-3 bg-gray-900 text-sm text-gray-300">
          <div className="font-bold text-white mb-1">Recent corps</div>
          {summary ? (
            <ul className="text-xs space-y-1">
              {topCorps().map(c => (
                <li key={c.id}>
                  <a href={`https://zkillboard.com/corporation/${c.id}/`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                    {c.name}
                  </a>{" "}
                  (Active {c.activeDays}d, last seen {c.lastSeenDaysAgo}d ago)
                </li>
              ))}
            </ul>
          ) : "Loading…"}
        </div>
      </div>

      <div className="text-sm text-gray-300">
        {systemId && (
          <div className="mb-2">
            System:{" "}
            <a className="underline text-blue-400" href={`https://anoik.is/systems/${jcode}`} target="_blank" rel="noreferrer">
              {jcode}
            </a>{" "}
            • <a className="underline text-blue-400" href={`https://zkillboard.com/system/${systemId}/`} target="_blank" rel="noreferrer">zKill</a>
          </div>
        )}
        {/* Space reserved if you want to show static/region/etc later */}
      </div>
    </div>
  );
}

export default function StructureAge() {
    const [input, setInput] = useState("");
    const [data, setData] = useState<AgeResp | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // parsed bits from paste
    const [parsedJ, setParsedJ] = useState<string | undefined>();
    const [parsedCorp, setParsedCorp] = useState<string | undefined>();
    const [corpId, setCorpId] = useState<number | undefined>();
    const [corpResolving, setCorpResolving] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null); setData(null);

        const { structureId, jcode, corpName } = extractFromPaste(input);
        setParsedJ(jcode ?? undefined);
        setParsedCorp(corpName ?? undefined);

        if (!structureId) { setErr("Could not find a structure ID in the input."); return; }

        // resolve corp id (best-effort; non-blocking)
        setCorpId(undefined);
        if (corpName) {
            setCorpResolving(true);
            try {
                const r = await fetch(`/api/corp-id?name=${encodeURIComponent(corpName)}`);
                if (r.ok) {
                    const j = await r.json();
                    if (j?.id) setCorpId(j.id);
                }
            } catch { /* empty */ }
            setCorpResolving(false);
        }

        // call age endpoint
        setLoading(true);
        try {
            const r = await fetch(`/api/age/${encodeURIComponent(structureId)}`);
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
            setData(j);
        } catch (e: any) {
            setErr(e.message || "Request failed");
        } finally {
            setLoading(false);
        }
    }

    function InfoBox() {
        return (
            <details className="mt-8 bg-black/50 border border-green-500/20 rounded-lg p-4 open:shadow-[0_0_0_1px_rgba(16,185,129,0.2)]">
                <summary className="cursor-pointer text-green-300 font-semibold select-none">
                    How this estimate works (click to expand)
                </summary>

                <div className="mt-3 text-sm leading-6 text-green-200/90 space-y-3">
                    <p>
                        <b>Data source</b>: a cleaned, monotone index of ESI Public Structure ID dates
                        (structure <i>ID → date</i>). Cleaning enforces non-decreasing dates by ID and can create
                        plateaus (many IDs sharing the same day).
                    </p>

                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            <b>Nearest neighbors</b>: I binary-search the two IDs that bracket your input{" "}
                            <code>S</code>, i.e. <code>L ≤ S ≤ H</code>.
                        </li>
                        <li>
                            <b>Exact hit</b>: if <code>S</code> exists in the index, I return that day with a{" "}
                            <b>±3&nbsp;day</b> band (<code>method = "exact"</code>).
                        </li>
                        <li>
                            <b>Interpolation</b>: otherwise I linearly interpolate between the neighbors’ dates:
                            <br />
                            <code>α = (S − L) / (H − L)</code>,{" "}
                            <code>t = t<sub>L</sub> + α · (t<sub>H</sub> − t<sub>L</sub>)</code>{" "}
                            (<code>method = "interpolate"</code>).
                        </li>
                        <li>
                            <b>Uncertainty window</b>: I pad around <code>t</code> using the local gap so dense
                            regions get tight windows and sparse/plateau regions get looser ones:
                            <br />
                            <code>pad = clamp(0.25 × |t<sub>H</sub> − t<sub>L</sub>|, 2d, 7d)</code>
                            <br />
                            Final range: <code>[t − pad, t + pad]</code>.
                        </li>
                        <li>
                            <b>Edges</b>: if I only have one neighbor, I extrapolate from the closest two points
                            and use a <b>±7&nbsp;day</b> window
                            (<code>method = "extrapolate-head/tail"</code>).
                        </li>
                    </ol>

                    <p>
                        <b>Why results can differ from memory</b>: “First seen” reflects when a structure became
                        publicly visible and was observed by the crawler. If a structure was anchored{" "}
                        <i>private</i> and flipped to public later, the source date is later than the true
                        anchor. Cleaning also flattens obvious inconsistencies, and times are normalized to
                        00:00:00 <b>UTC</b>.
                    </p>

                    <p className="text-green-300/90">
                        <b>Disclaimer</b>: This tool produces <i>estimates</i> only. It’s not an official anchor
                        time and may be off—especially for late-public structures, sparse regions of the index, or
                        data not yet covered by the source.
                    </p>
                </div>
            </details>
        );
    }

    return (
        <div className="relative z-10 mx-auto max-w-xl px-4 py-10">
            <h1 className="text-2xl font-bold mb-4 text-green-300">Structure Age Estimate</h1>

            <form onSubmit={onSubmit} className="flex gap-2 mb-3">
                <textarea
                    className="flex-1 min-h-[70px] bg-black/60 border border-green-500/30 rounded px-3 py-2 text-green-200 outline-none focus:border-green-400"
                    placeholder="Paste EVE chat line or enter a structure ID…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                />
                <button className="px-4 py-2 h-fit self-start border border-green-500/50 rounded hover:bg-green-500/10">
                    {loading ? "…" : "Estimate"}
                </button>
            </form>

            {/* Parsed preview (optional) */}
            {/* Parsed preview (bigger, no ID) */}
            {(parsedJ || parsedCorp) && (
                <div className="mb-6 text-green-200 text-base sm:text-lg">
                    {parsedJ && (
                        <>
                            <span className="text-green-400/80">System:</span>{" "}
                            <a
                                className="underline font-semibold"
                                href={`https://anoik.is/systems/${parsedJ}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {parsedJ}
                            </a>
                        </>
                    )}

                    {parsedJ && parsedCorp && (
                        <br/>
                    )}

                    {parsedCorp && (
                        <>
                            <span className="text-green-400/80">Corp:</span>{" "}
                            <span className="font-medium">{parsedCorp}</span>
                            {corpResolving && (
                                <span className="ml-2 text-green-400/70 text-sm">(resolving…)</span>
                            )}
                            {!corpResolving && corpId && (
                                <>
                                    {" "}
                                    (
                                    <a
                                        className="underline"
                                        href={`https://zkillboard.com/corporation/${corpId}/`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        zKill
                                    </a>
                                    )
                                </>
                            )}
                        </>
                    )}
                </div>
            )}



            {err && <p className="text-red-400">{err}</p>}

            {data && (
                <div className="space-y-2 text-green-200">
                    <p><span className="text-green-400/80">Estimate:</span> between <b>{fmtUTC(data.lowISO)}</b> and <b>{fmtUTC(data.highISO)}</b></p>
                    <p><span className="text-green-400/80">Midpoint:</span> {fmtUTC(data.midISO)} <span className="text-green-500/70">({data.method})</span></p>
                    <p><span className="text-green-400/80">Window width:</span> {data.daysWide} days</p>
                    {data && (
                        (() => {
                            const midAgeDays = ageDaysFromNow(data.midISO);
                            const ageText =
                                midAgeDays >= 0
                                    ? `≈ ${humanizeDays(midAgeDays)} old`
                                    : `anchors in ≈ ${humanizeDays(-midAgeDays)}`;

                            return (
                                <p className="text-green-200">
                                    <span className="text-green-400/80">Estimated age:</span> {ageText}
                                </p>
                            );
                        })()
                    )}
                {parsedJ && <SystemIntel jcode={parsedJ} />}

                </div>
            )}
            <InfoBox />
        </div>
    );
}
