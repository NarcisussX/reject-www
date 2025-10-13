import { useEffect, useMemo, useState } from "react";

type ListItem = {
    jcode: string;
    ransomISK: number;
    structuresCount: number;
    totalStructuresISK: number;
    created_at: string;
    updated_at: string;
    evicted?: number | boolean;
    ransomed?: boolean | number;
};

type Row = { kind: string; estimatedISK: string; fitText: string };
type Editing = { jcode: string; ransomISK: string; rows: Row[]; notes: string };

const AUTH_KEY = "reject.admin.auth"; // base64 "user:pass" in sessionStorage

export default function Admin() {
    const [authB64, setAuthB64] = useState<string | null>(() =>
        sessionStorage.getItem(AUTH_KEY)
    );
    const [list, setList] = useState<ListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [editing, setEditing] = useState<Editing | null>(null);

    const authedFetch = useMemo(() => {
        return async (path: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers || {});
            if (authB64) headers.set("Authorization", "Basic " + authB64);
            const res = await fetch(`/api${path}`, { ...init, headers });
            return res;
        };
    }, [authB64]);

    async function loadList(q = "") {
        setLoading(true);
        try {
            const res = await authedFetch(
                `/admin/systems${q ? `?search=${encodeURIComponent(q)}` : ""}`
            );
            if (res.status === 401 || res.status === 403) {
                setAuthB64(null);
                sessionStorage.removeItem(AUTH_KEY);
                return;
            }
            const data = (await res.json()) as ListItem[];
            setList(data.map(d => ({
                ...d,
                evicted: !!(d as any).evicted,
                ransomed: !!(d as any).ransomed,
            })));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (authB64) loadList();
    }, [authB64]);

    async function startEdit(jcode: string) {
        const r = await authedFetch(`/admin/systems/${jcode}`);
        if (!r.ok) return;
        const data = await r.json();
        setEditing({
            jcode: data.jcode,
            ransomISK: String(data.ransomISK || ""),
            notes: String(data.notes || ""),
            rows: (data.structures || []).map((s: any) => ({
                kind: s.kind,
                estimatedISK: String(s.estimatedISK || ""),
                fitText: s.fitText,
            })),
        });
    }
    async function toggleEvicted(item: ListItem, next: boolean) {
        const r = await authedFetch(`/admin/systems/${item.jcode}/evicted`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evicted: next }),
        });
        if (r.ok) {
            setList(list => list.map(x => x.jcode === item.jcode ? { ...x, evicted: next } : x));
        } else {
            alert('Failed to update evicted flag');
        }
    }
    async function toggleRansomed(item: ListItem, next: boolean) {
        const r = await authedFetch(`/admin/systems/${item.jcode}/ransomed`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ransomed: next }),
        });
        if (r.ok) {
            setList(list => list.map(x => x.jcode === item.jcode ? { ...x, ransomed: next } : x));
        } else {
            alert("Failed to update ransomed flag");
        }
    }

    async function handleDelete(jcode: string) {
        if (!confirm(`Delete ${jcode}?`)) return;
        const r = await authedFetch(`/admin/systems/${jcode}`, { method: "DELETE" });
        if (r.ok) loadList(search);
    }

    if (!authB64) return <Login onAuthed={setAuthB64} />;

    return (
        <div className="min-h-dvh bg-black text-green-400 font-mono p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-2xl">Admin — Ransom Appraisals</h1>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => loadList(search)}
                            className="px-3 py-2 border border-green-500/40 rounded hover:bg-green-600/10"
                        >
                            Refresh
                        </button>
                        <button
                            onClick={() => {
                                sessionStorage.removeItem(AUTH_KEY);
                                setAuthB64(null);
                            }}
                            className="px-3 py-2 border border-red-500/40 text-red-300 rounded hover:bg-red-600/10"
                        >
                            Log out
                        </button>
                    </div>
                </div>

                {/* Search + New */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search J-code (e.g., J123)"
                        className="bg-black border border-green-500/40 rounded px-3 py-2"
                    />
                    <button
                        onClick={() => loadList(search)}
                        className="px-3 py-2 bg-green-600 text-black font-bold rounded"
                    >
                        Search
                    </button>
                    <button
                        onClick={() =>
                            setEditing({ jcode: "", ransomISK: "", rows: [emptyRow()], notes: "" })
                        }
                        className="px-3 py-2 border border-green-500/40 rounded hover:bg-green-600/10"
                    >
                        New System
                    </button>
                </div>

                {/* List */}
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left border border-green-500/20 rounded overflow-hidden">
                        <thead className="bg-green-900/20">
                            <tr className="[&>th]:px-3 [&>th]:py-2">
                                <th>J-code</th>
                                <th>Ransom ISK</th>
                                <th># Structures</th>
                                <th>Total Structures ISK</th>
                                <th>Updated</th>
                                <th className="text-right pr-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-2">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="text-center text-green-300/70">
                                        Loading…
                                    </td>
                                </tr>
                            ) : list.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-center text-green-300/70">
                                        No systems
                                    </td>
                                </tr>
                            ) : (
                                list.map((item) => (
                                    <tr
                                        key={item.jcode}
                                        className="border-t border-green-500/10"
                                    >
                                        <td className="font-bold">{item.jcode}</td>
                                        <td>{fmtISK(item.ransomISK)}</td>
                                        <td>{item.structuresCount}</td>
                                        <td>{fmtISK(item.totalStructuresISK)}</td>
                                        <td className="text-green-300/70">
                                            {new Date(
                                                item.updated_at || item.created_at
                                            ).toLocaleString()}
                                        </td>
                                        <td className="text-right">
                                            <label className="inline-flex items-center gap-2 mr-3 align-middle">
                                                <input
                                                    type="checkbox"
                                                    checked={!!item.evicted}
                                                    onChange={(e) => toggleEvicted(item, e.target.checked)}
                                                    className="accent-red-500"
                                                    title="Mark as evicted"
                                                />
                                                <span className="text-red-300/80 text-xs uppercase tracking-wide">evicted</span>
                                            </label>
                                            <label className="inline-flex items-center gap-2 mr-3 align-middle">
                                                <input
                                                    type="checkbox"
                                                    checked={!!item.ransomed}
                                                    onChange={(e) => toggleRansomed(item, e.target.checked)}
                                                    className="accent-sky-500"
                                                    title="Mark as ransomed"
                                                />
                                                <span className="text-sky-300/80 text-xs uppercase tracking-wide">ransomed</span>
                                            </label>
                                            <button
                                                onClick={() => startEdit(item.jcode)}
                                                className="px-2 py-1 border border-green-500/40 rounded hover:bg-green-600/10 mr-2"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.jcode)}
                                                className="px-2 py-1 border border-red-500/40 text-red-300 rounded hover:bg-red-600/10"
                                            >
                                                Delete
                                            </button>
                                        </td>

                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Editor (render only when editing exists) */}
                {editing && (
                    <Editor
                        authedFetch={authedFetch}
                        editing={editing}
                        setEditing={setEditing}
                        onSaved={() => {
                            setEditing(null);
                            loadList(search);
                        }}
                    />
                )}
            </div>
        </div>
    );
}

