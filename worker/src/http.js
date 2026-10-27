import { hashPassword, randomToken, sha256Hex, verifyPassword } from './password.js';

const ACCEPTED_VERSIONS = new Set([1, 2]);
const SESSION_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_BODY = 80_000;

let dummyHashPromise = null;

function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('not-a-real-password-value');
  return dummyHashPromise;
}

export function originAllowed(origin, allowedList) {
  if (!origin || typeof origin !== 'string') return false;
  const list = String(allowedList || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.includes(origin)) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname;
  return host.endsWith('.vercel.app') && host.includes('docao-capitalist');
}

function corsFor(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !originAllowed(origin, env.ALLOWED_ORIGINS || '')) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors,
    },
  });
}

function tooBig() {
  const error = new Error('too_big');
  error.code = 'too_big';
  return error;
}

async function readJson(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) throw tooBig();
  const text = await request.text();
  if (text.length > MAX_BODY) throw tooBig();
  if (!text) return {};
  return JSON.parse(text);
}

function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const value = email.trim().toLowerCase();
  if (value.length < 3 || value.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

function normalizePassword(password) {
  if (typeof password !== 'string') return null;
  if (password.length < 8 || password.length > 200) return null;
  return password;
}

function readRev(save) {
  if (!save || !Number.isInteger(save.rev) || save.rev < 0) return 0;
  return save.rev;
}

function validateSave(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return false;
  if (!ACCEPTED_VERSIONS.has(save.v)) return false;
  if (!Array.isArray(save.businesses) || save.businesses.length > 24) return false;
  if (typeof save.totalEarned !== 'number' || !Number.isFinite(save.totalEarned)) return false;
  if (save.totalEarned < 0 || save.totalEarned > 1e18) return false;
  if (typeof save.money !== 'number' || !Number.isFinite(save.money)) return false;
  if (save.money < 0 || save.money > 1e18) return false;
  if (save.rev !== undefined && (!Number.isInteger(save.rev) || save.rev < 0 || save.rev > 1e15)) return false;
  return true;
}

async function userFromRequest(request, db) {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+([a-f0-9]{64})$/i.exec(header);
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1].toLowerCase());
  const row = await db
    .prepare(
      `SELECT users.id AS id, users.email AS email
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .bind(tokenHash, Date.now())
    .first();
  return row || null;
}

async function issueSession(db, userId) {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expires = Date.now() + SESSION_MS;
  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, userId, expires)
    .run();
  return token;
}

async function register(request, env, cors) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password);
  if (!email) return json({ error: 'invalid_email' }, 400, cors);
  if (!password) return json({ error: 'invalid_password' }, 400, cors);
  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, email, passwordHash, Date.now())
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('UNIQUE')) return json({ error: 'email_taken' }, 409, cors);
    throw error;
  }
  const token = await issueSession(env.DB, id);
  return json({ token, email }, 201, cors);
}

async function login(request, env, cors) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return json({ error: 'bad_login' }, 401, cors);
  const user = await env.DB.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').bind(email).first();
  const hash = user?.password_hash || (await dummyHash());
  const ok = await verifyPassword(password, hash);
  if (!user || !ok) return json({ error: 'bad_login' }, 401, cors);
  const token = await issueSession(env.DB, user.id);
  return json({ token, email: user.email }, 200, cors);
}

async function logout(request, env, cors) {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+([a-f0-9]{64})$/i.exec(header);
  if (match) {
    const tokenHash = await sha256Hex(match[1].toLowerCase());
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  return new Response(null, { status: 204, headers: cors });
}

async function me(request, env, cors) {
  const user = await userFromRequest(request, env.DB);
  if (!user) return json({ error: 'unauthorized' }, 401, cors);
  return json({ email: user.email }, 200, cors);
}

async function getSave(request, env, cors) {
  const user = await userFromRequest(request, env.DB);
  if (!user) return json({ error: 'unauthorized' }, 401, cors);
  const row = await env.DB.prepare('SELECT payload, updated_at FROM saves WHERE user_id = ?').bind(user.id).first();
  if (!row) return json({ save: null, updatedAt: null }, 200, cors);
  try {
    return json({ save: JSON.parse(row.payload), updatedAt: row.updated_at }, 200, cors);
  } catch {
    return json({ save: null, updatedAt: null }, 200, cors);
  }
}

async function putSave(request, env, cors) {
  const user = await userFromRequest(request, env.DB);
  if (!user) return json({ error: 'unauthorized' }, 401, cors);
  const body = await readJson(request);
  if (!validateSave(body.save)) return json({ error: 'bad_save' }, 400, cors);
  const incoming = body.save;
  const force = body.force === true;
  const existing = await env.DB.prepare('SELECT payload, updated_at FROM saves WHERE user_id = ?')
    .bind(user.id)
    .first();
  if (existing && !force) {
    let prev = null;
    try {
      prev = JSON.parse(existing.payload);
    } catch {
      prev = null;
    }
    if (prev && Number.isFinite(Number(prev.totalEarned))) {
      const prevEarned = Number(prev.totalEarned);
      const nextEarned = Number(incoming.totalEarned);
      const stale = nextEarned < prevEarned || (nextEarned === prevEarned && readRev(incoming) < readRev(prev));
      if (stale) return json({ error: 'stale', save: prev, updatedAt: existing.updated_at }, 409, cors);
    }
  }
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO saves (user_id, payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  )
    .bind(user.id, JSON.stringify(incoming), now)
    .run();
  return json({ ok: true, updatedAt: now }, 200, cors);
}

async function route(request, env, path, cors) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (path === '/api/health' && request.method === 'GET') return json({ ok: true }, 200, cors);
  if (path === '/api/register' && request.method === 'POST') return register(request, env, cors);
  if (path === '/api/login' && request.method === 'POST') return login(request, env, cors);
  if (path === '/api/logout' && request.method === 'POST') return logout(request, env, cors);
  if (path === '/api/me' && request.method === 'GET') return me(request, env, cors);
  if (path === '/api/save' && request.method === 'GET') return getSave(request, env, cors);
  if (path === '/api/save' && request.method === 'PUT') return putSave(request, env, cors);
  return json({ error: 'not_found' }, 404, cors);
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const cors = corsFor(request, env);
  const started = Date.now();
  let response;
  try {
    response = await route(request, env, path, cors);
  } catch (error) {
    const code = error?.code === 'too_big' ? 'too_big' : error instanceof SyntaxError ? 'bad_json' : 'server';
    const status = code === 'too_big' ? 413 : code === 'bad_json' ? 400 : 500;
    if (code === 'server') {
      console.error(
        JSON.stringify({
          message: 'request failed',
          path,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    response = json({ error: code }, status, cors);
  }
  if (!env.QUIET) {
    console.log(
      JSON.stringify({
        message: 'request',
        method: request.method,
        path,
        status: response.status,
        ms: Date.now() - started,
      }),
    );
  }
  return response;
}
