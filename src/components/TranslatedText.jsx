import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient.js";
import i18n from "../../i18n.js";
import { loadLocalSettings } from "../lib/appSettings.js";

const CACHE_KEY = "baaro_tr_cache_v1";
const LANG_MAP = { boz: "fr", dog: "fr", snk: "fr", nqo: "fr" };

let active = 0;
const waiting = [];
function run(fn) {
  return new Promise((ok, ko) => {
    const go = () => {
      active++;
      fn().then(ok, ko).finally(() => { active--; const n = waiting.shift(); if (n) n(); });
    };
    active < 2 ? go() : waiting.push(go);
  });
}

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); }
function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; } }
function writeCache(k, v) {
  try {
    const c = readCache(); c[k] = v;
    const keys = Object.keys(c); if (keys.length > 300) keys.slice(0, 100).forEach((x) => delete c[x]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {}
}

function useTranslation(text, setting, sourceLang) {
  const ref = useRef(null);
  const [tr, setTr] = useState(null);
  const [visible, setVisible] = useState(false);
  const raw = (i18n.language || "fr").split("-")[0];
  const target = LANG_MAP[raw] || raw;
  const enabled = !!loadLocalSettings()[setting] && !!text && String(text).trim().length > 1;

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !visible) return;
    let dead = false;
    const key = target + ":" + hash(String(text));
    const hit = readCache()[key];
    if (hit) { setTr(hit); return; }
    run(async () => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return null;
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ text, targetLang: target, sourceLang }),
      });
      if (!r.ok) return null;
      return (await r.json()).translated;
    }).then((v) => { if (dead || !v) return; writeCache(key, v); setTr(v); }).catch(() => {});
    return () => { dead = true; };
  }, [enabled, visible, text, target, sourceLang]);

  const changed = !!tr && tr.trim() !== String(text).trim();
  return { ref, tr, changed };
}

const linkBtn = { display: "block", fontSize: 11, opacity: 0.7, background: "none", border: 0, padding: 0, marginTop: 2, color: "inherit", textDecoration: "underline" };

export default function TranslatedText({ text, as: Tag = "p", className, style, sourceLang, setting = "auto_translate" }) {
  const { ref, tr, changed } = useTranslation(text, setting, sourceLang);
  const [showOrig, setShowOrig] = useState(false);
  return (
    <div ref={ref}>
      <Tag className={className} style={style}>{changed && !showOrig ? tr : text}</Tag>
      {changed && (
        <button type="button" onClick={() => setShowOrig((v) => !v)} style={linkBtn}>
          {showOrig ? "Voir la traduction" : "Voir l'original"}
        </button>
      )}
    </div>
  );
}

export function AutoTranslate({ text, as: Tag = "div", sourceLang, children, setting = "auto_translate", showToggle = true }) {
  const { ref, tr, changed } = useTranslation(text, setting, sourceLang);
  const [showOrig, setShowOrig] = useState(false);
  return (
    <Tag ref={ref}>
      {children(changed && !showOrig ? tr : text)}
      {changed && showToggle && (
        <button type="button" onClick={() => setShowOrig((v) => !v)} style={linkBtn}>
          {showOrig ? "Voir la traduction" : "Voir l'original"}
        </button>
      )}
    </Tag>
  );
}
