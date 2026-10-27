import { BUSINESSES, STARTING_MONEY } from './data.js';

export const SAVE_VERSION = 1;
export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
export const FIRST_TIMER_RATIO = 0.2;
export const BUY_QTYS = [1, 10, 100, 'max'];
const MAX_BUY = 10000;

export function getDef(id) {
  return BUSINESSES.find((b) => b.id === id) ?? null;
}

export function roundMoney(n) {
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) >= 1e12) return n;
  return Math.round(n * 100) / 100;
}

export function createState() {
  return {
    v: SAVE_VERSION,
    money: STARTING_MONEY,
    totalEarned: 0,
    buyQty: 1,
    sound: false,
    lastSaved: Date.now(),
    businesses: BUSINESSES.map((def) => ({
      id: def.id,
      owned: 0,
      hasManager: false,
      timer: 0,
      pending: 0,
      running: false,
    })),
  };
}

export function businessOf(state, id) {
  return state.businesses.find((b) => b.id === id) ?? null;
}

/** Custo de `qty` compras seguidas a partir de `owned`. */
export function costOfMany(base, coeff, owned, qty) {
  if (qty <= 0) return 0;
  const first = base * coeff ** owned;
  const raw = Math.abs(coeff - 1) < 1e-9 ? first * qty : (first * (coeff ** qty - 1)) / (coeff - 1);
  if (!Number.isFinite(raw) || raw <= 0) return Number.POSITIVE_INFINITY;
  return roundMoney(raw);
}

export function maxAffordable(money, base, coeff, owned) {
  const first = costOfMany(base, coeff, owned, 1);
  if (!(first > 0) || money + 1e-6 < first) return 0;
  const ratio = (money * (coeff - 1)) / (base * coeff ** owned) + 1;
  let n = ratio > 1 ? Math.floor(Math.log(ratio) / Math.log(coeff) + 1e-9) : 0;
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n > MAX_BUY) n = MAX_BUY;
  while (n > 0 && costOfMany(base, coeff, owned, n) > money + 1e-6) n -= 1;
  while (n < MAX_BUY && costOfMany(base, coeff, owned, n + 1) <= money + 1e-6) n += 1;
  return n;
}

export function quoteBuy(state, id) {
  const def = getDef(id);
  const biz = businessOf(state, id);
  if (!def || !biz) return { qty: 0, cost: 0, affordable: false };
  if (state.buyQty === 'max') {
    const qty = maxAffordable(state.money, def.baseCost, def.coeff, biz.owned);
    if (qty <= 0) {
      return { qty: 0, cost: costOfMany(def.baseCost, def.coeff, biz.owned, 1), affordable: false };
    }
    return { qty, cost: costOfMany(def.baseCost, def.coeff, biz.owned, qty), affordable: true };
  }
  const qty = state.buyQty;
  const cost = costOfMany(def.baseCost, def.coeff, biz.owned, qty);
  return { qty, cost, affordable: state.money + 1e-6 >= cost };
}

export function buy(state, id) {
  const quote = quoteBuy(state, id);
  if (!quote.affordable || quote.qty <= 0) return 0;
  const def = getDef(id);
  const biz = businessOf(state, id);
  const wasZero = biz.owned === 0;
  state.money = roundMoney(state.money - quote.cost);
  if (state.money < 0) state.money = 0;
  biz.owned += quote.qty;
  if (wasZero) {
    biz.running = true;
    biz.timer = def.time * FIRST_TIMER_RATIO;
  }
  if (biz.pending > 0) biz.pending = def.revenue * biz.owned;
  return quote.qty;
}

export function hire(state, id) {
  const def = getDef(id);
  const biz = businessOf(state, id);
  if (!def || !biz) return false;
  if (biz.hasManager || biz.owned < 1 || state.money + 1e-6 < def.managerCost) return false;
  state.money = roundMoney(state.money - def.managerCost);
  if (state.money < 0) state.money = 0;
  biz.hasManager = true;
  biz.running = true;
  if (biz.pending > 0) {
    state.money = roundMoney(state.money + biz.pending);
    state.totalEarned = roundMoney(state.totalEarned + biz.pending);
    biz.pending = 0;
    biz.timer = 0;
  }
  return true;
}

/** Começa um ciclo. Não mexe no caixa — a receita só entra quando a barra enche. */
export function startCycle(state, id) {
  const def = getDef(id);
  const biz = businessOf(state, id);
  if (!def || !biz || biz.owned < 1 || biz.hasManager || biz.running) return false;
  biz.running = true;
  biz.pending = 0;
  if (!(biz.timer > 0) || biz.timer >= def.time) biz.timer = 0;
  return true;
}

/** Gorjeta do cutuco: 10% de 1 segundo de renda, no mínimo R$ 0,50. */
export function pokeTip(state) {
  const { auto, total } = incomePerSecond(state);
  const base = auto > 0 ? auto : total;
  return roundMoney(Math.max(0.5, base * 0.1));
}

export function poke(state) {
  const tip = pokeTip(state);
  state.money = roundMoney(state.money + tip);
  state.totalEarned = roundMoney(state.totalEarned + tip);
  return tip;
}

