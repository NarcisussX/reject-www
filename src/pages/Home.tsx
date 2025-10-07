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
    <div className="screen bg-black text-green-400 font-mono">
      {/* tiny CSS for the matrix scroll, scoped to this page */}
      <style>{`
        @keyframes matrix-scroll { to { transform: translateY(100%); } }
        .matrix-col { animation: matrix-scroll 12s linear infinite; }
      `}</style>

      {/* faint binary background */}
      <div className="matrix pointer-events-none">
        <div className="absolute inset-0 overflow-hidden">
          <pre className="matrix-col opacity-70 select-none" style={{ position:'absolute', top:'-100%', left:0, right:0 }}>
{`01101001 01110011 01101011
01010010 01100101 01101110 01110100
01000010 01100101 01100001 01110010
01001001 01110011 01101011
01000100 01100101 01100001 01101100
01010000 01100001 01111001`}
          </pre>
        </div>
      </div>

      <div className="wrap">
        <div className="container content">
          {/* Header line */}
          <div className="header">
            <div className="badge glow">REJECTED APPLICATIONS INC.</div>
          </div>

          {/* Main */}
          <main className="grid place-items-start">
            <section className="w-full">
              <h1 className="glow text-5xl md:text-6xl leading-tight">Asset Relocation Specialists</h1>
              <p className="mt-4 text-green-300/90 max-w-prose">
                We relocate your assets. No motivation required beyond ISK. Buy us off with a ransom and we disappear.
              </p>

              <form onSubmit={submit} className="panel mt-8">
                <label className="block text-green-300/80 mb-2">Are we reffing your structures? Camping your hole?</label>
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

              {/* terminal flavor box */}
              <div className="panel mt-6">
                <div className="term" style={{ maxHeight: 180 }}>
                  <div className="row">Initializing eviction workflow… <span className="blink">_</span></div>
                  <div className="row">Scanning local structures… Astrahus detected.</div>
                  <div className="row">Negotiation channel open. Ransom accepted in ISK only.</div>
                  <div className="row">Tip: Bring your wallet. Or bring content.</div>
                </div>
              </div>
            </section>
          </main>

          {/* Footer */}
          <footer className="footer">
            <div>© 2025 Rejected Applications Inc.</div>
            <div>Asset Relocation Specialists — “We relocate your assets.”</div>
          </footer>
        </div>
      </div>
    </div>
  )
}
