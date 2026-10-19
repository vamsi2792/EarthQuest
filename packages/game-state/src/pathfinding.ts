import type { Position } from "@earthquest/types";

export interface Grid {
  width: number;
  height: number;
  /** 1 = wall, 0 = walkable; row-major */
  cells: Uint8Array;
}

/** Deterministic pseudo-random world so every platform and test sees the same map. */
export function makeWorld(width: number, height: number, seed = 1, wallDensity = 0.28): Grid {
  const cells = new Uint8Array(width * height);
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = 0; i < cells.length; i++) cells[i] = rand() < wallDensity ? 1 : 0;
  cells[0] = 0;
  cells[cells.length - 1] = 0;
  return { width, height, cells };
}

/** Min-heap keyed on f-score, storing cell indices. */
class MinHeap {
  private items: number[] = [];
  constructor(private readonly score: Float64Array) {}
  get size() {
    return this.items.length;
  }
  push(index: number) {
    const a = this.items;
    a.push(index);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop() as number;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** A* over a 4-connected grid. Returns the path including both endpoints, or null if unreachable. */
export function findPath(grid: Grid, from: Position, to: Position): Position[] | null {
  const { width, height, cells } = grid;
  const inside = (p: Position) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  if (!inside(from) || !inside(to)) return null;

  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  if (cells[start] || cells[goal]) return null;

  const g = new Float64Array(cells.length).fill(Infinity);
  const f = new Float64Array(cells.length).fill(Infinity);
  const cameFrom = new Int32Array(cells.length).fill(-1);
  const closed = new Uint8Array(cells.length);
  const h = (i: number) => Math.abs((i % width) - to.x) + Math.abs(Math.floor(i / width) - to.y);

  g[start] = 0;
  f[start] = h(start);
  const open = new MinHeap(f);
  open.push(start);

  while (open.size) {
    const current = open.pop();
    if (closed[current]) continue;
    if (current === goal) {
      const path: Position[] = [];
      for (let i = goal; i !== -1; i = cameFrom[i]) path.push({ x: i % width, y: Math.floor(i / width) });
      return path.reverse();
    }
    closed[current] = 1;
    const x = current % width;
    const y = Math.floor(current / width);
    const neighbours = [
      x > 0 ? current - 1 : -1,
      x < width - 1 ? current + 1 : -1,
      y > 0 ? current - width : -1,
      y < height - 1 ? current + width : -1,
    ];
    for (const n of neighbours) {
      if (n < 0 || cells[n] || closed[n]) continue;
      const tentative = g[current] + 1;
      if (tentative < g[n]) {
        cameFrom[n] = current;
        g[n] = tentative;
        f[n] = tentative + h(n);
        open.push(n);
      }
    }
  }
  return null;
}
