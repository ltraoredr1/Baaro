import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const checks = [
  ["package.json", "package manifest"],
  ["capacitor.config.json", "Capacitor config"],

  ["supabase/migrations/016_video_views_feed_integrity.sql", "video view integrity migration"],
  ["supabase/migrations/017_messaging_calls_integrity.sql", "messaging/calls migration"],
  ["supabase/migrations/018_live_integrity_realtime.sql", "live migration"],
  ["supabase/migrations/019_ai_routing_foundation.sql", "AI routing migration"],
  ["supabase/migrations/020_notifications_foundation.sql", "notifications migration"],
  ["supabase/migrations/021_economy_payout_foundation.sql", "payout migration"],

  ["api/chat.js", "chat API"],
  ["api/payout.js", "payout API"],
  ["api/wallet.js", "wallet API"],
  ["api/social.js", "social API"],
];

let failed = 0;

function fail(message) {
  console.error(`FAIL: ${message}`);
  failed++;
}

function readFile(relativePath, label) {
  const absolutePath = path.join(root, relativePath);

  if (!fs.existsSync(absolutePath)) {
    fail(`${label} missing (${relativePath})`);
    return null;
  }

  return fs.readFileSync(absolutePath, "utf8");
}

// ============================================================
// FILE EXISTENCE
// ============================================================

for (const [file, label] of checks) {
  readFile(file, label);
}

// ============================================================
// PACKAGE.JSON
// ============================================================

const packagePath = path.join(root, "package.json");

if (fs.existsSync(packagePath)) {
  let pkg;

  try {
    pkg = JSON.parse(
      fs.readFileSync(packagePath, "utf8")
    );
  } catch (error) {
    fail(`package.json invalid JSON: ${error.message}`);
    pkg = null;
  }

  if (pkg) {
    const scriptsRequired = [
      "build",
      "check:lock",
      "check:ai",
      "check:notifications",
      "check:performance",
      "check:android",
      "check:payout",
    ];

    for (const name of scriptsRequired) {
      if (!pkg.scripts?.[name]) {
        fail(`npm script missing: ${name}`);
      }
    }
  }
}

// ============================================================
// SQL HARDENING CHECKS
// ============================================================

const sqlFiles = [
  "016_video_views_feed_integrity.sql",
  "017_messaging_calls_integrity.sql",
  "018_live_integrity_realtime.sql",
  "019_ai_routing_foundation.sql",
  "020_notifications_foundation.sql",
  "021_economy_payout_foundation.sql",
];

for (const file of sqlFiles) {
  const p = path.join(
    root,
    "supabase/migrations",
    file
  );

  if (!fs.existsSync(p)) {
    continue;
  }

  const text = fs
    .readFileSync(p, "utf8")
    .toLowerCase();

  // Catch accidental destructive statements.
  const forbidden = [
    "drop schema public",
    "drop table public.wallets",
    "truncate public.wallets",
  ];

  for (const marker of forbidden) {
    if (text.includes(marker)) {
      fail(
        `destructive SQL marker in ${file}: ${marker}`
      );
    }
  }
}

// ============================================================
// PAYOUT SAFETY
// ============================================================

const payoutPath = path.join(
  root,
  "api/payout.js"
);

if (fs.existsSync(payoutPath)) {
  const payout = fs.readFileSync(
    payoutPath,
    "utf8"
  );

  if (
    !payout.includes("payout_unavailable") ||
    !payout.includes("503")
  ) {
    fail(
      "payout must remain disabled-by-default"
    );
  }
}

// ============================================================
// SOCIAL API CONTRACT
// ============================================================

const socialPath = path.join(
  root,
  "api/social.js"
);

if (fs.existsSync(socialPath)) {
  const social = fs.readFileSync(
    socialPath,
    "utf8"
  );

  // ----------------------------------------------------------
  // Basic handlers
  // ----------------------------------------------------------

  const requiredSocialMarkers = [
    [
      "handleComment",
      "comment handler",
    ],
    [
      "handleReaction",
      "reaction handler",
    ],
    [
      "handleBlock",
      "block handler",
    ],
    [
      "handleReport",
      "report handler",
    ],
    [
      "handleStory",
      "story handler",
    ],
    [
      "handleNotification",
      "notification handler",
    ],
  ];

  for (const [marker, label] of requiredSocialMarkers) {
    if (!social.includes(marker)) {
      fail(
        `social API missing ${label}: ${marker}`
      );
    }
  }

  // ----------------------------------------------------------
  // Comments contract
  // ----------------------------------------------------------

  const commentMarkers = [
    [
      'from("comments")',
      "comments table access",
    ],
    [
      'author_id: userId',
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

  for (const [marker, label] of commentMarkers) {
    if (!social.includes(marker)) {
      fail(
        `social API missing ${label}: ${marker}`
      );
    }
  }

  // ----------------------------------------------------------
  // Comment INSERT must handle errors
  // ----------------------------------------------------------

  if (
    social.includes(
      'from("comments").insert'
    )
  ) {
    const insertIndex = social.indexOf(
      'from("comments").insert'
    );

    const nextSection = social.slice(
      insertIndex,
      insertIndex + 3000
    );

    if (
      !nextSection.includes(
        "insertError"
      )
    ) {
      fail(
        "comment INSERT error is not explicitly checked"
      );
    }
  }

  // ----------------------------------------------------------
  // Current notification schema
  // ----------------------------------------------------------

  if (
    social.includes(
      ".from(\"notifications\")"
    )
  ) {
    if (
      !social.includes(
        "notification_id"
      )
    ) {
      fail(
        "social notifications contract must use notification_id"
      );
    }

    if (
      !social.includes(
        "source_id"
      )
    ) {
      fail(
        "social notifications contract must use source_id"
      );
    }
  }

  // ----------------------------------------------------------
  // Detect legacy notification identifiers
  // ----------------------------------------------------------

  const legacyNotificationPatterns = [
    '.select("id, type, message',
    '.eq("id", id)',
    "target_id",
    "target_type",
  ];

  for (const marker of legacyNotificationPatterns) {
    if (social.includes(marker)) {
      fail(
        `legacy notification schema marker detected in api/social.js: ${marker}`
      );
    }
  }

  // ----------------------------------------------------------
  // Identity contract
  // ----------------------------------------------------------

  if (
    !social.includes(
      "user.id"
    )
  ) {
    fail(
      "social API must use authenticated user.id as identity root"
    );
  }
}

// ============================================================
// FINAL RESULT
// ============================================================

if (failed) {
  console.error(
    `E2E readiness / contract checks failed: ${failed}`
  );

  process.exit(1);
}

console.log(
  "E2E readiness / contract checks: OK"
);

console.log(
  "Social/comment contract: OK"
);

console.log(
  "Identity contract: auth.users.id -> user.id"
);

console.log(
  "Notification contract: notification_id / user_id / actor_id / source_id"
);

console.log(
  "Full browser/device E2E still requires a configured Supabase project, provider keys, and Android/Web test runners."
);
