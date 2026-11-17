/* global process */
/**
 * A dependency-free static file server that behaves like GitHub Pages, to
 * check the static prototype build locally:
 *
 *   node e2e/support/static-server.mjs --dir client/dist --port 7401 --mount /tackle2-ui/
 *
 * - Serves `--dir` under `--mount` (default `/`), on 127.0.0.1 only.
 * - A directory serves its `index.html`; a directory path without a trailing
 *   slash (the mount included) redirects to the path with one.
 * - Any other path gets `<dir>/404.html` with status 404 (the SPA deep link
 *   convention). No rewrites, no SPA fallback with status 200.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    dir: { type: "string", default: "client/dist" },
    port: { type: "string", default: "7400" },
    mount: { type: "string", default: "/" },
  },
});

const root = path.resolve(values.dir);
const port = Number(values.port);
const mount = `/${values.mount}/`.replace(/\/{2,}/g, "/");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".ico": "image/vnd.microsoft.icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".yaml": "application/yaml; charset=utf-8",
  ".yml": "application/yaml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const contentType = (file) =>
  CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

const statOrNull = (file) => stat(file).catch(() => null);

const send = (request, response, status, file, size) => {
  response.writeHead(status, {
    "Content-Type": contentType(file),
    "Content-Length": size,
    "Cache-Control": "no-cache",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(file).pipe(response);
};

const notFound = async (request, response) => {
  const page = path.join(root, "404.html");
  const info = await statOrNull(page);
  if (info?.isFile()) return send(request, response, 404, page, info.size);
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found\n");
};

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end();
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return notFound(request, response);
  }
  if (`${pathname}/` === mount) {
    response.writeHead(301, { Location: `${mount}${url.search}` });
    return response.end();
  }
  if (!pathname.startsWith(mount)) return notFound(request, response);

  const file = path.join(root, pathname.slice(mount.length));
  if (file !== root && !file.startsWith(`${root}${path.sep}`))
    return notFound(request, response);

  const info = await statOrNull(file);
  if (info?.isDirectory()) {
    if (!pathname.endsWith("/")) {
      response.writeHead(301, { Location: `${url.pathname}/${url.search}` });
      return response.end();
    }
    const index = path.join(file, "index.html");
    const indexInfo = await statOrNull(index);
    if (indexInfo?.isFile())
      return send(request, response, 200, index, indexInfo.size);
    return notFound(request, response);
  }
  if (info?.isFile()) return send(request, response, 200, file, info.size);
  return notFound(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}${mount}`);
});

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
