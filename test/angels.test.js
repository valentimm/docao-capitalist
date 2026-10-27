import assert from 'node:assert/strict';
import test from 'node:test';
import { STARTING_MONEY } from '../src/data.js';
import {
  angelsDeserved,
  applyOffline,
  buy,
  buyAngelUpgrade,
  createState,
  cycleReward,
  hire,
  hydrate,
  lifetimeForAngelCount,
  managerPrice,
  pendingAngels,
  quoteBuy,
  rebirth,
  revenueMultiplier,
  serialize,
  startCycle,
  tick,
} from '../src/economy.js';

test('a raiz da grana de carreira vira anjo, cedo demais não rende', () => {
  assert.equal(angelsDeserved(0), 0);
  assert.equal(angelsDeserved(10_000), 0);
  assert.equal(angelsDeserved(159_999), 0);
  assert.equal(angelsDeserved(160_000), 1);
  assert.equal(angelsDeserved(1_000_000), 2);
  assert.equal(angelsDeserved(16_000_000), 10);
  assert.equal(angelsDeserved(100_000_000), 25);
  assert.equal(lifetimeForAngelCount(1), 160_000);
  assert.equal(lifetimeForAngelCount(10), 16_000_000);
  assert.equal(angelsDeserved(lifetimeForAngelCount(10)), 10);
});

test('renascer zera o império, entrega só anjo novo e não devolve o que já foi gasto', () => {
  const state = createState();
  state.money = 900;
  buy(state, 'torresmo');
  state.buyQty = 100;
  state.sound = true;
  state.totalEarned = 16_000_000;
  assert.equal(state.businesses[0].owned, 1);
  assert.equal(pendingAngels(state), 10);

  assert.equal(rebirth(state), 10);
  assert.equal(state.angels, 10);
  assert.equal(state.angelsSpent, 0);
  assert.equal(state.money, STARTING_MONEY);
  assert.equal(state.totalEarned, 16_000_000);
  assert.equal(state.buyQty, 100);
  assert.equal(state.sound, true);
  assert.equal(state.businesses.every((biz) => biz.owned === 0 && !biz.hasManager && !biz.running), true);
  assert.equal(pendingAngels(state), 0);
  assert.equal(rebirth(state), 0);
  assert.equal(state.money, STARTING_MONEY);

  assert.equal(buyAngelUpgrade(state, 'brasa'), true);
  assert.equal(state.angels, 0);
  assert.equal(state.angelsSpent, 10);
  assert.equal(state.angelUpgrades.brasa, true);
  assert.equal(pendingAngels(state), 0);
  assert.equal(buyAngelUpgrade(state, 'brasa'), false);

  state.totalEarned = 19_360_000;
  assert.equal(angelsDeserved(state.totalEarned), 11);
  assert.equal(pendingAngels(state), 1);
  assert.equal(rebirth(state), 1);
  assert.equal(state.angels, 1);
  assert.equal(state.angelUpgrades.brasa, true);
  assert.equal(state.businesses[0].owned, 0);
});

test('renascer sem anjo pendente não apaga a barraca', () => {
  const state = createState();
  buy(state, 'torresmo');
  state.totalEarned = 50_000;
  assert.equal(pendingAngels(state), 0);
  assert.equal(rebirth(state), 0);
  assert.equal(state.businesses[0].owned, 1);
  assert.equal(state.money, 1);
});

test('bênção não paga no clique: a receita dobrada cai no fim da barra', () => {
  const state = createState();
  state.angelUpgrades.brasa = true;
  assert.equal(revenueMultiplier(state), 2);
  state.money = 10;
  assert.equal(buy(state, 'torresmo'), 1);
  const afterBuy = state.money;
  assert.equal(state.businesses[0].pending, 0);
  assert.equal(tick(state, 0.3).gained, 0);
  assert.equal(state.money, afterBuy);

  state.businesses[0].running = false;
  state.businesses[0].timer = 0.4;
  assert.equal(startCycle(state, 'torresmo'), true);
  assert.equal(state.money, afterBuy);
  assert.equal(tick(state, 0.2).gained, 0);
  assert.equal(state.money, afterBuy);

  const done = tick(state, 0.5);
  assert.equal(done.gained, 2);
  assert.equal(done.payouts[0].manual, true);
  assert.equal(done.payouts[0].gain, 2);
  assert.equal(state.money, afterBuy + 2);
  assert.equal(state.totalEarned, 2);
  assert.equal(state.businesses[0].running, false);
});

