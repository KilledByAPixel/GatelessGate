// Position-Verlet cloth. Pure data + functions, no Three.js.
// Shared by the flag (M0), later the blinds (case 26) and robes (case 16).

export function createCloth(cols, rows, spacing, isPinned = (c, r) => r === 0) {
  const n = cols * rows;
  const positions = new Float32Array(n * 3);
  const prev = new Float32Array(n * 3);
  const pins = new Uint8Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      positions[i * 3] = c * spacing;
      positions[i * 3 + 1] = -r * spacing;
      positions[i * 3 + 2] = 0;
      pins[i] = isPinned(c, r) ? 1 : 0;
    }
  }
  prev.set(positions);
  const constraints = [];
  const diag = spacing * Math.SQRT2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c + 1 < cols) constraints.push([i, i + 1, spacing]);
      if (r + 1 < rows) constraints.push([i, i + cols, spacing]);
      if (c + 1 < cols && r + 1 < rows) {
        constraints.push([i, i + cols + 1, diag]);
        constraints.push([i + 1, i + cols, diag]);
      }
    }
  }
  return { cols, rows, spacing, positions, prev, pins, constraints };
}

export function stepCloth(cloth, dt, { gravity = [0, -9.8, 0], force = null, iterations = 3, damping = 0.985 } = {}) {
  const { positions: p, prev, pins, constraints } = cloth;
  const n = pins.length;
  const dt2 = dt * dt;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const x = p[i3], y = p[i3 + 1], z = p[i3 + 2];
    if (pins[i]) {
      prev[i3] = x; prev[i3 + 1] = y; prev[i3 + 2] = z;
      continue;
    }
    let fx = gravity[0], fy = gravity[1], fz = gravity[2];
    if (force) {
      const f = force(x, y, z, i);
      fx += f[0]; fy += f[1]; fz += f[2];
    }
    p[i3] = x + (x - prev[i3]) * damping + fx * dt2;
    p[i3 + 1] = y + (y - prev[i3 + 1]) * damping + fy * dt2;
    p[i3 + 2] = z + (z - prev[i3 + 2]) * damping + fz * dt2;
    prev[i3] = x; prev[i3 + 1] = y; prev[i3 + 2] = z;
  }
  for (let k = 0; k < iterations; k++) {
    for (const [a, b, rest] of constraints) {
      const pa = pins[a], pb = pins[b];
      if (pa && pb) continue;
      const a3 = a * 3, b3 = b * 3;
      const dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d === 0) continue;
      const diff = (d - rest) / d;
      const wA = pa ? 0 : (pb ? 1 : 0.5);
      const wB = pb ? 0 : (pa ? 1 : 0.5);
      if (wA !== 0) {
        p[a3] += dx * diff * wA; p[a3 + 1] += dy * diff * wA; p[a3 + 2] += dz * diff * wA;
      }
      if (wB !== 0) {
        p[b3] -= dx * diff * wB; p[b3 + 1] -= dy * diff * wB; p[b3 + 2] -= dz * diff * wB;
      }
    }
  }
}

export function clothEnergy(cloth) {
  const { positions: p, prev } = cloth;
  let e = 0;
  for (let i = 0; i < p.length; i++) {
    const d = p[i] - prev[i];
    e += d * d;
  }
  return e;
}
