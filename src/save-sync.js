export const SESSION_KEY = 'docao-capitalista-session';
export const FORCE_UPLOAD_KEY = 'docao-capitalista-force-upload';

const ACCEPTED_VERSIONS = new Set([1, 2]);

export function readRev(raw) {
  if (!raw || !Number.isInteger(raw.rev) || raw.rev < 0) return 0;
  return raw.rev;
}

function isSave(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (!ACCEPTED_VERSIONS.has(raw.v)) return false;
  if (!Array.isArray(raw.businesses)) return false;
  if (typeof raw.totalEarned !== 'number' || !Number.isFinite(raw.totalEarned) || raw.totalEarned < 0) return false;
  return true;
}

/**
 * Escolhe o save na hora de entrar.
 * 1. Quem tem totalEarned maior ganha (grana de todas as vidas).
 * 2. Empate: o rev maior ganha — compra e renascimento que ainda não renderam.
 * 3. Empate de novo: a nuvem ganha.
 * Save inválido ou ausente perde pro outro.
 */
export function pickSave(localRaw, cloudRaw) {
  const localOk = isSave(localRaw);
  const cloudOk = isSave(cloudRaw);
  if (!localOk && !cloudOk) return { source: 'none', save: null };
  if (!cloudOk) return { source: 'local', save: localRaw };
  if (!localOk) return { source: 'cloud', save: cloudRaw };
  if (localRaw.totalEarned > cloudRaw.totalEarned) return { source: 'local', save: localRaw };
  if (cloudRaw.totalEarned > localRaw.totalEarned) return { source: 'cloud', save: cloudRaw };
  if (readRev(localRaw) > readRev(cloudRaw)) return { source: 'local', save: localRaw };
  return { source: 'cloud', save: cloudRaw };
}

export function readSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!raw || typeof raw.token !== 'string' || typeof raw.email !== 'string') return null;
    return { token: raw.token, email: raw.email };
  } catch {
    return null;
  }
}

export function writeSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token: session.token, email: session.email }));
}
