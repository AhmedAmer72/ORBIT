import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repoRoot, "dist");
const port = Number(process.env.PORT) || 4173;
const host = "0.0.0.0";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

if (!existsSync(path.join(root, "index.html"))) {
  console.error(`No site build at ${root}. Run npm run build before npm start.`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const requested = decodeURIComponent(url.pathname);
  const resolved = path.resolve(root, `.${requested}`);
  const inside = resolved === root || resolved.startsWith(`${root}${path.sep}`);
  let file = inside && existsSync(resolved) && statSync(resolved).isFile() ? resolved : path.join(root, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const type = types[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(file));
});

server.listen(port, host, () => {
  console.log(`Orbit site listening on http://${host}:${port}`);
});
