import fs from "fs";
import path from "path";
const walk=(d,o=[])=>{for(const f of fs.readdirSync(d,{withFileTypes:true})){if(f.name==="node_modules"||f.name.startsWith("."))continue;const p=path.join(d,f.name);f.isDirectory()?walk(p,o):o.push(p)}return o};
const all=walk("src");

/* 1. AutoTranslate : réglage au choix + bouton « original » optionnel */
const tt="src/components/TranslatedText.jsx";
let t=fs.readFileSync(tt,"utf8");
const i=t.indexOf("export function AutoTranslate");
if(i<0){console.log("⚠ AutoTranslate absent : relance d'abord le patch du fil");process.exit(1)}
if(!t.includes("showToggle")){
  let head=t.slice(0,i), tail=t.slice(i);
  tail=tail
   .replace("{ text, as: Tag = \"div\", sourceLang, children }",()=>"{ text, as: Tag = \"div\", sourceLang, children, setting = \"auto_translate\", showToggle = true }")
   .replace("!!loadLocalSettings().auto_translate",()=>"!!loadLocalSettings()[setting]")
   .replace("{changed && (",()=>"{changed && showToggle && (");
  fs.writeFileSync(tt,head+tail);console.log("✔ AutoTranslate étendu");
}

/* 2. Vidéos */
const f=all.find(p=>/\.jsx?$/.test(p)&&fs.readFileSync(p,"utf8").includes("export function VideosTab"));
if(!f){console.log("⚠ VideosTab introuvable");process.exit(1)}
let s=fs.readFileSync(f,"utf8");
if(s.includes("AutoTranslate")){console.log("= vidéos déjà patchées");process.exit(0)}
const b=s;
s=s.replace('import { TipButton } from "../../components/TipButton.jsx";',()=>'import { TipButton } from "../../components/TipButton.jsx";\nimport { AutoTranslate } from "../../components/TranslatedText.jsx";')
 .replace('{caption || "Vidéo BAARO"}',()=>'<AutoTranslate as="span" setting="translate_media" showToggle={false} text={caption}>{(shown) => shown || "Vidéo BAARO"}</AutoTranslate>')
 .replace('<p className="text-sm text-white/75">{comment.content}</p>',()=>'<AutoTranslate setting="translate_media" text={comment.content}>{(shown) => <p className="text-sm text-white/75">{shown}</p>}</AutoTranslate>');
if(s===b){console.log("⚠ rien remplacé");process.exit(1)}
fs.writeFileSync(f,s);console.log("✔ vidéos patchées :",f);
