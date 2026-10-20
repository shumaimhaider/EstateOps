/**
 * Generates deterministic illustrative pictures (SVG data URIs) for units. Flats, shops and
 * villas get a gallery; plots get none. Stands in for uploaded photos in the real system.
 */
const SCENES = {
  flat: ['Living room', 'Master bedroom', 'Kitchen', 'Building exterior'],
  shop: ['Storefront', 'Shop interior', 'Street frontage'],
  villa: ['Front elevation', 'Living area', 'Garden'],
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const hsl = (h, s, l) => `hsl(${h % 360} ${s}% ${l}%)`;

function frame(inner, sky, ground) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img">` +
    `<rect width="800" height="500" fill="${sky}"/><rect y="360" width="800" height="140" fill="${ground}"/>` +
    `${inner}</svg>`
  );
}

function windows(x, y, cols, rows, size, gap, fill) {
  let out = '';
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      out += `<rect x="${x + c * (size + gap)}" y="${y + r * (size + gap)}" width="${size}" height="${size}" rx="4" fill="${fill}"/>`;
    }
  }
  return out;
}

const PAINTERS = {
  'Living room': (p) =>
    frame(
      `<rect x="60" y="80" width="200" height="150" rx="6" fill="${p.glass}"/>` +
        `<rect x="150" y="300" width="420" height="90" rx="26" fill="${p.accent}"/>` +
        `<rect x="170" y="260" width="380" height="70" rx="22" fill="${p.accentDark}"/>` +
        `<rect x="610" y="250" width="90" height="140" rx="6" fill="${p.wood}"/>`,
      p.wall,
      p.floor,
    ),
  'Master bedroom': (p) =>
    frame(
      `<rect x="500" y="70" width="190" height="140" rx="6" fill="${p.glass}"/>` +
        `<rect x="140" y="280" width="420" height="110" rx="14" fill="${p.accent}"/>` +
        `<rect x="140" y="230" width="420" height="70" rx="10" fill="${p.accentDark}"/>` +
        `<rect x="90" y="300" width="50" height="90" rx="6" fill="${p.wood}"/>`,
      p.wall,
      p.floor,
    ),
  Kitchen: (p) =>
    frame(
      `<rect x="50" y="120" width="700" height="60" rx="4" fill="${p.wood}"/>` +
        `<rect x="50" y="270" width="700" height="120" rx="4" fill="${p.accent}"/>` +
        `<circle cx="250" cy="330" r="26" fill="${p.accentDark}"/><circle cx="350" cy="330" r="26" fill="${p.accentDark}"/>` +
        `<rect x="540" y="60" width="180" height="140" rx="6" fill="${p.glass}"/>`,
      p.wall,
      p.floor,
    ),
  'Building exterior': (p) =>
    frame(
      `<rect x="220" y="40" width="360" height="340" rx="8" fill="${p.accent}"/>` +
        windows(250, 70, 5, 6, 40, 14, p.glass) +
        `<rect x="370" y="310" width="60" height="70" rx="4" fill="${p.accentDark}"/>`,
      p.sky,
      p.ground,
    ),
  Storefront: (p) =>
    frame(
      `<rect x="120" y="110" width="560" height="270" rx="8" fill="${p.accent}"/>` +
        `<rect x="120" y="110" width="560" height="60" fill="${p.accentDark}"/>` +
        `<rect x="160" y="200" width="300" height="180" rx="6" fill="${p.glass}"/>` +
        `<rect x="500" y="200" width="140" height="180" rx="6" fill="${p.wood}"/>`,
      p.sky,
      p.ground,
    ),
  'Shop interior': (p) =>
    frame(
      `<rect x="60" y="90" width="680" height="200" rx="6" fill="${p.glass}" opacity="0.5"/>` +
        `<rect x="100" y="250" width="240" height="140" rx="6" fill="${p.wood}"/>` +
        `<rect x="420" y="250" width="280" height="140" rx="6" fill="${p.accent}"/>` +
        `<rect x="120" y="120" width="560" height="14" fill="${p.accentDark}"/>`,
      p.wall,
      p.floor,
    ),
  'Street frontage': (p) =>
    frame(
      `<rect x="40" y="130" width="230" height="250" rx="6" fill="${p.accentDark}"/>` +
        `<rect x="285" y="100" width="230" height="280" rx="6" fill="${p.accent}"/>` +
        `<rect x="530" y="140" width="230" height="240" rx="6" fill="${p.accentDark}"/>` +
        windows(305, 130, 3, 2, 50, 14, p.glass),
      p.sky,
      p.ground,
    ),
  'Front elevation': (p) =>
    frame(
      `<polygon points="150,200 400,80 650,200" fill="${p.accentDark}"/>` +
        `<rect x="170" y="200" width="460" height="180" fill="${p.accent}"/>` +
        windows(210, 230, 3, 1, 70, 40, p.glass) +
        `<rect x="520" y="270" width="70" height="110" rx="4" fill="${p.wood}"/>`,
      p.sky,
      p.ground,
    ),
  'Living area': (p) => PAINTERS['Living room'](p),
  Garden: (p) =>
    frame(
      `<circle cx="180" cy="250" r="90" fill="${p.accentDark}"/><rect x="170" y="320" width="20" height="70" fill="${p.wood}"/>` +
        `<circle cx="620" cy="260" r="80" fill="${p.accent}"/><rect x="610" y="320" width="20" height="70" fill="${p.wood}"/>` +
        `<ellipse cx="400" cy="400" rx="140" ry="30" fill="${p.glass}"/>`,
      p.sky,
      p.ground,
    ),
};

function palette(seed) {
  const h = hash(seed);
  const hue = h % 360;
  return {
    wall: hsl(hue + 20, 35, 90),
    floor: hsl(hue + 20, 25, 72),
    sky: hsl(205, 70, 88),
    ground: hsl(120, 25, 62),
    accent: hsl(hue, 45, 58),
    accentDark: hsl(hue, 50, 40),
    glass: hsl(200, 60, 82),
    wood: hsl(28, 45, 40),
  };
}

const toDataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Gallery for a unit. Empty for plots. */
export function unitMedia(unit) {
  const scenes = SCENES[unit.kind];
  if (!scenes) return [];
  const p = palette(unit.id);
  return scenes.map((caption, i) => ({
    id: `${unit.id}-${i}`,
    kind: 'photo',
    caption: `${caption} - ${unit.unit_no}`,
    url: toDataUri(PAINTERS[caption](p)),
  }));
}
