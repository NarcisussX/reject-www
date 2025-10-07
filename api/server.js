import 'dotenv/config'
// basic auth for admin
function requireAdmin(req, res, next) {
    const hdr = req.headers.authorization || ''
    if (!hdr.startsWith('Basic ')) return res.set('WWW-Authenticate', 'Basic realm="admin"').status(401).end()
    const [user, pass] = Buffer.from(hdr.slice(6), 'base64').toString().split(':')
    if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) return next()
    return res.status(403).end()
}


// admin CRUD
app.post('/admin/systems', requireAdmin, (req, res) => {
    const { jcode, ransomISK, structures } = req.body || {}
    if (!/^J\d{6}$/i.test(jcode)) return res.status(400).json({ error: 'Invalid J-code' })
    const tx = db.transaction(() => {
        const { lastInsertRowid } = db.prepare('INSERT INTO systems (jcode, ransom_isk) VALUES (?, ?)').run(jcode.toUpperCase(), toISK(ransomISK))
        const stmt = db.prepare('INSERT INTO structures (system_id, kind, fit_text, estimated_value_isk) VALUES (?,?,?,?)')
        for (const s of structures || []) stmt.run(lastInsertRowid, s.kind, s.fitText, toISK(s.estimatedISK))
    })
    try { tx(); res.sendStatus(201) } catch (e) { res.status(409).json({ error: 'Already exists?' }) }
})


app.put('/admin/systems/:jcode', requireAdmin, (req, res) => {
    const j = (req.params.jcode || '').toUpperCase()
    const { ransomISK, structures } = req.body || {}
    const sys = db.prepare('SELECT id FROM systems WHERE jcode = ?').get(j)
    if (!sys) return res.sendStatus(404)
    const tx = db.transaction(() => {
        db.prepare('UPDATE systems SET ransom_isk = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(toISK(ransomISK), sys.id)
        db.prepare('DELETE FROM structures WHERE system_id = ?').run(sys.id)
        const stmt = db.prepare('INSERT INTO structures (system_id, kind, fit_text, estimated_value_isk) VALUES (?,?,?,?)')
        for (const s of structures || []) stmt.run(sys.id, s.kind, s.fitText, toISK(s.estimatedISK))
    })
    try { tx(); res.sendStatus(204) } catch (e) { res.status(500).json({ error: 'Update failed' }) }
})


app.get('/admin/systems/:jcode', requireAdmin, (req, res) => {
    const data = getSystem((req.params.jcode || '').toUpperCase())
    if (!data) return res.sendStatus(404)
    res.json(data)
})


app.delete('/admin/systems/:jcode', requireAdmin, (req, res) => {
    const j = (req.params.jcode || '').toUpperCase()
    const r = db.prepare('DELETE FROM systems WHERE jcode = ?').run(j)
    if (!r.changes) return res.sendStatus(404)
    res.sendStatus(204)
})


const port = 4000
app.listen(port, () => console.log(`API listening on ${port}`))