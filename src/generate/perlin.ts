// Seeded improved Perlin noise (Ken Perlin, 2002) with fractal Brownian motion

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

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + t * (b - a);

const grad = (hash: number, x: number, y: number, z: number) => {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

export class PerlinNoise3D {
  private perm: Uint8Array;

  constructor(seed: number) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle
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
   * Single octave of Perlin noise, roughly in range [-1, 1]
   *
   * @param {number} x - X coordinate (in noise space)
   * @param {number} y - Y coordinate (in noise space)
   * @param {number} z - Z coordinate (in noise space)
   * @returns {number} noise value
   */
  noise(x: number, y: number, z: number): number {
    const perm = this.perm;

    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = fade(x);
    const v = fade(y);
    const w = fade(z);

    const A = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;

    return lerp(
      lerp(
        lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
        lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  }

  /**
   * Fractal Brownian motion - layered octaves of noise, normalised to roughly [0, 1]
   *
   * @param {number} x - X coordinate (in noise space)
   * @param {number} y - Y coordinate (in noise space)
   * @param {number} z - Z coordinate (in noise space)
   * @param {number} octaves - number of noise layers
   * @param {number} persistence - amplitude falloff per octave (0-1)
   * @returns {number} noise value
   */
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
