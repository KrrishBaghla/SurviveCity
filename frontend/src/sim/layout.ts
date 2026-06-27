export const GRID_ROWS = 10;
export const GRID_COLS = 10;

const cell = (r: number, c: number) => `${r},${c}`;
const set = (cells: [number, number][]) => new Set(cells.map(([r, c]) => cell(r, c)));

export const SAFEHOUSE = set(
  Array.from({ length: 3 }, (_, r) =>
    Array.from({ length: 3 }, (_, c) => [4 + r, 4 + c] as [number, number]),
  ).flat(),
);

export const FOOD = set([
  [1, 1], [1, 8], [8, 1], [8, 8],
]);

export const WALLS = set([
  [3, 3], [3, 6],
  [7, 3], [7, 6],
  [2, 5], [5, 2],
  [5, 7], [7, 5],
]);

export const AGENT_SPAWNS: [number, number][] = [
  [4, 4], [4, 5], [5, 4],
];

export const ZOMBIE_SPAWNS: [number, number][] = [
  [0, 0], [0, 9], [9, 9],
];

export const isWall = (r: number, c: number) => WALLS.has(cell(r, c));
export const isFood = (r: number, c: number) => FOOD.has(cell(r, c));
export const isSafehouse = (r: number, c: number) => SAFEHOUSE.has(cell(r, c));
export const inBounds = (r: number, c: number) =>
  r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS;
