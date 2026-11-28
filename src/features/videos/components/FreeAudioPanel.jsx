import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Search, Shuffle, Sparkles } from "lucide-react";
import { COLORS } from "../../../theme.js";
import {
  AUDIO_COLLECTIONS, AUDIO_SEARCHES, MELODY_MOODS,
  generateMelody, loadCollection, searchArchive,
} from "../lib/freeAudioLibrary.js";

const fmt = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "");

function TrackRow({ item, previewingSoundId, toggleSoundPreview, chooseSound }) {
  const playing = previewingSoundId === String(item.id);
  return (
    <div className="rounded-xl bg-white/[0.04] p-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => toggleSoundPreview(item)}
          className="h-9 w-9 shrink-0 rounded-full bg-white/10 flex items-center justify-center"
          aria-label={playing ? "Arrêter l'écoute" : "Écouter"}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" onClick={() => chooseSound(item)} className="min-w-0 flex-1 text-left">
          <div className="text-sm font-bold truncate">{item.title}</div>
          <div className="text-[10px] text-white/50 truncate">
            {item.artist}{item.duration ? ` · ${fmt(item.duration)}` : ""} · {item.license}
          </div>
        </button>
      </div>
      {item.source_url && (
        <a href={item.source_url} target="_blank" rel="noreferrer" className="ml-11 text-[10px] text-yellow-300 underline">
          Source et licence
        </a>
      )}
    </div>
  );
}

export default function FreeAudioPanel({ previewingSoundId, toggleSoundPreview, chooseSound }) {
  const [tab, setTab] = useState("melodies");
  const [mood, setMood] = useState("calme");
  const [seconds, setSeconds] = useState(30);
  const [melodies, setMelodies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState(null); // {type:'col', col} | {type:'search', q}
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const sentinel = useRef(null);
  const reqId = useRef(0);

  const makeMelodies = async (count = 3) => {
    if (busy) return;
    setBusy(true);
    try {
      const out = [];
      for (let i = 0; i < count; i++) {
        out.push(await generateMelody(mood, Date.now() + Math.floor(Math.random() * 1e6), seconds));
      }
      setMelodies((prev) => [...out, ...prev].slice(0, 30));
    } catch {
      setError("Génération indisponible sur cet appareil.");
    } finally {
      setBusy(false);
    }
  };

  const fetchPage = async (src, p) => {
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    try {
      const res = src.type === "col" ? await loadCollection(src.col, p) : await searchArchive(src.q, p);
      if (id !== reqId.current) return;
      setItems((prev) => (p === 0 ? res.items : [...prev, ...res.items]));
      setHasMore(res.hasMore);
      setPage(p);
    } catch {
      if (id === reqId.current) setError("Bibliothèque indisponible. Réessaie.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  const open = (src) => { setSource(src); setItems([]); setHasMore(false); fetchPage(src, 0); };

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loading || !source) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) fetchPage(source, page + 1); });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, source, page]);

  const tabs = [["melodies", "Mélodies ∞"], ["Coran", "Coran"], ["Bible", "Bible"], ["search", "Plus"]];

  return (
    <div className="border-b border-white/10 p-3 space-y-2">
      <div className="flex gap-1.5">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className="flex-1 rounded-full px-2 py-1.5 text-[11px] font-bold"
            style={tab === k ? { background: COLORS.gold, color: "#000" } : { background: "rgba(255,255,255,.1)" }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "melodies" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {MELODY_MOODS.map((m) => (
              <button key={m.key} type="button" onClick={() => setMood(m.key)}
                className="rounded-full px-2.5 py-1 text-[11px]"
                style={mood === m.key ? { background: COLORS.gold, color: "#000" } : { background: "rgba(255,255,255,.1)" }}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}
              className="rounded-xl bg-white/10 px-2 py-2 text-xs outline-none">
              {[15, 30, 60, 90].map((s) => <option key={s} value={s} className="text-black">{s}s</option>)}
            </select>
            <button type="button" onClick={() => makeMelodies(3)} disabled={busy}
              className="flex-1 rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-center gap-2"
              style={{ background: COLORS.gold, color: "#000" }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {melodies.length ? "Encore des mélodies" : "Créer des mélodies"}
            </button>
            {melodies.length > 0 && (
              <button type="button" onClick={() => setMelodies([])} className="rounded-xl bg-white/10 p-2" aria-label="Vider">
                <Shuffle size={14} />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {melodies.map((m) => (
              <TrackRow key={m.id} item={m} {...{ previewingSoundId, toggleSoundPreview, chooseSound }} />
            ))}
          </div>
          <p className="text-[10px] text-white/40">Chaque mélodie est unique, créée sur ton téléphone, libre de droits.</p>
        </div>
      )}

      {(tab === "Coran" || tab === "Bible") && (
        <div className="flex flex-wrap gap-1.5">
          {AUDIO_COLLECTIONS.filter((c) => c.group === tab).map((c) => (
            <button key={c.key} type="button" onClick={() => open({ type: "col", col: c })}
              className="rounded-full px-2.5 py-1 text-[11px]"
              style={source?.col?.key === c.key ? { background: COLORS.gold, color: "#000" } : { background: "rgba(255,255,255,.1)" }}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {tab === "search" && (
        <>
          <div className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) open({ type: "search", q: query.trim() }); }}
              placeholder="Sourate, psaume, nasheed, gospel…"
              className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" />
            <button type="button" onClick={() => query.trim() && open({ type: "search", q: query.trim() })}
              className="rounded-xl px-3 py-2" style={{ background: COLORS.gold, color: "#000" }} aria-label="Rechercher">
              <Search size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AUDIO_SEARCHES.map(([l, q]) => (
              <button key={l} type="button" onClick={() => { setQuery(q); open({ type: "search", q }); }}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]">{l}</button>
            ))}
          </div>
        </>
      )}

      {tab !== "melodies" && source && (
        <div className="max-h-72 overflow-y-auto space-y-1.5">
          {items.map((it) => (
            <TrackRow key={it.id} item={it} {...{ previewingSoundId, toggleSoundPreview, chooseSound }} />
          ))}
          {!loading && !error && items.length === 0 && <p className="text-xs text-white/50">Aucun audio trouvé.</p>}
          {loading && <p className="text-xs text-white/50 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement…</p>}
          <div ref={sentinel} className="h-2" />
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {tab !== "melodies" && <p className="text-[10px] text-white/40">Internet Archive — audio gratuit. Vérifie la licence avant publication.</p>}
    </div>
  );
}
