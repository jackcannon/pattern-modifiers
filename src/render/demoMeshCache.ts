import { BufferGeometry } from 'three';

import { DemoModelType } from '../form/schema';

import { createDemoGeometry } from './demoModels';
import { getPreparedDemoMesh } from './demoClip';

interface DemoGeometryCacheEntry {
  key: string;
  geometry: BufferGeometry;
}

interface PreparedMeshCacheEntry {
  key: string;
  geometry: BufferGeometry;
}

let demoGeometryCache: DemoGeometryCacheEntry | null = null;
let preparedMeshCache: PreparedMeshCacheEntry | null = null;

const demoGeometryKey = (model: DemoModelType, size: number) => `${model}:${size}`;

const preparedMeshKey = (model: DemoModelType, size: number, maxCellSize: number) =>
  `${model}:${size}:${maxCellSize.toFixed(4)}`;

const replaceCacheEntry = <T extends { geometry: BufferGeometry }>(
  current: T | null,
  next: T
): T => {
  if (current && current !== next) current.geometry.dispose();
  return next;
};

/**
 * Returns scaled/oriented demo geometry, reusing the previous result when model and size are unchanged.
 *
 * @param {DemoModelType} model - demo model id
 * @param {number} size - target height in mm
 * @param {BufferGeometry | undefined} externalSource - loaded STL/OBJ source
 * @returns {BufferGeometry} demo geometry in printer space
 */
export const getCachedDemoGeometry = (
  model: DemoModelType,
  size: number,
  externalSource?: BufferGeometry
): BufferGeometry => {
  const key = demoGeometryKey(model, size);
  if (demoGeometryCache?.key === key) return demoGeometryCache.geometry;

  const geometry = createDemoGeometry(model, size, externalSource);
  demoGeometryCache = replaceCacheEntry(demoGeometryCache, { key, geometry });
  return geometry;
};

/**
 * Returns a merged, subdivided demo mesh ready for clipping, cached by model, size, and cell size.
 *
 * @param {DemoModelType} model - demo model id
 * @param {number} size - target height in mm
 * @param {number} maxCellSize - longest allowed clip edge in mm
 * @param {BufferGeometry | undefined} externalSource - loaded STL/OBJ source
 * @returns {BufferGeometry} prepared mesh for clipping
 */
export const getCachedPreparedDemoMesh = (
  model: DemoModelType,
  size: number,
  maxCellSize: number,
  externalSource?: BufferGeometry
): BufferGeometry => {
  const key = preparedMeshKey(model, size, maxCellSize);
  if (preparedMeshCache?.key === key) return preparedMeshCache.geometry;

  const demoGeometry = getCachedDemoGeometry(model, size, externalSource);
  const prepared = getPreparedDemoMesh(demoGeometry, maxCellSize);
  preparedMeshCache = replaceCacheEntry(preparedMeshCache, { key, geometry: prepared });
  return prepared;
};
