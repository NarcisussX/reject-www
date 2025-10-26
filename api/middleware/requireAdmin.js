export default function requireAdmin(req, res, next) {
  const hdr = req.headers.authorization || '';
  if (!hdr.startsWith('Basic ')) {
    return res.set('WWW-Authenticate', 'Basic realm="admin"').status(401).end();
  }
  const [user, pass] = Buffer.from(hdr.slice(6), 'base64').toString().split(':');
  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) return next();
  return res.status(403).end();
}
