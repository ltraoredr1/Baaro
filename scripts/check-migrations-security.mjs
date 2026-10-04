import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, "supabase", "migrations");
const unifiedPath = path.join(dir, "0001_baaro_unified.sql");
if (!fs.existsSync(unifiedPath)) { console.error("Unified migration missing"); process.exit(1); }
const sql = fs.readFileSync(unifiedPath, "utf8");
const required = [
  "get_profile_stats", "get_story_viewers", "get_story_reactors", "get_video_viewers",
  "get_video_likers", "get_post_viewers", "get_post_likers", "register_post_view",
  "user_settings", "user_settings_owner_read", "story_close_friends", "claim_media_jobs",
  "nexus_trust_score", "global_discovery_search"
];
const missing = required.filter((x) => !sql.includes(x));
if (missing.length) { console.error("Unified migration missing controls:", missing.join(", ")); process.exit(1); }
if (fs.readdirSync(dir).filter(f => f.endsWith(".sql")).length !== 1) { console.error("Expected exactly one active SQL migration"); process.exit(1); }
console.log("BAARO unified migration security check: OK (1 active migration)");
