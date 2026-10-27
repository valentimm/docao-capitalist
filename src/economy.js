import { ANGEL_UPGRADES, BUSINESSES, STARTING_MONEY, getAngelUpgrade } from './data.js';

export const SAVE_VERSION = 2;
// A nuvem aceita as mesmas versões em worker/src/http.js e src/save-sync.js.
const ACCEPTED_SAVE_VERSIONS = [1, 2];
export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
export const FIRST_TIMER_RATIO = 0.2;
export const BUY_QTYS = [1, 10, 100, 'max'];
const MAX_BUY = 10000;

/**
 * Anjos do Docão — prestígio no espírito dos Angels do AdVenture Capitalist.
 *
 * O total que a carreira já merece é:
 *   floor(sqrt(totalEarned) / ANGEL_DIVISOR)
 * com ANGEL_DIVISOR = 400. O 1e-9 só cobre erro de ponto flutuante na raiz.
 *
 * totalEarned é a grana de TODAS as vidas e não zera no renascimento.
 * Renascer entrega só o que ainda não foi reivindicado:
 *   pendentes = merecidos − anjosNoBolso − anjosGastos
 * Anjo no bolso já foi reivindicado. Anjo gasto em bênção não volta.
 *
 * Marcos, antes de gastar (partida ativa chega no mercado por volta de 1h):
 *   R$ 10 mil        → 0 anjos
 *   R$ 160 mil       → 1 anjo    (+2% se guardar; cedo, não paga o zeramento)
 *   R$ 1 milhão      → 2 anjos
 *   R$ 16 milhões    → 10 anjos  (dá pra Brasa abençoada, lá pelo meio do jogo)
 *   R$ 100 milhões   → 25 anjos
 *   R$ 1 bilhão      → 79 anjos
 *
 * Cada anjo não gasto dá +2% de receita em tudo (ANGEL_RATE).
 * Bênção dobrada sobe isso para +4% (ANGEL_RATE_BLESSED), inclusive nos anjos futuros.
 *
 * Bênçãos (ver ANGEL_UPGRADES), permanentes entre renascimentos:
 *   brasa   10 anjos  receita ×2
 *   carvao  15 anjos  tempo de ciclo ×0.75
 *   equipe  20 anjos  custo de gerente ×0.7
 *   atacado 25 anjos  custo de negócio ×0.6
 *   bencao  30 anjos  taxa do anjo ×2
 * A receita multiplicada entra no caixa quando a barra completa — nunca na compra
 * nem no toque de Começar.
 */
export const ANGEL_DIVISOR = 400;
export const ANGEL_RATE = 0.02;
export const ANGEL_RATE_BLESSED = 0.04;
const REVENUE_BLESSING = 2;
const CYCLE_TIME_BLESSING = 0.75;
const BUSINESS_COST_BLESSING = 0.6;
const MANAGER_COST_BLESSING = 0.7;

export function getDef(id) {
  return BUSINESSES.find((b) => b.id === id) ?? null;
}

export function roundMoney(n) {
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) >= 1e12) return n;
  return Math.round(n * 100) / 100;
}

export function emptyAngelUpgrades() {
  return Object.fromEntries(ANGEL_UPGRADES.map((upgrade) => [upgrade.id, false]));
}

