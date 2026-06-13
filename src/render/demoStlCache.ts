import { BufferGeometry } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const mergedStlCache = new Map<string, BufferGeometry>();

/**
 * Returns a welded indexed copy of an STL geometry, cached by path.
 *
 * @param {string} path - STL asset path used as cache key
 * @param {BufferGeometry} geometry - raw STL geometry from STLLoader
 * @returns {BufferGeometry} merged geometry
 */
export const getMergedStlGeometry = (path: string, geometry: BufferGeometry): BufferGeometry => {
  const cached = mergedStlCache.get(path);
  if (cached) return cached;

  const merged = mergeVertices(geometry);
  mergedStlCache.set(path, merged);
  return merged;
};
