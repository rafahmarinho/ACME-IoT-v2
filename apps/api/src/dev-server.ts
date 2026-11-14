/**
 * Local development server that serves the same handlers Vercel deploys from /api.
 * Run with `pnpm dev:api` from the repo root.
 */
import { createServer } from 'node:http';
import { json, preflight } from './lib/http.js';
import { routes } from './routes/index.js';

const port = Number(process.env.PORT ?? 3001);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks),
  });

  let response: Response;
  if (req.method === 'OPTIONS') response = preflight(request);
  else if (url.pathname === '/api/health') response = json({ ok: true, service: 'acme-iot-api', time: new Date().toISOString() });
  else if (routes[url.pathname] && req.method === 'POST') response = await routes[url.pathname](request);
  else response = json({ error: 'Not found', code: 'not_found' }, 404, request.headers.get('origin'));

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
  console.log(`${req.method} ${url.pathname} → ${response.status}`);
}).listen(port, () => console.log(`ACME IoT API listening on http://localhost:${port}`));
