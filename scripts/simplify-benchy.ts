import { readFileSync, writeFileSync } from 'fs';
import { Mesh } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';

const SOURCE_PATH = './public/models/benchy-source.stl';
const OUTPUT_PATH = './public/models/benchy.stl';

/** Target triangle count for the demo Benchy asset (~3 MB on disk). */
const TARGET_TRIANGLES = 29_500;

/** Relative simplification error (fraction of mesh extent). Lower preserves detail. */
const TARGET_ERROR = 0.0051;

const main = async () => {
  await MeshoptSimplifier.ready;

  const buffer = readFileSync(SOURCE_PATH);
  const loader = new STLLoader();
  const merged = mergeVertices(
    loader.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  );

  const sourceTriangles = merged.getIndex()!.count / 3;
  console.log(`Source: ${sourceTriangles.toFixed(0)} triangles`);

  const positions = merged.getAttribute('position').array as Float32Array;
  const indices = merged.getIndex()!.array as ArrayLike<number>;

  const [simplifiedIndices, actualError] = MeshoptSimplifier.simplifySloppy(
    indices,
    positions,
    3,
    null,
    TARGET_TRIANGLES * 3,
    TARGET_ERROR
  );

  console.log(`Simplification error: ${actualError.toFixed(5)}`);

  merged.setIndex(Array.from(simplifiedIndices));
  merged.getAttribute('position').needsUpdate = true;

  const simplified = mergeVertices(merged);
  merged.dispose();

  const outputTriangles = simplified.getIndex()!.count / 3;
  console.log(`Simplified: ${outputTriangles.toFixed(0)} triangles`);

  const mesh = new Mesh(simplified);
  const exporter = new STLExporter();
  const stl = exporter.parse(mesh, { binary: true }) as DataView;

  writeFileSync(OUTPUT_PATH, Buffer.from(stl.buffer, stl.byteOffset, stl.byteLength));
  console.log(`Wrote ${OUTPUT_PATH} (${stl.byteLength} bytes)`);

  simplified.dispose();
};

main();
