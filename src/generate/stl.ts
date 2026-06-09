import { Mesh } from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

import { FormObject, getDefaultFileName } from '../form/schema';

import { generateGeometry } from './generate';

const ensureFileExtension = (name: string, ext: string = 'stl') => {
  if (name.endsWith('.' + ext)) return name;
  return name + '.' + ext;
};

/**
 * Generates the model from the form settings and downloads it as a binary STL,
 * ready to be added to slicer software as a modifier.
 *
 * @param {FormObject} form - current form settings
 * @returns {void}
 */
export const downloadSTL = (form: FormObject): void => {
  const geometry = generateGeometry(form, form.exportResolution);
  const mesh = new Mesh(geometry);

  const exporter = new STLExporter();
  const data = exporter.parse(mesh, { binary: true });

  geometry.dispose();

  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const name = form.fileName.trim() || getDefaultFileName(form);

  const link = document.createElement('a');
  link.href = url;
  link.download = ensureFileExtension(name, 'stl');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