export function createState() {
  return {
    v: SAVE_VERSION,
    money: STARTING_MONEY,
    totalEarned: 0,
    buyQty: 1,
    sound: false,
    lastSaved: Date.now(),
    angels: 0,
    angelsSpent: 0,
    angelUpgrades: emptyAngelUpgrades(),
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

export function angelRate(state) {
  return state.angelUpgrades.bencao ? ANGEL_RATE_BLESSED : ANGEL_RATE;
}

export function revenueMultiplier(state) {
  const passive = 1 + state.angels * angelRate(state);
  return passive * (state.angelUpgrades.brasa ? REVENUE_BLESSING : 1);
}

export function timeMultiplier(state) {
  return state.angelUpgrades.carvao ? CYCLE_TIME_BLESSING : 1;
}

export function businessCostMultiplier(state) {
  return state.angelUpgrades.atacado ? BUSINESS_COST_BLESSING : 1;
}

export function managerCostMultiplier(state) {
  return state.angelUpgrades.equipe ? MANAGER_COST_BLESSING : 1;
}

export function effectiveCycleTime(state, def) {
  return def.time * timeMultiplier(state);
}

/** Receita de um ciclo completo. Só vira dinheiro quando a barra enche. */
export function cycleReward(state, def, owned) {
  if (!(owned > 0)) return 0;
  return roundMoney(def.revenue * owned * revenueMultiplier(state));
}

export function managerPrice(state, def) {
  return roundMoney(def.managerCost * managerCostMultiplier(state));
}

/** Anjos que sqrt(totalEarned) / ANGEL_DIVISOR já justifica, somando todas as vidas. */
export function angelsDeserved(totalEarned) {
  if (!(totalEarned > 0) || !Number.isFinite(totalEarned)) return 0;
  const raw = Math.sqrt(totalEarned) / ANGEL_DIVISOR;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw + 1e-9);
}

export function angelsClaimed(state) {
  return state.angels + state.angelsSpent;
}

/** Quantos anjos novos o renascimento entregaria agora. */
export function pendingAngels(state) {
  return Math.max(0, angelsDeserved(state.totalEarned) - angelsClaimed(state));
}

/** Grana de carreira mínima para merecer `count` anjos no total. */
export function lifetimeForAngelCount(count) {
  if (!(count > 0)) return 0;
  const target = count * ANGEL_DIVISOR;
  return target * target;
}

/** Custo de `qty` compras seguidas a partir de `owned`. */
export function costOfMany(base, coeff, owned, qty) {
  if (qty <= 0) return 0;
  const first = base * coeff ** owned;
  const raw = Math.abs(coeff - 1) < 1e-9 ? first * qty : (first * (coeff ** qty - 1)) / (coeff - 1);
  if (!Number.isFinite(raw) || raw <= 0) return Number.POSITIVE_INFINITY;
  return roundMoney(raw);
}

export function maxAffordable(money, base, coeff, owned, costMult = 1) {
  const mult = Number.isFinite(costMult) && costMult > 0 ? costMult : 1;
  const first = costOfMany(base, coeff, owned, 1) * mult;
  if (!(first > 0) || money + 1e-6 < first) return 0;
  const ratio = (money * (coeff - 1)) / (mult * base * coeff ** owned) + 1;
  let n = ratio > 1 ? Math.floor(Math.log(ratio) / Math.log(coeff) + 1e-9) : 0;
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n > MAX_BUY) n = MAX_BUY;
  while (n > 0 && costOfMany(base, coeff, owned, n) * mult > money + 1e-6) n -= 1;
  while (n < MAX_BUY && costOfMany(base, coeff, owned, n + 1) * mult <= money + 1e-6) n += 1;
  return n;
}

export function quoteBuy(state, id) {
  const def = getDef(id);
  const biz = businessOf(state, id);
  if (!def || !biz) return { qty: 0, cost: 0, affordable: false };
  const mult = businessCostMultiplier(state);
  if (state.buyQty === 'max') {
    const qty = maxAffordable(state.money, def.baseCost, def.coeff, biz.owned, mult);
    if (qty <= 0) {
      return {
        qty: 0,
        cost: roundMoney(costOfMany(def.baseCost, def.coeff, biz.owned, 1) * mult),
        affordable: false,
      };
    }
    return {
      qty,
      cost: roundMoney(costOfMany(def.baseCost, def.coeff, biz.owned, qty) * mult),
      affordable: true,
    };
  }
  const qty = state.buyQty;
  const cost = roundMoney(costOfMany(def.baseCost, def.coeff, biz.owned, qty) * mult);
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
    biz.timer = effectiveCycleTime(state, def) * FIRST_TIMER_RATIO;
  }
  if (biz.pending > 0) biz.pending = cycleReward(state, def, biz.owned);
  return quote.qty;
}

export function hire(state, id) {
  const def = getDef(id);
  const biz = businessOf(state, id);
  if (!def || !biz) return false;
  const price = managerPrice(state, def);
  if (biz.hasManager || biz.owned < 1 || state.money + 1e-6 < price) return false;
  state.money = roundMoney(state.money - price);
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
  const cycle = effectiveCycleTime(state, def);
  if (!(biz.timer > 0) || biz.timer >= cycle) biz.timer = 0;
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
    const cycle = effectiveCycleTime(state, def);
    if (!(cycle > 0)) continue;
    const rate = cycleReward(state, def, biz.owned) / cycle;
    if (biz.hasManager) auto += rate;
    else manual += rate;
  }
  return { auto, manual, total: auto + manual };
}

