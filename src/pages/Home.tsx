import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const [j, setJ] = useState('')
  const nav = useNavigate()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const J = j.trim().toUpperCase()
    if (!/^J\d{6}$/.test(J)) return alert('Enter a valid J-code like J123456')
    nav(`/j/${J}`)
  }

  return (
    <div className="bg-black text-green-400 font-mono">
      <div className="mx-auto max-w-4xl px-4 md:px-6 py-8 md:py-12">
        <div className="text-xs tracking-widest text-green-300/70 mb-3">
          REJECTED APPLICATIONS INC.
        </div>

        <h1 className="glow text-5xl md:text-7xl leading-tight">
          Asset<br/>Relocation<br/>Specialists
        </h1>

        <p className="mt-6 text-green-300/90 max-w-prose">
          We relocate your assets. No motivation required beyond ISK. Buy us off with a ransom and we disappear.
        </p>

        <form onSubmit={submit} className="panel panel-solid mt-8">
          <label className="block text-green-300/80 mb-2">
            Are we reffing your structures? Camping your hole?
          </label>
          <div className="flex gap-2">
            <input
              value={j}
              onChange={(e) => setJ(e.target.value)}
              placeholder="Enter your J-code (e.g., J123456)"
            />
            <button type="submit">Lookup</button>
          </div>
          <div className="mt-4 text-green-500/80 text-sm">
            — Enter your J-code to view your personalized eviction ransom appraisal and next steps.
          </div>
        </form>

        <div className="panel panel-solid mt-6">
          <div className="term" style={{ maxHeight: 180 }}>
            <div className="row">Initializing eviction workflow… <span className="blink">_</span></div>
            <div className="row">Scanning local structures… Astrahus detected.</div>
            <div className="row">Negotiation channel open. Ransom accepted in ISK only.</div>
            <div className="row">Tip: Bring your wallet. Or bring content.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
