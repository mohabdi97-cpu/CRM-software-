import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import workspace from "./api/workspace.js";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/api/workspace") return workspace(req, res);
  if (!/^(?:\/[a-z\d_-]+)*\/(?:[a-z\d_.-]+)?$/i.test(path)) {
    res.writeHead(404).end();
    return;
  }
  const name = path === "/" ? "/index.html" : path;
  const type = types[extname(name)];
  if (!type) {
    res.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(new URL("./public" + name, import.meta.url));
    res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
    res.end(content);
  } catch {
    res.writeHead(404).end();
  }
});
const port = Number(process.env.PORT || 4173);
server.listen(port, "127.0.0.1", () => console.log("Relay CRM at http://127.0.0.1:" + port));
