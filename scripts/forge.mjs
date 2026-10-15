import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = path.join(repo, "contracts");
const localForge = path.join(process.env.LOCALAPPDATA || "", "foundry-bin", "forge.exe");

const candidates = ["arc-forge", localForge, "forge", "forge.exe"];
const bin = candidates.find((candidate) => {
  if (candidate.includes("\\") || candidate.includes("/")) return fs.existsSync(candidate);
  const probe = spawnSync(candidate, ["--version"], { encoding: "utf8", shell: true });
  return probe.status === 0;
});

if (!bin) {
  console.error("Neither arc-forge nor forge is installed. See docs/ARCBOND_NETWORK_CONFIGURATION.md.");
  process.exit(1);
}

const result = spawnSync(bin, process.argv.slice(2), {
  cwd: contracts,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
