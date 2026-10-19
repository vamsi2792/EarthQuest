import { findPath, makeWorld, type Grid } from "@earthquest/game-state";
import type { Position } from "@earthquest/types";

export interface PathJob {
  from: Position;
  to: Position;
}
export type WorkerRequest = { id: number; size: number; seed: number; jobs: PathJob[] };
export type WorkerResponse = { id: number; paths: (Position[] | null)[]; ms: number };

let cached: { key: string; grid: Grid } | undefined;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, size, seed, jobs } = e.data;
  const key = `${size}:${seed}`;
  if (cached?.key !== key) cached = { key, grid: makeWorld(size, size, seed, 0.25) };
  const started = performance.now();
  const paths = jobs.map((job) => findPath(cached!.grid, job.from, job.to));
  const response: WorkerResponse = { id, paths, ms: performance.now() - started };
  (self as unknown as Worker).postMessage(response);
};
