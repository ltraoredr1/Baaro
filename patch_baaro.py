import os, re

def find(name):
    for base in ("src", "api"):
        for root, _, files in os.walk(base):
            if name in files:
                return os.path.join(root, name)
    return None

def read(p): return open(p, encoding="utf-8").read()
def write(p, t): open(p, "w", encoding="utf-8").write(t)

def rel(frm, to):
    r = os.path.relpath(to, os.path.dirname(frm)).replace(os.sep, "/")
    return r if r.startswith(".") else "./" + r

def rep(t, old, new, label, marker=None):
    if (marker or new) in t:
        print("  ~ déjà fait :", label); return t
    if old not in t:
        print("  ✗ NON TROUVÉ :", label); return t
    print("  ✓", label)
    return t.replace(old, new, 1)

def rre(t, pattern, new, label, marker=None):
    if (marker or new) in t:
        print("  ~ déjà fait :", label); return t
    m = re.search(pattern, t, re.S)
    if not m:
        print("  ✗ NON TROUVÉ :", label); return t
    print("  ✓", label)
    return t[:m.start()] + new + t[m.end():]

def after_line(t, line_pattern, add, label, marker):
    if marker in t:
        print("  ~ déjà fait :", label); return t
    m = re.search(line_pattern, t, re.M)
    if not m:
        print("  ✗ NON TROUVÉ :", label); return t
    print("  ✓", label)
    return t[:m.end()] + "\n" + add + t[m.end():]

# ---------- useMessaging.js ----------
p = find("useMessaging.js")
print("useMessaging:", p)
if p:
    t = read(p)
    t = rre(t,
        r"setMessages\(\(prev\) => \[\s*\.\.\.prev,\s*\{\s*\.\.\.data,\s*plaintext: text\.trim\(\), encrypted: true, decryptFailed: false\s*\},?\s*\]\);",
        r"""setMessages((prev) =>
          prev.some((m) => m.id === data.id)
            ? prev
            : [...prev, { ...data, plaintext: text.trim(), encrypted: true, decryptFailed: false }]
        );""",
        "anti-doublon à l'envoi", marker="prev.some((m) => m.id === data.id)\n            ? prev\n            : [...prev, { ...data")
    write(p, t)

# ---------- api/live.js ----------
p = "api/live.js" if os.path.exists("api/live.js") else None
print("live.js:", p)
if p:
    t = read(p)
    anchor = 'if (!liveId) return res.status(400).json({ error: "liveId requis" });'
    block = r"""
  // Appels 1-1 : autorisation via la table calls
  if (liveId.startsWith("call-")) {
    const { data: call } = await admin.from("calls").select("caller_id, callee_id, daily_room_name").eq("daily_room_name", liveId).maybeSingle();
    if (!call) return res.status(404).json({ error: "Appel introuvable" });
    if (call.caller_id !== user.id && call.callee_id !== user.id) return res.status(403).json({ error: "Tu ne fais pas partie de cet appel" });
    try { await createDailyRoom(liveId, { maxParticipants: 2 }); } catch (e) { logWarn("live", "ensure call room", { message: e.message }); }
    const isCaller = call.caller_id === user.id;
    const callToken = await createMeetingToken(liveId, { userId: user.id, userName: body.userName || "BAARO", isOwner: isCaller });
    return res.status(200).json({ ok: true, token: callToken, roomName: liveId, url: roomUrl(liveId), isOwner: isCaller });
  }"""
    t = rep(t, anchor, anchor + block, "token pour appels 1-1", marker='liveId.startsWith("call-")')
    write(p, t)

