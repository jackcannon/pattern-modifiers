// 3D simplex noise (Stefan Gustavson / Ken Perlin style)

const F3 = 1 / 3;
const G3 = 1 / 6;

// Gradient directions flattened into typed arrays for fast, allocation-free access in the hot loops.
const GRAD_X = new Int8Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0]);
const GRAD_Y = new Int8Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1]);
const GRAD_Z = new Int8Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1]);

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export class SimplexNoise3D {
  private perm: Uint8Array;

  /** Gradient of the most recent {@link noiseGrad} / {@link fbmGrad} call, written in place to avoid allocations */
  gradX = 0;
  gradY = 0;
  gradZ = 0;

  constructor(seed: number) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /**
   * Single octave of simplex noise, roughly in range [-1, 1]
   */
  noise(x: number, y: number, z: number): number {
    const perm = this.perm;

    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);

    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    let i1: number;
    let j1: number;
    let k1: number;
    let i2: number;
    let j2: number;
    let k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      } else {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      }
    } else if (y0 < z0) {
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else if (x0 < z0) {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let n0 = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      t0 *= t0;
      const gi = perm[ii + perm[jj + perm[kk]]] % 12;
      n0 = t0 * t0 * (GRAD_X[gi] * x0 + GRAD_Y[gi] * y0 + GRAD_Z[gi] * z0);
    }

    let n1 = 0;
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      t1 *= t1;
      const gi = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12;
      n1 = t1 * t1 * (GRAD_X[gi] * x1 + GRAD_Y[gi] * y1 + GRAD_Z[gi] * z1);
    }

    let n2 = 0;
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      t2 *= t2;
      const gi = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12;
      n2 = t2 * t2 * (GRAD_X[gi] * x2 + GRAD_Y[gi] * y2 + GRAD_Z[gi] * z2);
    }

    let n3 = 0;
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      t3 *= t3;
      const gi = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12;
      n3 = t3 * t3 * (GRAD_X[gi] * x3 + GRAD_Y[gi] * y3 + GRAD_Z[gi] * z3);
    }

    return 32 * (n0 + n1 + n2 + n3);
  }

  /**
   * Single octave of simplex noise that also writes its analytic gradient into {@link gradX}/{@link gradY}/{@link gradZ}.
   * Computing the gradient exactly (rather than by finite differences) gives smooth, uniform topographical lines.
   *
   * @param {number} x - sample X
   * @param {number} y - sample Y
   * @param {number} z - sample Z
   * @returns {number} noise value, roughly in range [-1, 1]
   */
  noiseGrad(x: number, y: number, z: number): number {
    const perm = this.perm;

    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);

    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    let i1: number;
    let j1: number;
    let k1: number;
    let i2: number;
    let j2: number;
    let k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else if (y0 < z0) {
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
    } else if (x0 < z0) {
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
    } else {
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let n = 0;
    let dx = 0;
    let dy = 0;
    let dz = 0;

    // Each corner contributes n = t^4 * (g·d); its gradient is -8·t^3·(g·d)·d + t^4·g.
    // Inlined per corner (rather than a closure) to keep the accumulators in registers.
    let tc = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (tc >= 0) {
      const gi = perm[ii + perm[jj + perm[kk]]] % 12;
      const gX = GRAD_X[gi];
      const gY = GRAD_Y[gi];
      const gZ = GRAD_Z[gi];
      const gd = gX * x0 + gY * y0 + gZ * z0;
      const t2 = tc * tc;
      const t4 = t2 * t2;
      n += t4 * gd;
      const c = -8 * t2 * tc * gd;
      dx += c * x0 + t4 * gX;
      dy += c * y0 + t4 * gY;
      dz += c * z0 + t4 * gZ;
    }

    tc = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (tc >= 0) {
      const gi = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12;
      const gX = GRAD_X[gi];
      const gY = GRAD_Y[gi];
      const gZ = GRAD_Z[gi];
      const gd = gX * x1 + gY * y1 + gZ * z1;
      const t2 = tc * tc;
      const t4 = t2 * t2;
      n += t4 * gd;
      const c = -8 * t2 * tc * gd;
      dx += c * x1 + t4 * gX;
      dy += c * y1 + t4 * gY;
      dz += c * z1 + t4 * gZ;
    }

    tc = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (tc >= 0) {
      const gi = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12;
      const gX = GRAD_X[gi];
      const gY = GRAD_Y[gi];
      const gZ = GRAD_Z[gi];
      const gd = gX * x2 + gY * y2 + gZ * z2;
      const t2 = tc * tc;
      const t4 = t2 * t2;
      n += t4 * gd;
      const c = -8 * t2 * tc * gd;
      dx += c * x2 + t4 * gX;
      dy += c * y2 + t4 * gY;
      dz += c * z2 + t4 * gZ;
    }

    tc = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (tc >= 0) {
      const gi = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12;
      const gX = GRAD_X[gi];
      const gY = GRAD_Y[gi];
      const gZ = GRAD_Z[gi];
      const gd = gX * x3 + gY * y3 + gZ * z3;
      const t2 = tc * tc;
      const t4 = t2 * t2;
      n += t4 * gd;
      const c = -8 * t2 * tc * gd;
      dx += c * x3 + t4 * gX;
      dy += c * y3 + t4 * gY;
      dz += c * z3 + t4 * gZ;
    }

    this.gradX = 32 * dx;
    this.gradY = 32 * dy;
    this.gradZ = 32 * dz;
    return 32 * n;
  }

  /**
   * Fractal Brownian motion that also writes the analytic gradient of the result into
   * {@link gradX}/{@link gradY}/{@link gradZ} (with respect to the input coordinates).
   *
   * @param {number} x - sample X
   * @param {number} y - sample Y
   * @param {number} z - sample Z
   * @param {number} octaves - number of noise layers
   * @param {number} persistence - amplitude falloff per octave
   * @returns {number} value in range [0, 1]
   */
  fbmGrad(x: number, y: number, z: number, octaves: number, persistence: number): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;
    let gx = 0;
    let gy = 0;
    let gz = 0;

    for (let o = 0; o < octaves; o++) {
      const v = this.noiseGrad(x * frequency, y * frequency, z * frequency);
      total += v * amplitude;
      gx += this.gradX * amplitude * frequency;
      gy += this.gradY * amplitude * frequency;
      gz += this.gradZ * amplitude * frequency;
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    const norm = 1 / (maxAmplitude * 2);
    this.gradX = gx * norm;
    this.gradY = gy * norm;
    this.gradZ = gz * norm;
    return total * norm + 0.5;
  }

  fbm(x: number, y: number, z: number, octaves: number, persistence: number): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let o = 0; o < octaves; o++) {
      total += this.noise(x * frequency, y * frequency, z * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxAmplitude / 2 + 0.5;
  }
}
