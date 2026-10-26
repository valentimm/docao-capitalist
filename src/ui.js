import { BUSINESSES } from './data.js';
import { formatAway, formatMoney, formatRemaining } from './format.js';
import { getDef, incomePerSecond, quoteBuy } from './economy.js';

const cards = new Map();
const teamRows = new Map();

let live = null;
let speechEl = null;
let speechLockUntil = 0;

function buttonParts(label, cost) {
  return `<span class="btn-label">${label}</span><span class="btn-cost">${cost}</span>`;
}

export function mount(handlers) {
  speechEl = document.querySelector('#speech');
  live = document.querySelector('#live');

  const list = document.querySelector('#business-list');
  for (const def of BUSINESSES) {
    const el = document.createElement('article');
    el.className = 'biz';
    el.dataset.id = def.id;
    el.style.setProperty('--accent', def.accent);
    el.innerHTML = `
      <div class="biz-top">
        <div class="icon-badge" aria-hidden="true"><span>${def.icon}</span></div>
        <div class="biz-copy">
          <div class="biz-title-row">
            <h2>${def.name}</h2>
            <span class="owned">×0</span>
          </div>
          <p class="tagline">${def.tagline}</p>
        </div>
      </div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Progresso de ${def.name}">
        <div class="bar-fill"></div>
      </div>
      <button type="button" class="btn btn-collect collect" data-action="collect" hidden>Coletar</button>
      <div class="biz-meta">
        <span class="payout"></span>
        <span class="eta"></span>
      </div>
      <p class="manager-line"></p>
      <div class="biz-actions">
        <button type="button" class="btn btn-buy" data-action="buy">${buttonParts('Comprar', '')}</button>
        <button type="button" class="btn btn-hire" data-action="hire">${buttonParts('Gerente', '')}</button>
      </div>
    `;
    list.appendChild(el);
    cards.set(def.id, {
      el,
      owned: el.querySelector('.owned'),
      bar: el.querySelector('.bar'),
      fill: el.querySelector('.bar-fill'),
      collect: el.querySelector('.collect'),
      payout: el.querySelector('.payout'),
      eta: el.querySelector('.eta'),
      manager: el.querySelector('.manager-line'),
      buy: el.querySelector('[data-action="buy"]'),
      buyLabel: el.querySelector('[data-action="buy"] .btn-label'),
      buyCost: el.querySelector('[data-action="buy"] .btn-cost'),
      hire: el.querySelector('[data-action="hire"]'),
      hireLabel: el.querySelector('[data-action="hire"] .btn-label'),
      hireCost: el.querySelector('[data-action="hire"] .btn-cost'),
    });
    el.querySelector('[data-action="buy"]').addEventListener('click', () => handlers.onBuy(def.id));
    el.querySelector('[data-action="hire"]').addEventListener('click', () => handlers.onHire(def.id));
    el.querySelector('[data-action="collect"]').addEventListener('click', () => handlers.onCollect(def.id));
  }

  const teamList = document.querySelector('#team-list');
  for (const def of BUSINESSES) {
    const row = document.createElement('article');
    row.className = 'team-row';
    row.innerHTML = `
      <div class="icon-badge" aria-hidden="true"><span>${def.icon}</span></div>
      <div>
        <h3>${def.manager}</h3>
        <span class="team-for">${def.name}</span>
        <p>${def.managerBlurb}</p>
        <button type="button" class="btn btn-hire">${buttonParts('Contratar', '')}</button>
      </div>
    `;
    row.style.setProperty('--accent', def.accent);
    teamList.appendChild(row);
    const button = row.querySelector('button');
    teamRows.set(def.id, {
      button,
      label: button.querySelector('.btn-label'),
      cost: button.querySelector('.btn-cost'),
    });
    button.addEventListener('click', () => handlers.onHire(def.id));
  }

  document.querySelector('#poke').addEventListener('click', handlers.onPoke);
  document.querySelector('#team-btn').addEventListener('click', () => {
    document.querySelector('#team-dialog').showModal();
  });
  document.querySelector('#team-close').addEventListener('click', () => {
    document.querySelector('#team-dialog').close();
  });
  document.querySelector('#sound-btn').addEventListener('click', handlers.onSound);
  document.querySelector('#reset-btn').addEventListener('click', () => {
    document.querySelector('#reset-dialog').showModal();
  });
  document.querySelector('#reset-cancel').addEventListener('click', () => {
    document.querySelector('#reset-dialog').close();
  });
  document.querySelector('#reset-confirm').addEventListener('click', () => {
    document.querySelector('#reset-dialog').close();
    handlers.onReset();
  });
  document.querySelector('#offline-ok').addEventListener('click', () => {
    document.querySelector('#offline-dialog').close();
  });

  for (const button of document.querySelectorAll('.modes button')) {
    button.addEventListener('click', () => {
      const qty = button.dataset.qty === 'max' ? 'max' : Number(button.dataset.qty);
      handlers.onQty(qty);
    });
  }

  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
}

