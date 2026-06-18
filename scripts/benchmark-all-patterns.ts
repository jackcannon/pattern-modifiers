// Benchmark all patterns across setting combos. Run: bun scripts/benchmark-all-patterns.ts
import { generateGeometry } from '../src/generate/generate';
import { PATTERN_DEFINITIONS } from '../src/generate/patterns/registry';
import { createDefaultFormObj } from '../src/form/schema';

import type { FormObject, PatternType } from '../src/form/schema';

const BASE = {
  ...createDefaultFormObj(),
  width: 100,
  depth: 80,
  height: 60,
  seed: 1234
};

type BenchCase = { label: string; overrides: Partial<FormObject> };

const SHARED_CASES: BenchCase[] = [
  { label: 'default-res72', overrides: { previewResolution: 72, exportResolution: 72 } },
  { label: 'low-oct-res48', overrides: { octaves: 1, previewResolution: 48, exportResolution: 48 } },
  { label: 'high-oct-res72', overrides: { octaves: 4, persistence: 0.6, previewResolution: 72, exportResolution: 72 } },
  { label: 'export-res96', overrides: { previewResolution: 96, exportResolution: 96 } }
];

const PATTERN_EXTRA_CASES: Partial<Record<PatternType, BenchCase[]>> = {
  topographical: [
    { label: 'tight-lines-res64', overrides: { lineSpacing: 6, lineThickness: 1, exportResolution: 64 } },
    { label: 'wide-lines-res48', overrides: { lineSpacing: 14, lineThickness: 2.5, exportResolution: 48 } }
  ],
  halftone: [
    { label: 'dense-dots-res72', overrides: { dotSpacing: 4, mergeSmoothnessPct: 50, exportResolution: 72 } },
    { label: 'sparse-dots-res48', overrides: { dotSpacing: 12, mergeSmoothnessPct: 10, exportResolution: 48 } }
  ],
  crosshatch: [
    { label: 'tight-hatch-res72', overrides: { hatchSpacing: 4, hatchCrossStart: 45, exportResolution: 72 } },
    { label: 'wide-hatch-res48', overrides: { hatchSpacing: 10, exportResolution: 48 } }
  ],
  parallel: [
    { label: 'tight-lines-res72', overrides: { hatchSpacing: 3, exportResolution: 72 } },
    { label: 'wide-lines-res48', overrides: { hatchSpacing: 12, exportResolution: 48 } }
  ],
  woodgrain: [
    { label: 'many-knots-res72', overrides: { knotCount: 12, ringSpacing: 6, exportResolution: 72 } },
    { label: 'smooth-rings-res48', overrides: { knotCount: 0, grainWaviness: 0.2, exportResolution: 48 } }
  ],
  kintsugi: [
    { label: 'fine-cracks-res72', overrides: { crackWidth: 0.8, crackJaggedness: 8, exportResolution: 72 } },
    { label: 'wide-cracks-res48', overrides: { crackWidth: 4, crackJaggedness: 2, exportResolution: 48 } }
  ],
  lattice: [
    { label: 'dense-struts-res72', overrides: { strutSpacing: 8, strutRadius: 1.2, exportResolution: 72 } },
    { label: 'sparse-struts-res48', overrides: { strutSpacing: 20, strutRadius: 2, exportResolution: 48 } }
  ],
  marble: [
    { label: 'tight-veins-res72', overrides: { veinSpacing: 10, swirl: 2.5, exportResolution: 72 } },
    { label: 'wide-veins-res48', overrides: { veinSpacing: 35, swirl: 0.5, exportResolution: 48 } }
  ],
  gyroid: [
    { label: 'fine-period-res72', overrides: { period: 8, exportResolution: 72 } },
    { label: 'coarse-period-res48', overrides: { period: 24, exportResolution: 48 } }
  ],
  waves: [
    { label: 'short-wave-res72', overrides: { wavelength: 8, amplitude: 0.8, exportResolution: 72 } },
    { label: 'long-wave-res48', overrides: { wavelength: 30, amplitude: 0.3, exportResolution: 48 } }
  ]
};

const casesFor = (type: PatternType): BenchCase[] => {
  const extra = PATTERN_EXTRA_CASES[type] ?? [];
  return [...SHARED_CASES, ...extra];
};

const buildForm = (type: PatternType, overrides: Partial<FormObject>): FormObject => {
  const def = PATTERN_DEFINITIONS.find((p) => p.type === type)!;
  return { ...BASE, type, ...def.fieldDefaults, ...overrides } as FormObject;
};

const benchOne = (form: FormObject, resolution: number, runs: number) => {
  // Warm-up
  generateGeometry(form, resolution).dispose();

  let total = 0;
  let tris = 0;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    const geo = generateGeometry(form, resolution);
    total += performance.now() - t0;
    tris = geo.getAttribute('position').count / 3;
    geo.dispose();
  }
  return { ms: total / runs, tris };
};

const results: {
  type: PatternType;
  label: string;
  resolution: number;
  ms: number;
  tris: number;
}[] = [];

for (const def of PATTERN_DEFINITIONS) {
  for (const benchCase of casesFor(def.type)) {
    const form = buildForm(def.type, benchCase.overrides);
    const resolution = form.exportResolution;
    const runs = resolution >= 96 ? 2 : resolution >= 72 ? 3 : 4;
    const { ms, tris } = benchOne(form, resolution, runs);
    results.push({ type: def.type, label: benchCase.label, resolution, ms, tris });
  }
}

const byPattern = new Map<PatternType, { totalMs: number; count: number; maxMs: number; cases: typeof results }>();
for (const r of results) {
  const entry = byPattern.get(r.type) ?? { totalMs: 0, count: 0, maxMs: 0, cases: [] };
  entry.totalMs += r.ms;
  entry.count += 1;
  entry.maxMs = Math.max(entry.maxMs, r.ms);
  entry.cases.push(r);
  byPattern.set(r.type, entry);
}

const ranked = [...byPattern.entries()]
  .map(([type, s]) => ({ type, avgMs: s.totalMs / s.count, maxMs: s.maxMs, cases: s.cases }))
  .sort((a, b) => b.avgMs - a.avgMs);

console.log('=== Pattern benchmark (avg ms across cases, higher = slower) ===');
for (const row of ranked) {
  console.log(`${row.type.padEnd(14)} avg=${row.avgMs.toFixed(1)}ms  max=${row.maxMs.toFixed(1)}ms`);
}

console.log('\n=== Slowest case per pattern ===');
for (const row of ranked) {
  const worst = [...row.cases].sort((a, b) => b.ms - a.ms)[0];
  console.log(`${row.type}: ${worst.label} res${worst.resolution} ${worst.ms.toFixed(1)}ms (${worst.tris} tris)`);
}

console.log(`\nSLOWEST_PATTERN=${ranked[0].type}`);
