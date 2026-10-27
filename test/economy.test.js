import assert from 'node:assert/strict';
import test from 'node:test';
import { STARTING_MONEY } from '../src/data.js';
import {
  applyOffline,
  buy,
  costOfMany,
  createState,
  hire,
  hydrate,
  maxAffordable,
  poke,
  quoteBuy,
  serialize,
  startCycle,
  tick,
} from '../src/economy.js';
import { formatAngels, formatMoney } from '../src/format.js';

test('formato de anjos em pt-BR', () => {
  assert.equal(formatAngels(0), '0 anjos');
  assert.equal(formatAngels(1), '1 anjo');
  assert.equal(formatAngels(10), '10 anjos');
  assert.equal(formatAngels(1000), '1.000 anjos');
});

test('formato de dinheiro em pt-BR', () => {
  assert.equal(formatMoney(0), 'R$ 0,00');
  assert.equal(formatMoney(4), 'R$ 4,00');
  assert.equal(formatMoney(12.5), 'R$ 12,50');
  assert.equal(formatMoney(999.99), 'R$ 999,99');
  assert.match(formatMoney(1500), /mil/);
  assert.match(formatMoney(1_500_000), /mi/);
  assert.match(formatMoney(2_000_000_000), /bi/);
});

test('custo geométrico e compra máxima', () => {
  assert.equal(costOfMany(4, 1.07, 0, 1), 4);
  assert.equal(costOfMany(4, 1.07, 0, 2), 8.28);
  const state = createState();
  state.money = 30;
  const qty = maxAffordable(30, 4, 1.07, 0);
  assert.ok(qty >= 1);
  assert.ok(costOfMany(4, 1.07, 0, qty) <= 30);
  assert.ok(costOfMany(4, 1.07, 0, qty + 1) > 30);
});

test('compra, ciclo e gerente da barraca', () => {
  const state = createState();
  assert.equal(state.money, STARTING_MONEY);
  assert.equal(buy(state, 'torresmo'), 1);
  assert.equal(state.businesses[0].owned, 1);
  assert.equal(state.businesses[0].running, true);
  assert.equal(state.money, 1);
  assert.equal(hire(state, 'torresmo'), false);

  const mid = tick(state, 0.5);
  assert.equal(mid.gained, 0);
  assert.equal(state.money, 1);
  assert.equal(state.businesses[0].pending, 0);

  const done = tick(state, 0.5);
  assert.equal(done.gained, 1);
  assert.equal(done.payouts[0].manual, true);
  assert.equal(state.money, 2);
  assert.equal(state.businesses[0].running, false);
  assert.equal(state.businesses[0].timer, 0);

  state.money = 350;
  state.businesses[0].pending = 1;
  state.businesses[0].timer = 0.4;
  assert.equal(hire(state, 'torresmo'), true);
  assert.equal(state.businesses[0].hasManager, true);
  assert.equal(state.businesses[0].pending, 0);
  assert.equal(state.businesses[0].running, true);
  assert.equal(state.money, 1);

  const gained = tick(state, 5);
  assert.equal(gained.gained, 5);
  assert.equal(state.money, 6);
  assert.equal(state.businesses[0].running, true);
});

test('o clique começa a barra e o caixa só entra no fim', () => {
  const state = createState();
  buy(state, 'torresmo');
  state.businesses[0].running = false;
  state.businesses[0].timer = 0.4;
  const money = state.money;

  assert.equal(startCycle(state, 'torresmo'), true);
  assert.equal(state.money, money);
  assert.equal(state.businesses[0].timer, 0.4);
  assert.equal(tick(state, 0.2).gained, 0);
  assert.equal(state.money, money);
  assert.equal(startCycle(state, 'torresmo'), false);
  assert.equal(state.money, money);
  assert.ok(state.businesses[0].timer > 0.4);

  const done = tick(state, 0.5);
  assert.equal(done.gained, 1);
  assert.equal(state.money, money + 1);
  assert.equal(state.businesses[0].running, false);
  assert.equal(startCycle(state, 'torresmo'), true);
  assert.equal(state.money, money + 1);
  assert.equal(state.businesses[0].timer, 0);
});

test('sem gerente, o tempo fora fecha só o ciclo que já andava', () => {
  const state = createState();
  buy(state, 'torresmo');
  state.businesses[0].timer = 0;
  state.businesses[0].running = true;
  const money = state.money;
  const report = applyOffline(state, 500);
  assert.equal(report.gained, 1);
  assert.equal(state.money, money + 1);
  assert.equal(state.businesses[0].pending, 0);
  assert.equal(state.businesses[0].running, false);
  assert.equal(state.businesses[0].timer, 0);
  assert.deepEqual(report.ready, []);

  const idle = createState();
  buy(idle, 'torresmo');
  idle.businesses[0].running = false;
  idle.businesses[0].timer = 0;
  const idleMoney = idle.money;
  const quiet = applyOffline(idle, 500);
  assert.equal(quiet.gained, 0);
  assert.equal(idle.money, idleMoney);
});

test('save antigo com coleta pendente credita uma vez', () => {
  const state = hydrate({
    v: 1,
    money: 10,
    totalEarned: 3,
    buyQty: 1,
    sound: false,
    lastSaved: Date.now(),
    businesses: [
      {
        id: 'torresmo',
        owned: 2,
        hasManager: false,
        timer: 1,
        pending: 2,
      },
    ],
  });
  assert.equal(state.money, 12);
  assert.equal(state.totalEarned, 5);
  assert.equal(state.businesses[0].pending, 0);
  assert.equal(state.businesses[0].timer, 0);
  assert.equal(state.businesses[0].running, false);
  assert.equal(tick(state, 5).gained, 0);
  assert.equal(state.money, 12);
});

test('offline de gerente respeita o teto de 8 horas', () => {
  const state = createState();
  state.money = 400;
  buy(state, 'torresmo');
  hire(state, 'torresmo');
  const moneyBefore = state.money;
  const tenHours = 10 * 60 * 60;
  const report = applyOffline(state, tenHours);
  assert.equal(report.capped, true);
  assert.equal(report.applied, 8 * 60 * 60);
  assert.equal(report.gained, 8 * 60 * 60);
  assert.equal(state.money, moneyBefore + 8 * 60 * 60);
});

test('save sobrevive a lixo e a ida e volta', () => {
  assert.equal(hydrate(null), null);
  assert.equal(hydrate({ v: 3, businesses: [] }), null);
  assert.equal(hydrate({ v: 0, businesses: [] }), null);
  const state = createState();
  state.money = 80;
  state.buyQty = 10;
  buy(state, 'torresmo');
  const again = hydrate(serialize(state));
  assert.equal(again.money, state.money);
  assert.equal(again.buyQty, 10);
  assert.equal(again.businesses[0].owned, state.businesses[0].owned);
  const dirty = serialize(state);
  dirty.businesses[0].owned = -4;
  dirty.businesses[0].hasManager = true;
  dirty.buyQty = 7;
  const cleaned = hydrate(dirty);
  assert.equal(cleaned.businesses[0].owned, 0);
  assert.equal(cleaned.businesses[0].hasManager, false);
  assert.equal(cleaned.buyQty, 1);
});

test('máximo não compra no prejuízo e o cutuco paga gorjeta', () => {
  const state = createState();
  state.money = 0;
  state.buyQty = 'max';
  assert.equal(quoteBuy(state, 'torresmo').affordable, false);
  assert.equal(buy(state, 'torresmo'), 0);
  const tip = poke(state);
  assert.ok(tip >= 0.5);
  assert.equal(state.money, tip);
});
