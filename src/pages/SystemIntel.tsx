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
