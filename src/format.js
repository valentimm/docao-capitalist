const small = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const UNITS = ['mil', 'mi', 'bi', 'tri', 'qua', 'qui', 'sex', 'sep', 'oct', 'non', 'dec'];

function formatScaled(scaled) {
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(scaled);
}

/** Contagem de anjos: "1 anjo", "12 anjos", "1.000 anjos". */
export function formatAngels(value) {
  const n = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  if (n === 1) return '1 anjo';
  return `${n.toLocaleString('pt-BR')} anjos`;
}

/** R$ no padrão pt-BR, com sufixo a partir de mil (mil, mi, bi, tri…). */
export function formatMoney(value) {
  if (!Number.isFinite(value)) return 'R$ —';
  const sign = value < 0 ? '−' : '';
  let n = Math.abs(value);
  if (n < 1000) return `${sign}R$ ${small.format(n)}`;

  let tier = 0;
  while (n >= 1000 && tier < UNITS.length) {
    n /= 1000;
    tier += 1;
  }
  if (n >= 999.5 && tier < UNITS.length) {
    n = 1;
    tier += 1;
  }
  if (tier === 0 || tier > UNITS.length) return `${sign}R$ ${small.format(Math.abs(value))}`;
  return `${sign}R$ ${formatScaled(n)} ${UNITS[tier - 1]}`;
}

export function formatAway(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return s === 1 ? '1 segundo' : `${s} segundos`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourLabel = hours === 1 ? '1 hora' : `${hours} horas`;
  if (!rest) return hourLabel;
  return `${hourLabel} e ${rest} min`;
}

export function formatRemaining(seconds) {
  if (seconds < 10) {
    return `${seconds.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}s`;
  }
  if (seconds < 60) return `${Math.ceil(seconds).toLocaleString('pt-BR')}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);
  if (minutes < 60) return rest ? `${minutes}min ${rest}s` : `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin ? `${hours}h ${remMin}min` : `${hours}h`;
}
