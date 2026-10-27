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
import { AccountError, fetchCloudSave, loginAccount, logoutAccount, pushCloudSave, registerAccount } from './account.js';
import { FORCE_UPLOAD_KEY, SESSION_KEY, pickSave, readRev, readSession, writeSession } from './save-sync.js';
import {
  announce,
  cardFloater,
  closeAccount,
  mount,
  openAccount,
  pokeSquash,
  popCash,
  rotateQuip,
  say,
  setResetMentionsCloud,
  setSaveStatus,
  showOffline,
  update,
} from './ui.js';

const SAVE_KEY = 'docao-capitalista-v1';
const POKE_COOLDOWN_MS = 700;

let state = createState();
let lastWall = Date.now();
let nextSave = 0;
let pokeReadyAt = 0;
let quipIndex = 0;
let session = null;
let cloudReady = false;
let saveRev = 0;
let forceNextPush = false;
let cloudTimer = 0;
let pushTail = Promise.resolve();
let lastUploadedKey = '';
let booted = false;

function readLocalRaw() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  } catch {
    return null;
  }
}

function snapshot() {
  const payload = serialize(state);
  payload.rev = saveRev;
  payload.lastSaved = state.lastSaved;
  return payload;
}

function uploadKey(payload) {
  return JSON.stringify({ ...payload, lastSaved: 0 });
}

function writeLocal() {
  if (!booted) return;
  state.lastSaved = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot()));
}

function markForceUpload() {
  forceNextPush = true;
  localStorage.setItem(FORCE_UPLOAD_KEY, '1');
}

function clearForceUpload() {
  forceNextPush = false;
  localStorage.removeItem(FORCE_UPLOAD_KEY);
}

function loadLocalOnly() {
  const localRaw = readLocalRaw();
  state = hydrate(localRaw) || createState();
  saveRev = readRev(localRaw);
}

function adoptRaw(raw) {
  const next = hydrate(raw);
  if (!next) return false;
  state = next;
  saveRev = readRev(raw);
  setSoundEnabled(state.sound);
  lastWall = Date.now();
  writeLocal();
  update(state);
  return true;
}

function cloudRicherThan(raw, other) {
  if (!raw) return false;
  if (!other) return Number(raw.totalEarned) > 0 || readRev(raw) > 0;
  if (Number(raw.totalEarned) > Number(other.totalEarned)) return true;
  if (Number(raw.totalEarned) === Number(other.totalEarned) && readRev(raw) > readRev(other)) return true;
  return false;
}

async function pullAndMerge() {
  const remote = await fetchCloudSave(session.token);
  if (remote.status === 401) {
    const error = new Error('unauthorized');
    error.code = 401;
    throw error;
  }
  if (!remote.ok) throw new Error('cloud');
  const localRaw = readLocalRaw();
  const picked = pickSave(localRaw, remote.save);
  if (picked.source === 'cloud' && picked.save) {
    state = hydrate(picked.save) || createState();
    saveRev = readRev(picked.save);
  } else if (picked.source === 'local' && picked.save) {
    state = hydrate(picked.save) || createState();
    saveRev = Math.max(readRev(picked.save), readRev(remote.save));
  } else {
    state = createState();
    saveRev = 0;
  }
  return { picked, remote };
}

async function flushCloud(force) {
  if (!session) return;
  const useForce = Boolean(force || forceNextPush);
  const payload = snapshot();
  const key = uploadKey(payload);
  if (!useForce && key === lastUploadedKey) {
    setSaveStatus('saved', session.email);
    return;
  }
  setSaveStatus('saving', session.email);
  const result = await pushCloudSave(session.token, payload, { force: useForce });
  if (result.status === 409 && result.save) {
    const newerLocal = saveRev > payload.rev;
    const cloudEarned = Number(result.save.totalEarned);
    if (!newerLocal || cloudEarned > state.totalEarned) {
      adoptRaw(result.save);
      lastUploadedKey = uploadKey(snapshot());
    }
    setSaveStatus('saved', session.email);
    return;
  }
  if (result.status === 401) {
    session = null;
    cloudReady = false;
    writeSession(null);
    setSaveStatus('guest');
    setResetMentionsCloud(false);
    return;
  }
  if (!result.ok) {
    setSaveStatus('offline', session.email);
    cloudReady = false;
    window.setTimeout(retryReconcile, 8000);
    return;
  }
  lastUploadedKey = key;
  if (useForce) clearForceUpload();
  if (saveRev === payload.rev) setSaveStatus('saved', session.email);
}

function enqueueFlush(force) {
  const job = pushTail.then(() => flushCloud(force));
  pushTail = job.catch(() => {});
  return job;
}

function scheduleCloud(force = false) {
  if (!session || !cloudReady) return;
  window.clearTimeout(cloudTimer);
  if (force) {
    void enqueueFlush(true);
    return;
  }
  cloudTimer = window.setTimeout(() => {
    void enqueueFlush(false);
  }, 1200);
}

