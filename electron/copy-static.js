/**
 * Post-build script: copies static assets into the standalone output
 * so electron-builder can package everything together.
 */
const fs = require("fs");
const path = require("path");

const standaloneDir = path.join(__dirname, "..", ".next", "standalone");

// Copy .next/static → standalone/.next/static
const staticFrom = path.join(__dirname, "..", ".next", "static");
const staticTo = path.join(standaloneDir, ".next", "static");
if (fs.existsSync(staticFrom)) {
  fs.cpSync(staticFrom, staticTo, { recursive: true });
  console.log("✓ Copied .next/static → standalone/.next/static");
} else {
  console.warn("⚠ .next/static not found");
}

// Copy public → standalone/public
const publicFrom = path.join(__dirname, "..", "public");
const publicTo = path.join(standaloneDir, "public");
if (fs.existsSync(publicFrom)) {
  fs.cpSync(publicFrom, publicTo, { recursive: true });
  console.log("✓ Copied public → standalone/public");
} else {
  console.warn("⚠ public not found");
}

console.log("\nBuild complete. Ready for electron-builder.");