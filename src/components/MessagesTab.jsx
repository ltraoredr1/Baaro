import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Send,
  MessageCircle,
  Plus,
  X,
  Search,
  Users,
  UserPlus,
  Paperclip,
  Mic,
  MicOff,
  Phone,
  Video,
  FileText,
  Download,
  Image as ImageIcon,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import {
  getFriends,
  getFollowing,
  getFollowers,
} from "../supabaseClient.js";
import {
  uploadChatFile,
  uploadVoiceBlob,
  mimeToMessageType,
  formatFileSize,
  formatDuration,
  getBestAudioMime,
  getReadableUrl,
} from "../lib/chatMedia.js";
import {
  createCallRoom,
  createCallRecord,
  joinCallRoom,
  updateCallStatus,
} from "../lib/chatCalls.js";
import { ChatCallModal } from "./ChatCallModal.jsx";

/**
 * Messages + liste d'amis + recherche + vocaux + fichiers + appels
 */
export function MessagesTab({ onRewardPoints, userId: propUserId }) {
  const [currentUserId, setCurrentUserId] = useState(propUserId || null);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [pickerTab, setPickerTab] = useState("friends");
  const [friends, setFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  // Appels
  const [callState, setCallState] = useState(null); // { mode, callType, callRecord, roomUrl, token, otherUser, isCaller }

  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordStartRef = useRef(null);

  useEffect(() => {
    if (propUserId) {
      setCurrentUserId(propUserId);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, [propUserId]);

  const fetchProfiles = useCallback(async (ids) => {
    const missing = ids.filter((id) => id && !profilesCache.current[id]);
    if (missing.length === 0) return profilesCache.current;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, handle, avatar_url, flag")
      .in("user_id", missing);
    (data || []).forEach((p) => {
      profilesCache.current[p.user_id] = p;
    });
    return profilesCache.current;
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, user1_id, user2_id, created_at")
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const rows = data || [];
      const otherIds = rows.map((c) =>
        c.user1_id === currentUserId ? c.user2_id : c.user1_id
      );
      await fetchProfiles(otherIds);

      const enriched = await Promise.all(
        rows.map(async (c) => {
          const otherId =
            c.user1_id === currentUserId ? c.user2_id : c.user1_id;
          const profile = profilesCache.current[otherId] || {
            display_name: "Membre",
            flag: "🌍",
            handle: "membre",
          };
          const { data: msgs } = await supabase
            .from("messages")
            .select("text, created_at, sender_id, type, file_name")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1);
          const lastMsg = msgs?.[0] || null;
          return {
            id: c.id,
            otherUserId: otherId,
            otherUserName: profile.display_name || profile.handle || "Membre",
            otherUserHandle: profile.handle,
            otherUserAvatar: profile.avatar_url,
            otherUserFlag: profile.flag || "🌍",
            lastMsg,
            created_at: c.created_at,
          };
        })
      );

      enriched.sort((a, b) => {
        const ta = a.lastMsg?.created_at || a.created_at || "";
        const tb = b.lastMsg?.created_at || b.created_at || "";
        return tb.localeCompare(ta);
      });

      setConversations(enriched);
    } catch (err) {
      console.error("Erreur conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, fetchProfiles]);

  useEffect(() => {
    if (!currentUserId) return;
    fetchConversations();
    const channel = supabase
      .channel("public:messages-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => fetchConversations()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchConversations]);

  // Écoute appels entrants
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`calls-incoming-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `callee_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const call = payload.new;
          if (call.status !== "ringing") return;
          // Récupérer token + room
          try {
            const profile = profilesCache.current[call.caller_id] || {};
            if (!profilesCache.current[call.caller_id]) {
              await fetchProfiles([call.caller_id]);
            }
            const p = profilesCache.current[call.caller_id] || profile;
            const { token, url } = await joinCallRoom({
              roomName: call.daily_room_name,
              callId: call.id,
              userName: p.display_name || "BAARO",
            });
            setCallState({
              mode: "incoming",
              callType: call.type,
              callRecord: call,
              roomUrl: url,
              token,
              otherUser: {
                name: p.display_name || "Membre",
                avatar: p.avatar_url,
                flag: p.flag || "🌍",
              },
              isCaller: false,
            });
          } catch (e) {
            console.error("Incoming call error:", e);
          }
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [currentUserId, fetchProfiles]);

  useEffect(() => {
    if (!activeChat?.id) return;
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, text, created_at, sender_id, type, media_url, media_mime, media_size, media_duration, file_name, thumbnail_url"
        )
        .eq("conversation_id", activeChat.id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!error) setMessages(data || []);
    };
    fetchMessages();
    const channel = supabase
      .channel(`room_${activeChat.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeChat.id}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ---- Amis ----
  const loadFriends = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingFriends(true);
    try {
      const [{ data: friendIds }, { data: followingIds }, { data: followerIds }] =
        await Promise.all([getFriends(), getFollowing(), getFollowers()]);

      const ids = [
        ...new Set([
          ...(friendIds || []),
          ...(followingIds || []),
          ...(followerIds || []),
        ]),
      ].filter((id) => id && id !== currentUserId);

      if (ids.length === 0) {
        setFriends([]);
        return;
      }

      await fetchProfiles(ids);
      setFriends(
        ids.map((id) => {
          const p = profilesCache.current[id] || {};
          return {
            user_id: id,
            display_name: p.display_name || "Membre",
            handle: p.handle || `@user_${String(id).slice(0, 8)}`,
            avatar_url: p.avatar_url,
            flag: p.flag || "🌍",
            isFriend: (friendIds || []).includes(id),
          };
        })
      );
    } catch (e) {
      console.error(e);
      setFriends([]);
    } finally {
      setLoadingFriends(false);
    }
  }, [currentUserId, fetchProfiles]);

  useEffect(() => {
    if (showNewChat && pickerTab === "friends") loadFriends();
  }, [showNewChat, pickerTab, loadFriends]);

  // ---- Recherche membres ----
  useEffect(() => {
    if (!showNewChat || pickerTab !== "search") return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const pattern = `%${q}%`;
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, avatar_url, flag")
          .or(`display_name.ilike.${pattern},handle.ilike.${pattern}`)
          .neq("user_id", currentUserId)
          .limit(25);
        if (error) throw error;
        setSearchResults(data || []);
      } catch (e) {
        console.error(e);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, showNewChat, pickerTab, currentUserId]);

  const createOrOpenConversation = async (otherUserId, name, avatar, flag) => {
    if (!currentUserId || !otherUserId) {
      alert("Tu n'es pas connecté");
      return;
    }
    if (otherUserId === currentUserId) {
      alert("Tu ne peux pas discuter avec toi-même");
      return;
    }

    const chatData = {
      otherUserId,
      otherUserName: name || "Membre",
      otherUserAvatar: avatar,
      otherUserFlag: flag || "🌍",
    };

    try {
      const { data: existingList, error: findErr } = await supabase
        .from("conversations")
        .select("id, user1_id, user2_id")
        .or(
          `and(user1_id.eq.${currentUserId},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${currentUserId})`
        )
        .limit(1);

      if (findErr) {
        console.error("find conversation:", findErr);
        if (/relation .*conversations.* does not exist/i.test(findErr.message)) {
          alert(
            "Table conversations absente. Exécute supabase-fix-conversations.sql dans Supabase."
          );
          return;
        }
      }

      const existing = existingList?.[0];
      if (existing) {
        setActiveChat({ id: existing.id, ...chatData });
        setShowNewChat(false);
        return;
      }

      const u1 = currentUserId < otherUserId ? currentUserId : otherUserId;
      const u2 = currentUserId < otherUserId ? otherUserId : currentUserId;

      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({ user1_id: u1, user2_id: u2 })
        .select("id")
        .single();

      if (error) {
        console.error("create conversation:", error);
        if (error.code === "23505") {
          const { data: again } = await supabase
            .from("conversations")
            .select("id")
            .or(
              `and(user1_id.eq.${u1},user2_id.eq.${u2}),and(user1_id.eq.${u2},user2_id.eq.${u1})`
            )
            .limit(1);
          if (again?.[0]) {
            setActiveChat({ id: again[0].id, ...chatData });
            setShowNewChat(false);
            return;
          }
        }
        alert(
          "Impossible de créer la conversation\n\n" +
            (error.message || error.code || "Erreur inconnue")
        );
        return;
      }

      setActiveChat({ id: newConv.id, ...chatData });
      setShowNewChat(false);
      fetchConversations();
    } catch (e) {
      console.error(e);
      alert("Erreur : " + (e.message || String(e)));
    }
  };

  // ---- Envoi texte ----
  const handleSendMessage = async (e) => {
    e?.preventDefault?.();
    if (!newMessage.trim() || !activeChat || !currentUserId) return;
    const text = newMessage.trim();
    setNewMessage("");
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: activeChat.id,
        sender_id: currentUserId,
        recipient_id: activeChat.otherUserId,
        text,
        type: "text",
      });
      if (error) throw error;
    } catch (err) {
      console.error("Erreur envoi:", err);
      setNewMessage(text);
    }
  };

  // ---- Envoi fichier ----
  const handleFileSelect = async (e) => {
    const files = e.target?.files;
    const file = files?.[0];
    // Reset pour pouvoir resélectionner le même fichier
    try {
      e.target.value = "";
    } catch (_) {}

    if (!file) {
      console.warn("Aucun fichier sélectionné");
      return;
    }
    if (!activeChat) {
      alert("Ouvre une conversation d'abord");
      return;
    }
    if (!currentUserId) {
      alert("Tu n'es pas connecté");
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadChatFile(file, currentUserId);
      const msgType = mimeToMessageType(uploaded.mime);

      const { error } = await supabase.from("messages").insert({
        conversation_id: activeChat.id,
        sender_id: currentUserId,
        recipient_id: activeChat.otherUserId,
        text: uploaded.fileName || "Fichier",
        type: msgType === "voice" ? "audio" : msgType,
        media_url: uploaded.url,
        media_mime: uploaded.mime,
        media_size: uploaded.size,
        file_name: uploaded.fileName,
      });
      if (error) throw error;
    } catch (err) {
      console.error("Upload fichier:", err);
      alert(
        "Échec envoi fichier :\n" +
          (err?.message || String(err)) +
          "\n\nVérifie le bucket chat-media et les policies Storage."
      );
    } finally {
      setUploading(false);
    }
  };

  const openFilePicker = () => {
    if (uploading || recording) return;
    const input = fileInputRef.current;
    if (!input) {
      alert("Sélecteur de fichiers indisponible");
      return;
    }
    // Astuce mobile : certains navigateurs ignorent .click() sur input hidden
    input.style.display = "block";
    input.style.position = "fixed";
    input.style.left = "0";
    input.style.top = "0";
    input.style.opacity = "0.01";
    input.style.width = "1px";
    input.style.height = "1px";
    input.style.zIndex = "9999";
    try {
      input.click();
    } catch (err) {
      console.error(err);
      alert("Impossible d'ouvrir le sélecteur de fichiers");
    }
    setTimeout(() => {
      if (input) {
        input.style.display = "none";
        input.style.opacity = "";
        input.style.position = "";
      }
    }, 1000);
  };

  // ---- Message vocal ----
  const startRecording = async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const mime = getBestAudioMime();
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recordChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recordTimerRef.current);
        const duration = Math.round(
          (Date.now() - (recordStartRef.current || Date.now())) / 1000
        );
        const blob = new Blob(recordChunksRef.current, { type: mime });
        if (blob.size < 500) {
          setRecording(false);
          setRecordSeconds(0);
          return;
        }
        setUploading(true);
        try {
          const uploaded = await uploadVoiceBlob(blob, currentUserId, duration);
          const { error } = await supabase.from("messages").insert({
            conversation_id: activeChat.id,
            sender_id: currentUserId,
            recipient_id: activeChat.otherUserId,
            text: "🎤 Message vocal",
            type: "voice",
            media_url: uploaded.url,
            media_mime: uploaded.mime,
            media_size: uploaded.size,
            media_duration: uploaded.duration,
            file_name: uploaded.fileName || "voice.m4a",
          });
          if (error) throw error;
        } catch (err) {
          console.error(err);
          alert(err.message || "Échec envoi vocal");
        } finally {
          setUploading(false);
          setRecording(false);
          setRecordSeconds(0);
        }
      };
      mediaRecorderRef.current = recorder;
      recordStartRef.current = Date.now();
      recorder.start(250);
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error(err);
      alert(
        "Micro inaccessible. Autorise le micro dans les paramètres du navigateur / de l'app."
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
    }
  };

  // ---- Appels ----
  const startOutgoingCall = async (type = "voice") => {
    if (!activeChat || !currentUserId) return;
    try {
      const res = await createCallRoom({
        userName: activeChat.otherUserName || "BAARO",
      });
      const roomName = res.roomName;
      const url = res.url || res.roomUrl;
      const token = res.token;
      if (!roomName || !url || !token) {
        throw new Error(
          "Réponse Daily incomplète. Vérifie DAILY_API_KEY et DAILY_DOMAIN sur Vercel."
        );
      }
      let record = null;
      try {
        record = await createCallRecord({
          conversationId: activeChat.id,
          callerId: currentUserId,
          calleeId: activeChat.otherUserId,
          type,
          dailyRoomName: roomName,
        });
      } catch (dbErr) {
        console.warn("Table calls absente ou RLS :", dbErr.message);
        // On continue quand même l'appel même si l'historique échoue
        record = { id: null, daily_room_name: roomName };
      }
      setCallState({
        mode: "outgoing",
        callType: type,
        callRecord: record,
        roomUrl: url,
        token,
        otherUser: {
          name: activeChat.otherUserName,
          avatar: activeChat.otherUserAvatar,
          flag: activeChat.otherUserFlag,
        },
        isCaller: true,
      });
    } catch (err) {
      console.error(err);
      const msg = err.message || String(err);
      if (/DAILY_API_KEY/i.test(msg) || /non configurés/i.test(msg)) {
        alert(
          "Appels non configurés.\n\nAjoute DAILY_API_KEY (et DAILY_DOMAIN) dans les variables d'environnement Vercel, puis redéploie."
        );
      } else {
        alert("Impossible de démarrer l'appel :\n" + msg);
      }
    }
  };

  // ---- Rendu d'un message ----
  const renderMessageContent = (msg, isMe) => {
    const type = msg.type || "text";
    const url = msg.media_url;

    if ((type === "voice" || type === "audio") && url) {
      return (
        <div className="flex flex-col gap-1.5 min-w-[180px]">
          <audio
            controls
            playsInline
            preload="metadata"
            src={url}
            className="w-full max-w-[240px]"
            style={{ minHeight: 36 }}
            onError={async (e) => {
              // Tente de régénérer une signed URL si lecture échoue
              try {
                const pathMatch = url.match(/chat-media\/(.+?)(?:\?|$)/);
                if (pathMatch) {
                  const fresh = await getReadableUrl(decodeURIComponent(pathMatch[1]));
                  if (fresh && e.currentTarget) e.currentTarget.src = fresh;
                }
              } catch (_) {}
            }}
          />
          <div className="flex items-center justify-between gap-2">
            {msg.media_duration != null && (
              <span className={`text-[10px] ${isMe ? "text-black/60" : "text-gray-400"}`}>
                🎤 {formatDuration(msg.media_duration)}
              </span>
            )}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              download={msg.file_name || "vocal"}
              className={`text-[10px] underline ${isMe ? "text-black/50" : "text-gray-400"}`}
            >
              Télécharger
            </a>
          </div>
        </div>
      );
    }

    if (type === "image" && url) {
      return (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={msg.file_name || "image"}
            className="max-w-[220px] max-h-[280px] rounded-xl object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </a>
      );
    }

    if (type === "video" && url) {
      return (
        <video
          controls
          playsInline
          src={url}
          className="max-w-[240px] max-h-[280px] rounded-xl"
          preload="metadata"
        />
      );
    }

    if (type === "file" && url) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          download={msg.file_name}
          className="flex items-center gap-2 underline-offset-2 hover:underline"
        >
          <FileText size={18} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[160px]">
              {msg.file_name || "Fichier"}
            </p>
            {msg.media_size != null && (
              <p className={`text-[10px] ${isMe ? "text-black/60" : "text-gray-400"}`}>
                {formatFileSize(msg.media_size)}
              </p>
            )}
          </div>
          <Download size={14} />
        </a>
      );
    }

    return <p className="whitespace-pre-wrap break-words">{msg.text}</p>;
  };

  const renderUserRow = (user, badge) => (
    <button
      key={user.user_id}
      type="button"
      onClick={() =>
        createOrOpenConversation(
          user.user_id,
          user.display_name,
          user.avatar_url,
          user.flag
        )
      }
      className="w-full p-3 rounded-2xl border text-left hover:border-amber-400/50 transition flex items-center gap-3"
      style={{ background: COLORS.surface, borderColor: COLORS.border }}
    >
      <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center overflow-hidden text-lg shrink-0">
        {user.avatar_url ? (
          <img src={user.avatar_url} className="w-full h-full object-cover" alt="" />
        ) : (
          user.flag || "🌍"
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate" style={{ color: COLORS.ivory }}>
          {user.display_name || "Membre"}
        </p>
        <p className="text-xs truncate" style={{ color: COLORS.muted }}>
          {user.handle || ""}
        </p>
      </div>
      {badge && (
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0"
          style={{ background: "rgba(217,174,82,0.2)", color: COLORS.gold }}
        >
          {badge}
        </span>
      )}
      <MessageCircle size={16} style={{ color: COLORS.gold }} />
    </button>
  );

  // --- Nouvelle conversation ---
  if (showNewChat) {
    return (
      <div
        className="flex flex-col h-full max-w-2xl mx-auto w-full"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-lg font-bold" style={{ color: COLORS.ivory }}>
            Nouvelle conversation
          </h2>
          <button
            onClick={() => setShowNewChat(false)}
            className="p-2 rounded-full hover:bg-white/10"
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setPickerTab("friends")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border"
            style={{
              background:
                pickerTab === "friends" ? "rgba(217,174,82,0.2)" : "rgba(255,255,255,0.03)",
              borderColor: pickerTab === "friends" ? COLORS.borderGold : COLORS.border,
              color: pickerTab === "friends" ? COLORS.gold : COLORS.muted,
            }}
          >
            <Users size={16} />
            Amis
          </button>
          <button
            onClick={() => setPickerTab("search")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border"
            style={{
              background:
                pickerTab === "search" ? "rgba(217,174,82,0.2)" : "rgba(255,255,255,0.03)",
              borderColor: pickerTab === "search" ? COLORS.borderGold : COLORS.border,
              color: pickerTab === "search" ? COLORS.gold : COLORS.muted,
            }}
          >
            <Search size={16} />
            Recherche
          </button>
        </div>

        {pickerTab === "search" && (
          <div className="relative mb-4">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: COLORS.muted }}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nom ou @handle…"
              className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
              autoFocus
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2">
          {pickerTab === "friends" && (
            <>
              {loadingFriends && (
                <p className="text-center text-sm py-8" style={{ color: COLORS.muted }}>
                  Chargement des amis…
                </p>
              )}
              {!loadingFriends && friends.length === 0 && (
                <div className="text-center py-12" style={{ color: COLORS.muted }}>
                  <UserPlus size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm mb-1">Aucun ami pour l’instant</p>
                  <p className="text-xs opacity-70">
                    Suis des membres dans Communauté, ou utilise Recherche
                  </p>
                </div>
              )}
              {friends.map((u) => renderUserRow(u, u.isFriend ? "Ami" : "Suivi"))}
            </>
          )}

          {pickerTab === "search" && (
            <>
              {searchQuery.trim().length < 2 && (
                <p className="text-center text-sm py-8" style={{ color: COLORS.muted }}>
                  Tape au moins 2 caractères
                </p>
              )}
              {searching && (
                <p className="text-center text-sm py-4" style={{ color: COLORS.muted }}>
                  Recherche…
                </p>
              )}
              {!searching &&
                searchQuery.trim().length >= 2 &&
                searchResults.length === 0 && (
                  <p className="text-center text-sm py-8" style={{ color: COLORS.muted }}>
                    Aucun membre trouvé
                  </p>
                )}
              {searchResults.map((u) => renderUserRow(u))}
            </>
          )}
        </div>
      </div>
    );
  }

  // --- Conversation active ---
  if (activeChat) {
    return (
      <>
        {callState && (
          <ChatCallModal
            mode={callState.mode}
            callType={callState.callType}
            callRecord={callState.callRecord}
            roomUrl={callState.roomUrl}
            token={callState.token}
            otherUser={callState.otherUser}
            isCaller={callState.isCaller}
            onClose={() => setCallState(null)}
          />
        )}

        <div
          className="flex flex-col max-w-2xl mx-auto w-full"
          style={{ height: "calc(100dvh - 130px)", maxHeight: "calc(100dvh - 130px)" }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 p-3 border-b"
            style={{ borderColor: COLORS.border }}
          >
            <button
              onClick={() => {
                setActiveChat(null);
                setMessages([]);
                fetchConversations();
              }}
              className="p-2 rounded-full hover:bg-white/10"
              style={{ color: COLORS.ivory }}
            >
              <ArrowLeft size={20} />
            </button>
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden text-sm">
              {activeChat.otherUserAvatar ? (
                <img
                  src={activeChat.otherUserAvatar}
                  className="w-full h-full object-cover"
                  alt=""
                />
              ) : (
                activeChat.otherUserFlag || "🌍"
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm truncate" style={{ color: COLORS.ivory }}>
                {activeChat.otherUserName}
              </p>
            </div>
            {/* Boutons appel */}
            <button
              onClick={() => startOutgoingCall("voice")}
              className="p-2 rounded-full hover:bg-white/10"
              style={{ color: COLORS.teal }}
              title="Appel vocal"
            >
              <Phone size={18} />
            </button>
            <button
              onClick={() => startOutgoingCall("video")}
              className="p-2 rounded-full hover:bg-white/10"
              style={{ color: COLORS.gold }}
              title="Appel vidéo"
            >
              <Video size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.length === 0 && (
              <p className="text-center text-sm py-10" style={{ color: COLORS.muted }}>
                Début de la conversation — dis bonjour 👋
              </p>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_id === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-2.5 rounded-2xl text-sm ${
                      isMe ? "rounded-tr-sm" : "rounded-tl-sm"
                    }`}
                    style={{
                      background: isMe ? COLORS.gold : COLORS.surface2,
                      color: isMe ? "#000" : COLORS.ivory,
                    }}
                  >
                    {renderMessageContent(msg, isMe)}
                    <p
                      className={`text-[10px] mt-1 ${
                        isMe ? "text-black/60" : "text-gray-400"
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Barre d'envoi */}
          <div
            className="p-3 border-t shrink-0"
            style={{
              borderColor: COLORS.border,
              paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
              background: COLORS.bg || "#0B1220",
            }}
          >
            {recording && (
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-bold animate-pulse" style={{ color: "#EF4444" }}>
                  ● Enregistrement {formatDuration(recordSeconds)}
                </span>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="text-xs font-bold px-3 py-1 rounded-full"
                  style={{ background: "#EF4444", color: "#fff" }}
                >
                  Envoyer
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv"
                onChange={handleFileSelect}
                style={{
                  display: "none",
                  position: "absolute",
                  width: 1,
                  height: 1,
                  opacity: 0,
                }}
              />
              <button
                type="button"
                onClick={openFilePicker}
                disabled={uploading || recording}
                className="p-2.5 rounded-xl border disabled:opacity-40 relative"
                style={{
                  borderColor: COLORS.border,
                  color: uploading ? COLORS.gold : COLORS.muted,
                }}
                title="Joindre un fichier"
              >
                {uploading ? (
                  <span className="text-[10px] font-bold animate-pulse">…</span>
                ) : (
                  <Paperclip size={18} />
                )}
              </button>

              <button
                type="button"
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={uploading}
                className="p-2.5 rounded-xl border disabled:opacity-40"
                style={{
                  borderColor: recording ? "#EF4444" : COLORS.border,
                  color: recording ? "#EF4444" : COLORS.muted,
                  background: recording ? "rgba(239,68,68,0.15)" : "transparent",
                }}
                title="Maintenir pour enregistrer un vocal"
              >
                {recording ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={uploading ? "Envoi…" : "Votre message…"}
                disabled={uploading || recording}
                className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none disabled:opacity-50"
                style={{
                  background: COLORS.surface2,
                  borderColor: COLORS.border,
                  color: COLORS.ivory,
                }}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || uploading || recording}
                className="p-3 rounded-xl disabled:opacity-50"
                style={{ background: COLORS.gold, color: "#000" }}
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // --- Liste des conversations ---
  return (
    <>
      {callState && (
        <ChatCallModal
          mode={callState.mode}
          callType={callState.callType}
          callRecord={callState.callRecord}
          roomUrl={callState.roomUrl}
          token={callState.token}
          otherUser={callState.otherUser}
          isCaller={callState.isCaller}
          onClose={() => setCallState(null)}
        />
      )}

      <div
        className="flex flex-col h-full max-w-2xl mx-auto w-full p-4"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-xl font-bold flex items-center gap-2"
            style={{ color: COLORS.ivory }}
          >
            <MessageCircle size={24} style={{ color: COLORS.gold }} />
            Messages
          </h2>
          <button
            onClick={() => {
              setShowNewChat(true);
              setPickerTab("friends");
              setSearchQuery("");
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold"
            style={{ background: "rgba(217,174,82,0.2)", color: COLORS.gold }}
          >
            <Plus size={16} />
            Nouveau
          </button>
        </div>

        <button
          onClick={() => {
            setShowNewChat(true);
            setPickerTab("friends");
          }}
          className="mb-4 w-full flex items-center gap-3 p-3 rounded-2xl border text-left"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: COLORS.border }}
        >
          <Users size={18} style={{ color: COLORS.gold }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: COLORS.ivory }}>
              Écrire à un ami
            </p>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Liste d’amis ou recherche par nom / @handle
            </p>
          </div>
        </button>

        {loading && (
          <p className="text-center py-10 text-sm" style={{ color: COLORS.muted }}>
            Chargement…
          </p>
        )}

        {!loading && conversations.length === 0 && (
          <div className="text-center py-16" style={{ color: COLORS.muted }}>
            <MessageCircle size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-2">Aucune conversation</p>
            <button
              onClick={() => setShowNewChat(true)}
              className="text-sm font-bold"
              style={{ color: COLORS.gold }}
            >
              Commencer un chat
            </button>
          </div>
        )}

        <div className="space-y-2">
          {conversations.map((c) => {
            let preview = "Nouvelle conversation";
            if (c.lastMsg) {
              if (c.lastMsg.type === "voice") preview = "🎤 Message vocal";
              else if (c.lastMsg.type === "image") preview = "📷 Photo";
              else if (c.lastMsg.type === "video") preview = "🎬 Vidéo";
              else if (c.lastMsg.type === "file") preview = `📎 ${c.lastMsg.file_name || "Fichier"}`;
              else preview = c.lastMsg.text || preview;
            }
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveChat(c)}
                className="w-full p-3 rounded-2xl border text-left hover:border-amber-400/40 transition flex items-center gap-3"
                style={{ background: COLORS.surface, borderColor: COLORS.border }}
              >
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center overflow-hidden text-lg shrink-0">
                  {c.otherUserAvatar ? (
                    <img
                      src={c.otherUserAvatar}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  ) : (
                    c.otherUserFlag
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate" style={{ color: COLORS.ivory }}>
                    {c.otherUserName}
                  </p>
                  <p className="text-xs truncate" style={{ color: COLORS.muted }}>
                    {preview}
                  </p>
                </div>
                {c.lastMsg?.created_at && (
                  <span className="text-[10px] shrink-0" style={{ color: COLORS.muted }}>
                    {new Date(c.lastMsg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