/**
 * Avança o tempo. A receita entra no caixa quando o ciclo completa.
 * Com gerente, vários ciclos fecham e o próximo já recomeça.
 * Sem gerente, só corre o ciclo que foi iniciado, e para no fim.
 * Multiplicador de anjo e de bênção entra nesse crédito, não antes.
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
    const cycle = effectiveCycleTime(state, def);
    if (!(cycle > 0)) continue;
    biz.timer += dt;
    if (biz.timer < cycle) continue;
    if (auto) {
      const cycles = Math.floor(biz.timer / cycle);
      const gain = cycles * cycleReward(state, def, biz.owned);
      biz.timer -= cycles * cycle;
      if (biz.timer < 1e-9) biz.timer = 0;
      biz.running = true;
      if (gain > 0) {
        state.money += gain;
        state.totalEarned += gain;
        payouts.push({ id: biz.id, gain, manual: false });
      }
    } else {
      const gain = cycleReward(state, def, biz.owned);
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

function spentOnUpgrades(upgrades) {
  return ANGEL_UPGRADES.reduce((sum, upgrade) => sum + (upgrades[upgrade.id] ? upgrade.cost : 0), 0);
}

/**
 * Zera caixa, negócios e gerentes. Fica com anjos (incluindo os novos),
 * bênçãos e a grana de todas as vidas. Não faz nada se não houver anjo pendente.
 */
export function rebirth(state) {
  const gain = pendingAngels(state);
  if (gain <= 0) return 0;
  const next = createState();
  next.angels = state.angels + gain;
  next.angelsSpent = state.angelsSpent;
  next.angelUpgrades = { ...state.angelUpgrades };
  next.totalEarned = state.totalEarned;
  next.sound = Boolean(state.sound);
  next.buyQty = BUY_QTYS.includes(state.buyQty) ? state.buyQty : 1;
  next.lastSaved = Date.now();
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, next);
  return gain;
}

export function buyAngelUpgrade(state, id) {
  const upgrade = getAngelUpgrade(id);
  if (!upgrade || state.angelUpgrades[id]) return false;
  if (state.angels < upgrade.cost) return false;
  state.angels -= upgrade.cost;
  state.angelsSpent += upgrade.cost;
  state.angelUpgrades[id] = true;
  return true;
}

export function serialize(state) {
  return {
    v: SAVE_VERSION,
    money: state.money,
    totalEarned: state.totalEarned,
    buyQty: state.buyQty,
    sound: Boolean(state.sound),
    lastSaved: state.lastSaved,
    angels: state.angels,
    angelsSpent: state.angelsSpent,
    angelUpgrades: { ...state.angelUpgrades },
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

function readAngelUpgrades(raw) {
  const upgrades = emptyAngelUpgrades();
  const saved = raw?.angelUpgrades;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return upgrades;
  for (const upgrade of ANGEL_UPGRADES) {
    upgrades[upgrade.id] = saved[upgrade.id] === true;
  }
  return upgrades;
}

export function hydrate(raw) {
  if (!raw || !ACCEPTED_SAVE_VERSIONS.includes(raw.v) || !Array.isArray(raw.businesses)) return null;
  const state = createState();
  state.money = finiteNonNeg(raw.money, STARTING_MONEY);
  state.totalEarned = finiteNonNeg(raw.totalEarned, 0);
  state.buyQty = BUY_QTYS.includes(raw.buyQty) ? raw.buyQty : 1;
  state.sound = Boolean(raw.sound);
  state.lastSaved = finiteNonNeg(raw.lastSaved, Date.now());
  state.angels = Math.floor(finiteNonNeg(raw.angels, 0));
  state.angelUpgrades = readAngelUpgrades(raw);
  const spentFloor = spentOnUpgrades(state.angelUpgrades);
  state.angelsSpent = Math.max(Math.floor(finiteNonNeg(raw.angelsSpent, 0)), spentFloor);
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
      const gain = cycleReward(state, def, biz.owned);
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
