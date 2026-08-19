import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "capacitor.config.json",
  "src/lib/nativeCapabilities.js",
  "src/lib/nativePush.js",
  "native-plugins/nearby/android/src/main/java/com/baaro/nearby/NearbyChatPlugin.kt",
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error("Missing Android foundation files:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const dep of ["@capacitor/core", "@capacitor/android", "@capacitor/cli", "@capacitor/push-notifications"]) {
  if (!(pkg.dependencies?.[dep] || pkg.devDependencies?.[dep])) {
    console.error(`Missing dependency: ${dep}`);
    process.exit(1);
  }
}

const cap = JSON.parse(fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"));
if (cap.appId !== "com.baaro.app") {
  console.error("Unexpected Capacitor appId");
  process.exit(1);
}

console.log("Android foundation checks: OK");
console.log("Note: native Android compilation still requires an Android project generated with `npx cap add android`.");
