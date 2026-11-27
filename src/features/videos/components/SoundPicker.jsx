import { useEffect, useState } from "react";
import { ChevronDown, Music2, Pause, Play, Search, Loader2 } from "lucide-react";
import { COLORS } from "../../../theme.js";

// Sélecteur de son ; soundPicker = retour de useSoundPicker.
const SOUND_CATEGORIES = [
  ["Coran", "Quran recitation"], ["Bible", "Bible reading"],
  ["Chants religieux", "religious choir hymn"], ["Piano", "solo piano music"],
  ["Afro", "African instrumental music"], ["Calme", "relaxing ambient music"],
  ["Émotion", "emotional cinematic music"], ["Nature", "nature sound rain birds"],
  ["Inspiration", "inspiring instrumental"],
];

export default function SoundPicker({ soundPicker, hasFile, bakedAudio }) {
  const [commonsQuery, setCommonsQuery] = useState("");
  const [commonsResults, setCommonsResults] = useState([]);
  const [commonsLoading, setCommonsLoading] = useState(false);
  const [commonsError, setCommonsError] = useState("");
  const [commonsSearch, setCommonsSearch] = useState("");
  const {
    sounds,
    selectedSound,
    showSoundPicker,
    setShowSoundPicker,
    muteOriginal,
    setMuteOriginal,
    previewingSoundId,
    soundFileInputRef,
    stopSoundPreview,
    toggleSoundPreview,
    chooseSound,
    handleSoundFile,
  } = soundPicker;

  useEffect(() => {
    if (!commonsSearch.trim()) { setCommonsResults([]); return; }
    let cancelled = false;
    setCommonsLoading(true);
    setCommonsError("");
    const params = new URLSearchParams({
      action: "query", generator: "search",
      gsrsearch: `filetype:audio ${commonsSearch}`,
      gsrnamespace: "6", gsrlimit: "12",
      prop: "imageinfo", iiprop: "url|extmetadata",
      format: "json", origin: "*",
    });
    fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
      .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data) => {
        const pages = Object.values(data?.query?.pages || {});
        const results = pages.map((page) => {
          const info = page.imageinfo?.[0], meta = info?.extmetadata || {};
          const clean = (value) => String(value || "").replace(/<[^>]*>/g, "").trim();
          return {
            id: `commons-${page.pageid}`, title: page.title.replace(/^File:/, ""),
            artist: clean(meta.Artist?.value) || "Wikimedia Commons",
            audio_url: info?.url, license: clean(meta.LicenseShortName?.value) || "Licence à consulter",
            source_url: info?.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
          };
        }).filter((item) => item.audio_url && /\.(mp3|ogg|oga|wav|flac|webm|opus)(\?|$)/i.test(item.audio_url));
        if (!cancelled) setCommonsResults(results);
      })
      .catch(() => { if (!cancelled) setCommonsError("Recherche audio indisponible. Réessaie."); })
      .finally(() => { if (!cancelled) setCommonsLoading(false); });
    return () => { cancelled = true; };
  }, [commonsSearch]);

  return (
    <>
      <button
        onClick={() => {
          stopSoundPreview();
          setShowSoundPicker((value) => !value);
        }}
        className="w-full flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3"
      >
        <span className="flex items-center gap-2 text-sm min-w-0">
          <Music2 size={17} className="shrink-0" />
          <span className="truncate">
            {selectedSound?.title || selectedSound?.name || "Ajouter un son"}
          </span>
        </span>
        <ChevronDown
          size={17}
          className={showSoundPicker ? "rotate-180 transition" : "transition"}
        />
      </button>

      <input
        ref={soundFileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          handleSoundFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {showSoundPicker && (
        <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <button
            onClick={() => soundFileInputRef.current?.click()}
            className="w-full px-4 py-3 text-left text-sm font-bold border-b border-white/10"
            style={{ color: COLORS.gold }}
          >
            🎵 Importer mon audio
          </button>
          <button
            onClick={() => chooseSound(null)}
            className="w-full px-4 py-3 text-left text-sm border-b border-white/10"
          >
            Aucun son (son d'origine)
          </button>
          <div className="border-b border-white/10 p-3 space-y-2">
            <div className="text-xs font-bold text-white/80">Bibliothèque audio gratuite</div>
            <div className="flex gap-2">
              <input value={commonsQuery} onChange={(event) => setCommonsQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") setCommonsSearch(commonsQuery.trim()); }}
                placeholder="Rechercher Coran, piano, pluie…" className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm outline-none"/>
              <button type="button" onClick={() => setCommonsSearch(commonsQuery.trim())}
                className="rounded-xl px-3 py-2" style={{background: COLORS.gold, color: "#000"}} aria-label="Rechercher des sons"><Search size={16}/></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SOUND_CATEGORIES.map(([label, query]) => <button key={label} type="button"
                onClick={() => { setCommonsQuery(query); setCommonsSearch(query); }}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]">{label}</button>)}
            </div>
            {commonsLoading && <p className="text-xs text-white/50 flex items-center gap-2"><Loader2 size={14}/> Recherche…</p>}
            {commonsError && <p role="alert" className="text-xs text-red-300">{commonsError}</p>}
            {!commonsLoading && commonsSearch && commonsResults.length === 0 && !commonsError && <p className="text-xs text-white/50">Aucun fichier audio compatible trouvé.</p>}
            {commonsResults.map((item) => <div key={item.id} className="rounded-xl bg-white/[0.04] p-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggleSoundPreview(item)} className="h-9 w-9 shrink-0 rounded-full bg-white/10 flex items-center justify-center" aria-label={previewingSoundId === item.id ? "Arrêter l'écoute" : "Écouter"}>
                  {previewingSoundId === item.id ? <Pause size={15}/> : <Play size={15}/>}
                </button>
                <button type="button" onClick={() => chooseSound(item)} className="min-w-0 flex-1 text-left">
                  <div className="text-sm font-bold truncate">{item.title}</div><div className="text-[10px] text-white/50 truncate">{item.artist} · {item.license}</div>
                </button>
              </div>
              <a href={item.source_url} target="_blank" rel="noreferrer" className="ml-11 text-[10px] text-yellow-300 underline">Source et licence</a>
            </div>)}
            <p className="text-[10px] text-white/40">Wikimedia Commons — audio libre. Vérifie les conditions de licence et l’attribution avant publication.</p>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {sounds.length === 0 && (
              <p className="px-4 py-4 text-xs text-white/40">
                Aucun son dans la bibliothèque. Importe ton propre audio
                ci-dessus.
              </p>
            )}
            {sounds.map((item) => {
              const key = String(item.id);
              const isPreviewing = previewingSoundId === key;
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 px-2 border-b border-white/5 last:border-0"
                >
                  <button
                    onClick={() => toggleSoundPreview(item)}
                    className="h-9 w-9 shrink-0 rounded-full bg-white/10 flex items-center justify-center"
                    aria-label={isPreviewing ? "Arrêter l'écoute" : "Écouter"}
                  >
                    {isPreviewing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button
                    onClick={() => chooseSound(item)}
                    className="flex-1 min-w-0 py-3 text-left text-sm"
                  >
                    <div className="font-bold truncate">
                      {item.title || item.name || "Son BAARO"}
                    </div>
                    <div className="text-[10px] text-white/40 truncate">
                      {item.artist || "Audio BAARO"}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasFile && selectedSound?.audio_url && !bakedAudio && (
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm">
          <span>Couper le son d'origine de la vidéo</span>
          <input
            type="checkbox"
            checked={muteOriginal}
            onChange={(event) => setMuteOriginal(event.target.checked)}
            className="h-5 w-5"
          />
        </label>
      )}
    </>
  );
}
