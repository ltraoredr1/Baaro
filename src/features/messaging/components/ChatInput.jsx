/**
 * src/features/messaging/components/ChatInput.jsx
 * Barre de saisie : texte, pièces jointes, collage d'image, vocal (enregistrer / annuler / envoyer),
 * bandeau "réponse à…" et signal de saisie (onTyping).
 * L'enregistrement vocal est géré ICI uniquement (MessagesTab reçoit le résultat via onSendVoice).
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Send, Paperclip, Square, Trash2, Reply, X } from "lucide-react";

export const MAX_FILE_MB = 25;
const MIN_VOICE_MS = 800;
const MAX_VOICE_SEC = 300; // 5 min

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function ChatInput({
  onSend,
  onSendMedia,
  onSendVoice,
  onTyping,
  onError,
  replyTo, // { name, text } | null
  onCancelReply,
  disabled,
  placeholder = "Message...",
}) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const fileRef = useRef(null);
  const textareaRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);

  const report = useCallback(
    (msg) => {
      if (onError) onError(msg);
      else console.warn("[ChatInput]", msg);
    },
    [onError]
  );

  // Hauteur auto du textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [text]);

  // Quand on choisit "Répondre", le curseur passe dans la zone de saisie
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  const releaseMic = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Nettoyage au démontage : micro coupé, timer arrêté, aucun envoi
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      } catch {
        /* déjà arrêté */
      }
      releaseMic();
    };
  }, [releaseMic]);

  const handleSend = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend?.(t);
    setText("");
  };

  const sendFile = (file) => {
    if (!file || !onSendMedia) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      report(`Fichier trop volumineux (max ${MAX_FILE_MB} Mo).`);
      return;
    }
    onSendMedia(file);
  };

  const handlePaste = (e) => {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.kind === "file");
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      sendFile(file);
    }
  };

  const startRecording = async () => {
    if (disabled || isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      report("L'enregistrement vocal n'est pas supporté par ce navigateur.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const elapsedMs = Date.now() - startedAtRef.current;
        const type = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        releaseMic();
        setIsRecording(false);
        setRecordingTime(0);
        if (cancelledRef.current) return;
        if (elapsedMs < MIN_VOICE_MS || blob.size === 0) {
          report("Vocal trop court.");
          return;
        }
        onSendVoice?.(blob, Math.round(elapsedMs / 1000));
      };

      startedAtRef.current = Date.now();
      recorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setRecordingTime(sec);
        if (sec >= MAX_VOICE_SEC && recorder.state !== "inactive") recorder.stop();
      }, 500);
    } catch (err) {
      console.error("Erreur accès micro :", err);
      releaseMic();
      report("Impossible d'accéder au microphone.");
    }
  };

  const stopRecording = () => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  };

  return (
    <div className="border-t border-white/10 bg-[#0B1220]">
      {replyTo && !isRecording && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <Reply size={16} className="flex-shrink-0 text-[#D9AE52]" />
          <div className="flex-1 min-w-0 border-l-2 border-[#D9AE52] pl-2">
            <p className="text-[11px] font-semibold text-[#D9AE52] truncate">Répondre à {replyTo.name}</p>
            <p className="text-xs truncate text-[rgba(245,243,239,0.55)]">{replyTo.text}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1.5 rounded-full hover:bg-white/10 text-[rgba(245,243,239,0.55)]"
            aria-label="Annuler la réponse"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="p-2 flex items-end gap-2">
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between gap-2 px-3 py-2 bg-red-500/10 text-red-400 rounded-2xl">
            <button
              type="button"
              onClick={cancelRecording}
              className="p-2 rounded-full hover:bg-white/10"
              title="Annuler"
              aria-label="Annuler l'enregistrement"
            >
              <Trash2 size={18} />
            </button>
            <span className="text-xs font-semibold animate-pulse">
              Enregistrement… {formatTime(recordingTime)}
            </span>
            <button
              type="button"
              onClick={stopRecording}
              className="p-2 rounded-full bg-red-500 text-white"
              title="Envoyer le vocal"
              aria-label="Arrêter et envoyer"
            >
              <Square size={16} />
            </button>
          </div>
        ) : (
          <>
            {onSendMedia && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={disabled}
                  className="p-2 rounded-full hover:bg-white/10 text-[rgba(245,243,239,0.55)] disabled:opacity-40"
                  title="Joindre un fichier"
                  aria-label="Joindre un fichier"
                >
                  <Paperclip size={20} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) sendFile(f);
                    e.target.value = "";
                  }}
                />
              </>
            )}

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value) onTyping?.();
              }}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                // Ne pas envoyer pendant la composition IME
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={placeholder}
              rows={1}
              disabled={disabled}
              className="flex-1 resize-none max-h-28 rounded-2xl bg-white/[0.06] px-4 py-2.5 text-sm outline-none text-[#F5F3EF] placeholder:text-[rgba(245,243,239,0.4)]"
            />

            {text.trim() || !onSendVoice ? (
              <button
                type="button"
                onClick={handleSend}
                disabled={disabled || !text.trim()}
                className="p-2.5 rounded-full bg-[#D9AE52] text-[#0B1220] disabled:opacity-40"
                title="Envoyer"
                aria-label="Envoyer"
              >
                <Send size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={disabled}
                className="p-2.5 rounded-full hover:bg-white/10 text-[#D9AE52] disabled:opacity-40"
                title="Enregistrer un vocal"
                aria-label="Enregistrer un vocal"
              >
                <Mic size={20} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
