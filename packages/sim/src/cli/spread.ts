/**
 * CLI: pnpm --filter @lsp/sim run spread -- --clients 3 --beats 60 [--seed 1] [--seeds 10] [--human 40]
 *
 * The only I/O in this package: argument parsing and printing. The simulation itself is pure.
 * Exits non-zero when the done-criterion fails so CI enforces it.
 */
import { criterionConfig, formatReport, runSpread } from "../spread.js";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`--${name} needs a number`);
  return v;
}

const clients = arg("clients", 3);
const beats = arg("beats", 60);
const seed = arg("seed", 1);
const seeds = arg("seeds", 1);
const human = arg("human", 40);

let failures = 0;
for (let s = seed; s < seed + seeds; s++) {
  const config = { ...criterionConfig(s, beats, clients), humanSdMs: human };
  const report = runSpread(config);
  console.log(formatReport(report));
  console.log("");
  if (!report.pass) failures++;
}
if (seeds > 1) console.log(`${seeds - failures}/${seeds} seeds pass`);
process.exit(failures === 0 ? 0 : 1);
