import { describe, expect, it } from "vitest";
import { findPath, makeWorld, type Grid } from "./pathfinding";

const open = (w: number, h: number): Grid => ({ width: w, height: h, cells: new Uint8Array(w * h) });

describe("findPath", () => {
  it("finds the shortest path on an open grid", () => {
    const path = findPath(open(5, 5), { x: 0, y: 0 }, { x: 4, y: 4 });
    expect(path).not.toBeNull();
    expect(path).toHaveLength(9); // Manhattan distance 8 -> 9 cells
    expect(path![0]).toEqual({ x: 0, y: 0 });
    expect(path![8]).toEqual({ x: 4, y: 4 });
  });

  it("routes around walls", () => {
    const grid = open(3, 3);
    grid.cells[1 * 3 + 0] = 1;
    grid.cells[1 * 3 + 1] = 1; // wall across the middle row except x=2
    const path = findPath(grid, { x: 0, y: 0 }, { x: 0, y: 2 });
    expect(path).toHaveLength(7);
    expect(path!.some((p) => p.x === 2 && p.y === 1)).toBe(true);
  });

  it("returns null when the goal is walled off", () => {
    const grid = open(3, 3);
    grid.cells[1 * 3 + 0] = 1;
    grid.cells[1 * 3 + 1] = 1;
    grid.cells[1 * 3 + 2] = 1;
    expect(findPath(grid, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it("returns null for blocked or out-of-bounds endpoints", () => {
    const grid = open(3, 3);
    grid.cells[4] = 1;
    expect(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(findPath(grid, { x: 0, y: 0 }, { x: 9, y: 9 })).toBeNull();
  });

  it("makeWorld is deterministic", () => {
    expect(makeWorld(20, 20, 7).cells).toEqual(makeWorld(20, 20, 7).cells);
  });
});
