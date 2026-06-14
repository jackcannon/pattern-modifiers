export interface BuildVolumePreset {
  id: string;
  /** Short model name shown in the dropdown */
  name: string;
  width: number;
  depth: number;
  height: number;
}

export interface BuildVolumePresetGroup {
  manufacturer: string;
  presets: BuildVolumePreset[];
}

/**
 * Printer build volume presets. Edit this list to add or change printers.
 *
 * - Groups appear in the dropdown in the order listed here (Bambu first, etc.)
 * - Presets within each group are sorted smallest-first by volume automatically
 * - Dimensions are width × depth × height in mm (X × Y × Z)
 */
export const BUILD_VOLUME_PRESET_GROUPS: BuildVolumePresetGroup[] = [
  {
    manufacturer: 'Bambu Lab',
    presets: [
      { id: 'bambu-a1-mini', name: 'A1 mini', width: 180, depth: 180, height: 180 },
      { id: 'bambu-a1', name: 'A1 / P1 / X1', width: 256, depth: 256, height: 256 },
      { id: 'bambu-h2d', name: 'H2D', width: 325, depth: 320, height: 325 },
      { id: 'bambu-h2c', name: 'H2C', width: 330, depth: 320, height: 325 }
    ]
  },
  {
    manufacturer: 'Prusa',
    presets: [
      { id: 'prusa-mk4', name: 'MK4 / MK3S+', width: 250, depth: 210, height: 220 },
      { id: 'prusa-xl', name: 'XL', width: 360, depth: 360, height: 360 }
    ]
  },
  {
    manufacturer: 'Creality',
    presets: [
      { id: 'creality-ender3-k1', name: 'Ender 3 / K1', width: 220, depth: 220, height: 250 },
      { id: 'creality-k1-max', name: 'K1 Max', width: 300, depth: 300, height: 300 }
    ]
  },
  {
    manufacturer: 'Anycubic',
    presets: [
      { id: 'anycubic-kobra3', name: 'Kobra 3 / S1', width: 250, depth: 250, height: 260 },
      { id: 'anycubic-kobra2-plus', name: 'Kobra 2 Plus', width: 320, depth: 320, height: 400 },
      { id: 'anycubic-kobra2-max', name: 'Kobra 2 Max', width: 420, depth: 420, height: 500 }
    ]
  },
  {
    manufacturer: 'Voron',
    presets: [{ id: 'voron-350', name: '2.4 350', width: 350, depth: 350, height: 350 }]
  }
];

const presetVolume = (preset: BuildVolumePreset) => preset.width * preset.depth * preset.height;

export const formatBuildVolumePresetLabel = (preset: BuildVolumePreset) =>
  `${preset.name} (${preset.width} × ${preset.depth} × ${preset.height} mm)`;

export const BUILD_VOLUME_PRESET_GROUPS_SORTED: BuildVolumePresetGroup[] = BUILD_VOLUME_PRESET_GROUPS.map((group) => ({
  ...group,
  presets: [...group.presets].sort((a, b) => presetVolume(a) - presetVolume(b))
}));

export const BUILD_VOLUME_PRESETS: BuildVolumePreset[] = BUILD_VOLUME_PRESET_GROUPS_SORTED.flatMap((group) => group.presets);

export const getBuildVolumePreset = (id: string) => BUILD_VOLUME_PRESETS.find((preset) => preset.id === id);

/** Default build volume: Bambu Lab H2C (330 × 320 × 325 mm) */
export const DEFAULT_BUILD_VOLUME = getBuildVolumePreset('bambu-h2c')!;

export const DEFAULT_BUILD_VOLUME_PRESET_ID = DEFAULT_BUILD_VOLUME.id;

export const getBuildPlateDimensions = (presetId: string): BuildVolumePreset =>
  getBuildVolumePreset(presetId) ?? DEFAULT_BUILD_VOLUME;