function save(kind = 'auto') {
  if (!booted) return;
  if (kind === 'mutate' || kind === 'catchup' || kind === 'reset') saveRev += 1;
  if (kind === 'reset' && session) markForceUpload();
  writeLocal();
  if (kind === 'reset' && session) scheduleCloud(true);
  else scheduleCloud(false);
}

function applyCatchUp() {
  const awaySeconds = (Date.now() - state.lastSaved) / 1000;
  let offlineReport = null;
  let gained = 0;
  if (awaySeconds > 20) {
    offlineReport = applyOffline(state, awaySeconds);
    gained = offlineReport?.gained || 0;
  } else if (awaySeconds > 0.25) {
    gained = tick(state, Math.min(awaySeconds, 20)).gained || 0;
  }
  return { offlineReport, gained };
}

function freshSpeech() {
  const owned = state.businesses.reduce((sum, business) => sum + business.owned, 0);
  if (owned === 0 && state.totalEarned === 0) say(TUTORIAL, 14000);
  else if (owned === 0 && (state.angels > 0 || state.angelsSpent > 0)) {
    say('Os anjos ficaram. A barraca é o primeiro passo de novo.', 9000);
  } else say('Voltou. A brasa ainda está acesa.', 7000);
}

async function retryReconcile() {
  if (!session || cloudReady) return;
  try {
    if (localStorage.getItem(FORCE_UPLOAD_KEY) === '1') {
      forceNextPush = true;
      cloudReady = true;
      await enqueueFlush(true);
      if (forceNextPush) {
        cloudReady = false;
        window.setTimeout(retryReconcile, 15000);
        return;
      }
      setSaveStatus('saved', session.email);
      update(state);
      return;
    }
    writeLocal();
    const { picked } = await pullAndMerge();
    if (picked.source === 'local') saveRev += 1;
    writeLocal();
    cloudReady = true;
    await enqueueFlush(false);
    setSoundEnabled(state.sound);
    setSaveStatus('saved', session.email);
    update(state);
  } catch (error) {
    if (error.code === 401) {
      session = null;
      cloudReady = false;
      writeSession(null);
      setSaveStatus('guest');
      setResetMentionsCloud(false);
      return;
    }
    window.setTimeout(retryReconcile, 15000);
  }
}

function celebrate(payouts) {
  const manual = payouts.filter((payout) => payout.manual && payout.gain > 0);
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
    save(report.gained > 0 ? 'catchup' : 'auto');
  } else if (dt > 0) {
    const result = tick(state, dt);
    celebrate(result.payouts);
    if (result.gained > 0) save('mutate');
  }
  update(state);
  if (wall > nextSave) {
    save('auto');
    nextSave = wall + 4000;
  }
  requestAnimationFrame(frame);
}

