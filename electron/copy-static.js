/**
 * Post-build script: creates a clean standalone directory with only
 * what the Electron-packaged server needs (no project source, no dev files).
 */
const fs = require("fs");
const path = require("path");

const projectDir = path.join(__dirname, "..");
const standaloneSrc = path.join(projectDir, ".next", "standalone");
const cleanDir = path.join(projectDir, ".next", "standalone-clean");

// Clean start
if (fs.existsSync(cleanDir)) fs.rmSync(cleanDir, { recursive: true });
fs.mkdirSync(cleanDir, { recursive: true });

// 1. Copy server.js
fs.copyFileSync(path.join(standaloneSrc, "server.js"), path.join(cleanDir, "server.js"));
console.log("  server.js");

// 2. Copy .next (built app)
const nextDir = path.join(standaloneSrc, ".next");
if (fs.existsSync(nextDir)) {
  fs.cpSync(nextDir, path.join(cleanDir, ".next"), { recursive: true });
  console.log("  .next/");
}

// 3. Copy node_modules (production deps only)
const nmDir = path.join(standaloneSrc, "node_modules");
if (fs.existsSync(nmDir)) {
  fs.cpSync(nmDir, path.join(cleanDir, "node_modules"), { recursive: true });
  console.log("  node_modules/");
}

// 4. Copy public (static assets)
const pubDir = path.join(projectDir, "public");
if (fs.existsSync(pubDir)) {
  fs.cpSync(pubDir, path.join(cleanDir, "public"), { recursive: true });
  console.log("  public/");
}

// Replace old standalone with clean version
fs.rmSync(standaloneSrc, { recursive: true });
fs.renameSync(cleanDir, standaloneSrc);

const size = getDirSize(standaloneSrc);
console.log(`\nClean standalone: ${(size / 1024 / 1024).toFixed(1)} MB`);
console.log("Ready for electron-builder.");

function getDirSize(dir) {
  let size = 0;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) size += getDirSize(full);
    else size += fs.statSync(full).size;
  }
  return size;
}