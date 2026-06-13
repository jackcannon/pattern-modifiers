const hash3 = (seed: number, x: number, y: number, z: number) => {
  let h = seed ^ (x * 374761393) ^ (y * 668265263) ^ (z * 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const featurePoint = (seed: number, ix: number, iy: number, iz: number) => ({
  x: ix + hash3(seed, ix, iy, iz),
  y: iy + hash3(seed + 1, ix, iy, iz),
  z: iz + hash3(seed + 2, ix, iy, iz)
});

/**
 * Worley (cellular) noise: distance to nearest feature point, normalised to roughly [0, 1]
 */
export const worleyF1 = (seed: number, x: number, y: number, z: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  let minDist = Infinity;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cellX = ix + dx;
        const cellY = iy + dy;
        const cellZ = iz + dz;
        const point = featurePoint(seed, cellX, cellY, cellZ);
        const dist = Math.hypot(x - point.x, y - point.y, z - point.z);
        if (dist < minDist) minDist = dist;
      }
    }
  }

  return Math.min(1, minDist);
};

/**
 * Voronoi edge metric: difference between 1st and 2nd nearest distances, normalised to roughly [0, 1]
 */
export const voronoiF2MinusF1 = (seed: number, x: number, y: number, z: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  let minDist = Infinity;
  let secondDist = Infinity;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cellX = ix + dx;
        const cellY = iy + dy;
        const cellZ = iz + dz;
        const point = featurePoint(seed, cellX, cellY, cellZ);
        const dist = Math.hypot(x - point.x, y - point.y, z - point.z);
        if (dist < minDist) {
          secondDist = minDist;
          minDist = dist;
        } else if (dist < secondDist) {
          secondDist = dist;
        }
      }
    }
  }

  return Math.min(1, (secondDist - minDist) * 2);
};
