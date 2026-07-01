// Copy public/ into .next/standalone/public/ (required by Next.js standalone)
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "public");
const dst = path.join(__dirname, "..", ".next", "standalone", "public");
if (!fs.existsSync(dst)) {
  fs.cpSync(src, dst, { recursive: true });
  console.log("Copied public/ to standalone");
}