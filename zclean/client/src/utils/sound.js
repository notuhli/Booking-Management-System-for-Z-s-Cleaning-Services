// ── Notification sounds ──────────────────────────────────────────────────────
// Tones are SYNTHESISED with the Web Audio API rather than loaded from an mp3:
// no asset to download, nothing to 404, no bundle weight, and the pitch can
// differ per event type so the admin can tell a booking from a message without
// looking at the screen.
//
// Muting is per-device (localStorage) because the same account may be used on
// a shared counter machine where sound is unwelcome and a laptop where it is
// essential.
//
// Browser autoplay policy: audio is blocked until the user has interacted with
// the page. We fail silently in that case — the visual badge is always the
// primary signal and the sound is only an enhancement.

const MUTE_KEY = 'zclean_sound_muted';

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function setMuted(muted) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
}

let ctx = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

// ── Unlocking audio on phones ────────────────────────────────────────────────
// Mobile browsers refuse to play any sound that the person did not ask for:
// Chrome on Android and Safari on iOS both block audio unless it starts inside
// a real tap. This is why notification sounds worked on a laptop but never on a
// phone — and it is a browser rule, so deploying the site does not change it.
//
// The way round it is to start the audio engine during the FIRST tap, while
// permission is granted, with a note so quiet nobody hears it. From then on the
// browser treats this page's audio as user-approved and later chimes play on
// their own.
//
// Two limits remain, and no web page can lift them: an iPhone's silent switch
// still mutes everything, and nothing plays at all when the browser is closed.
let unlocked = false;

function unlockAudio() {
  if (unlocked) return;
  const audio = getCtx();
  if (!audio) return;
  try {
    audio.resume?.();
    // Some browsers only count the context as unlocked once a source has
    // actually run inside the gesture, so play an inaudible blip.
    const osc  = audio.createOscillator();
    const gain = audio.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.01);
    unlocked = true;
  } catch { /* nothing to do — the badge is still the primary signal */ }
}

// Called once when the app starts. Listens for the first interaction of any
// kind, then removes itself.
export function initSound() {
  if (typeof window === 'undefined') return;
  const events = ['pointerdown', 'touchstart', 'keydown'];
  const once = () => {
    unlockAudio();
    events.forEach(e => window.removeEventListener(e, once));
  };
  events.forEach(e => window.addEventListener(e, once, { passive: true }));
}

// Two short notes with a quick fade so it reads as a chime, not a beep.
function chime(notes, buzz) {
  // A short vibration alongside the sound: it still reaches the person when the
  // phone is on silent, which is exactly when the chime cannot. Android only —
  // iOS does not support this from a web page.
  if (!isMuted() && navigator.vibrate) {
    try { navigator.vibrate(buzz); } catch {}
  }
  return chimeTones(notes);
}

function chimeTones(notes) {
  if (isMuted()) return;
  // Respect the same accessibility preference the UI animations honour.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const audio = getCtx();
  if (!audio) return;
  try {
    if (audio.state === 'suspended') audio.resume();   // may reject before first interaction
    const now = audio.currentTime;
    notes.forEach(([freq, startAt, dur], i) => {
      const osc  = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Short attack, exponential release — soft rather than piercing.
      gain.gain.setValueAtTime(0.0001, now + startAt);
      gain.gain.exponentialRampToValueAtTime(0.14, now + startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startAt + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + startAt);
      osc.stop(now + startAt + dur + 0.02);
    });
  } catch { /* autoplay blocked or audio unavailable — badge still shows */ }
}

// Rising two-note tone — something arrived that needs reading.
export const playMessageSound = () => chime([[660, 0, 0.12], [880, 0.10, 0.18]], [40, 60, 40]);

// Lower, calmer pair — a booking or status update, less urgent than a message.
export const playNotifySound  = () => chime([[520, 0, 0.14], [660, 0.12, 0.20]], [60]);
