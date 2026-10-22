/**
 * Site-plan layout: blocks are placed on a 1000x640 canvas and every unit gets a rectangle inside
 * its block (plots in a grid, towers as a floors x flats stacking plan). Pure geometry, no I/O.
 */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 640;
const PAD = 16;
const GAP = 14;
const LABEL = 24;

function placeUnits(block, units, floorsById) {
  if (units.length === 0) return [];
  const innerX = block.geometry.x + 8;
  const innerY = block.geometry.y + LABEL;
  const innerW = block.geometry.w - 16;
  const innerH = block.geometry.h - LABEL - 8;
  const stacked = units.some((u) => u.floorId && floorsById.has(u.floorId));

  let cols;
  let rows;
  const position = new Map();
  if (stacked) {
    const perFloor = new Map();
    for (const u of units) perFloor.set(u.floorId, (perFloor.get(u.floorId) ?? 0) + 1);
    cols = Math.max(...perFloor.values());
    rows = Math.max(...units.map((u) => floorsById.get(u.floorId)?.number ?? 0), 1);
    const seen = new Map();
    for (const u of units) {
      const col = seen.get(u.floorId) ?? 0;
      seen.set(u.floorId, col + 1);
      position.set(u.id, { col, row: rows - (floorsById.get(u.floorId)?.number ?? 0) });
    }
  } else {
    cols = Math.max(1, Math.ceil(Math.sqrt((units.length * innerW) / innerH)));
    rows = Math.ceil(units.length / cols);
    units.forEach((u, i) => position.set(u.id, { col: i % cols, row: Math.floor(i / cols) }));
  }
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  return units.map((u) => {
    const { col, row } = position.get(u.id);
    return {
      unitId: u.id,
      geometry: {
        type: 'rect',
        x: Math.round(innerX + col * cellW + 1),
        y: Math.round(innerY + row * cellH + 1),
        w: Math.max(4, Math.round(cellW - 2)),
        h: Math.max(4, Math.round(cellH - 2)),
      },
    };
  });
}

/**
 * @param blocks  [{ id }] in display order
 * @param unitsByBlock Map<blockId, unit[]>
 * @param floorsById Map<floorId, { number }>
 * @returns {{ blocks: [{ blockId, geometry }], units: [{ unitId, geometry }] }}
 */
export function layoutProject(blocks, unitsByBlock, floorsById) {
  const n = blocks.length;
  if (n === 0) return { blocks: [], units: [] };
  const cols = n <= 2 ? n : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = (MAP_WIDTH - PAD * 2 - GAP * (cols - 1)) / cols;
  const cellH = (MAP_HEIGHT - PAD * 2 - GAP * (rows - 1)) / rows;
  const out = { blocks: [], units: [] };
  blocks.forEach((block, i) => {
    const geometry = {
      x: Math.round(PAD + (i % cols) * (cellW + GAP)),
      y: Math.round(PAD + Math.floor(i / cols) * (cellH + GAP)),
      w: Math.round(cellW),
      h: Math.round(cellH),
    };
    out.blocks.push({ blockId: block.id, geometry });
    out.units.push(
      ...placeUnits({ ...block, geometry }, unitsByBlock.get(block.id) ?? [], floorsById),
    );
  });
  return out;
}
