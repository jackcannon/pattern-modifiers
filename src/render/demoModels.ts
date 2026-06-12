import { BoxGeometry, BufferGeometry, Mesh, Object3D, SphereGeometry, Vector3 } from 'three';
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { DemoModelType } from '../form/schema';

const tempSize = new Vector3();

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
  const oriented = geometry.clone();

  switch (model) {
    case 'cube':
    case 'sphere':
    case 'benchy':
      break;
    case 'teapot':
      // TeapotGeometry is Y-up; rotate onto the build plate with lid facing +Z
      oriented.rotateX(-Math.PI / 2);
      oriented.rotateY(Math.PI);
      break;
    case 'suzanne':
      oriented.rotateX(Math.PI / 2);
      break;
    case 'bunny':
      // Stanford bunny OBJ is Y-up
      oriented.rotateX(Math.PI / 2);
      break;
  }

  return oriented;
};

/**
 * Scales geometry so its height (Z axis) matches `targetSize` mm and positions it
 * centred on X/Y with its bottom resting on the build plate (Z = 0).
 *
 * @param {BufferGeometry} geometry - source geometry in printer orientation
 * @param {number} targetSize - desired height in mm
 * @returns {BufferGeometry} positioned geometry (caller owns disposal)
 */
export const prepareDemoGeometry = (geometry: BufferGeometry, targetSize: number): BufferGeometry => {
  const prepared = geometry.getIndex() ? geometry.clone() : mergeVertices(geometry);
  prepared.computeBoundingBox();

  const box = prepared.boundingBox!;
  box.getSize(tempSize);
  const scale = targetSize / tempSize.z;
  prepared.scale(scale, scale, scale);

  prepared.computeBoundingBox();
  const scaled = prepared.boundingBox!;
  const center = scaled.getCenter(new Vector3());
  prepared.translate(-center.x, -center.y, -scaled.min.z);

  prepared.computeVertexNormals();
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
      base = externalSource.clone();
      break;
  }

  const oriented = orientDemoGeometry(base, model);
  if (oriented !== base) base.dispose();

  const prepared = prepareDemoGeometry(oriented, size);
  oriented.dispose();
  return prepared;
};
