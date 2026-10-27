const MESSAGES = {
  email_taken: 'Esse e-mail já tem conta. Entra com a senha.',
  invalid_email: 'Esse e-mail não serve.',
  invalid_password: 'A senha precisa de 8 caracteres.',
  bad_login: 'E-mail ou senha não confere.',
  network: 'A nuvem não respondeu.',
};

function apiBase() {
  const configured = import.meta.env.VITE_API_URL || '';
  return String(configured).replace(/\/$/, '');
}

function apiUrl(path) {
  return `${apiBase()}${path}`;
}

export class AccountError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'AccountError';
    this.status = status;
  }
}

async function postAuth(path, email, password) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new AccountError(MESSAGES.network, 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AccountError(MESSAGES[data.error] || MESSAGES.network, response.status);
  }
  if (!data || typeof data.token !== 'string' || typeof data.email !== 'string') {
    throw new AccountError(MESSAGES.network, response.status);
  }
  return { token: data.token, email: data.email };
}

export function registerAccount(email, password) {
  return postAuth('/api/register', email, password);
}

export function loginAccount(email, password) {
  return postAuth('/api/login', email, password);
}

export async function logoutAccount(token) {
  try {
    await fetch(apiUrl('/api/logout'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Sair localmente mesmo se a nuvem não responder.
  }
}

export async function fetchCloudSave(token) {
  let response;
  try {
    response = await fetch(apiUrl('/api/save'), {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, status: 0, save: null };
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) return { ok: false, status: 401, save: null };
  if (!response.ok) return { ok: false, status: response.status, save: null };
  return { ok: true, status: 200, save: data.save ?? null, updatedAt: data.updatedAt ?? null };
}

export async function pushCloudSave(token, save, { force = false, keepalive = false } = {}) {
  let response;
  try {
    response = await fetch(apiUrl('/api/save'), {
      method: 'PUT',
      keepalive,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ save, force }),
    });
  } catch {
    return { ok: false, status: 0, error: 'network', save: null };
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 409) {
    return { ok: false, status: 409, error: 'stale', save: data.save ?? null };
  }
  if (!response.ok) return { ok: false, status: response.status, error: data.error || 'save', save: null };
  return { ok: true, status: response.status, updatedAt: data.updatedAt ?? null, save: null };
}
