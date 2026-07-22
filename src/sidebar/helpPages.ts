export type HelpPage = {
  id: string;
  title: string;
  lead: string;
  imageSrc: string;
  imageAlt: string;
  /** How the hero image fills the top area. Defaults to cover. */
  imageFit?: 'cover' | 'contain';
  /** Side-by-side hero images */
  compare?: {
    left: { src: string; alt: string; label: string };
    right: { src: string; alt: string; label: string };
  };
  note?: string;
  /** When true, show a placeholder until a real screenshot is added */
  pendingScreenshot?: boolean;
};

export const HELP_PAGES: HelpPage[] = [
  {
    id: 'what',
    title: 'What is this?',
    lead: 'Pattern Modifiers makes 3D pattern shapes for your slicer. Download a mesh, then use it as a modifier on a print.',
    imageSrc: '/help/1-overview.png',
    imageAlt: '3D preview of a topographical pattern modifier on the build plate'
  },
  {
    id: 'modifiers',
    title: 'What is a modifier?',
    lead: 'A modifier is a 3D region in your slicer. Print settings can change only inside that region.',
    imageSrc: '/help/2-modifier.png',
    imageAlt: 'Demo mode showing a patterned cube on the build plate',
    note: 'Works in Bambu Studio, PrusaSlicer, OrcaSlicer, and similar tools.'
  },
  {
    id: 'choose',
    title: 'Choose a pattern',
    lead: 'Pick a style such as Topographical, Perlin, or Gyroid. Hover the ? icons for short explanations of each control.',
    imageSrc: '/help/3-pattern.png',
    imageAlt: 'Pattern dropdown set to Topographical',
    imageFit: 'contain'
  },
  {
    id: 'size',
    title: 'Set the size',
    lead: 'Width, depth, and height are in millimetres. Match the area you want to affect on your print.',
    imageSrc: '/help/4-size.png',
    imageAlt: 'Model width, depth, and height sliders',
    imageFit: 'contain'
  },
  {
    id: 'download',
    title: 'Download',
    lead: 'Export STL or 3MF when you are happy with the preview. Both work as modifiers in your slicer.',
    imageSrc: '/help/5-download.png',
    imageAlt: 'STL and 3MF download buttons',
    imageFit: 'contain'
  },
  {
    id: 'preview',
    title: 'Preview and demo',
    lead: 'Preview shows the full modifier you will download. Demo is an optional rough look on a sample shape.',
    imageSrc: '/help/6a-preview.png',
    imageAlt: 'Preview and demo comparison',
    compare: {
      left: {
        src: '/help/6a-preview.png',
        alt: 'Full Perlin pattern modifier preview',
        label: 'Preview'
      },
      right: {
        src: '/help/6b-demo.png',
        alt: 'Demo mode showing Perlin pattern on a cube',
        label: 'Demo'
      }
    },
    note: 'The downloaded file is always the full pattern, not the demo object.'
  },
  {
    id: 'slicer-1',
    title: 'Open your model',
    lead: 'In Bambu Studio (or similar), load the part you want to print as usual.',
    imageSrc: '/help/7-bambu-1-model.png',
    imageAlt: 'Print model open in Bambu Studio'
  },
  {
    id: 'slicer-2',
    title: 'Add as a modifier',
    lead: 'Right-click the object → Add Modifier → Load… then choose your STL or 3MF.',
    imageSrc: '/help/8-bambu-2-add-modifier.png',
    imageAlt: 'Add Modifier menu in Bambu Studio'
  },
  {
    id: 'slicer-3',
    title: 'Change the settings',
    lead: 'Select the modifier in the object list. Set infill, walls, speed, or other options for that region only.',
    imageSrc: '/help/9-bambu-3-settings.png',
    imageAlt: 'Modifier process settings in Bambu Studio'
  },
  {
    id: 'slicer-4',
    title: 'Slice and check',
    lead: 'Open Preview and confirm the patterned regions use your new settings.',
    imageSrc: '/help/10-bambu-4-preview.png',
    imageAlt: 'Slice preview showing modifier regions'
  }
];