/* ---------------- Login ---------------- */

function Login({ onAuthed }: { onAuthed: (b64: string) => void }) {
    const [u, setU] = useState("");
    const [p, setP] = useState("");
    const [err, setErr] = useState("");

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr("");
        const b64 = btoa(`${u}:${p}`);
        const r = await fetch("/api/admin/systems", {
            headers: { Authorization: "Basic " + b64 },
        });
        if (r.status === 401 || r.status === 403) {
            setErr("Invalid credentials");
            return;
        }
        sessionStorage.setItem(AUTH_KEY, b64);
        onAuthed(b64);
    }

    return (
        <div className="min-h-dvh bg-black text-green-400 font-mono grid place-items-center p-6">
            <form
                onSubmit={submit}
                className="w-full max-w-sm border border-green-500/40 rounded p-4 bg-black"
            >
                <h1 className="text-xl mb-3">Admin login</h1>
                <input
                    value={u}
                    onChange={(e) => setU(e.target.value)}
                    placeholder="User"
                    className="w-full bg-black border border-green-500/40 rounded px-3 py-2 mb-2"
                />
                <input
                    value={p}
                    onChange={(e) => setP(e.target.value)}
                    placeholder="Password"
                    type="password"
                    className="w-full bg-black border border-green-500/40 rounded px-3 py-2"
                />
                {err && <div className="mt-2 text-red-300">{err}</div>}
                <div className="mt-3 flex justify-end">
                    <button className="px-3 py-2 bg-green-600 text-black font-bold rounded">
                        Enter
                    </button>
                </div>
            </form>
        </div>
    );
}

/* ---------------- Editor ---------------- */

function emptyRow(): Row {
    return { kind: "Astrahus", estimatedISK: "", fitText: "" };
}

function fmtISK(n: number) {
    return `${(n || 0).toLocaleString()} ISK`;
}

