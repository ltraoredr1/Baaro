/**
 * src/features/messaging/components/VoiceTranscript.jsx
 *
 * « Lire le vocal » : bouton sous un message vocal qui le transforme en texte
 * (Français / Bambara) directement sur l'appareil, via Whisper (voir
 * src/lib/whisperTranscribe.js). Utile en classe, au marché, dans les transports…
 */
import React, { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Copy, X, RotateCw } from "lucide-react";
import {
  TRANSCRIBE_LANGS,
  getCachedTranscript,
  getPreferredLang,
  setPreferredLang,
  isModelReady,
  transcribeVoice,
} from "../../../lib/whisperTranscribe.js";

const STAGE_LABEL = {
  decode: "Préparation du vocal…",
  model: "Téléchargement du modèle (une seule fois)",
  transcribe: "Transcription en cours…",
};

export function VoiceTranscript({ src, isMe = false }) {
  // idle → choosing → working → done | error
  const [phase, setPhase] = useState("idle");
  const [lang, setLang] = useState(() => getPreferredLang());
  const [text, setText] = useState("");
  const [progress, setProgress] = useState({ stage: "decode", percent: null });
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const pill = isMe ? "bg-white/20 hover:bg-white/30" : "bg-white/10 hover:bg-white/15";

  const run = async (code, force = false) => {
    setLang(code);
    setPreferredLang(code);
    setError("");
    setPhase("working");
    setProgress({ stage: "decode", percent: null });
    try {
      const out = await transcribeVoice(src, code, {
        force,
        onProgress: (p) => aliveRef.current && setProgress(p),
      });
      if (!aliveRef.current) return;
      setText(out);
      setPhase("done");
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e?.message || "Transcription impossible.");
      setPhase("error");
    }
  };

  const onOpen = () => {
    // Déjà transcrit sur cet appareil : affichage immédiat.
    const cached = getCachedTranscript(src, lang);
    if (cached != null) {
      setText(cached);
      setPhase("done");
      return;
    }
    // Une seule langue disponible et modèle déjà présent : on lance directement.
    if (TRANSCRIBE_LANGS.length === 1 && isModelReady(TRANSCRIBE_LANGS[0].code)) {
      run(TRANSCRIBE_LANGS[0].code);
      return;
    }
    setPhase("choosing");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`mt-2 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${pill}`}
      >
        <FileText size={13} /> Lire le vocal
      </button>
    );
  }

  if (phase === "choosing") {
    return (
      <div className="mt-2 text-xs rounded-xl bg-black/15 p-2.5 max-w-[260px]">
        <p className="font-semibold mb-1">Lire le vocal en…</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {TRANSCRIBE_LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => run(l.code)}
              className="px-3 py-1 rounded-full bg-[#D9AE52] text-[#0B1220] font-semibold"
            >
              {l.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPhase("idle")}
            aria-label="Annuler"
            className={`px-2 py-1 rounded-full ${pill}`}
          >
            <X size={12} />
          </button>
        </div>
        <p className="opacity-70 leading-snug">
          Au premier usage, un modèle d'environ{" "}
          {Math.max(...TRANSCRIBE_LANGS.map((l) => l.approxMb))} Mo est téléchargé une seule fois ; ensuite ça
          marche sans connexion. Le vocal reste sur ton téléphone.
        </p>
      </div>
    );
  }

  if (phase === "working") {
    const pct = progress.percent;
    return (
      <div className="mt-2 text-xs rounded-xl bg-black/15 p-2.5 min-w-[190px]">
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin flex-shrink-0" />
          <span>
            {STAGE_LABEL[progress.stage] || "Un instant…"}
            {pct != null ? ` ${pct}%` : ""}
          </span>
        </div>
        {pct != null && (
          <div className="h-1 rounded-full bg-white/15 mt-2">
            <div className="h-full rounded-full bg-[#D9AE52]" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mt-2 text-xs rounded-xl bg-red-500/15 text-red-200 p-2.5 max-w-[260px]">
        <p className="mb-1.5">{error}</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => run(lang, true)} className={`px-2.5 py-1 rounded-full ${pill}`}>
            Réessayer
          </button>
          <button type="button" onClick={() => setPhase("idle")} className={`px-2.5 py-1 rounded-full ${pill}`}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  // phase === "done"
  const langLabel = TRANSCRIBE_LANGS.find((l) => l.code === lang)?.label || "";
  return (
    <div className="mt-2 text-sm rounded-xl bg-black/15 p-2.5 max-w-[280px]">
      <p className="whitespace-pre-wrap break-words not-italic">
        {text || <span className="opacity-70 italic">Aucune parole détectée.</span>}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px]">
        <span className="opacity-60">{langLabel} · transcription automatique</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs">
        {text && (
          <button type="button" onClick={copy} className={`flex items-center gap-1 px-2.5 py-1 rounded-full ${pill}`}>
            <Copy size={12} /> {copied ? "Copié" : "Copier"}
          </button>
        )}
        {TRANSCRIBE_LANGS.length > 1 && (
          <button
            type="button"
            onClick={() => run(TRANSCRIBE_LANGS.find((l) => l.code !== lang)?.code || lang)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full ${pill}`}
          >
            <RotateCw size={12} /> {TRANSCRIBE_LANGS.find((l) => l.code !== lang)?.label}
          </button>
        )}
        <button type="button" onClick={() => setPhase("idle")} className={`px-2.5 py-1 rounded-full ${pill}`}>
          Masquer
        </button>
      </div>
    </div>
  );
}

export default VoiceTranscript;
