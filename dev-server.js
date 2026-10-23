// Local stand-in for Vercel: serves public/ and runs api/*.js handlers.
// Usage: npm run dev  (then open http://localhost:3000)

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) return raw ? JSON.parse(raw) : {};
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  return raw;
}

function withHelpers(res) {
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  res.send = (data) => res.end(typeof data === 'string' ? data : JSON.stringify(data));
  return res;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
        const mod = await import(pathToFileURL(join(ROOT, 'api', `${name}.js`)).href);
        req.query = Object.fromEntries(url.searchParams);
        req.body = await readBody(req);
        return await mod.default(req, withHelpers(res));
      }
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      if (path.endsWith('/')) path += 'index.html';
      let file = join(ROOT, 'public', path);
      if (!extname(file)) file += '.html';
      await stat(file);
      res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND') {
        res.statusCode = 404;
        return res.end('Not found');
      }
      console.error(e);
      res.statusCode = 500;
      res.end('Server error');
    }
  })
  .listen(PORT, () => console.log(`FindMe running on http://localhost:${PORT}`));
