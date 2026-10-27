// API local com o mesmo handler do Worker. O banco é um SQLite em worker/.data.
// Produção usa `npx wrangler dev` ou `npx wrangler deploy` com D1.

import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteD1 } from './src/sqlite-d1.js';
import { handleRequest } from './src/http.js';

const port = Number(process.env.PORT || 8787);
const root = new URL('./.data/', import.meta.url);
mkdirSync(root, { recursive: true });
const file = new URL('./local.sqlite', root);
const sqlite = new DatabaseSync(file.pathname);
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec(readFileSync(new URL('./migrations/0001_init.sql', import.meta.url), 'utf8'));

const env = {
  DB: createSqliteD1(sqlite),
  ALLOWED_ORIGINS:
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173,https://docao-capitalist.vercel.app',
  QUIET: process.env.QUIET || '',
};

function headersFrom(incoming) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null) continue;
    if (key === 'host' || key === 'connection' || key === 'content-length' || key === 'transfer-encoding') continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const host = req.headers.host || `127.0.0.1:${port}`;
    const request = new Request(`http://${host}${req.url}`, {
      method: req.method,
      headers: headersFrom(req.headers),
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    const response = await handleRequest(request, env);
    const bytes = Buffer.from(await response.arrayBuffer());
    const headers = Object.fromEntries(response.headers);
    res.writeHead(response.status, headers);
    res.end(bytes);
  } catch (error) {
    console.error(JSON.stringify({ message: 'dev server failed', error: error instanceof Error ? error.message : String(error) }));
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'server' }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ message: 'api local', url: `http://127.0.0.1:${port}` }));
});
