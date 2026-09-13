import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const host = "127.0.0.1";
const port = Number(process.env.FD_UI_PORT ?? 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function resolveRequestPath(urlPath) {
  const pathname = decodeURIComponent((urlPath ?? "/").split("?", 1)[0]);
  const requested = pathname === "/" ? "/ui-preview/本地UI预览.html" : pathname;
  const relative = normalize(requested).replace(/^([/\\])+/, "");
  const absolute = resolve(projectRoot, relative);
  if (absolute !== projectRoot && !absolute.startsWith(`${projectRoot}${sep}`)) return null;
  return absolute;
}

const server = http.createServer((request, response) => {
  let path = resolveRequestPath(request.url);
  if (!path) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
  if (!existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }
  response.writeHead(200, {
    "content-type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(path).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Fate/Domination UI preview: http://${host}:${port}/`);
});
