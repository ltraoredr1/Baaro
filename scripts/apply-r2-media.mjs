#!/usr/bin/env node
/**
 * BAARO: bascule des nouveaux uploads média vers Cloudflare R2.
 *
 * Usage:
 *   node scripts/apply-r2-media.mjs
 *
 * Ne modifie PAS package.json.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new Error(`Fichier introuvable: ${rel}`);
  return fs.readFileSync(file, "utf8");
}

function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content, "utf8");
}

function addImport(rel, importLine, anchor) {
  const content = read(rel);
  if (content.includes(importLine)) return;
  if (!content.includes(anchor)) {
    throw new Error(`Anchor d'import introuvable dans ${rel}`);
  }
  write(rel, content.replace(anchor, `${anchor}\n${importLine}`));
}

function replaceRegex(rel, regex, replacement, label) {
  const content = read(rel);
  const next = content.replace(regex, replacement);
  if (next === content) {
    throw new Error(`Bloc ${label || "attendu"} introuvable dans ${rel}`);
  }
  write(rel, next);
}

// 1) Feed posts
addImport(
  "src/features/feed/FeedTab.jsx",
  'import { uploadExternalMedia } from "../../lib/externalMedia.js";',
  'import { API_BASE } from "../../config.js";'
);

replaceRegex(
  "src/features/feed/FeedTab.jsx",
  /  const uploadMedia = async \(file, authorId\) => \{[\s\S]*?\n  \};/,
  `  const uploadMedia = async (file, authorId) => {
    const result = await uploadExternalMedia(file, {
      folder: "posts",
      userId: authorId,
      maxBytes: MAX_VIDEO_SIZE,
    });

    return {
      media_url: result.url,
      media_type: file.type.startsWith("video") ? "video" : "image",
    };
  };`,
  "uploadMedia Feed"
);

// 2) Stories
addImport(
  "src/components/FeedStories.jsx",
  'import { uploadExternalMedia } from "../lib/externalMedia.js";',
  'import { useToast } from "./ToastContext.jsx";'
);

replaceRegex(
  "src/components/FeedStories.jsx",
  /      if \(file\) \{[\s\S]*?        mediaType = mode === "video" \? "video" : "image";\n      \}/,
  `      if (file) {
        const result = await uploadExternalMedia(file, {
          folder: "stories",
          userId: currentUser.id,
          maxBytes: MAX_FILE_SIZE,
        });
        mediaUrl = result.url;
        mediaType = mode === "video" ? "video" : "image";
      }`,
  "uploadMedia Stories"
);

// 3) Videos
addImport(
  "src/features/videos/VideosTab.jsx",
  'import { uploadExternalMedia } from "../../lib/externalMedia.js";',
  'import { supabase } from "../../supabaseClient.js";'
);

replaceRegex(
  "src/features/videos/VideosTab.jsx",
  /      const ext = \(selectedFile\.name\.split\("\."\)\.pop\(\) \|\| "mp4"\)\.toLowerCase\(\);[\s\S]*?      const \{ data: publicData \} = supabase\.storage\.from\("videos"\)\.getPublicUrl\(path\);/,
  `      const result = await uploadExternalMedia(selectedFile, {
        folder: "videos",
        userId: user.id,
        maxBytes: 500 * 1024 * 1024,
      });
      setUploadProgress(65);`,
  "uploadMedia Videos"
);

replaceRegex(
  "src/features/videos/VideosTab.jsx",
  /video_url:\s*publicData\.publicUrl/g,
  "video_url: result.url",
  "video URL Videos"
);

// 4) Shop images
addImport(
  "src/services/mediaUpload.js",
  'import { uploadExternalMedia } from "../lib/externalMedia.js";',
  'import { supabase } from "../supabaseClient.js";'
);

replaceRegex(
  "src/services/mediaUpload.js",
  /  const \{ error \} = await supabase\.storage\.from\(BUCKET\)\.upload\([\s\S]*?  return data\.publicUrl;/,
  `  const result = await uploadExternalMedia(compressed, {
    folder: "shop",
    userId,
    maxBytes: MAX_SIZE,
  });
  return result.url;`,
  "uploadShopMedia"
);

// 5) Profile avatar / cover
addImport(
  "src/lib/profileMedia.js",
  'import { uploadExternalMedia } from "./externalMedia.js";',
  'import { supabase } from "../supabaseClient.js";'
);

replaceRegex(
  "src/lib/profileMedia.js",
  /  \/\/ Identité technique dans le path Storage[\s\S]*?  return `\\$\\{base\\}\\?v=\\$\\{Date\.now\(\)\\}`;/,
  `  const result = await uploadExternalMedia(compressed, {
    folder: "profiles",
    userId,
    maxBytes: MAX_SIZE,
  });
  return result.url;`,
  "uploadProfileMedia"
);

// 6) Chat attachments / voice
addImport(
  "src/lib/chatMedia.js",
  'import { uploadExternalMedia } from "./externalMedia.js";',
  'import { supabase } from "../supabaseClient.js";'
);

replaceRegex(
  "src/lib/chatMedia.js",
  /  const ext = \(file\.name\.split\("\."\)\.pop\(\) \|\| "bin"\)[\s\S]*?  return \{\n    url,\n    path: data\.path,\n    mime: file\.type \|\| "application\/octet-stream",\n    size: file\.size,\n    fileName: file\.name,\n  \};/,
  `  const result = await uploadExternalMedia(file, {
    folder: "chat",
    userId,
    maxBytes: MAX_FILE_SIZE,
  });

  return {
    url: result.url,
    path: result.path,
    mime: file.type || "application/octet-stream",
    size: file.size,
    fileName: file.name,
  };`,
  "uploadChatFile"
);

console.log("BAARO R2: patch média appliqué.");
console.log("package.json: inchangé.");
