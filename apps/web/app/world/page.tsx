"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findPath, makeWorld } from "@earthquest/game-state";
import type { Position } from "@earthquest/types";
import type { PathJob, WorkerRequest, WorkerResponse } from "./pathfinding.worker";

const SIZE = 1000;
const SEED = 3;
const VIEW = 600;
const PARTY_SIZE = 12;

type Mode = "worker" | "main";

export default function WorldMap() {
  const [mode, setMode] = useState<Mode>("worker");
  const [stats, setStats] = useState({ searchMs: 0, roundTripMs: 0, worstFrameMs: 0, found: 0 });
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const worstFrame = useRef(0);

  // The grid is only needed on the main thread for "main" mode and drawing; the worker builds its own copy.
  const grid = useMemo(() => makeWorld(SIZE, SIZE, SEED, 0.25), []);

  useEffect(() => {
    const worker = new Worker(new URL("./pathfinding.worker.ts", import.meta.url));
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    const ctx = baseRef.current?.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(SIZE, SIZE);
    for (let i = 0; i < grid.cells.length; i++) {
      const shade = grid.cells[i] ? 40 : 200;
      image.data.set([shade, shade, shade + 10, 255], i * 4);
    }
    ctx.putImageData(image, 0, 0);
  }, [grid]);

  // Frame-gap monitor: the longest gap between animation frames approximates the worst UI freeze.
  useEffect(() => {
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      worstFrame.current = Math.max(worstFrame.current, now - last);
      last = now;
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const drawPaths = useCallback((paths: (Position[] | null)[]) => {
    const ctx = overlayRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#ff5a36";
    for (const path of paths) path?.forEach((p) => ctx.fillRect(p.x, p.y, 2, 2));
  }, []);

  const sendParty = useCallback(
    (target: Position) => {
      // PARTY_SIZE members start along the top-left edge and all head for the clicked cell.
      const jobs: PathJob[] = Array.from({ length: PARTY_SIZE }, (_, i) => ({
        from: { x: 0, y: 0 },
        to: { x: Math.max(0, Math.min(SIZE - 1, target.x - i)), y: target.y },
      }));
      worstFrame.current = 0;
      const t0 = performance.now();

      if (mode === "main") {
        const paths = jobs.map((j) => findPath(grid, j.from, j.to));
        const ms = performance.now() - t0;
        drawPaths(paths);
        // Wait two frames so the frame monitor has recorded the gap this blocking search caused.
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            setStats({
              searchMs: ms,
              roundTripMs: ms,
              worstFrameMs: worstFrame.current,
              found: paths.filter(Boolean).length,
            }),
          ),
        );
        return;
      }

      const worker = workerRef.current;
      if (!worker) return;
      const id = ++requestId.current;
      const request: WorkerRequest = { id, size: SIZE, seed: SEED, jobs };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.id !== id) return; // a newer click superseded this one
        drawPaths(e.data.paths);
        setStats({
          searchMs: e.data.ms,
          roundTripMs: performance.now() - t0,
          worstFrameMs: worstFrame.current,
          found: e.data.paths.filter(Boolean).length,
        });
      };
      worker.postMessage(request);
    },
    [drawPaths, grid, mode],
  );

  return (
    <main style={{ padding: 24 }}>
      <h1>World map ({SIZE}×{SIZE})</h1>
      <p>
        Click the map to send a party of {PARTY_SIZE} there.{" "}
        <label>
          Pathfinding on{" "}
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="worker">Web Worker</option>
            <option value="main">Main thread</option>
          </select>
        </label>
      </p>
      <p data-testid="stats">
        search {stats.searchMs.toFixed(0)} ms · round trip {stats.roundTripMs.toFixed(0)} ms · worst frame gap{" "}
        {stats.worstFrameMs.toFixed(0)} ms · {stats.found}/{PARTY_SIZE} routes found
      </p>
      <div style={{ position: "relative", width: VIEW, height: VIEW }}>
        <canvas ref={baseRef} width={SIZE} height={SIZE} style={{ position: "absolute", width: VIEW, height: VIEW }} />
        <canvas
          ref={overlayRef}
          width={SIZE}
          height={SIZE}
          style={{ position: "absolute", width: VIEW, height: VIEW, cursor: "crosshair" }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            sendParty({
              x: Math.floor(((e.clientX - rect.left) / VIEW) * SIZE),
              y: Math.floor(((e.clientY - rect.top) / VIEW) * SIZE),
            });
          }}
        />
      </div>
    </main>
  );
}
