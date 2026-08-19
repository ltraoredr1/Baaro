import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [
  "src/App.jsx",
  "vite.config.js",
  "public/service-worker.js",
];
let failed = false;
for (const file of files) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error(`Missing performance-critical file: ${file}`);
    failed = true;
  }
}
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
for (const token of ["lazy(() => import(\"./components/MessagesTab.jsx\")", "lazy(() => import(\"./components/VideosTab.jsx\")"]) {
  if (!app.includes(token)) {
    console.error(`Expected lazy-loading marker missing: ${token}`);
    failed = true;
  }
}
const sw = fs.readFileSync(path.join(root, "public/service-worker.js"), "utf8");
if (!sw.includes("MAX_RUNTIME_ENTRIES")) {
  console.error("Service worker cache bound missing");
  failed = true;
}
if (failed) process.exit(1);
console.log("BAARO performance foundation checks: OK");
