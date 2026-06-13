import { BoxGeometry, BufferAttribute, BufferGeometry, Mesh, Object3D, SphereGeometry, Uint32BufferAttribute } from 'three';
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { DemoModelType } from '../form/schema';

const cloneIndexedGeometry = (geometry: BufferGeometry): BufferGeometry => {
  const cloned = new BufferGeometry();
  const position = geometry.getAttribute('position') as BufferAttribute;
  cloned.setAttribute('position', new BufferAttribute(new Float32Array(position.array as Float32Array), 3));

  const index = geometry.getIndex();
  if (index) {
    const array = index.array;
    if (array instanceof Uint32Array) {
      cloned.setIndex(new Uint32BufferAttribute(new Uint32Array(array), 1));
    } else if (array instanceof Uint16Array) {
      cloned.setIndex(new Uint32BufferAttribute(new Uint32Array(array), 1));
    } else {
      const next = new Uint32Array(index.count);
      for (let i = 0; i < index.count; i++) next[i] = index.getX(i);
      cloned.setIndex(new Uint32BufferAttribute(next, 1));
    }
  }

  return cloned;
};

export const createCubeGeometry = (): BufferGeometry => new BoxGeometry(1, 1, 1);

export const createSphereGeometry = (): BufferGeometry => new SphereGeometry(0.5, 32, 24);

export const createTeapotGeometry = (): BufferGeometry => new TeapotGeometry(1, 15);

export const extractMeshGeometry = (object: Object3D): BufferGeometry => {
  const geometries: BufferGeometry[] = [];

  object.traverse((child) => {
    if (child instanceof Mesh) geometries.push(child.geometry.clone());
  });

  if (geometries.length === 0) throw new Error('No mesh geometry found in demo model');

  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
  if (!merged) throw new Error('Failed to merge demo model geometry');

  return mergeVertices(merged);
};

/**
 * Rotates source geometry into printer space (Z-up, sitting on the build plate).
 *
 * @param {BufferGeometry} geometry - source geometry
 * @param {DemoModelType} model - demo model type
 * @returns {BufferGeometry} oriented geometry (caller owns disposal)
 */
export const orientDemoGeometry = (geometry: BufferGeometry, model: DemoModelType): BufferGeometry => {
  switch (model) {
    case 'cube':
    case 'sphere':
    case 'benchy':
      return geometry;
    case 'teapot': {
      const oriented = geometry.clone();
      // TeapotGeometry is Y-up; rotate onto the build plate with lid facing +Z
      oriented.rotateX(-Math.PI / 2);
      oriented.rotateY(Math.PI);
      return oriented;
    }
    case 'suzanne': {
      const oriented = geometry.clone();
      oriented.rotateX(Math.PI / 2);
      return oriented;
    }
    case 'bunny': {
      const oriented = geometry.clone();
      // Stanford bunny OBJ is Y-up
      oriented.rotateX(Math.PI / 2);
      return oriented;
    }
  }
};

/**
 * Scales geometry so its height (Z axis) matches `targetSize` mm and positions it
 * centred on X/Y with its bottom resting on the build plate (Z = 0).
 *
 * @param {BufferGeometry} geometry - source geometry in printer orientation
 * @param {number} targetSize - desired height in mm
 * @param {boolean} inPlace - mutate `geometry` instead of cloning indexed sources
 * @returns {BufferGeometry} positioned geometry (caller owns disposal)
 */
export const prepareDemoGeometry = (
  geometry: BufferGeometry,
  targetSize: number,
  inPlace = false
): BufferGeometry => {
  const prepared = geometry.getIndex()
    ? inPlace
      ? geometry
      : cloneIndexedGeometry(geometry)
    : mergeVertices(geometry);

  const coords = (prepared.getAttribute('position').array as Float32Array);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < coords.length; i += 3) {
    const x = coords[i];
    const y = coords[i + 1];
    const z = coords[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const scale = targetSize / (maxZ - minZ);
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;

  for (let i = 0; i < coords.length; i += 3) {
    coords[i] = (coords[i] - centerX) * scale;
    coords[i + 1] = (coords[i + 1] - centerY) * scale;
    coords[i + 2] = (coords[i + 2] - minZ) * scale;
  }

  prepared.getAttribute('position').needsUpdate = true;
  prepared.boundingBox = null;
  prepared.boundingSphere = null;

  return prepared;
};

export const createDemoGeometry = (
  model: DemoModelType,
  size: number,
  externalSource?: BufferGeometry
): BufferGeometry => {
  let base: BufferGeometry;

  switch (model) {
    case 'cube':
      base = createCubeGeometry();
      break;
    case 'sphere':
      base = createSphereGeometry();
      break;
    case 'teapot':
      base = createTeapotGeometry();
      break;
    case 'suzanne':
    case 'bunny':
    case 'benchy':
      if (!externalSource) throw new Error(`${model} geometry not loaded`);
      base = cloneIndexedGeometry(externalSource);
      break;
  }

  const oriented = orientDemoGeometry(base, model);
  if (oriented !== base) {
    base.dispose();
    return prepareDemoGeometry(oriented, size, true);
  }

  return prepareDemoGeometry(base, size, true);
};