export function say(text, holdMs = 8000) {
  if (!speechEl) return;
  speechEl.textContent = text;
  speechLockUntil = Date.now() + holdMs;
}

export function rotateQuip(text) {
  if (Date.now() < speechLockUntil) return false;
  say(text, 9000);
  return true;
}

function cashFloater(text) {
  const host = document.querySelector('.wallet');
  const el = document.createElement('span');
  el.className = 'floater';
  el.textContent = text;
  host.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

export function cardFloater(id, text) {
  const card = cards.get(id);
  if (!card) return;
  const el = document.createElement('span');
  el.className = 'floater';
  el.textContent = text;
  card.el.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

export function update(state) {
  const money = document.querySelector('#money');
  const nextMoney = formatMoney(state.money);
  if (money.textContent !== nextMoney) {
    money.textContent = nextMoney;
    money.classList.remove('bump');
    void money.offsetWidth;
    money.classList.add('bump');
  }

  const rates = incomePerSecond(state);
  document.querySelector('#rate-value').textContent = `${formatMoney(rates.total)}/s`;
  const sub = document.querySelector('#rate-sub');
  if (rates.total <= 0) sub.textContent = 'compra uma barraca pra começar';
  else if (rates.manual <= 0) sub.textContent = 'tudo no automático. pode cochilar.';
  else if (rates.auto <= 0) sub.textContent = 'tudo na mão. um gerente muda isso.';
  else sub.textContent = `${formatMoney(rates.auto)}/s sozinho · ${formatMoney(rates.manual)}/s na mão`;

  const lifetime = document.querySelector('#lifetime');
  lifetime.textContent =
    state.totalEarned > 0
      ? `Já passou pelo caixa: ${formatMoney(state.totalEarned)}`
      : 'O caixa ainda está estreando.';

  for (const button of document.querySelectorAll('.modes button')) {
    const qty = button.dataset.qty === 'max' ? 'max' : Number(button.dataset.qty);
    button.setAttribute('aria-pressed', qty === state.buyQty ? 'true' : 'false');
  }

  const soundBtn = document.querySelector('#sound-btn');
  soundBtn.textContent = state.sound ? 'Som: ligado' : 'Som: mudo';
  soundBtn.setAttribute('aria-pressed', state.sound ? 'true' : 'false');

  let hireDeal = false;

  for (const def of BUSINESSES) {
    const biz = state.businesses.find((b) => b.id === def.id);
    const card = cards.get(def.id);
    card.owned.textContent = `×${biz.owned.toLocaleString('pt-BR')}`;
    card.el.classList.toggle('is-ready', biz.pending > 0);
    card.el.classList.toggle('is-auto', biz.hasManager);

    const pct = def.time > 0 ? Math.min(100, (biz.timer / def.time) * 100) : 0;
    card.fill.style.width = `${pct}%`;
    const shown = String(Math.round(pct));
    if (card.bar.getAttribute('aria-valuenow') !== shown) card.bar.setAttribute('aria-valuenow', shown);

    const waiting = biz.pending > 0 && !biz.hasManager;
    card.collect.hidden = !waiting;
    card.bar.hidden = waiting;
    if (waiting) card.collect.textContent = `Coletar ${formatMoney(biz.pending)}`;

    const payout = def.revenue * Math.max(biz.owned, 1);
    card.payout.textContent =
      biz.owned > 0 ? `rende ${formatMoney(def.revenue * biz.owned)}` : `rende ${formatMoney(payout)} cada`;
    if (biz.owned <= 0) card.eta.textContent = `ciclo de ${formatRemaining(def.time)}`;
    else if (waiting) card.eta.textContent = 'pronto!';
    else card.eta.textContent = `falta ${formatRemaining(Math.max(0, def.time - biz.timer))}`;

    if (biz.hasManager) card.manager.textContent = `${def.manager} no automático`;
    else if (biz.owned > 0) card.manager.textContent = 'Sem gerente · a coleta é na mão';
    else card.manager.textContent = 'A primeira unidade libera o gerente';

    const quote = quoteBuy(state, def.id);
    card.buy.disabled = !quote.affordable;
    if (state.buyQty === 'max' && quote.qty <= 0) card.buyLabel.textContent = 'Comprar Máx';
    else if (quote.qty <= 1) card.buyLabel.textContent = 'Comprar';
    else card.buyLabel.textContent = `Comprar ×${quote.qty.toLocaleString('pt-BR')}`;
    card.buyCost.textContent = formatMoney(quote.cost);

    const team = teamRows.get(def.id);
    const canHire = !biz.hasManager && biz.owned >= 1 && state.money + 1e-6 >= def.managerCost;
    if (canHire) hireDeal = true;

    if (biz.hasManager) {
      card.hire.disabled = true;
      card.hire.classList.add('is-hired');
      card.hireLabel.textContent = 'Na equipe';
      card.hireCost.textContent = def.manager;
      team.button.disabled = true;
      team.button.classList.add('is-hired');
      team.label.textContent = 'Na equipe';
      team.cost.textContent = 'já trabalhando';
    } else if (biz.owned < 1) {
      card.hire.disabled = true;
      card.hire.classList.remove('is-hired');
      card.hireLabel.textContent = 'Gerente';
      card.hireCost.textContent = 'depois da 1ª';
      team.button.disabled = true;
      team.button.classList.remove('is-hired');
      team.label.textContent = 'Bloqueado';
      team.cost.textContent = 'compre a 1ª';
    } else {
      card.hire.disabled = !canHire;
      card.hire.classList.remove('is-hired');
      card.hireLabel.textContent = 'Contratar';
      card.hireCost.textContent = formatMoney(def.managerCost);
      team.button.disabled = !canHire;
      team.button.classList.remove('is-hired');
      team.label.textContent = 'Contratar';
      team.cost.textContent = formatMoney(def.managerCost);
    }
  }

  document.querySelector('#team-btn').classList.toggle('has-deal', hireDeal);
}

export function showOffline(report) {
  const dialog = document.querySelector('#offline-dialog');
  const away = formatAway(report.applied);
  const capped = report.capped ? ' O teto da soneca é 8 horas. Até o Docão levanta pra comer.' : '';
  document.querySelector('#offline-copy').textContent =
    `Você ficou fora por ${away}. Os gerentes não tiraram folga.${capped}`;
  document.querySelector('#offline-gain').textContent = `+ ${formatMoney(report.gained)}`;
  const extra = document.querySelector('#offline-extra');
  if (report.ready.length === 1) {
    extra.textContent = `${getDef(report.ready[0]).name} também ficou pronta pra coletar.`;
  } else if (report.ready.length > 1) {
    extra.textContent = 'Tem coleta esperando na mesa, além do que já entrou no caixa.';
  } else {
    extra.textContent = 'Já entrou no caixa. Pode contar.';
  }
  if (!dialog.open) dialog.showModal();
}

export function announce(text) {
  if (live) live.textContent = text;
}

export function popCash(text) {
  cashFloater(text);
}

export function pokeSquash() {
  const mascot = document.querySelector('#poke');
  mascot.classList.add('poked');
  window.setTimeout(() => mascot.classList.remove('poked'), 180);
}
