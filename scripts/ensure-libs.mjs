import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const lib = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "contracts", "lib");
const deps = [
  {
    dir: "openzeppelin-contracts",
    url: "https://github.com/OpenZeppelin/openzeppelin-contracts.git",
    branch: "v5.4.0",
  },
  {
    dir: "forge-std",
    url: "https://github.com/foundry-rs/forge-std.git",
    branch: "v1.11.0",
  },
];

fs.mkdirSync(lib, { recursive: true });

for (const dep of deps) {
  const dest = path.join(lib, dep.dir);
  if (fs.existsSync(path.join(dest, "src")) || fs.existsSync(path.join(dest, "contracts"))) {
    continue;
  }
  execSync(`git clone --depth 1 --branch ${dep.branch} ${dep.url} "${dest}"`, { stdio: "inherit" });
}
