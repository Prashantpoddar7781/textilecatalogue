let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new Ctx();
  }
  return audioContext;
}

function playTone(frequency: number, durationMs: number, volume = 0.18) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const run = () => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.value = volume;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + durationMs / 1000);
    oscillator.start(start);
    oscillator.stop(start + durationMs / 1000);
  };

  if (ctx.state === 'suspended') {
    void ctx.resume().then(run).catch(() => undefined);
    return;
  }
  run();
}

/** Short confirmation beep after a successful barcode scan. */
export function playScanBeep() {
  playTone(880, 90);
}

/** Lower tone when a barcode does not match a design. */
export function playScanErrorBeep() {
  playTone(220, 140, 0.14);
}
