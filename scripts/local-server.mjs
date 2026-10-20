import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export async function serveRoots(roots, port = 0) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost'), parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    const name = parts.shift(), root = roots[name];
    if (!root) { res.writeHead(404).end(); return; }
    const target = path.resolve(root, parts.join('/') || 'index.html');
    if (!target.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
    let stat; try { stat = fs.statSync(target); if (!stat.isFile()) throw Error(); } catch { res.writeHead(404).end(); return; }
    const etag = `"${stat.size}-${stat.mtimeMs}"`, extension = path.extname(target);
    const mime = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[extension] || 'application/octet-stream';
    const headers = { 'Content-Type': mime, ETag: etag, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' };
    let status = 200, start = 0, end = stat.size - 1;
    if (req.headers['if-none-match'] === etag) { requests.push({ path: url.pathname, status: 304, bytes: 0 }); res.writeHead(304, headers).end(); return; }
    if (req.headers.range) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!range || Number(range[1]) >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
      start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end; status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = String(end - start + 1);
    requests.push({ path: url.pathname, status, range: req.headers.range ?? null, bytes: end - start + 1 });
    res.writeHead(status, headers);
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(target, { start, end }).pipe(res);
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
