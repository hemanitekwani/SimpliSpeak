// Full-screen gesture recognition.
// One finger: tap, doubletap, longpress, swipeleft/right/up/down.
// Two fingers: twofingertap, twoswipeup/down/left/right.

const SWIPE_MIN = 45;      // px
const DOUBLE_TAP_MS = 450;
const LONG_PRESS_MS = 800;

export function attachGestures(el, onGesture) {
  const starts = new Map();      // pointerId -> {x, y}
  const deltas = [];             // finished pointers' movement
  let maxPointers = 0, longTimer = null, longFired = false, tapTimer = null, lastTap = 0;

  el.addEventListener("pointerdown", e => {
    el.setPointerCapture?.(e.pointerId);
    if (starts.size === 0) { maxPointers = 0; deltas.length = 0; longFired = false; }
    starts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    maxPointers = Math.max(maxPointers, starts.size);
    clearTimeout(longTimer);
    if (starts.size === 1) {
      longTimer = setTimeout(() => { if (starts.size === 1 && maxPointers === 1) { longFired = true; onGesture("longpress"); } }, LONG_PRESS_MS);
    }
  });

  el.addEventListener("pointermove", e => {
    const s = starts.get(e.pointerId);
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 15) clearTimeout(longTimer);
  });

  const end = e => {
    const s = starts.get(e.pointerId);
    if (!s) return;
    deltas.push({ dx: e.clientX - s.x, dy: e.clientY - s.y });
    starts.delete(e.pointerId);
    if (starts.size > 0) return;
    clearTimeout(longTimer);
    if (longFired) return;
    // Average movement of all fingers.
    const dx = deltas.reduce((a, d) => a + d.dx, 0) / deltas.length;
    const dy = deltas.reduce((a, d) => a + d.dy, 0) / deltas.length;
    const swiped = Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_MIN;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy < 0 ? "up" : "down");
    if (maxPointers >= 2) { onGesture(swiped ? `twoswipe${dir}` : "twofingertap"); return; }
    if (swiped) { onGesture(`swipe${dir}`); return; }
    const now = performance.now();
    if (now - lastTap < DOUBLE_TAP_MS) { clearTimeout(tapTimer); lastTap = 0; onGesture("doubletap"); }
    else { lastTap = now; tapTimer = setTimeout(() => onGesture("tap"), DOUBLE_TAP_MS); }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", e => { starts.delete(e.pointerId); clearTimeout(longTimer); });
  el.addEventListener("contextmenu", e => e.preventDefault());
}
