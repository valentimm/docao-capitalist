let ctx = null;
let enabled = false;

function context() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, when, dur, type, gain) {
  const audio = context();
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, when);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(when);
  osc.stop(when + dur);
}

export function setSoundEnabled(on) {
  enabled = Boolean(on);
  if (enabled) {
    try {
      context();
    } catch {
      enabled = false;
    }
  }
}

export function play(kind) {
  if (!enabled) return;
  let audio;
  try {
    audio = context();
  } catch {
    return;
  }
  const t = audio.currentTime;
  if (kind === 'buy') {
    tone(520, t, 0.08, 'triangle', 0.04);
    tone(680, t + 0.07, 0.1, 'triangle', 0.04);
  } else if (kind === 'start') {
    tone(440, t, 0.06, 'triangle', 0.03);
  } else if (kind === 'collect') {
    tone(880, t, 0.09, 'square', 0.03);
    tone(1180, t + 0.06, 0.12, 'square', 0.025);
  } else if (kind === 'hire') {
    tone(523, t, 0.12, 'triangle', 0.05);
    tone(659, t + 0.1, 0.12, 'triangle', 0.05);
    tone(784, t + 0.2, 0.18, 'triangle', 0.05);
  } else if (kind === 'poke') {
    tone(196, t, 0.1, 'sine', 0.05);
    tone(150, t + 0.09, 0.14, 'sine', 0.05);
  }
}