# ---------- MainShell.jsx ----------
p = find("MainShell.jsx")
print("MainShell:", p)
if p:
    t = read(p)
    modal = find("ChatCallModal.jsx")
    imp = 'import { useCryptoKeys } from "../hooks/useCryptoKeys.js";\nimport { useIncomingCalls } from "../hooks/useIncomingCalls.js";\n'
    if modal:
        imp += 'import { ChatCallModal } from "%s";' % rel(p, modal)
    t = after_line(t, r'^import \{ saveLastTab, loadLastTab \}.*$', imp, "imports", "useIncomingCalls")
    t = rep(t, "const id = user?.id;",
        "const id = user?.id;\n  useCryptoKeys(isAnonymous ? null : id);\n  const { incoming, clear: clearIncoming } = useIncomingCalls(isAnonymous ? null : id);",
        "hooks clé + appels (comptes réels seulement)", marker="useIncomingCalls(isAnonymous")
    locked = r"""function LockedMessages({ onCreateAccount }) {
  return (
    <div className="max-w-md mx-auto text-center p-8 mt-10 rounded-3xl border"
         style={{ borderColor: "rgba(217,174,82,0.2)", background: "rgba(255,255,255,0.04)" }}>
      <div className="text-4xl mb-3">🔒</div>
      <h2 className="font-bold text-lg mb-2" style={{ color: "#F5F3EF" }}>Messagerie réservée aux comptes</h2>
      <p className="text-sm mb-5" style={{ color: "rgba(245,243,239,0.6)" }}>
        Crée un compte pour discuter en privé et passer des appels.
      </p>
      <button onClick={onCreateAccount} className="px-5 py-3 rounded-xl font-bold text-sm"
              style={{ background: "#D9AE52", color: "#000" }}>
        Créer un compte
      </button>
    </div>
  );
}

"""
    t = rep(t, "export function MainShell() {", locked + "export function MainShell() {",
        "écran messagerie verrouillée", marker="function LockedMessages")
    t = rep(t, "const Tab = tabs[activeTab] || null;",
        'const Tab = activeTab === "messages" && isAnonymous\n    ? LockedMessages\n    : (tabs[activeTab] || null);',
        "onglet Chat verrouillé pour anonymes", marker="? LockedMessages")
    t = rre(t, r"messages:\s*\{\s*id,\s*onOpenProfile: setInspectingProfileId,\s*\},",
        'messages: {\n      id,\n      onOpenProfile: setInspectingProfileId,\n      onCreateAccount: () => setActiveTab("settings"),\n    },',
        "props messages", marker="onCreateAccount: () =>")
    t = rre(t, r'onNavigateToMessages=\{\(\) =>\s*setActiveTab\("messages"\)\s*\}',
        'onNavigateToMessages={() => {\n            if (!isAnonymous) { try { sessionStorage.setItem("baaro:open_chat_with", inspectingProfileId); } catch {} }\n            setInspectingProfileId(null);\n            setProfileReadOnly(false);\n            setActiveTab("messages");\n          }}',
        "bouton Message du profil", marker="baaro:open_chat_with")
    t = rep(t, "<OfflineBanner />",
        '{incoming && <ChatCallModal mode="incoming" {...incoming} onClose={clearIncoming} />}\n      <OfflineBanner />',
        "fenêtre d'appel entrant", marker='mode="incoming"')
    write(p, t)

