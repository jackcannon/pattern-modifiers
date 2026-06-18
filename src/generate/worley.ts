const hash3 = (seed: number, x: number, y: number, z: number) => {
  let h = seed ^ (x * 374761393) ^ (y * 668265263) ^ (z * 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const featureCoords = (seed: number, ix: number, iy: number, iz: number, out: { x: number; y: number; z: number }) => {
  out.x = ix + hash3(seed, ix, iy, iz);
  out.y = iy + hash3(seed + 1, ix, iy, iz);
  out.z = iz + hash3(seed + 2, ix, iy, iz);
};

const featurePoint = (seed: number, ix: number, iy: number, iz: number) => ({
  x: ix + hash3(seed, ix, iy, iz),
  y: iy + hash3(seed + 1, ix, iy, iz),
  z: iz + hash3(seed + 2, ix, iy, iz)
});

const CELL_PT = { x: 0, y: 0, z: 0 };

/**
 * Worley (cellular) noise: distance to nearest feature point, normalised to roughly [0, 1]
 */
export const worleyF1 = (seed: number, x: number, y: number, z: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  let minDistSq = Infinity;

  for (let dz = -1; dz <= 1; dz++) {
    const cellZ = iz + dz;
    for (let dy = -1; dy <= 1; dy++) {
      const cellY = iy + dy;
      for (let dx = -1; dx <= 1; dx++) {
        const cellX = ix + dx;
        featureCoords(seed, cellX, cellY, cellZ, CELL_PT);
        const ddx = x - CELL_PT.x;
        const ddy = y - CELL_PT.y;
        const ddz = z - CELL_PT.z;
        const distSq = ddx * ddx + ddy * ddy + ddz * ddz;
        if (distSq < minDistSq) minDistSq = distSq;
      }
    }
  }

  return Math.min(1, Math.sqrt(minDistSq));
};

/**
 * Voronoi edge metric: difference between 1st and 2nd nearest distances, normalised to roughly [0, 1]
 */
export const voronoiF2MinusF1 = (seed: number, x: number, y: number, z: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  let minDistSq = Infinity;
  let secondDistSq = Infinity;

  for (let dz = -1; dz <= 1; dz++) {
    const cellZ = iz + dz;
    for (let dy = -1; dy <= 1; dy++) {
      const cellY = iy + dy;
      for (let dx = -1; dx <= 1; dx++) {
        const cellX = ix + dx;
        featureCoords(seed, cellX, cellY, cellZ, CELL_PT);
        const ddx = x - CELL_PT.x;
        const ddy = y - CELL_PT.y;
        const ddz = z - CELL_PT.z;
        const distSq = ddx * ddx + ddy * ddy + ddz * ddz;
        if (distSq < minDistSq) {
          secondDistSq = minDistSq;
          minDistSq = distSq;
        } else if (distSq < secondDistSq) {
          secondDistSq = distSq;
        }
      }
    }
  }

  return Math.min(1, (Math.sqrt(secondDistSq) - Math.sqrt(minDistSq)) * 2);
};
