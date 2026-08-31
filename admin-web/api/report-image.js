/**
 * Same-origin image proxy for admin export backups.
 * Browser fetch of Firebase Storage URLs is often blocked by CORS; this
 * serverless function downloads server-side and returns the bytes.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end('Method not allowed');
    return;
  }

  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  if (!rawUrl) {
    res.statusCode = 400;
    res.end('Missing url');
    return;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.statusCode = 400;
    res.end('Invalid url');
    return;
  }

  const host = parsed.hostname.toLowerCase();
  const allowed =
    host === 'firebasestorage.googleapis.com' ||
    host.endsWith('.googleapis.com') ||
    host.endsWith('.firebasestorage.app') ||
    host.endsWith('.storage.googleapis.com');

  if (!allowed || parsed.protocol !== 'https:') {
    res.statusCode = 400;
    res.end('URL host not allowed');
    return;
  }

  try {
    const upstream = await fetch(rawUrl);
    if (!upstream.ok) {
      res.statusCode = upstream.status;
      res.end(`Upstream failed (${upstream.status})`);
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (error) {
    res.statusCode = 502;
    res.end(error instanceof Error ? error.message : 'Proxy failed');
  }
};