export function incomePerSecond(state) {
  let auto = 0;
  let manual = 0;
  for (const biz of state.businesses) {
    if (biz.owned <= 0) continue;
    const def = getDef(biz.id);
    const rate = (def.revenue * biz.owned) / def.time;
    if (biz.hasManager) auto += rate;
    else manual += rate;
  }
  return { auto, manual, total: auto + manual };
}

/**
 * Avança o tempo. A receita entra no caixa quando o ciclo completa.
 * Com gerente, vários ciclos fecham e o próximo já recomeça.
 * Sem gerente, só corre o ciclo que foi iniciado, e para no fim.
 */
export function tick(state, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return { gained: 0, payouts: [] };
  const before = state.money;
  const payouts = [];
  for (const biz of state.businesses) {
    if (biz.owned <= 0) continue;
    const def = getDef(biz.id);
    if (!def) continue;
    const auto = Boolean(biz.hasManager);
    if (!auto && !biz.running) continue;
    biz.timer += dt;
    if (biz.timer < def.time) continue;
    if (auto) {
      const cycles = Math.floor(biz.timer / def.time);
      const gain = cycles * def.revenue * biz.owned;
      biz.timer -= cycles * def.time;
      biz.running = true;
      if (gain > 0) {
        state.money += gain;
        state.totalEarned += gain;
        payouts.push({ id: biz.id, gain, manual: false });
      }
    } else {
      const gain = def.revenue * biz.owned;
      if (gain > 0) {
        state.money += gain;
        state.totalEarned += gain;
        payouts.push({ id: biz.id, gain, manual: true });
      }
      biz.running = false;
      biz.timer = 0;
      biz.pending = 0;
    }
  }
  state.money = roundMoney(state.money);
  state.totalEarned = roundMoney(state.totalEarned);
  return { gained: roundMoney(state.money - before), payouts };
}

export function applyOffline(state, seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const applied = Math.min(safe, MAX_OFFLINE_SECONDS);
  const result = tick(state, applied);
  return {
    gained: result.gained,
    applied,
    capped: safe > MAX_OFFLINE_SECONDS + 0.001,
    ready: [],
    payouts: result.payouts,
  };
}

export function serialize(state) {
  return {
    v: SAVE_VERSION,
    money: state.money,
    totalEarned: state.totalEarned,
    buyQty: state.buyQty,
    sound: Boolean(state.sound),
    lastSaved: state.lastSaved,
    businesses: state.businesses.map((b) => ({
      id: b.id,
      owned: b.owned,
      hasManager: b.hasManager,
      timer: b.timer,
      pending: b.pending,
      running: Boolean(b.running),
    })),
  };
}

function finiteNonNeg(n, fallback = 0) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function hydrate(raw) {
  if (!raw || raw.v !== SAVE_VERSION || !Array.isArray(raw.businesses)) return null;
  const state = createState();
  state.money = finiteNonNeg(raw.money, STARTING_MONEY);
  state.totalEarned = finiteNonNeg(raw.totalEarned, 0);
  state.buyQty = BUY_QTYS.includes(raw.buyQty) ? raw.buyQty : 1;
  state.sound = Boolean(raw.sound);
  state.lastSaved = finiteNonNeg(raw.lastSaved, Date.now());
  for (const saved of raw.businesses) {
    const biz = businessOf(state, saved.id);
    const def = getDef(saved.id);
    if (!biz || !def) continue;
    biz.owned = Math.min(1e9, Math.floor(finiteNonNeg(saved.owned, 0)));
    biz.hasManager = Boolean(saved.hasManager) && biz.owned >= 1;
    biz.timer = Math.min(def.time, finiteNonNeg(saved.timer, 0));
    const pocket = finiteNonNeg(saved.pending, 0);
    biz.pending = 0;

    if (biz.hasManager && pocket > 0) {
      state.money = roundMoney(state.money + pocket);
      state.totalEarned = roundMoney(state.totalEarned + pocket);
    }

    if (biz.owned < 1) {
      biz.running = false;
      biz.timer = 0;
      continue;
    }

    if (biz.hasManager) {
      biz.running = true;
      continue;
    }

    if (typeof saved.running === 'boolean') {
      biz.running = saved.running;
      if (pocket > 0) {
        state.money = roundMoney(state.money + pocket);
        state.totalEarned = roundMoney(state.totalEarned + pocket);
        biz.timer = 0;
        biz.running = false;
      }
      continue;
    }

    // Save antigo: a barra andava sozinha e o clique em Coletar é que pagava.
    if (pocket > 0) {
      state.money = roundMoney(state.money + pocket);
      state.totalEarned = roundMoney(state.totalEarned + pocket);
      biz.timer = 0;
      biz.running = false;
    } else if (biz.timer >= def.time) {
      const gain = def.revenue * biz.owned;
      state.money = roundMoney(state.money + gain);
      state.totalEarned = roundMoney(state.totalEarned + gain);
      biz.timer = 0;
      biz.running = false;
    } else {
      biz.running = true;
    }
  }
  return state;
}