# ---------- MessagesTab.jsx ----------
p = find("MessagesTab.jsx")
print("MessagesTab:", p)
if p:
    t = read(p)
    t = rep(t, 'import { ChatCallModal } from "./ChatCallModal.jsx";',
        'import { ChatCallModal } from "./ChatCallModal.jsx";\nimport { deserializePayload } from "../lib/crypto.js";',
        "import crypto", marker="deserializePayload")
    t = rep(t, "const [starred, setStarred] = useState(new Set());",
        "const [starred, setStarred] = useState(new Set());\n  const [actionsFor, setActionsFor] = useState(null);\n  const closeCall = useCallback(() => setCallState(null), []);",
        "états actionsFor/closeCall", marker="const closeCall")
    t = rep(t, "const recordTimerRef = useRef(null);",
        "const recordTimerRef = useRef(null);\n  const recordSecondsRef = useRef(0);\n  const typingChRef = useRef(null);\n  const lastTypingSent = useRef(0);\n  const markedRef = useRef(new Set());",
        "refs", marker="const recordSecondsRef")
    t = rep(t, "onClose={() => setCallState(null)}", "onClose={closeCall}", "appel stable (closeCall)")
    t = rep(t, "incoming.forEach((m) => markMessageRead(m.id));",
        "incoming.forEach((m) => { if (markedRef.current.has(m.id)) return; markedRef.current.add(m.id); markMessageRead(m.id); });",
        "lu envoyé une seule fois", marker="markedRef.current.has")
    t = rep(t, 'return () => { supabase.removeChannel(channel); window.clearTimeout(window.__baaroTypingTimer); };',
        'typingChRef.current = channel;\n    return () => { typingChRef.current = null; supabase.removeChannel(channel); window.clearTimeout(window.__baaroTypingTimer); };',
        "canal typing réutilisé", marker="typingChRef.current = channel")
    t = rre(t, r"const broadcastTyping = async \(value\) => \{.*?(?=const handleFileSelect)",
        r"""const broadcastTyping = (value) => {
    const now = Date.now();
    if (!typingChRef.current || now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    typingChRef.current.send({ type: "broadcast", event: "typing", payload: { userId: id, typing: value } });
  };

  """, "indicateur Écrit…", marker="lastTypingSent.current = now")
    t = rre(t, r'setNewMessage\(""\);\s*if \(!isValidAuthUserId\(id\) \|\| !isValidAuthUserId\(activeChat\.otherUserId\)\) return;',
        'if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) { alert("Conversation invalide"); return; }\n    setNewMessage("");',
        "validation avant vidage du champ", marker="Conversation invalide")
    t = rep(t,
        'await supabase.from("messages").insert({ conversation_id: activeChat.id, sender_id: id, recipient_id: activeChat.otherUserId, text: up.fileName, type: mimeToMessageType(up.mime), media_url: up.url, media_mime: up.mime, media_size: up.size, file_name: up.fileName });',
        'const { error: insErr } = await supabase.from("messages").insert({ conversation_id: activeChat.id, sender_id: id, recipient_id: activeChat.otherUserId, text: up.fileName, type: mimeToMessageType(up.mime), media_url: up.url, media_mime: up.mime, media_size: up.size, file_name: up.fileName });\n      if (insErr) throw insErr;',
        "erreur d'envoi de fichier", marker="insErr")

    new_rec_call = r"""const startRecording = async () => {
    if (mediaRecorderRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = getBestAudioMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recordChunksRef.current = [];
      recordSecondsRef.current = 0;
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recordTimerRef.current);
        mediaRecorderRef.current = null;
        const seconds = recordSecondsRef.current;
        const blob = new Blob(recordChunksRef.current, { type: rec.mimeType || mime });
        if (blob.size < 500 || seconds < 1) { setRecording(false); setRecordSeconds(0); return; }
        setUploading(true);
        try {
          const up = await uploadVoiceBlob(blob, id, seconds);
          const { error } = await supabase.from("messages").insert({
            conversation_id: activeChat.id, sender_id: id, recipient_id: activeChat.otherUserId,
            text: "Vocal", type: "voice", media_url: up.url, media_mime: up.mime,
            media_size: up.size, media_duration: up.duration,
          });
          if (error) throw error;
        } catch (err) { alert(err.message); }
        finally { setUploading(false); setRecording(false); setRecordSeconds(0); }
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      recordTimerRef.current = setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);
    } catch { alert("Micro non autorisé"); }
  };

  const stopRecording = () => {
    const r = mediaRecorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  };

  const startCall = async (type) => {
    if (!activeChat || !id) return;
    try {
      const roomRes = await createCallRoom({ userName: "Moi", mode: type });
      const roomName = roomRes.roomName || roomRes.daily_room_name;
      if (!roomName || !roomRes.url) throw new Error("Salle non créée : vérifie DAILY_API_KEY et DAILY_DOMAIN sur Vercel");
      const rec = await createCallRecord({ conversationId: activeChat.id, callerId: id, calleeId: activeChat.otherUserId, type, dailyRoomName: roomName });
      if (!rec?.id) throw new Error("Appel non enregistré (table calls ou RLS)");
      const tokenRes = await getCallToken({ roomName, userName: "Moi", isOwner: true });
      setCallState({
        mode: "outgoing", callType: type, callRecord: rec,
        roomUrl: roomRes.url, token: tokenRes.token,
        otherUser: { name: activeChat.otherUserName, avatar: activeChat.otherUserAvatar, flag: activeChat.otherUserFlag },
      });
    } catch (e) {
      console.error(e);
      alert(e.message || "Impossible de démarrer l'appel");
    }
  };

  """
    if "recordSecondsRef.current += 1" in t:
        print("  ~ déjà fait : vocal + appel")
    else:
        a = t.find("const startRecording = async () => {")
        m = re.search(r"useEffect\(\(\) => \{\s*if \(!showNewChat\) return;", t)
        if a < 0 or not m:
            print("  ✗ NON TROUVÉ : vocal + appel")
        else:
            t = t[:a] + new_rec_call + t[m.start():]
            print("  ✓ vocal (1 appui) + appel (ordre corrigé)")

    t = rep(t, "onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}",
        "onClick={recording ? stopRecording : startRecording}", "bouton micro", marker="recording ? stopRecording")
    t = rep(t, '<div className="px-3 py-2 rounded-2xl text-sm" style={{ background: isMe ? C.gold : C.surface2, color: isMe ? "#000" : C.ivory }}>',
        '<div onClick={() => setActionsFor(actionsFor === m.id ? null : m.id)} className="px-3 py-2 rounded-2xl text-sm" style={{ background: isMe ? C.gold : C.surface2, color: isMe ? "#000" : C.ivory }}>',
        "toucher un message", marker="setActionsFor(actionsFor === m.id")
    t = rep(t, 'className="hidden group-hover:flex absolute -top-8 right-0 gap-1 rounded-xl p-1"',
        'className={`${actionsFor === m.id ? "flex" : "hidden"} absolute -top-8 right-0 gap-1 rounded-xl p-1 z-20`}',
        "actions visibles au toucher", marker='actionsFor === m.id ? "flex"')
    t = rep(t, '{c.lastMsg ? c.lastMsg.text : "Nouvelle conversation"}',
        '{!c.lastMsg ? "Nouvelle conversation" : c.lastMsg.type === "voice" ? "🎤 Vocal" : c.lastMsg.type === "image" ? "📷 Photo" : c.lastMsg.type === "video" ? "🎬 Vidéo" : deserializePayload(c.lastMsg.text) ? "🔒 Message chiffré" : c.lastMsg.text}',
        "aperçu sans texte chiffré", marker='"🔒 Message chiffré"')
    t = rep(t, '.select("id, display_name, avatar_url, flag").ilike("display_name", "%" + q + "%")',
        '.select("id, display_name, avatar_url, flag").not("public_key", "is", null).ilike("display_name", "%" + q + "%")',
        "contacts : seulement comptes avec clé", marker='.not("public_key", "is", null)')

    open_effect = r"""useEffect(() => {
    if (!id) return;
    let target = null;
    try {
      target = sessionStorage.getItem("baaro:open_chat_with");
      sessionStorage.removeItem("baaro:open_chat_with");
    } catch {}
    if (!target || !isValidAuthUserId(target)) return;
    (async () => {
      await fetchProfiles([target]);
      const pr = profilesCache.current[target] || {};
      openConversation(target, pr.display_name || "Membre", pr.avatar_url, pr.flag || "🌍");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  """
    t = rep(t, "const handleSend = async (e) => {", open_effect + "const handleSend = async (e) => {",
        "ouvrir la conversation depuis un profil", marker="baaro:open_chat_with")
    write(p, t)

print("\nTerminé. Cherche les lignes ✗ ci-dessus.")
