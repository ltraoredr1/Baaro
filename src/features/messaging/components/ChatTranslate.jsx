/**
 * src/features/messaging/components/ChatTranslate.jsx
 *
 * Traduction d'un message reçu : Bambara ⇄ Français (et autres langues).
 * La langue cible est celle de l'interface de l'utilisateur ; il peut basculer
 * vers l'autre langue (Français ⇄ Bambara) en un geste.
 *
 * Deux modes :
 *  - manuel : bouton « Traduire » sous le message (avis de confidentialité la 1re fois) ;
 *  - direct : si l'utilisateur a activé la traduction directe (bouton dans l'en-tête
 *    de la conversation), le message est traduit automatiquement dès son affichage,
 *    sauf s'il est déjà dans la langue du lecteur.
 *
 * Confidentialité : les messages sont chiffrés de bout en bout. Traduire un
 * message l'envoie, lui seul, au service de traduction de BAARO (sans mise en
 * cache côté serveur). Le mode direct n'existe qu'après un consentement explicite.
 */
import React, { useEffect, useRef, useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { langLabel } from "../../../lib/translateApi.js";
import { needsTranslation } from "../lib/chatLangGuess.js";
import {
  chatTargetLang,
  giveChatConsent,
  hasChatConsent,
  peekTranslation,
  translateForChat,
  useAutoTranslate,
} from "../lib/autoTranslate.js";

/** L'autre langue proposée en un geste : Bambara ⇄ Français. */
function otherLang(target) {
  return target === "bm" ? "fr" : "bm";
}

export function ChatTranslate({ text, isMe = false }) {
  const auto = useAutoTranslate();
  // idle → consent → loading → done | same | error
  const [phase, setPhase] = useState("idle");
  const [target, setTarget] = useState(() => chatTargetLang());
  const [result, setResult] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [error, setError] = useState("");
  const [fromAuto, setFromAuto] = useState(false);
  const aliveRef = useRef(true);
  const autoTriedFor = useRef(""); // « langue|texte » déjà traité automatiquement

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const pill = isMe ? "bg-white/20 hover:bg-white/30" : "bg-white/10 hover:bg-white/15";

  const run = async (lang, { automatic = false, signal } = {}) => {
    setTarget(lang);
    setError("");
    setShowOriginal(false);
    setFromAuto(automatic);

    const known = peekTranslation(text, lang);
    if (known !== undefined) {
      setResult(known);
      setPhase(!known || known === String(text).trim() ? "same" : "done");
      return;
    }

    setPhase("loading");
    try {
      const out = await translateForChat(text, lang, { signal });
      if (!aliveRef.current || signal?.aborted) return;
      setResult(out);
      setPhase(!out || out === String(text).trim() ? "same" : "done");
    } catch (e) {
      if (!aliveRef.current || e?.name === "AbortError") return;
      if (automatic) {
        // En mode direct, un échec reste discret : le bouton manuel reste disponible.
        setPhase("idle");
        return;
      }
      setError(e?.message || "Traduction impossible.");
      setPhase("error");
    }
  };

  // Mode direct : traduire automatiquement ce qui n'est pas dans la langue du lecteur.
  useEffect(() => {
    if (!auto || !hasChatConsent()) return undefined;
    const lang = chatTargetLang();
    const marker = `${lang}|${text}`;
    if (autoTriedFor.current === marker) return undefined;
    if (!needsTranslation(text, lang)) return undefined;

    autoTriedFor.current = marker;
    const ctrl = new AbortController();
    run(lang, { automatic: true, signal: ctrl.signal });
    return () => {
      ctrl.abort();
      // Le composant a été démonté avant la fin : on pourra réessayer au prochain affichage.
      if (autoTriedFor.current === marker) autoTriedFor.current = "";
    };
    // `run` ne dépend que de `text` et des setters : on ne relance que si le texte ou le mode changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, text]);

  const onClick = () => {
    if (hasChatConsent()) run(target);
    else setPhase("consent");
  };

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`mt-1.5 flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${pill}`}
      >
        <Languages size={12} /> Traduire
      </button>
    );
  }

  if (phase === "consent") {
    return (
      <div className="mt-1.5 text-[11px] rounded-xl bg-black/15 p-2 max-w-[250px] not-italic">
        <p className="opacity-80 leading-snug mb-1.5">
          Pour traduire, ce message (et lui seul) est envoyé au service de traduction BAARO, en dehors du
          chiffrement de bout en bout. BAARO ne l'enregistre pas.
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              giveChatConsent();
              run(target);
            }}
            className="px-2.5 py-1 rounded-full bg-[#D9AE52] text-[#0B1220] font-semibold"
          >
            Traduire
          </button>
          <button type="button" onClick={() => setPhase("idle")} className={`px-2.5 py-1 rounded-full ${pill}`}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] opacity-80">
        <Loader2 size={12} className="animate-spin" /> Traduction en {langLabel(target)}…
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mt-1.5 text-[11px] rounded-xl bg-red-500/15 text-red-200 p-2 max-w-[250px] not-italic">
        <p className="mb-1">{error}</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => run(target)} className={`px-2 py-0.5 rounded-full ${pill}`}>
            Réessayer
          </button>
          <button type="button" onClick={() => setPhase("idle")} className={`px-2 py-0.5 rounded-full ${pill}`}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  // done | same
  const other = otherLang(target);

  // Mode direct : si le message était déjà dans la langue du lecteur, on n'affiche rien de plus.
  if (phase === "same" && fromAuto) {
    return (
      <button
        type="button"
        onClick={() => run(other)}
        className={`mt-1.5 flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full opacity-70 ${pill}`}
      >
        <Languages size={12} /> En {langLabel(other)}
      </button>
    );
  }

  return (
    <div className="mt-1.5 text-sm rounded-xl bg-black/15 p-2 max-w-[280px] not-italic">
      {phase === "same" ? (
        <p className="text-[11px] opacity-80">Ce message est déjà en {langLabel(target)}.</p>
      ) : (
        <p className="whitespace-pre-wrap break-words" dir="auto">
          {showOriginal ? text : result}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
        {phase === "done" && (
          <span className="opacity-60">
            {showOriginal ? "Original" : `${langLabel(target)} · traduction automatique`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1 text-[11px]">
        {phase === "done" && (
          <button type="button" onClick={() => setShowOriginal((v) => !v)} className={`px-2 py-0.5 rounded-full ${pill}`}>
            {showOriginal ? "Voir la traduction" : "Voir l'original"}
          </button>
        )}
        <button type="button" onClick={() => run(other)} className={`px-2 py-0.5 rounded-full ${pill}`}>
          En {langLabel(other)}
        </button>
        <button type="button" onClick={() => setPhase("idle")} className={`px-2 py-0.5 rounded-full ${pill}`}>
          Masquer
        </button>
      </div>
    </div>
  );
}

export default ChatTranslate;
