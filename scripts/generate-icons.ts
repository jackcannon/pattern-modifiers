// Regenerate PNG favicons from public/logo.svg. Run with: bun scripts/generate-icons.ts
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { Resvg } from '@resvg/resvg-js';

const root = join(import.meta.dir, '..');
const logoSvg = readFileSync(join(root, 'public/logo.svg'));

const render = (size: number) => {
  const resvg = new Resvg(logoSvg, {
    fitTo: { mode: 'width', value: size },
    background: 'transparent'
  });
  return resvg.render().asPng();
};

writeFileSync(join(root, 'public/favicon-32.png'), render(32));
writeFileSync(join(root, 'public/apple-touch-icon.png'), render(192));

console.log('Wrote public/favicon-32.png (32×32)');
console.log('Wrote public/apple-touch-icon.png (192×192)');
