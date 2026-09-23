/**
 * Smoke checks BAARO — garde-fous CI
 * Version stricte Étape 6 + Social/Comments contract
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;

function fail(msg) {
  console.error("FAIL:", msg);
  failures++;
}

function ok(msg) {
  console.log("OK:", msg);
}

function readRequired(relativePath, label = relativePath) {
  const file = path.join(root, relativePath);

  if (!fs.existsSync(file)) {
    fail(`missing ${label} (${relativePath})`);
    return null;
  }

  return fs.readFileSync(file, "utf8");
}

// ============================================================
// FICHIERS CRITIQUES
// ============================================================

const requiredFiles = [
  "src/app/tabs.jsx",
  "src/app/MainShell.jsx",
  "src/components/Navigation.jsx",
  "src/components/OfflineBanner.jsx",
  "src/components/EmptyState.jsx",
  "src/components/LazyMedia.jsx",
  "src/components/ErrorBoundary.jsx",

  "api/wallet.js",
  "api/payments.js",
  "api/webhooks.js",
  "api/chat.js",
  "api/social.js",
  "api/_shared.js",

  "capacitor.config.json",
  "vercel.json",

  "supabase/migrations/023_marketplace_orders.sql",
  "supabase/migrations/024_companies_and_services.sql",
  "supabase/migrations/027_marketplace_economy_security.sql",
];

for (const f of requiredFiles) {
  if (fs.existsSync(path.join(root, f))) {
    ok(`file ${f}`);
  } else {
    fail(`missing ${f}`);
  }
}

// ============================================================
// CONTRAINTE api/ ≤ 12 FICHIERS JS
// ============================================================

const apiDir = path.join(root, "api");

if (fs.existsSync(apiDir)) {
  const apiJs = fs
    .readdirSync(apiDir)
    .filter((n) => {
      const full = path.join(apiDir, n);
      return (
        n.endsWith(".js") &&
        fs.statSync(full).isFile()
      );
    });

  if (apiJs.length <= 12) {
    ok(`api/ JS files: ${apiJs.length} ≤ 12`);
  } else {
    fail(
      `api/ has ${apiJs.length} JS files (max 12): ${apiJs
        .sort()
        .join(", ")}`
    );
  }
}

// ============================================================
// NAVIGATION / TABS
// ============================================================

const nav = readRequired(
  "src/components/Navigation.jsx",
  "Navigation"
);

if (nav) {
  if (
    nav.includes('id: "shop"') ||
    nav.includes("id: 'shop'")
  ) {
    ok("Navigation contains shop tab");
  } else {
    fail("Navigation missing shop tab id");
  }
}

const tabsPath = path.join(
  root,
  "src/app/tabs.jsx"
);

if (fs.existsSync(tabsPath)) {
  const tabs = fs.readFileSync(
    tabsPath,
    "utf8"
  );

  if (tabs.includes("shop")) {
    ok("tabs.jsx maps shop");
  } else {
    fail("tabs.jsx missing shop");
  }
}

// ============================================================
// MAIN SHELL
// ============================================================

const mainShell = readRequired(
  "src/app/MainShell.jsx",
  "MainShell"
);

if (mainShell) {
  if (mainShell.includes("OfflineBanner")) {
    ok("MainShell mounts OfflineBanner");
  } else {
    fail("MainShell missing OfflineBanner");
  }

  if (mainShell.includes("ErrorBoundary")) {
    ok("MainShell uses ErrorBoundary");
  } else {
    fail("MainShell missing ErrorBoundary");
  }
}

// ============================================================
// PAIEMENTS
// ============================================================

const pay = readRequired(
  "api/payments.js",
  "payments API"
);

if (pay) {
  if (
    pay.includes("cinetpay") &&
    pay.includes("stripe")
  ) {
    ok(
      "payments contains CinetPay + Stripe"
    );
  } else {
    fail(
      "payments provider support incomplete"
    );
  }
}

// ============================================================
// WEBHOOKS
// ============================================================

const hooks = readRequired(
  "api/webhooks.js",
  "webhooks API"
);

if (hooks) {
  if (
    (
      hooks.includes("handleCinetPay") ||
      hooks.includes("CinetPay")
    ) &&
    (
      hooks.includes("handleStripe") ||
      hooks.includes("Stripe")
    )
  ) {
    ok(
      "webhooks contains CinetPay + Stripe"
    );
  } else {
    fail(
      "webhooks provider support incomplete"
    );
  }

  if (hooks.includes("mark_order_paid")) {
    ok(
      "webhooks calls mark_order_paid"
    );
  } else {
    fail(
      "webhooks missing mark_order_paid"
    );
  }
}

// ============================================================
// MARKETPLACE SECURITY — 027
// ============================================================

const m027 = readRequired(
  "supabase/migrations/027_marketplace_economy_security.sql",
  "migration 027"
);

if (m027) {
  if (m027.includes("create_order_secure")) {
    ok("027 has create_order_secure");
  } else {
    fail(
      "027 missing create_order_secure"
    );
  }

  if (m027.includes("mark_order_paid")) {
    ok("027 has mark_order_paid");
  } else {
    fail(
      "027 missing mark_order_paid"
    );
  }

  if (m027.includes("service_role")) {
    ok(
      "027 restricts mark_order_paid to service_role"
    );
  } else {
    fail(
      "027 mark_order_paid not locked to service_role"
    );
  }
}

// ============================================================
// VERCEL REWRITES
// ============================================================

const vercel = readRequired(
  "vercel.json",
  "Vercel config"
);

if (vercel) {
  const rewrites = [
    ['"/api/create-payment"', "create-payment"],
    ['"/api/payment-webhook"', "payment-webhook"],
    ['"/api/stripe-webhook"', "stripe-webhook"],
  ];

  for (const [needle, label] of rewrites) {
    if (vercel.includes(needle)) {
      ok(`rewrite ${label}`);
    } else {
      fail(
        `rewrite missing: ${label}`
      );
    }
  }
}

// ============================================================
// HELPERS API CONSOLIDÉS
// ============================================================

const shared = readRequired(
  "api/_shared.js",
  "_shared.js"
);

if (shared) {
  if (
    shared.includes("rateLimitAsync") &&
    shared.includes("UPSTASH")
  ) {
    ok(
      "_shared.js: rateLimitAsync + Upstash ready"
    );
  } else {
    fail(
      "_shared.js missing rateLimitAsync/Upstash"
    );
  }

  if (
    shared.includes("cors") ||
    shared.includes("CORS") ||
    shared.includes("ALLOWED_ORIGINS")
  ) {
    ok(
      "_shared.js: CORS helper ready"
    );
  } else {
    fail(
      "_shared.js missing CORS helper"
    );
  }
}

// ============================================================
// SOCIAL API — COMMENTS CONTRACT
// ============================================================

const social = readRequired(
  "api/social.js",
  "social API"
);

if (social) {
  // ----------------------------------------------------------
  // Handlers principaux
  // ----------------------------------------------------------

  const socialHandlers = [
    ["handleComment", "comment handler"],
    ["handleReaction", "reaction handler"],
    ["handleBlock", "block handler"],
    ["handleReport", "report handler"],
    ["handleStory", "story handler"],
    ["handleNotification", "notification handler"],
  ];

  for (const [marker, label] of socialHandlers) {
    if (social.includes(marker)) {
      ok(`social: ${label}`);
    } else {
      fail(
        `social API missing ${label}`
      );
    }
  }

  // ----------------------------------------------------------
  // Commentaires
  // ----------------------------------------------------------

  const commentContract = [
    [
      'from("comments")',
      "comments table access",
    ],
    [
      "author_id: userId",
      "comment author_id",
    ],
    [
      "list_comments",
      "list_comments action",
    ],
    [
      "delete_comment",
      "delete_comment action",
    ],
    [
      "comments_count",
      "comments_count synchronization",
    ],
  ];

  for (const [marker, label] of commentContract) {
    if (social.includes(marker)) {
      ok(`social comments: ${label}`);
    } else {
      fail(
        `social comments missing ${label}`
      );
    }
  }

  // ----------------------------------------------------------
  // Contrôle des erreurs INSERT
  // ----------------------------------------------------------

  const commentInsertIndex = social.indexOf(
    'from("comments").insert'
  );

  if (commentInsertIndex >= 0) {
    const insertSection = social.slice(
      commentInsertIndex,
      commentInsertIndex + 3500
    );

    if (
      insertSection.includes(
        "insertError"
      )
    ) {
      ok(
        "comments INSERT errors are checked"
      );
    } else {
      fail(
        "comments INSERT errors are not checked"
      );
    }
  } else {
    fail(
      "comments INSERT not found"
    );
  }

  // ----------------------------------------------------------
  // Retour du commentaire créé
  // ----------------------------------------------------------

  if (
    social.includes(
      "comment,"
    ) ||
    social.includes(
      "comment:"
    )
  ) {
    ok(
      "social returns created comment"
    );
  } else {
    fail(
      "social does not expose created comment"
    );
  }

  // ----------------------------------------------------------
  // Synchronisation du compteur
  // ----------------------------------------------------------

  if (
    social.includes(
      "comments_count"
    ) &&
    social.includes(
      ".update("
    )
  ) {
    ok(
      "social synchronizes comments_count"
    );
  } else {
    fail(
      "social comments_count synchronization missing"
    );
  }

  // ----------------------------------------------------------
  // Identité
  // ----------------------------------------------------------

  if (
    social.includes(
      "user.id"
    )
  ) {
    ok(
      "social identity uses authenticated user.id"
    );
  } else {
    fail(
      "social identity must use authenticated user.id"
    );
  }

  // ----------------------------------------------------------
  // Notifications — nouveau schéma
  // ----------------------------------------------------------

  if (
    social.includes(
      "notification_id"
    )
  ) {
    ok(
      "social notifications use notification_id"
    );
  } else {
    fail(
      "social notifications missing notification_id"
    );
  }

  if (
    social.includes(
      "source_id"
    )
  ) {
    ok(
      "social notifications use source_id"
    );
  } else {
    fail(
      "social notifications missing source_id"
    );
  }

  if (
    social.includes(
      "actor_id"
    )
  ) {
    ok(
      "social notifications use actor_id"
    );
  } else {
    fail(
      "social notifications missing actor_id"
    );
  }

  // ----------------------------------------------------------
  // Détection ancienne structure notifications
  // ----------------------------------------------------------

  const legacyNotificationPatterns = [
    'select("id, type, message',
    '.eq("id", id)',
    "target_id",
    "target_type",
  ];

  for (
    const marker of legacyNotificationPatterns
  ) {
    if (social.includes(marker)) {
      fail(
        `legacy notification marker detected in api/social.js: ${marker}`
      );
    }
  }
}

// ============================================================
// LIVE URL OPTIONNELLE
// ============================================================

const base =
  process.env.BAARO_BASE_URL;

if (base) {
  try {
    const url = base.replace(
      /\/?$/,
      "/"
    );

    const res = await fetch(url);

    if (res.ok) {
      ok(
        `HTTP ${res.status} ${base}`
      );
    } else {
      fail(
        `HTTP ${res.status} ${base}`
      );
    }
  } catch (e) {
    fail(
      `fetch ${base}: ${e.message}`
    );
  }
} else {
  console.log(
    "SKIP live URL (set BAARO_BASE_URL to probe)"
  );
}

// ============================================================
// FINAL RESULT
// ============================================================

if (failures) {
  console.error(
    `\n${failures} failure(s)`
  );
} else {
  console.log(
    "\nAll smoke checks passed."
  );
}

process.exit(
  failures ? 1 : 0
);
