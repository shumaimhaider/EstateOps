/**
 * Site-plan layout for a project: blocks are placed on a 1000x640 canvas and each unit gets a
 * rectangle inside its block (plots in a grid, towers as a floors x flats stacking plan).
 */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 640;
const PAD = 16;
const GAP = 14;
const LABEL = 24;

function placeUnits(block, units, floorsById) {
  if (units.length === 0) return;
  const innerX = block.x + 8;
  const innerY = block.y + LABEL;
  const innerW = block.w - 16;
  const innerH = block.h - LABEL - 8;
  const stacked = units.some((u) => u.floor_id);

  let gridCols;
  let gridRows;
  const position = new Map();
  if (stacked) {
    const perFloor = new Map();
    for (const u of units) perFloor.set(u.floor_id, (perFloor.get(u.floor_id) ?? 0) + 1);
    gridCols = Math.max(...perFloor.values());
    gridRows = Math.max(...units.map((u) => floorsById.get(u.floor_id).number));
    const seen = new Map();
    for (const u of units) {
      const col = seen.get(u.floor_id) ?? 0;
      seen.set(u.floor_id, col + 1);
      position.set(u.id, { col, row: gridRows - floorsById.get(u.floor_id).number });
    }
  } else {
    gridCols = Math.max(1, Math.ceil(Math.sqrt((units.length * innerW) / innerH)));
    gridRows = Math.ceil(units.length / gridCols);
    units.forEach((u, i) =>
      position.set(u.id, { col: i % gridCols, row: Math.floor(i / gridCols) }),
    );
  }
  const cellW = innerW / gridCols;
  const cellH = innerH / gridRows;
  for (const u of units) {
    const { col, row } = position.get(u.id);
    u.geometry = {
      type: 'rect',
      x: Math.round(innerX + col * cellW + 1),
      y: Math.round(innerY + row * cellH + 1),
      w: Math.max(4, Math.round(cellW - 2)),
      h: Math.max(4, Math.round(cellH - 2)),
    };
  }
}

/** Mutates `blocks` (x, y, w, h) and `units` (geometry). */
export function layoutProject(blocks, unitsByBlock, floorsById) {
  const n = blocks.length;
  const cols = n <= 2 ? n : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = (MAP_WIDTH - PAD * 2 - GAP * (cols - 1)) / cols;
  const cellH = (MAP_HEIGHT - PAD * 2 - GAP * (rows - 1)) / rows;
  blocks.forEach((block, i) => {
    block.x = Math.round(PAD + (i % cols) * (cellW + GAP));
    block.y = Math.round(PAD + Math.floor(i / cols) * (cellH + GAP));
    block.w = Math.round(cellW);
    block.h = Math.round(cellH);
    placeUnits(block, unitsByBlock.get(block.id) ?? [], floorsById);
  });
}