function Editor({
    authedFetch,
    editing,
    setEditing,
    onSaved,
}: {
    authedFetch: (path: string, init?: RequestInit) => Promise<Response>;
    editing: Editing;                               // <-- non-nullable now
    setEditing: (e: Editing | null) => void;
    onSaved: () => void;
}) {

    async function save(e: React.FormEvent) {
        e.preventDefault();
        const body = {
            jcode: editing.jcode.toUpperCase(),
            ransomISK: editing.ransomISK, // send raw; server parses
            notes: editing.notes,
            structures: editing.rows.map((r) => ({
                kind: r.kind,
                estimatedISK: r.estimatedISK, // raw; server parses
                fitText: r.fitText,
            })),
        };

        // POST upsert; if it fails for some reason, try PUT
        let r = await authedFetch("/admin/systems", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            r = await authedFetch(`/admin/systems/${body.jcode}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
        }
        if (r.ok) {
            setEditing(null);
            onSaved();
        } else {
            alert("Save failed");
        }
    }

    return (
        <div className="mt-8 border border-green-500/30 rounded p-4 bg-black">
            <h2 className="text-xl">Edit — {editing.jcode || "New"}</h2>
            <form onSubmit={save} className="mt-4 space-y-3">
                <div className="grid md:grid-cols-3 gap-3">
                    <input
                        value={editing.jcode}
                        onChange={(e) => setEditing({ ...editing, jcode: e.target.value })}
                        placeholder="J-code (J123456)"
                        className="bg-black border border-green-500/40 rounded px-3 py-2"
                    />
                    <input
                        value={editing.ransomISK}
                        onChange={(e) =>
                            setEditing({ ...editing, ransomISK: e.target.value })
                        }
                        placeholder="Ransom (e.g., 1.2b, 900m)"
                        className="bg-black border border-green-500/40 rounded px-3 py-2"
                    />
                    <div className="text-green-300/70 self-center">
                        Supports k/m/b and commas
                    </div>
                </div>
                <textarea
                    value={editing.notes}
                    onChange={e => setEditing({ ...editing, notes: e.target.value })}
                    placeholder="Notes for this J-code (shown on the public page below the structures)"
                    className="w-full bg-black border border-green-500/40 rounded px-3 py-2"
                    rows={4}
                />
                <div className="space-y-3">
                    {editing.rows.map((r, i) => (
                        <div
                            key={i}
                            className="border border-green-500/30 rounded p-3 grid md:grid-cols-3 gap-2"
                        >

                            <input
                                value={r.kind}
                                onChange={(e) => {
                                    const rows = editing.rows.slice();
                                    rows[i] = { ...rows[i], kind: e.target.value };
                                    setEditing({ ...editing, rows });
                                }}
                                placeholder="Structure Kind"
                                className="bg-black border border-green-500/40 rounded px-3 py-2"
                            />
                            <input
                                value={r.estimatedISK}
                                onChange={(e) => {
                                    const rows = editing.rows.slice();
                                    rows[i] = { ...rows[i], estimatedISK: e.target.value };
                                    setEditing({ ...editing, rows });
                                }}
                                placeholder="Estimated ISK (e.g., 900m)"
                                className="bg-black border border-green-500/40 rounded px-3 py-2"
                            />
                            <textarea
                                value={r.fitText}
                                onChange={(e) => {
                                    const rows = editing.rows.slice();
                                    rows[i] = { ...rows[i], fitText: e.target.value };
                                    setEditing({ ...editing, rows });
                                }}
                                placeholder="Paste fit"
                                className="bg-black border border-green-500/40 rounded px-3 py-2 md:col-span-3"
                                rows={4}
                            />
                            <div className="md:col-span-3 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const rows = editing.rows.slice();
                                        rows.splice(i, 1);
                                        setEditing({ ...editing, rows: rows.length ? rows : [emptyRow()] });
                                    }}
                                    className="px-3 py-2 border border-green-500/40 rounded"
                                >
                                    Remove
                                </button>
                                {i === editing.rows.length - 1 && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setEditing({ ...editing, rows: [...editing.rows, emptyRow()] })
                                        }
                                        className="px-3 py-2 bg-green-600 text-black rounded"
                                    >
                                        Add Row
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="px-4 py-2 border border-green-500/40 rounded"
                    >
                        Cancel
                    </button>
                    <button className="px-4 py-2 bg-green-600 text-black font-bold rounded">
                        Save
                    </button>
                </div>
            </form>
        </div>
    );
}
