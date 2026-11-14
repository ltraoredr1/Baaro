import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const required = [
  "capacitor.config.json",
  "src/lib/nativeCapabilities.js",
  "src/lib/nativeBootstrap.js",
  "src/lib/secureScreen.js",
  "src/lib/pushNotifications.js",
  "native-plugins/nearby/android/src/main/java/com/baaro/nearby/NearbyChatPlugin.kt",
  "android/app/build.gradle",
  "android/app/src/main/AndroidManifest.xml",
  "android/app/src/main/java/com/baaro/app/MainActivity.java",
  "android/app/src/main/java/com/baaro/app/BaaroUpdaterPlugin.java",
];

const missing = required.filter(
  (file) => !fs.existsSync(path.join(root, file))
);

if (missing.length > 0) {
  console.error("Fichiers Android manquants :");

  for (const file of missing) {
    console.error(`- ${file}`);
  }

  process.exit(1);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);

const requiredDeps = [
  "@capacitor/core",
  "@capacitor/android",
  "@capacitor/push-notifications",
];

for (const dep of requiredDeps) {
  if (!pkg.dependencies?.[dep] && !pkg.devDependencies?.[dep]) {
    console.error(`Dépendance manquante : ${dep}`);
    process.exit(1);
  }
}

const cap = JSON.parse(
  fs.readFileSync(
    path.join(root, "capacitor.config.json"),
    "utf8"
  )
);

if (cap.appId !== "com.baaro.app") {
  console.error(
    `Identifiant Capacitor incorrect : ${cap.appId}`
  );
  process.exit(1);
}

const bootstrap = fs.readFileSync(
  path.join(root, "src/lib/nativeBootstrap.js"),
  "utf8"
);

if (!bootstrap.includes("./pushNotifications.js")) {
  console.error(
    "nativeBootstrap.js ne référence pas pushNotifications.js."
  );
  process.exit(1);
}

if (bootstrap.includes("./nativePush.js")) {
  console.error(
    "Référence obsolète détectée : ./nativePush.js"
  );
  process.exit(1);
}

const updaterJs = fs.readFileSync(
  path.join(root, "src/lib/nativeUpdater.js"),
  "utf8"
);
const updaterJava = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/baaro/app/BaaroUpdaterPlugin.java"),
  "utf8"
);

if (
  updaterJs.includes("arrayBuffer()") ||
  updaterJs.includes("toBase64") ||
  !updaterJs.includes("BaaroUpdater.downloadApk")
) {
  console.error("L'updater APK ne doit pas charger l'APK en mémoire JavaScript.");
  process.exit(1);
}

for (const marker of [
  "BufferedInputStream",
  "FileOutputStream",
  "digest.update(buffer, 0, count)",
  "MessageDigest.isEqual",
  "MAX_APK_BYTES",
  ".apk.part",
]) {
  if (!updaterJava.includes(marker)) {
    console.error(`Téléchargement natif en flux incomplet : ${marker} absent.`);
    process.exit(1);
  }
}

console.log("Contrôles de fondation Android : OK");
console.log("Updater APK natif en flux et contrôle SHA-256 : OK");
console.log("Identifiant Android : com.baaro.app");
console.log("Module push : pushNotifications.js");
console.log("Fichiers Android requis : présents");
