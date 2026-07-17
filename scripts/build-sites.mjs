import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const serverDir = join(distDir, "server");
const hostingSrc = join(root, ".openai", "hosting.json");
const hostingDestDir = join(distDir, ".openai");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function extname(path) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot).toLowerCase();
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (path.startsWith(serverDir)) continue;
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

await mkdir(serverDir, { recursive: true });
await mkdir(hostingDestDir, { recursive: true });
await copyFile(hostingSrc, join(hostingDestDir, "hosting.json"));

const files = await walk(distDir);
const assets = {};
for (const file of files) {
  const rel = "/" + relative(distDir, file).split(/[\\/]/).join("/");
  if (rel === "/server/index.js") continue;
  const data = await readFile(file);
  assets[rel] = {
    body: data.toString("base64"),
    contentType: contentTypes[extname(rel)] || "application/octet-stream",
  };
}

const serverSource = `const assets = ${JSON.stringify(assets)};

function responseFor(pathname) {
  const normalized = pathname.endsWith("/") ? pathname + "index.html" : pathname;
  const asset = assets[normalized] || assets[pathname] || assets["/index.html"];
  const bytes = Uint8Array.from(atob(asset.body), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "content-type": asset.contentType,
      "cache-control": normalized.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}

export default {
  fetch(request) {
    const url = new URL(request.url);
    return responseFor(url.pathname);
  },
};
`;

await writeFile(join(serverDir, "index.js"), serverSource);
