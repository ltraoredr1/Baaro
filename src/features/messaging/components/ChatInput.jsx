/**
 * src/features/messaging/components/ChatInput.jsx
 */
import React, { useState, useRef } from "react";
import { Mic, Send, Paperclip, Square } from "lucide-react";

export function ChatInput({ onSend, onSendMedia, onSendVoice, disabled, placeholder = "Message..." }) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const fileRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const handleSend = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend?.(t);
    setText("");
  };

  // Démarrer l'enregistrement vocal
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Arrêter tous les flux du micro
        stream.getTracks().forEach(track => track.stop());
        if (audioBlob.size > 0 && onSendVoice) {
          onSendVoice(audioBlob, recordingTime);
        }
        setRecordingTime(0);
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Erreur accès micro :", err);
      alert("Impossible d'accéder au microphone.");
    }
  };

  // Arrêter l'enregistrement vocal
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="p-2 border-t bg-white dark:bg-zinc-900 flex items-end gap-2">
      {isRecording ? (
        <div className="flex-1 flex items-center justify-between px-4 py-2 bg-red-500/10 text-red-500 rounded-2xl">
          <span className="text-xs font-semibold animate-pulse">Enregistrement... {formatTime(recordingTime)}</span>
          <button onClick={stopRecording} className="p-1 rounded-full bg-red-500 text-white">
            <Square size={16} />
          </button>
        </div>
      ) : (
        <>
          <button 
            type="button" 
            onClick={() => fileRef.current?.click()} 
            disabled={disabled}
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
          >
            <Paperclip size={20} />
          </button>
          
          <input 
            ref={fileRef} 
            type="file" 
            hidden 
            onChange={e => { 
              const f = e.target.files?.[0]; 
              if (f) onSendMedia?.(f); 
              e.target.value = "";
            }} 
          />

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none max-h-28 rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100"
          />

          {text.trim() ? (
            <button 
              type="button" 
              onClick={handleSend} 
              disabled={disabled} 
              className="p-2.5 rounded-full bg-blue-600 text-white text-sm disabled:opacity-40"
            >
              <Send size={18} />
            </button>
          ) : (
            <button 
              type="button" 
              onClick={startRecording} 
              disabled={disabled} 
              className="p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
              title="Enregistrer un vocal"
            >
              <Mic size={20} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
