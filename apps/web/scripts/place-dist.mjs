import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");
const source = path.join(webRoot, "dist");

function copyTo(dest) {
  if (path.resolve(dest) === path.resolve(source)) return;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(source, dest, { recursive: true });
}

// Repo root, for a project whose root directory is the repository.
copyTo(path.join(repoRoot, "dist"));
// Nested path Vercel checks when the project root is apps/web and
// outputDirectory is still the old apps/web/dist value.
copyTo(path.join(webRoot, "apps", "web", "dist"));