test('cada anjo no bolso soma receita, e bênção dobrada troca a taxa', () => {
  const state = createState();
  state.angels = 50;
  assert.equal(revenueMultiplier(state), 2);
  assert.equal(cycleReward(state, { revenue: 1, time: 1 }, 1), 2);

  state.angels = 10;
  state.angelUpgrades.brasa = true;
  assert.equal(revenueMultiplier(state), 2.4);
  assert.equal(cycleReward(state, { revenue: 1, time: 1 }, 1), 2.4);

  state.angelUpgrades.bencao = true;
  assert.equal(revenueMultiplier(state), 2.8);
});

test('carvão encurta o ciclo e o offline manual continua fechando um só', () => {
  const state = createState();
  state.angels = 15;
  assert.equal(buyAngelUpgrade(state, 'carvao'), true);
  state.money = 10;
  buy(state, 'torresmo');
  const money = state.money;
  assert.equal(tick(state, 0.5).gained, 0);
  assert.equal(state.money, money);
  assert.equal(tick(state, 0.3).gained, 1);
  assert.equal(state.businesses[0].running, false);

  state.businesses[0].running = true;
  state.businesses[0].timer = 0;
  const again = state.money;
  const report = applyOffline(state, 500);
  assert.equal(report.gained, 1);
  assert.equal(state.money, again + 1);
  assert.equal(state.businesses[0].running, false);
  assert.equal(state.businesses[0].timer, 0);
});

test('atacado e equipe barateiam compra e gerente sem mexer no ciclo', () => {
  const state = createState();
  state.angelUpgrades.atacado = true;
  state.money = 5;
  const quote = quoteBuy(state, 'torresmo');
  assert.equal(quote.cost, 2.4);
  assert.equal(quote.affordable, true);
  assert.equal(buy(state, 'torresmo'), 1);
  assert.equal(state.money, 2.6);
  assert.equal(state.businesses[0].pending, 0);

  state.angelUpgrades.equipe = true;
  state.money = 245;
  assert.equal(managerPrice(state, { managerCost: 350 }), 245);
  assert.equal(hire(state, 'torresmo'), true);
  assert.equal(state.money, 0);
  assert.equal(state.businesses[0].hasManager, true);
});

test('bênção cara demais ou repetida não sai do bolso', () => {
  const state = createState();
  state.angels = 9;
  assert.equal(buyAngelUpgrade(state, 'brasa'), false);
  assert.equal(state.angels, 9);
  assert.equal(buyAngelUpgrade(state, 'nao-existe'), false);
  state.angels = 10;
  assert.equal(buyAngelUpgrade(state, 'brasa'), true);
  assert.equal(buyAngelUpgrade(state, 'brasa'), false);
  assert.equal(state.angels, 0);
});

test('save v1 migra com zero anjos e sem zerar o império', () => {
  const state = hydrate({
    v: 1,
    money: 42,
    totalEarned: 80,
    buyQty: 10,
    sound: true,
    lastSaved: 50,
    businesses: [
      { id: 'torresmo', owned: 4, hasManager: false, timer: 0.25, pending: 0, running: true },
    ],
  });
  assert.ok(state);
  assert.equal(state.money, 42);
  assert.equal(state.totalEarned, 80);
  assert.equal(state.buyQty, 10);
  assert.equal(state.sound, true);
  assert.equal(state.angels, 0);
  assert.equal(state.angelsSpent, 0);
  assert.equal(state.angelUpgrades.brasa, false);
  assert.equal(state.businesses[0].owned, 4);
  assert.equal(state.businesses[0].running, true);
  assert.equal(state.businesses[0].timer, 0.25);
  assert.equal(rebirth(state), 0);
  assert.equal(state.businesses[0].owned, 4);
  assert.equal(state.money, 42);
});

test('save v2 guarda anjo, bênção e não devolve anjo já gasto', () => {
  const state = createState();
  state.angels = 4;
  state.angelsSpent = 10;
  state.angelUpgrades.brasa = true;
  state.totalEarned = 5_000_000;
  state.money = 80;
  const again = hydrate(serialize(state));
  assert.equal(again.v, 2);
  assert.equal(again.angels, 4);
  assert.equal(again.angelsSpent, 10);
  assert.equal(again.angelUpgrades.brasa, true);
  assert.equal(again.angelUpgrades.carvao, false);
  assert.equal(again.totalEarned, 5_000_000);
  assert.equal(again.money, 80);

  const sloppy = serialize(state);
  sloppy.angelsSpent = 0;
  sloppy.angelUpgrades.brasa = true;
  const cleaned = hydrate(sloppy);
  assert.equal(cleaned.angelUpgrades.brasa, true);
  assert.equal(cleaned.angelsSpent, 10);
  assert.equal(pendingAngels(cleaned), 0);
});
