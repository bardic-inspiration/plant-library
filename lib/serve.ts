/**
 * A static file server for the built site, under the configured base path.
 * Honors HTTP range requests, as the basemap's PMTiles file needs. Node only.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pmtiles': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

export function serve(dist: string, base: string, port = 4321): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    let path = decodeURIComponent(u.pathname);
    if (!path.startsWith(base)) {
      res.writeHead(302, { location: base });
      res.end();
      return;
    }
    path = normalize(path.slice(base.length)).replace(/^(\.\.[/\\])+/, '');
    let file = join(dist, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      const nf = join(dist, '404.html');
      if (existsSync(nf)) createReadStream(nf).pipe(res);
      else res.end('Not found');
      return;
    }
    const size = statSync(file).size;
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? Number(range[1]) : size - Number(range[2]);
      const end = range[1] && range[2] ? Number(range[2]) : size - 1;
      if (start >= size || end >= size || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1, 'accept-ranges': 'bytes' });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${port}${base}` })));
}
