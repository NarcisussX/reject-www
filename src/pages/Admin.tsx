import { useState } from 'react'


export default function Admin() {
    const [auth, setAuth] = useState({ u: '', p: '' })
    const [jcode, setJ] = useState('')
    const [ransom, setR] = useState('')
    const [rows, setRows] = useState([{ kind: 'Astrahus', estimatedISK: '0', fitText: '' }])


    function addRow() { setRows([...rows, { kind: 'Athanor', estimatedISK: '0', fitText: '' }]) }
    function rmRow(i: number) { setRows(rows.filter((_, idx) => idx !== i)) }


    async function save(e: React.FormEvent) {
        e.preventDefault()
        const body = {
            jcode: jcode.toUpperCase(),
            ransomISK: ransom, // send raw
            structures: rows.map(r => ({ kind: r.kind, estimatedISK: r.estimatedISK, fitText: r.fitText })) // send raw
        }
        const r = await fetch('/api/admin/systems', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa(auth.u + ':' + auth.p) },
            body: JSON.stringify(body)
        })
        alert(r.ok ? 'Saved' : 'Failed')
    }


    return (
        <div className="min-h-dvh bg-black text-green-400 font-mono p-6">
            <h1 className="text-2xl">Admin — Add System</h1>
            <form onSubmit={save} className="mt-4 space-y-3">
                <div className="grid md:grid-cols-3 gap-3">
                    <input placeholder="Admin user" value={auth.u} onChange={e => setAuth(a => ({ ...a, u: e.target.value }))} className="bg-black border border-green-500/40 rounded px-3 py-2" />
                    <input placeholder="Admin pass" type="password" value={auth.p} onChange={e => setAuth(a => ({ ...a, p: e.target.value }))} className="bg-black border border-green-500/40 rounded px-3 py-2" />
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                    <input placeholder="J-code (J123456)" value={jcode} onChange={e => setJ(e.target.value)} className="bg-black border border-green-500/40 rounded px-3 py-2" />
                    <input placeholder="Ransom ISK" value={ransom} onChange={e => setR(e.target.value)} className="bg-black border border-green-500/40 rounded px-3 py-2" />
                </div>
                <div className="space-y-3">
                    {rows.map((r, i) => (
                        <div key={i} className="border border-green-500/30 rounded p-3 grid md:grid-cols-3 gap-2">
                            <input value={r.kind} onChange={e => setRows(rs => rs.map((x, idx) => idx === i ? { ...x, kind: e.target.value } : x))} placeholder="Structure Kind" className="bg-black border border-green-500/40 rounded px-3 py-2" />
                            <input value={r.estimatedISK} onChange={e => setRows(rs => rs.map((x, idx) => idx === i ? { ...x, estimatedISK: e.target.value } : x))} placeholder="Estimated ISK" className="bg-black border border-green-500/40 rounded px-3 py-2" />
                            <textarea value={r.fitText} onChange={e => setRows(rs => rs.map((x, idx) => idx === i ? { ...x, fitText: e.target.value } : x))} placeholder="Paste fit" className="bg-black border border-green-500/40 rounded px-3 py-2 md:col-span-3" rows={4} />
                            <div className="md:col-span-3 flex justify-end gap-2">
                                <button type="button" onClick={() => rmRow(i)} className="px-3 py-2 border border-green-500/40 rounded">Remove</button>
                                {i === rows.length - 1 && <button type="button" onClick={addRow} className="px-3 py-2 bg-green-600 text-black rounded">Add Row</button>}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end">
                    <button className="px-4 py-2 bg-green-600 text-black font-bold rounded">Save System</button>
                </div>
            </form>
        </div>
    )
}