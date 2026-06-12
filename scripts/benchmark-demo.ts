import { readFileSync } from 'fs';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { createDefaultFormObj } from '../src/form/schema.ts';
import { createPatternField } from '../src/generate/patternField.ts';
import { clipPreparedDemoMesh, getPreparedDemoMesh } from '../src/render/demoClip.ts';
import { getCachedPreparedDemoMesh } from '../src/render/demoMeshCache.ts';
import { createDemoGeometry } from '../src/render/demoModels.ts';

const bench = (label: string, fn: () => void) => {
  const t0 = performance.now();
  fn();
  console.log(label, (performance.now() - t0).toFixed(0), 'ms');
};

const form = createDefaultFormObj();
form.demoModel = 'benchy';
form.demoSize = 50;
form.demoResolution = 36;

const loader = new STLLoader();
const buf = readFileSync('./public/models/benchy.stl');
const stl = mergeVertices(
  loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
);

bench('createPatternField (cold)', () => {
  createPatternField(form, 36);
});

const field = createPatternField(form, 36);

bench('createPatternField (threshold only)', () => {
  createPatternField({ ...form, threshold: form.threshold + 3 }, 36);
});

bench('createDemoGeometry (indexed source)', () => {
  createDemoGeometry('benchy', 50, stl);
});

const demoGeo = createDemoGeometry('benchy', 50, stl);

bench('getPreparedDemoMesh (cold)', () => {
  const prepared = getPreparedDemoMesh(demoGeo, field.maxCellSize);
  prepared.dispose();
});

const prepared = getPreparedDemoMesh(demoGeo, field.maxCellSize);
console.log('prepared tris', prepared.getIndex()!.count / 3);

const reuse = { inside: null as import('three').BufferGeometry | null, outside: null as import('three').BufferGeometry | null };

bench('clipPreparedDemoMesh (cold)', () => {
  const result = clipPreparedDemoMesh(prepared, field);
  reuse.inside = result.inside;
  reuse.outside = result.outside;
});

bench('clipPreparedDemoMesh (warm + reuse)', () => {
  const form2 = { ...form, threshold: form.threshold + 5 };
  const field2 = createPatternField(form2, 36);
  const result = clipPreparedDemoMesh(prepared, field2, reuse);
  reuse.inside = result.inside;
  reuse.outside = result.outside;
});

bench('getCachedPreparedDemoMesh (warm cache)', () => {
  getCachedPreparedDemoMesh('benchy', 50, field.maxCellSize, stl);
});

bench('full warm path (cache + clip + reuse)', () => {
  const form3 = { ...form, threshold: form.threshold + 10 };
  const field3 = createPatternField(form3, 36);
  const mesh = getCachedPreparedDemoMesh('benchy', 50, field3.maxCellSize, stl);
  clipPreparedDemoMesh(mesh, field3, reuse);
});

demoGeo.dispose();
prepared.dispose();
reuse.inside?.dispose();
reuse.outside?.dispose();
