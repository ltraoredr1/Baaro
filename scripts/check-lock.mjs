import fs from "node:fs";

const packagePath = "package.json";
const lockPath = "package-lock.json";

if (!fs.existsSync(packagePath)) {
  console.error("FAIL: package.json missing");
  process.exit(1);
}

if (!fs.existsSync(lockPath)) {
  console.error("FAIL: package-lock.json missing");
  process.exit(1);
}

let pkg;
let lock;

try {
  pkg = JSON.parse(
    fs.readFileSync(packagePath, "utf8")
  );
} catch (error) {
  console.error(
    `FAIL: invalid package.json: ${error.message}`
  );
  process.exit(1);
}

try {
  lock = JSON.parse(
    fs.readFileSync(lockPath, "utf8")
  );
} catch (error) {
  console.error(
    `FAIL: invalid package-lock.json: ${error.message}`
  );
  process.exit(1);
}

// ------------------------------------------------------------
// Lockfile version
// ------------------------------------------------------------

if (
  typeof lock.lockfileVersion !== "number" ||
  lock.lockfileVersion < 2
) {
  console.error(
    `FAIL: unsupported package-lock.json lockfileVersion: ${lock.lockfileVersion}`
  );
  process.exit(1);
}

// ------------------------------------------------------------
// Declared dependencies
// ------------------------------------------------------------

const declared = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
};

// ------------------------------------------------------------
// Root lockfile dependencies
// ------------------------------------------------------------

const root = lock.packages?.[""];

if (!root) {
  console.error(
    'FAIL: package-lock.json has no root package entry ("")'
  );
  process.exit(1);
}

const locked = {
  ...(root.dependencies ?? {}),
  ...(root.devDependencies ?? {}),
};

// ------------------------------------------------------------
// Compare manifests
// ------------------------------------------------------------

const missing = Object.keys(declared).filter(
  (name) => !locked[name]
);

const stale = Object.keys(locked).filter(
  (name) => !declared[name]
);

// ------------------------------------------------------------
// Result
// ------------------------------------------------------------

if (missing.length || stale.length) {
  console.error(
    "package.json / package-lock.json mismatch"
  );

  if (missing.length) {
    console.error(
      "Missing from lock:",
      missing.join(", ")
    );
  }

  if (stale.length) {
    console.error(
      "Stale root entries:",
      stale.join(", ")
    );
  }

  console.error(
    "Run: npm install --package-lock-only --ignore-scripts"
  );

  process.exit(1);
}

console.log(
  "Dependency manifest and lockfile root are synchronized."
);
console.log(
  `lockfileVersion: ${lock.lockfileVersion}`
);
console.log(
  `Dependencies checked: ${Object.keys(declared).length}`
);
