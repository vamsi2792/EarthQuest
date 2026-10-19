#!/usr/bin/env node
// Fails (exit 1) when a route's first-load JavaScript, gzipped, exceeds its budget.
// Usage: node scripts/check-bundle-budget.mjs [path-to-.next] [path-to-budgets.json]
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const nextDir = process.argv[2] ?? "apps/web/.next";
const budgetFile = process.argv[3] ?? "budgets.json";

const manifest = JSON.parse(readFileSync(join(nextDir, "app-build-manifest.json"), "utf8"));
const budgets = JSON.parse(readFileSync(budgetFile, "utf8"));

const gzipSize = (file) => gzipSync(readFileSync(join(nextDir, file))).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

const rows = [];
let failed = false;

for (const [route, files] of Object.entries(manifest.pages)) {
  const jsFiles = [...new Set(files)].filter((f) => f.endsWith(".js"));
  const size = jsFiles.reduce((total, f) => total + gzipSize(f), 0);
  const budget = budgets[route];
  // A route nobody budgeted for is how bundle bloat sneaks in, so it fails too.
  const status = budget === undefined ? "NO BUDGET" : size > budget ? "OVER" : "ok";
  if (status !== "ok") failed = true;
  rows.push({ route, size, budget, status });
}

// A budget for a route that no longer exists usually means the config has rotted.
for (const route of Object.keys(budgets)) {
  if (!(route in manifest.pages)) {
    console.error(`budgets.json lists "${route}" but the build has no such route`);
    failed = true;
  }
}

const lines = [
  "| Route | First-load JS (gzip) | Budget | Status |",
  "|---|---|---|---|",
  ...rows.map((r) => `| ${r.route} | ${kb(r.size)} | ${r.budget === undefined ? "-" : kb(r.budget)} | ${r.status} |`),
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);

if (failed) {
  console.error("\nBundle budget check failed.");
  process.exit(1);
}
