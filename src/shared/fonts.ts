// A large, searchable list of Google Fonts offered in the customizer's Design
// section. Every family here ships at least the 400 and 700 weights the widget
// relies on, so the on-demand loader below can request them without a 400 from
// the css2 API. Inter is the default and is already bundled via the base CSS.
export const GOOGLE_FONTS: string[] = [
  'Inter',
  'Abel',
  'Advent Pro',
  'Alfa Slab One',
  'Anton',
  'Archivo',
  'Archivo Black',
  'Archivo Narrow',
  'Arimo',
  'Arvo',
  'Asap',
  'Assistant',
  'Barlow',
  'Barlow Condensed',
  'Barlow Semi Condensed',
  'Bebas Neue',
  'Bitter',
  'Cabin',
  'Cairo',
  'Catamaran',
  'Chakra Petch',
  'Chivo',
  'Comfortaa',
  'Cousine',
  'DM Mono',
  'DM Sans',
  'DM Serif Display',
  'Dosis',
  'EB Garamond',
  'Electrolize',
  'Exo',
  'Exo 2',
  'Fira Code',
  'Fira Sans',
  'Fjalla One',
  'Francois One',
  'Heebo',
  'Hind',
  'IBM Plex Mono',
  'IBM Plex Sans',
  'IBM Plex Serif',
  'Inconsolata',
  'JetBrains Mono',
  'Josefin Sans',
  'Jost',
  'Kanit',
  'Karla',
  'Lato',
  'Lexend',
  'Libre Franklin',
  'Lora',
  'Manrope',
  'Merriweather',
  'Merriweather Sans',
  'Michroma',
  'Montserrat',
  'Montserrat Alternates',
  'Mukta',
  'Mulish',
  'Nanum Gothic',
  'Noto Sans',
  'Noto Serif',
  'Nunito',
  'Nunito Sans',
  'Open Sans',
  'Orbitron',
  'Oswald',
  'Overpass',
  'Oxanium',
  'PT Sans',
  'PT Serif',
  'Playfair Display',
  'Poppins',
  'Prompt',
  'Quicksand',
  'Rajdhani',
  'Raleway',
  'Red Hat Display',
  'Roboto',
  'Roboto Condensed',
  'Roboto Flex',
  'Roboto Mono',
  'Roboto Slab',
  'Rubik',
  'Russo One',
  'Saira',
  'Saira Condensed',
  'Saira Semi Condensed',
  'Sarabun',
  'Signika',
  'Sora',
  'Source Code Pro',
  'Source Sans 3',
  'Source Serif 4',
  'Space Grotesk',
  'Space Mono',
  'Spline Sans',
  'Teko',
  'Titillium Web',
  'Ubuntu',
  'Urbanist',
  'Varela Round',
  'Work Sans',
  'Yanone Kaffeesatz',
  'Zilla Slab',
];

// Builds the CSS font-family stack for a chosen family, always falling back to
// Inter and then a generic sans-serif so a not-yet-loaded font still renders.
export function fontStack(family: string): string {
  const quoted = `'${family.replace(/'/g, '')}'`;
  return family === 'Inter' ? `${quoted}, sans-serif` : `${quoted}, 'Inter', sans-serif`;
}

// Injects (once) the Google Fonts <link> for a family so the chosen font is
// actually available when the widget applies it. Inter is bundled via the base
// CSS import, so it's skipped. Idempotent per family + document.
export function loadFont(family: string, doc: Document = document): void {
  if (!family || family === 'Inter') return;
  const id = `gf-${family.replace(/\s+/g, '-').toLowerCase()}`;
  if (doc.getElementById(id)) return;
  const link = doc.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  const fam = family.trim().replace(/\s+/g, '+');
  link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@400;700&display=swap`;
  doc.head.appendChild(link);
}
