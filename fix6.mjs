import fs from "fs";
import path from "path";
const walk=(d,o=[])=>{for(const f of fs.readdirSync(d,{withFileTypes:true})){if(f.name==="node_modules"||f.name.startsWith("."))continue;const p=path.join(d,f.name);f.isDirectory()?walk(p,o):o.push(p)}return o};
const all=walk("src");

/* 1. Composant AutoTranslate (réutilise cache, file d'attente et langue de TranslatedText) */
const tt="src/components/TranslatedText.jsx";
let t=fs.readFileSync(tt,"utf8");
if(!t.includes("export function AutoTranslate")){
  t+=`
export function AutoTranslate({ text, as: Tag = "div", sourceLang, children }) {
  const ref = useRef(null);
  const [tr, setTr] = useState(null);
  const [showOrig, setShowOrig] = useState(false);
  const [visible, setVisible] = useState(false);
  const raw = (i18n.language || "fr").split("-")[0];
  const target = LANG_MAP[raw] || raw;
  const enabled = !!loadLocalSettings().auto_translate && !!text && String(text).trim().length > 1;

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
  return (
    <Tag ref={ref}>
      {children(changed && !showOrig ? tr : text)}
      {changed && (
        <button type="button" onClick={() => setShowOrig((v) => !v)} style={{ display: "block", fontSize: 11, opacity: 0.7, background: "none", border: 0, padding: 0, marginTop: 2, color: "inherit", textDecoration: "underline" }}>
          {showOrig ? "Voir la traduction" : "Voir l'original"}
        </button>
      )}
    </Tag>
  );
}
`;
  fs.writeFileSync(tt,t);console.log("✔ AutoTranslate ajouté");
}

/* 2. Fil */
const feed=all.find(f=>/\.jsx?$/.test(f)&&fs.readFileSync(f,"utf8").includes("export function FeedTab"));
if(!feed){console.log("⚠ FeedTab introuvable");process.exit(1)}
let s=fs.readFileSync(feed,"utf8");
if(s.includes("AutoTranslate")){console.log("= fil déjà patché");process.exit(0)}
const before=s;
s=s.replace('import { TipButton } from "../../components/TipButton.jsx";',()=>'import { TipButton } from "../../components/TipButton.jsx";\nimport { AutoTranslate } from "../../components/TranslatedText.jsx";')
 .replace('<RichTextRenderer content={post.text} />',()=>'<AutoTranslate text={post.text}>{(shown) => <RichTextRenderer content={shown} />}</AutoTranslate>')
 .replace('</span> : {c.text}',()=>'</span> : <AutoTranslate as="span" text={c.text}>{(shown) => shown}</AutoTranslate>');
if(s===before){console.log("⚠ rien remplacé");process.exit(1)}
fs.writeFileSync(feed,s);console.log("✔ fil patché :",feed);
