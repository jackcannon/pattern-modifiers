import { BufferGeometry } from 'three';
import { strToU8, zipSync } from 'fflate';

import { formToEffectiveExport, getExportDisplayFileName } from '../form/exportState';
import { FormObject } from '../form/schema';
import { buildShareUrl } from '../form/shareUrl';

import { generateGeometry } from './generate';
import { ensureFileExtension, forceDownloadBlob } from './stl';

/** Match common weld precision so shared edges keep shared indices (avoids open-edge slicer warnings). */
const WELD_PRECISION = 1e5;

interface WeldedMesh {
  name: string;
  vertices: number[];
  triangles: number[];
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * Welds a triangle-soup BufferGeometry into indexed vertex/triangle buffers so
 * shared edges keep shared indices (required for slicers that flag open edges on 3MF meshes).
 *
 * @param {BufferGeometry} geometry - pattern mesh (typically non-indexed positions)
 * @param {string} name - object name written into the 3MF
 * @returns {WeldedMesh} welded mesh
 */
const geometryToWeldedMesh = (geometry: BufferGeometry, name: string): WeldedMesh => {
  const position = geometry.getAttribute('position');
  if (!position) {
    return { name, vertices: [], triangles: [] };
  }

  const vertexIndexByKey = new Map<string, number>();
  const vertices: number[] = [];
  const triangles: number[] = [];

  const roundCoord = (value: number) => Math.round(value * WELD_PRECISION) / WELD_PRECISION;
  const getVertexIndex = (x: number, y: number, z: number): number => {
    const key = `${roundCoord(x)},${roundCoord(y)},${roundCoord(z)}`;
    let index = vertexIndexByKey.get(key);
    if (index === undefined) {
      index = vertices.length / 3;
      vertexIndexByKey.set(key, index);
      vertices.push(x, y, z);
    }
    return index;
  };

  const index = geometry.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const i0 = index.getX(i);
      const i1 = index.getX(i + 1);
      const i2 = index.getX(i + 2);
      const a = getVertexIndex(position.getX(i0), position.getY(i0), position.getZ(i0));
      const b = getVertexIndex(position.getX(i1), position.getY(i1), position.getZ(i1));
      const c = getVertexIndex(position.getX(i2), position.getY(i2), position.getZ(i2));
      if (a !== b && b !== c && a !== c) triangles.push(a, b, c);
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      const a = getVertexIndex(position.getX(i), position.getY(i), position.getZ(i));
      const b = getVertexIndex(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
      const c = getVertexIndex(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));
      if (a !== b && b !== c && a !== c) triangles.push(a, b, c);
    }
  }

  return { name, vertices, triangles };
};

const formatCoord = (value: number): string => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
};

/**
 * Builds a 3MF model XML document with a single combined mesh object.
 *
 * @param {WeldedMesh} mesh - welded mesh to include
 * @param {string} shareUrl - share link stored as ShareURL metadata
 * @param {string} formStateJson - JSON form backup stored as FormState metadata
 * @returns {string} model XML
 */
const build3mfModelXml = (mesh: WeldedMesh, shareUrl: string, formStateJson: string): string => {
  const vertexXml = Array.from({ length: mesh.vertices.length / 3 }, (_, vi) => {
    const x = formatCoord(mesh.vertices[vi * 3]);
    const y = formatCoord(mesh.vertices[vi * 3 + 1]);
    const z = formatCoord(mesh.vertices[vi * 3 + 2]);
    return `          <vertex x="${x}" y="${y}" z="${z}"/>`;
  }).join('\n');

  const triangleXml = Array.from({ length: mesh.triangles.length / 3 }, (_, ti) => {
    const v1 = mesh.triangles[ti * 3];
    const v2 = mesh.triangles[ti * 3 + 1];
    const v3 = mesh.triangles[ti * 3 + 2];
    return `          <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`;
  }).join('\n');

  const objectName = escapeXml(mesh.name);

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="und" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">PatternModifiers</metadata>
  <metadata name="CreationDate">${new Date().toISOString()}</metadata>
  <metadata name="app-name">pattern-modifiers</metadata>
  <metadata name="ShareURL">${escapeXml(shareUrl)}</metadata>
  <metadata name="FormState">${escapeXml(formStateJson)}</metadata>
  <resources>
    <basematerials id="0">
      <base name="mat0" displaycolor="#FFA000FF"/>
    </basematerials>
    <object id="1" type="model" pid="0" pindex="0" name="${objectName}">
      <mesh>
        <vertices>
${vertexXml}
        </vertices>
        <triangles>
${triangleXml}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>
`;
};

/**
 * Builds Bambu Studio / Orca-style model_settings.config so the single object
 * keeps its display name instead of a generic fallback.
 *
 * @param {string} objectName - object display name (filename without extension)
 * @returns {string} model_settings.config XML
 */
const buildModelSettingsConfig = (objectName: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1">
    <metadata key="name" value="${escapeXml(objectName)}"/>
    <part id="1" subtype="normal_part">
      <metadata key="name" value="${escapeXml(objectName)}"/>
    </part>
  </object>
</config>
`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="config" ContentType="application/octet-stream"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

/** Strips a trailing file extension from an export name, if present. */
const stripFileExtension = (name: string): string => name.replace(/\.[^.\/]+$/, '');

/**
 * Generates the model from the form settings and downloads it as a 3MF package.
 *
 * Always emits one combined mesh object (even if the geometry is non-contiguous),
 * named after the filename without extension.
 *
 * @param {FormObject} form - current form settings
 * @param {string} [name] - download base name (without requiring .3mf)
 * @returns {void}
 */
export const download3MF = (form: FormObject, name: string = getExportDisplayFileName(form)): void => {
  const objectName = stripFileExtension(name) || 'pattern';
  const geometry = generateGeometry(form, form.exportResolution);
  const mesh = geometryToWeldedMesh(geometry, objectName);
  geometry.dispose();

  const shareUrl = buildShareUrl(form);
  const formStateJson = JSON.stringify(formToEffectiveExport(form));
  const xml = build3mfModelXml(mesh, shareUrl, formStateJson);
  const modelSettings = buildModelSettingsConfig(objectName);

  const packaged = zipSync(
    {
      '3D': { '3dmodel.model': strToU8(xml) },
      Metadata: { 'model_settings.config': strToU8(modelSettings) },
      _rels: { '.rels': strToU8(RELS) },
      '[Content_Types].xml': strToU8(CONTENT_TYPES)
    },
    { comment: 'created by PatternModifiers' }
  );

  const blob = new Blob([packaged], { type: 'model/3mf' });
  forceDownloadBlob(ensureFileExtension(name, '3mf'), blob);
};
