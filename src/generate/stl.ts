import { Mesh } from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

import { getExportDisplayFileName } from '../form/exportState';
import { FormObject } from '../form/schema';

import { generateGeometry } from './generate';

export const forceDownloadBlob = (title: string, blob: Blob) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
};

export const ensureFileExtension = (name: string, ext: string = 'stl') => {
  if (name.endsWith('.' + ext)) return name;
  return name + '.' + ext;
};

/**
 * Generates the model from the form settings and downloads it as a binary STL,
 * ready to be added to slicer software as a modifier.
 *
 * @param {FormObject} form - current form settings
 * @param {string} [name] - download base name (without requiring .stl)
 * @returns {void}
 */
export const downloadSTL = (form: FormObject, name: string = getExportDisplayFileName(form)): void => {
  const geometry = generateGeometry(form, form.exportResolution);
  const mesh = new Mesh(geometry);

  const exporter = new STLExporter();
  const data = exporter.parse(mesh, { binary: true });

  geometry.dispose();

  const blob = new Blob([data], { type: 'application/octet-stream' });
  forceDownloadBlob(ensureFileExtension(name, 'stl'), blob);
};
