// Gentle orbit + cursor parallax. Hand-rolled — no OrbitControls.
// The camera never affects simulation state, so mouse input never breaks determinism.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function makeCameraRig(camera, el, {
  target = [0, 1.1, 0],
  distance = 11,
  azimuth = 0.5,
  polar = 1.25,
  minPolar = 0.9,
  maxPolar = 1.45,
  azimuthRange = 0.9,
  minDist = 7,
  maxDist = 16,
  parallax = 0.045,
  damping = 4,
} = {}) {
  const home = { azimuth, polar };
  const goal = { azimuth, polar, distance };
  const cur = { azimuth, polar, distance };
  const mouse = { x: 0, y: 0 };
  let dragging = false, px = 0, py = 0;

  const onPointerDown = (e) => {
    dragging = true;
    px = e.clientX; py = e.clientY;
  };
  const onPointerMove = (e) => {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    mouse.x = clamp((e.clientX / w) * 2 - 1, -1, 1);
    mouse.y = clamp((e.clientY / h) * 2 - 1, -1, 1);
    if (dragging) {
      goal.azimuth = clamp(goal.azimuth - (e.clientX - px) * 0.005, home.azimuth - azimuthRange, home.azimuth + azimuthRange);
      goal.polar = clamp(goal.polar - (e.clientY - py) * 0.005, minPolar, maxPolar);
      px = e.clientX; py = e.clientY;
    }
  };
  const onPointerUp = () => { dragging = false; };
  const onPointerLeave = () => { dragging = false; };
  const onWheel = (e) => {
    e.preventDefault?.();
    goal.distance = clamp(goal.distance + e.deltaY * 0.01, minDist, maxDist);
  };
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointerleave', onPointerLeave);
  el.addEventListener('wheel', onWheel);

  function update(dt) {
    const k = 1 - Math.exp(-damping * dt);
    cur.azimuth += (goal.azimuth + mouse.x * parallax - cur.azimuth) * k;
    cur.polar += (goal.polar - mouse.y * parallax - cur.polar) * k;
    cur.distance += (goal.distance - cur.distance) * k;
    const [tx, ty, tz] = target;
    const sp = Math.sin(cur.polar), cp = Math.cos(cur.polar);
    camera.position.set(
      tx + cur.distance * sp * Math.sin(cur.azimuth),
      ty + cur.distance * cp,
      tz + cur.distance * sp * Math.cos(cur.azimuth)
    );
    camera.lookAt(tx, ty, tz);
  }

  const state = () => ({ azimuth: cur.azimuth, polar: cur.polar, distance: cur.distance });

  function dispose() {
    el.removeEventListener?.('pointerdown', onPointerDown);
    el.removeEventListener?.('pointermove', onPointerMove);
    el.removeEventListener?.('pointerup', onPointerUp);
    el.removeEventListener?.('pointerleave', onPointerLeave);
    el.removeEventListener?.('wheel', onWheel);
  }

  return { update, state, goal, dispose };
}
