import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { buy, createState, hydrate, serialize, startCycle } from '../src/economy.js';
import { handleRequest, originAllowed } from '../worker/src/http.js';
import { createSqliteD1 } from '../worker/src/sqlite-d1.js';

function memoryDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../worker/migrations/0001_init.sql', import.meta.url), 'utf8'));
  return createSqliteD1(sqlite);
}

function envFor(db) {
  return {
    DB: db,
    ALLOWED_ORIGINS: 'http://localhost:5173,https://docao-capitalist.vercel.app',
    QUIET: '1',
  };
}

async function call(db, path, { method = 'GET', token, body, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const response = await handleRequest(
    new Request(`https://api.test${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    envFor(db),
  );
  const text = await response.text();
  let data = null;
  if (text) data = JSON.parse(text);
  return { status: response.status, data, headers: response.headers };
}

test('origem da Vercel de preview entra; outra origem não', () => {
  const allowed = 'https://docao-capitalist.vercel.app';
  assert.equal(originAllowed('https://docao-capitalist.vercel.app', allowed), true);
  assert.equal(originAllowed('http://localhost:5173', allowed), false);
  assert.equal(originAllowed('http://localhost:5173', `http://localhost:5173,${allowed}`), true);
  assert.equal(originAllowed('https://docao-capitalist-git-login.vercel.app', allowed), true);
  assert.equal(originAllowed('https://evil.vercel.app', allowed), false);
  assert.equal(originAllowed('https://docao-capitalist.evil.com', allowed), false);
  assert.equal(originAllowed('http://docao-capitalist.vercel.app', allowed), false);
});

test('conta, save e sessão', async () => {
  const db = memoryDb();
  const created = await call(db, '/api/register', {
    method: 'POST',
    origin: 'http://localhost:5173',
    body: { email: ' Matheus@Exemplo.com ', password: 'senha-boa' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.email, 'matheus@exemplo.com');
  assert.equal(created.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  const token = created.data.token;

  const duplicate = await call(db, '/api/register', {
    method: 'POST',
    body: { email: 'matheus@exemplo.com', password: 'outra-senha' },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.error, 'email_taken');

  const short = await call(db, '/api/register', {
    method: 'POST',
    body: { email: 'novo@exemplo.com', password: 'curta' },
  });
  assert.equal(short.status, 400);
  assert.equal(short.data.error, 'invalid_password');

  const wrong = await call(db, '/api/login', {
    method: 'POST',
    body: { email: 'matheus@exemplo.com', password: 'senha-errada' },
  });
  assert.equal(wrong.status, 401);

  const me = await call(db, '/api/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.email, 'matheus@exemplo.com');

  const empty = await call(db, '/api/save', { token });
  assert.equal(empty.status, 200);
  assert.equal(empty.data.save, null);

  const state = createState();
  buy(state, 'torresmo');
  startCycle(state, 'torresmo');
  state.totalEarned = 16_000_000;
  state.angels = 10;
  state.angelsSpent = 10;
  state.angelUpgrades.brasa = true;
  const payload = serialize(state);
  payload.rev = 3;
  payload.businesses[0].running = true;

  const put = await call(db, '/api/save', { method: 'PUT', token, body: { save: payload } });
  assert.equal(put.status, 200);

  const got = await call(db, '/api/save', { token });
  assert.equal(got.data.save.rev, 3);
  assert.equal(got.data.save.angels, 10);
  assert.equal(got.data.save.angelUpgrades.brasa, true);
  assert.equal(got.data.save.businesses[0].running, true);
  const hydrated = hydrate(got.data.save);
  assert.equal(hydrated.angels, 10);
  assert.equal(hydrated.angelUpgrades.brasa, true);
  assert.equal(hydrated.businesses[0].owned, 1);
  assert.equal(hydrated.businesses[0].running, true);

  const poorer = structuredClone(payload);
  poorer.totalEarned = 100;
  poorer.rev = 99;
  const stale = await call(db, '/api/save', { method: 'PUT', token, body: { save: poorer } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.save.totalEarned, 16_000_000);

  const sameCareerOldRev = structuredClone(payload);
  sameCareerOldRev.rev = 1;
  sameCareerOldRev.money = 1;
  const oldRev = await call(db, '/api/save', { method: 'PUT', token, body: { save: sameCareerOldRev } });
  assert.equal(oldRev.status, 409);

  const sameCareerNewRev = structuredClone(payload);
  sameCareerNewRev.rev = 4;
  sameCareerNewRev.money = 2;
  const newer = await call(db, '/api/save', { method: 'PUT', token, body: { save: sameCareerNewRev } });
  assert.equal(newer.status, 200);

  const reset = structuredClone(payload);
  reset.totalEarned = 0;
  reset.money = 5;
  reset.angels = 0;
  reset.rev = 5;
  const forced = await call(db, '/api/save', { method: 'PUT', token, body: { save: reset, force: true } });
  assert.equal(forced.status, 200);
  const afterReset = await call(db, '/api/save', { token });
  assert.equal(afterReset.data.save.totalEarned, 0);
  assert.equal(afterReset.data.save.money, 5);

  const bad = await call(db, '/api/save', { method: 'PUT', token, body: { save: { v: 9, totalEarned: 1, money: 1, businesses: [] } } });
  assert.equal(bad.status, 400);

  await call(db, '/api/logout', { method: 'POST', token });
  const afterLogout = await call(db, '/api/me', { token });
  assert.equal(afterLogout.status, 401);

  const again = await call(db, '/api/login', {
    method: 'POST',
    body: { email: 'matheus@exemplo.com', password: 'senha-boa' },
  });
  assert.equal(again.status, 200);
  const stillThere = await call(db, '/api/save', { token: again.data.token });
  assert.equal(stillThere.data.save.rev, 5);
});

test('preflight libera a origem do jogo', async () => {
  const db = memoryDb();
  const response = await handleRequest(
    new Request('https://api.test/api/save', {
      method: 'OPTIONS',
      headers: { Origin: 'https://docao-capitalist-git-login.vercel.app' },
    }),
    envFor(db),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://docao-capitalist-git-login.vercel.app');
});