async function start() {
  const localBefore = readLocalRaw();
  session = readSession();
  forceNextPush = localStorage.getItem(FORCE_UPLOAD_KEY) === '1';
  let picked = null;
  let bootOffline = false;

  if (session) {
    setSaveStatus('loading', session.email);
    try {
      if (forceNextPush) loadLocalOnly();
      else {
        const merged = await pullAndMerge();
        picked = merged.picked;
      }
    } catch (error) {
      if (error.code === 401) {
        session = null;
        writeSession(null);
        loadLocalOnly();
      } else {
        bootOffline = true;
        loadLocalOnly();
      }
    }
  } else {
    loadLocalOnly();
  }

  const caught = applyCatchUp();
  if (caught.gained > 0) saveRev += 1;
  booted = true;
  writeLocal();
  lastWall = Date.now();
  setSoundEnabled(state.sound);

  const broughtCloud = Boolean(session && !bootOffline && !forceNextPush && picked?.source === 'cloud' && cloudRicherThan(picked.save, localBefore));

  mount({
    onBuy(id) {
      const before = state.businesses.find((business) => business.id === id).owned;
      const qty = buy(state, id);
      if (!qty) return;
      play('buy');
      const def = getDef(id);
      cardFloater(id, `+${qty.toLocaleString('pt-BR')}`);
      if (before === 0) say(def.firstBuy);
      else say(`Mais ${qty.toLocaleString('pt-BR')} em ${def.name}. O cheiro de grana aumentou.`);
      const opened = state.businesses.filter((business) => business.owned > 0).length;
      if (opened === state.businesses.length) {
        say('A escada tá completa. Agora é escala, oinc.');
      }
      update(state);
      save('mutate');
    },
    onHire(id) {
      const def = getDef(id);
      if (!hire(state, id)) return;
      play('hire');
      popCash(`${def.manager}!`);
      const managers = state.businesses.filter((business) => business.hasManager).length;
      if (managers === state.businesses.length) {
        say('Equipe completa. O Docão virou acionista de si mesmo.');
      } else {
        say(`${def.manager} entrou na equipe. ${def.name} agora roda sozinho.`);
      }
      announce(`${def.manager} contratado.`);
      update(state);
      save('mutate');
    },
    onStart(id) {
      if (!startCycle(state, id)) return;
      play('start');
      update(state);
      save('mutate');
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
      save('mutate');
    },
    onQty(qty) {
      state.buyQty = qty;
      update(state);
      save('mutate');
    },
    onSound() {
      state.sound = !state.sound;
      setSoundEnabled(state.sound);
      if (state.sound) play('buy');
      say(state.sound ? 'Som ligado. Oinc com volume.' : 'Som mudo. O porco continua, só que calado.');
      update(state);
      save('mutate');
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
      save('mutate');
    },
    onBuyUpgrade(id) {
      const upgrade = getAngelUpgrade(id);
      if (!upgrade || !buyAngelUpgrade(state, id)) return;
      play('buy');
      say(`${upgrade.name}. Isso fica pra próxima vida também.`);
      announce(`${upgrade.name} comprada.`);
      update(state);
      save('mutate');
    },
    onReset() {
      state = createState();
      setSoundEnabled(false);
      lastWall = Date.now();
      say(TUTORIAL, 12000);
      announce('Império zerado.');
      update(state);
      save('reset');
    },
    onAccount() {
      openAccount(session?.email || '');
    },
    async onAuth({ mode, email, password }) {
      const auth = mode === 'register' ? await registerAccount(email, password) : await loginAccount(email, password);
      writeLocal();
      const before = readLocalRaw();
      session = { token: auth.token, email: auth.email };
      writeSession(session);
      setResetMentionsCloud(true);
      if (localStorage.getItem(FORCE_UPLOAD_KEY) === '1') {
        forceNextPush = true;
        cloudReady = true;
        await enqueueFlush(true);
        closeAccount();
        setSaveStatus(forceNextPush ? 'offline' : 'saved', session.email);
        if (!forceNextPush) {
          play('hire');
          say('Conta aberta. O império zerado foi pra nuvem.', 8000);
        }
        update(state);
        return;
      }
      try {
        const { picked: choice } = await pullAndMerge();
        const late = applyCatchUp();
        if (late.gained > 0) saveRev += 1;
        if (choice.source === 'local') saveRev += 1;
        writeLocal();
        lastWall = Date.now();
        cloudReady = true;
        await enqueueFlush(false);
        setSoundEnabled(state.sound);
        setSaveStatus('saved', session.email);
        closeAccount();
        play('hire');
        if (choice.source === 'cloud' && cloudRicherThan(choice.save, before)) {
          say('Achei um império mais rico na nuvem e trouxe pra cá.', 9000);
        } else {
          say('Conta aberta. O império agora mora na nuvem.', 8000);
        }
        update(state);
      } catch (error) {
        if (error.code === 401) {
          session = null;
          cloudReady = false;
          writeSession(null);
          setResetMentionsCloud(false);
          setSaveStatus('guest');
          throw new AccountError('A nuvem não respondeu.', 401);
        }
        cloudReady = false;
        setSaveStatus('offline', session.email);
        closeAccount();
        say('Conta aberta. Sem rede agora — o império ficou neste aparelho até a nuvem responder.', 9000);
        window.setTimeout(retryReconcile, 8000);
      }
    },
    async onLogout() {
      const token = session?.token;
      session = null;
      cloudReady = false;
      window.clearTimeout(cloudTimer);
      writeSession(null);
      if (token) await logoutAccount(token);
      setSaveStatus('guest');
      setResetMentionsCloud(false);
      closeAccount();
      say('Saiu da conta. O império continua neste aparelho.', 7000);
    },
  });

  setResetMentionsCloud(Boolean(session));
  update(state);
  if (broughtCloud) say('Achei um império na nuvem e trouxe pra cá.', 8000);
  else freshSpeech();

  if (caught.offlineReport && caught.offlineReport.gained >= 0.01) {
    showOffline(caught.offlineReport);
  } else if (caught.offlineReport && caught.offlineReport.ready.length > 0) {
    const name = getDef(caught.offlineReport.ready[0]).name;
    say(
      caught.offlineReport.ready.length === 1
        ? `${name} ficou pronta enquanto você foi ali.`
        : 'Tem negócio pronto pra coletar. O cheiro entrega.',
      7000,
    );
  }

  if (session && !bootOffline) {
    cloudReady = true;
    if (picked?.source === 'local') saveRev += 1;
    writeLocal();
    await enqueueFlush(forceNextPush);
  } else if (session && bootOffline) {
    setSaveStatus('offline', session.email);
    window.setTimeout(retryReconcile, 8000);
  } else {
    setSaveStatus('guest');
  }

  window.setInterval(() => {
    quipIndex = (quipIndex + 1) % QUIPS.length;
    rotateQuip(QUIPS[quipIndex]);
  }, 10000);

  requestAnimationFrame(frame);
}

start();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save('auto');
});

window.addEventListener('pagehide', () => {
  if (!booted) return;
  writeLocal();
  if (!session || !cloudReady) return;
  const payload = snapshot();
  void pushCloudSave(session.token, payload, { force: forceNextPush, keepalive: true });
});

window.addEventListener('storage', (event) => {
  if (event.key === SAVE_KEY || event.key === SESSION_KEY || event.key === FORCE_UPLOAD_KEY) {
    window.location.reload();
  }
});
