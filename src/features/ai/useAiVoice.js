import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { SPEAK_KEY } from "./aiAssistantConfig.js";
import { cleanTextForSpeech, findNativeVoice } from "./aiAssistantHelpers.js";

function readAutoSpeak() {
  try {
    return localStorage.getItem(SPEAK_KEY) === "1";
  } catch {
    return false;
  }
}

function teardownRecognition(recognition) {
  if (!recognition) return;
  if (recognition.native) {
    SpeechRecognition.stop().catch(() => {});
    SpeechRecognition.removeAllListeners().catch(() => {});
    return;
  }
  try {
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.abort();
  } catch {
    try {
      recognition.stop();
    } catch {
      // Déjà arrêtée.
    }
  }
}

/**
 * Voix de l'assistant : lecture à voix haute + dictée.
 * - onTranscript(texte) : appelé à chaque résultat de dictée
 * - showToast(message, type) : affichage des erreurs
 */
export function useAiVoice({ isGriot, griotVoice, onTranscript, showToast }) {
  const nativeApp = Capacitor.isNativePlatform();

  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(readAutoSpeak);

  const recognitionRef = useRef(null);
  const speakingIdRef = useRef(null);
  const mountedRef = useRef(false);

  const stopSpeech = useCallback(() => {
    if (nativeApp) {
      TextToSpeech.stop().catch(() => {});
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Synthèse indisponible.
      }
    }
    speakingIdRef.current = null;
    if (mountedRef.current) setSpeakingMessageId(null);
  }, [nativeApp]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    teardownRecognition(recognition);
    if (mountedRef.current) setIsListening(false);
  }, []);

  // Démontage : tout couper
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      teardownRecognition(recognition);

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Nettoyage best effort.
        }
      }
      if (nativeApp) TextToSpeech.stop().catch(() => {});
      speakingIdRef.current = null;
    };
  }, [nativeApp]);

  // Onglet masqué : couper voix et micro
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopSpeech();
        stopListening();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [stopSpeech, stopListening]);

  const speakText = useCallback(
    async (messageId, text, { force = false } = {}) => {
      if (speakingIdRef.current === messageId) {
        stopSpeech();
        return;
      }

      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;
      stopSpeech();
      speakingIdRef.current = messageId;
      setSpeakingMessageId(messageId);

      const done = () => {
        if (speakingIdRef.current === messageId) {
          speakingIdRef.current = null;
          if (mountedRef.current) setSpeakingMessageId(null);
        }
      };

      try {
        if (nativeApp) {
          const voice = await findNativeVoice(griotVoice);
          await TextToSpeech.speak({
            text: cleaned,
            lang: "fr-FR",
            rate: isGriot ? 0.92 : 1,
            pitch: isGriot ? 0.85 : 1,
            volume: 1,
            category: "playback",
            queueStrategy: 0,
            ...(voice === undefined ? {} : { voice }),
          });
          done();
          return;
        }

        if (
          typeof window === "undefined" ||
          !("speechSynthesis" in window) ||
          typeof window.SpeechSynthesisUtterance !== "function"
        ) {
          throw new Error("La synthèse vocale n'est pas disponible sur cet appareil");
        }

        const synth = window.speechSynthesis;
        const utterance = new window.SpeechSynthesisUtterance(cleaned);
        utterance.lang = "fr-FR";
        utterance.rate = isGriot ? 0.92 : 1;
        utterance.pitch = isGriot ? 0.85 : 1;
        const voices = synth.getVoices() || [];
        const frenchVoice =
          voices.find((v) => (v.lang || "").toLowerCase().replace(/_/g, "-") === "fr-fr") ||
          voices.find((v) => (v.lang || "").toLowerCase().startsWith("fr"));
        if (frenchVoice) utterance.voice = frenchVoice;
        utterance.onend = done;
        utterance.onerror = done;
        synth.speak(utterance);
      } catch (error) {
        done();
        if (force) {
          showToast(error?.message || "Impossible de lire cette réponse à voix haute", "error");
        }
      }
    },
    // griotVoice ajouté : sans lui, changer de voix n'avait aucun effet
    // tant que le mode Griot n'était pas basculé.
    [showToast, stopSpeech, isGriot, griotVoice, nativeApp]
  );

  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeak((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
      } catch {
        // Ignoré.
      }
      if (!next) stopSpeech();
      return next;
    });
  }, [stopSpeech]);

  const toggleListening = useCallback(async () => {
    if (recognitionRef.current) {
      stopListening();
      return;
    }

    if (nativeApp) {
      try {
        const { available } = await SpeechRecognition.available();
        if (!available) throw new Error("La reconnaissance vocale est indisponible sur cet appareil");

        let permission = await SpeechRecognition.checkPermissions();
        if (permission.speechRecognition !== "granted") {
          permission = await SpeechRecognition.requestPermissions();
        }
        if (permission.speechRecognition !== "granted") {
          throw new Error("L'autorisation du microphone est refusée");
        }

        await SpeechRecognition.removeAllListeners();
        recognitionRef.current = { native: true };
        await SpeechRecognition.addListener("partialResults", (data) => {
          const transcript = data?.matches?.[0] || data?.value?.[0];
          if (!transcript || !mountedRef.current) return;
          onTranscript(transcript);
        });
        await SpeechRecognition.addListener("listeningState", (data) => {
          if (data?.status === "started" && mountedRef.current) setIsListening(true);
          if (data?.status === "stopped") {
            recognitionRef.current = null;
            if (mountedRef.current) setIsListening(false);
          }
        });
        setIsListening(true);
        await SpeechRecognition.start({
          language: "fr-FR",
          maxResults: 1,
          partialResults: true,
          popup: false,
        });
      } catch (error) {
        recognitionRef.current = null;
        setIsListening(false);
        showToast(error?.message || "Impossible d'activer le micro", "error");
      }
      return;
    }

    if (typeof window === "undefined") {
      showToast("La dictée vocale n'est pas disponible", "error");
      return;
    }

    // Renommé : l'ancien nom « SpeechRecognition » masquait l'import Capacitor
    // dans toute la fonction (zone morte temporelle) et cassait le micro natif.
    const BrowserSpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!BrowserSpeechRecognition) {
      showToast("La dictée vocale n'est pas supportée par votre navigateur", "error");
      return;
    }

    try {
      const recognition = new BrowserSpeechRecognition();
      recognition.lang = "fr-FR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        if (mountedRef.current) setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (!transcript || !mountedRef.current) return;
        onTranscript(transcript);
      };

      recognition.onerror = () => {
        if (mountedRef.current) setIsListening(false);
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        if (mountedRef.current) setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      showToast("Impossible d'activer le micro", "error");
    }
  }, [showToast, stopListening, nativeApp, onTranscript]);

  return {
    autoSpeak,
    speakingMessageId,
    isListening,
    speakText,
    stopSpeech,
    stopListening,
    toggleAutoSpeak,
    toggleListening,
  };
}

export default useAiVoice;
