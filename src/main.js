import './style.css';
import { QUIPS, TUTORIAL, getAngelUpgrade } from './data.js';
import { play, setSoundEnabled } from './audio.js';
import {
  applyOffline,
  buy,
  buyAngelUpgrade,
  createState,
  getDef,
  hire,
  hydrate,
  poke,
  rebirth,
  serialize,
  startCycle,
  tick,
} from './economy.js';
import { formatAngels, formatMoney } from './format.js';
import { announce, cardFloater, mount, pokeSquash, popCash, rotateQuip, say, showOffline, update } from './ui.js';

const SAVE_KEY = 'docao-capitalista-v1';
const POKE_COOLDOWN_MS = 700;

let state = createState();
let lastWall = Date.now();
let nextSave = 0;
let pokeReadyAt = 0;
let quipIndex = 0;

function save() {
  state.lastSaved = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(state)));
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    const hydrated = hydrate(raw);
    if (hydrated) state = hydrated;
  } catch {
    state = createState();
  }
}

load();

const awaySeconds = (Date.now() - state.lastSaved) / 1000;
let offlineReport = null;
if (awaySeconds > 20) {
  offlineReport = applyOffline(state, awaySeconds);
  state.lastSaved = Date.now();
  save();
} else if (awaySeconds > 0.25) {
  tick(state, Math.min(awaySeconds, 20));
  state.lastSaved = Date.now();
}

lastWall = Date.now();
setSoundEnabled(state.sound);

function freshSpeech() {
  const owned = state.businesses.reduce((sum, b) => sum + b.owned, 0);
  if (owned === 0 && state.totalEarned === 0) say(TUTORIAL, 14000);
  else if (owned === 0 && (state.angels > 0 || state.angelsSpent > 0)) {
    say('Os anjos ficaram. A barraca é o primeiro passo de novo.', 9000);
  } else say('Voltou. A brasa ainda está acesa.', 7000);
}

mount({
  onBuy(id) {
    const before = state.businesses.find((b) => b.id === id).owned;
    const qty = buy(state, id);
    if (!qty) return;
    play('buy');
    const def = getDef(id);
    cardFloater(id, `+${qty.toLocaleString('pt-BR')}`);
    if (before === 0) say(def.firstBuy);
    else say(`Mais ${qty.toLocaleString('pt-BR')} em ${def.name}. O cheiro de grana aumentou.`);
    const opened = state.businesses.filter((b) => b.owned > 0).length;
    if (opened === state.businesses.length) {
      say('A escada tá completa. Agora é escala, oinc.');
    }
    update(state);
    save();
  },
  onHire(id) {
    const def = getDef(id);
    if (!hire(state, id)) return;
    play('hire');
    popCash(`${def.manager}!`);
    const managers = state.businesses.filter((b) => b.hasManager).length;
    if (managers === state.businesses.length) {
      say('Equipe completa. O Docão virou acionista de si mesmo.');
    } else {
      say(`${def.manager} entrou na equipe. ${def.name} agora roda sozinho.`);
    }
    announce(`${def.manager} contratado.`);
    update(state);
    save();
  },
  onStart(id) {
    if (!startCycle(state, id)) return;
    play('start');
    update(state);
    save();
  },
  onPoke() {
    pokeSquash();
    const now = Date.now();
    if (now < pokeReadyAt) return;
    pokeReadyAt = now + POKE_COOLDOWN_MS;
    const tip = poke(state);
    play('poke');
    popCash(`+ ${formatMoney(tip)}`);
    quipIndex = (quipIndex + 1) % QUIPS.length;
    say(QUIPS[quipIndex], 5000);
    update(state);
    save();
  },
  onQty(qty) {
    state.buyQty = qty;
    update(state);
    save();
  },
  onSound() {
    state.sound = !state.sound;
    setSoundEnabled(state.sound);
    if (state.sound) play('buy');
    say(state.sound ? 'Som ligado. Oinc com volume.' : 'Som mudo. O porco continua, só que calado.');
    update(state);
    save();
  },
  onRebirth() {
    const gain = rebirth(state);
    if (!gain) return;
    play('hire');
    popCash(`+ ${formatAngels(gain)}`);
    say(
      gain === 1
        ? 'Renascido. Um anjo ficou de olho na brasa.'
        : `Renascido. ${formatAngels(gain)} ficaram de olho na brasa.`,
      9000,
    );
    announce(`Renascimento: +${formatAngels(gain)}.`);
    update(state);
    save();
  },
  onBuyUpgrade(id) {
    const upgrade = getAngelUpgrade(id);
    if (!upgrade || !buyAngelUpgrade(state, id)) return;
    play('buy');
    say(`${upgrade.name}. Isso fica pra próxima vida também.`);
    announce(`${upgrade.name} comprada.`);
    update(state);
    save();
  },
  onReset() {
    localStorage.removeItem(SAVE_KEY);
    state = createState();
    setSoundEnabled(false);
    lastWall = Date.now();
    say(TUTORIAL, 12000);
    announce('Império zerado.');
    update(state);
    save();
  },
});

freshSpeech();
update(state);

if (offlineReport && offlineReport.gained >= 0.01) {
  showOffline(offlineReport);
} else if (offlineReport && offlineReport.ready.length > 0) {
  const name = getDef(offlineReport.ready[0]).name;
  say(
    offlineReport.ready.length === 1
      ? `${name} ficou pronta enquanto você foi ali.`
      : 'Tem negócio pronto pra coletar. O cheiro entrega.',
  );
}

window.setInterval(() => {
  quipIndex = (quipIndex + 1) % QUIPS.length;
  rotateQuip(QUIPS[quipIndex]);
}, 10000);

function celebrate(payouts) {
  const manual = payouts.filter((p) => p.manual && p.gain > 0);
  if (!manual.length) return;
  let sum = 0;
  for (const payout of manual) {
    sum += payout.gain;
    cardFloater(payout.id, `+ ${formatMoney(payout.gain)}`);
  }
  popCash(`+ ${formatMoney(sum)}`);
  play('collect');
  if (manual.length === 1) {
    announce(`+ ${formatMoney(manual[0].gain)} de ${getDef(manual[0].id).name}.`);
  } else {
    announce(`+ ${formatMoney(sum)} no fim dos ciclos.`);
  }
}

function frame() {
  const wall = Date.now();
  let dt = (wall - lastWall) / 1000;
  lastWall = wall;
  if (dt < 0) dt = 0;
  if (dt > 20) {
    const report = applyOffline(state, dt);
    if (report.gained >= 0.01) showOffline(report);
    save();
  } else if (dt > 0) {
    celebrate(tick(state, dt).payouts);
  }
  update(state);
  if (wall > nextSave) {
    save();
    nextSave = wall + 4000;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

window.addEventListener('pagehide', () => save());

window.addEventListener('storage', (event) => {
  if (event.key === SAVE_KEY && event.newValue) window.location.reload();
});
