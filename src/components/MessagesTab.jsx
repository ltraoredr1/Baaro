import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Send, MessageCircle, Plus, X, Search, Users, UserPlus,
  Paperclip, Mic, MicOff, Phone, Video, FileText, Download,
  Check, CheckCheck, Pencil, Trash2, SmilePlus,
} from "lucide-react";
import { COLORS as THEME_COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { getFriends, getFollowing, getFollowers } from "../supabaseClient.js";
import {
  uploadChatFile, uploadVoiceBlob, mimeToMessageType,
  formatFileSize, formatDuration, getBestAudioMime, getReadableUrl,
} from "../lib/chatMedia.js";
import { createCallRoom, createCallRecord, joinCallRoom, updateCallStatus } from "../lib/chatCalls.js";
import { ChatCallModal } from "./ChatCallModal.jsx";

const FALLBACK = {
  bg: "#0B1220", surface: "#111A2C", surface2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)", borderGold: "rgba(217,174,82,0.2)",
  ivory: "#F5F3EF", muted: "rgba(245,243,239,0.5)", gold: "#D9AE52", teal: "#2DBFA6",
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const ONLINE_WINDOW_MS = 70 * 1000;
const HEARTBEAT_MS = 25 * 1000;
const TYPING_IDLE_MS = 3000;
const TYPING_SEND_THROTTLE_MS = 1500;

export function MessagesTab({ id: propId, onOpenProfile }) {
  const C = {...FALLBACK,...(THEME_COLORS||{})};
  const [id, setId] = useState(propId || null);
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
  const [callState, setCallState] = useState(null);
  const [otherLastSeen, setOtherLastSeen] = useState(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [messageReactions, setMessageReactions] = useState({});
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");

  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordStartRef = useRef(null);
  const typingChannelRef = useRef(null);
  const typingClearTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    if (propId) { setId(propId); return; }
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setId(user.id); });
  }, [propId]);

  const fetchProfiles = useCallback(async (ids) => {
    const missing = ids.filter((i) => i &&!profilesCache.current[i]);
    if (missing.length === 0) return profilesCache.current;
    const { data } = await supabase.from("profiles").select("id, display_name, handle, avatar_url, flag").in("id", missing);
    (data||[]).forEach((p) => { profilesCache.current[p.id] = p; });
    return profilesCache.current;
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("conversations").select("id, user1_id, user2_id, created_at").or(`user1_id.eq.${id},user2_id.eq.${id}`).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      const rows = data||[];
      const otherIds = rows.map((c) => c.user1_id===id? c.user2_id : c.user1_id);
      await fetchProfiles(otherIds);
      const enriched = await Promise.all(rows.map(async (c) => {
        const otherId = c.user1_id===id? c.user2_id : c.user1_id;
        const profile = profilesCache.current[otherId] || { display_name: "Membre", flag: "🌍", handle: "membre" };
        const { data: msgs } = await supabase.from("messages").select("text, created_at, sender_id, type, file_name, deleted_at").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1);
        return { id: c.id, otherUserId: otherId, otherUserName: profile.display_name||profile.handle||"Membre", otherUserHandle: profile.handle, otherUserAvatar: profile.avatar_url, otherUserFlag: profile.flag||"🌍", lastMsg: msgs?.[0]||null, created_at: c.created_at };
      }));
      enriched.sort((a,b)=>{ const ta=a.lastMsg?.created_at||a.created_at||""; const tb=b.lastMsg?.created_at||b.created_at||""; return tb.localeCompare(ta); });
      setConversations(enriched);
    } catch (err) { console.error("Erreur conversations:", err); } finally { setLoading(false); }
  }, [id, fetchProfiles]);

  useEffect(() => {
    if (!id) return;
    fetchConversations();
    const channel = supabase.channel("public:messages-list").on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => fetchConversations()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchConversations]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`calls-incoming-${id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${id}` }, async (payload) => {
      const call = payload.new;
      if (call.status!=="ringing") return;
      try {
        if (!profilesCache.current[call.caller_id]) await fetchProfiles([call.caller_id]);
        const p = profilesCache.current[call.caller_id]||{};
        const { token, url } = await joinCallRoom({ roomName: call.daily_room_name, callId: call.id, userName: p.display_name||"BAARO" });
        setCallState({ mode: "incoming", callType: call.type, callRecord: call, roomUrl: url, token, otherUser: { name: p.display_name||"Membre", avatar: p.avatar_url, flag: p.flag||"🌍" }, isCaller: false });
      } catch (e) { console.error("Incoming call error:", e); }
    }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [id, fetchProfiles]);

  useEffect(() => {
    if (!id) return;
    const ping = () => { supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", id).then(()=>{},()=>{}); };
    ping();
    const iv=setInterval(ping, HEARTBEAT_MS);
    const onVisible=()=>{ if(document.visibilityState==="visible") ping(); };
    document.addEventListener("visibilitychange", onVisible);
    return ()=>{ clearInterval(iv); document.removeEventListener("visibilitychange", onVisible); };
  }, [id]);

  useEffect(() => {
    if (!activeChat?.otherUserId) { setOtherLastSeen(null); return; }
    let active=true;
    const fetchLastSeen=async()=>{ const { data }=await supabase.from("profiles").select("last_seen_at").eq("id", activeChat.otherUserId).single(); if(active) setOtherLastSeen(data?.last_seen_at||null); };
    fetchLastSeen();
    const iv=setInterval(fetchLastSeen,20000);
    const channel=supabase.channel(`presence_${activeChat.otherUserId}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"profiles",filter:`id=eq.${activeChat.otherUserId}`},(payload)=>{ if(active) setOtherLastSeen(payload.new.last_seen_at); }).subscribe();
    return ()=>{ active=false; clearInterval(iv); supabase.removeChannel(channel); };
  }, [activeChat?.otherUserId]);

  useEffect(() => {
    if (!activeChat?.id) { typingChannelRef.current=null; return; }
    setIsOtherTyping(false);
    const channel=supabase.channel(`typing_${activeChat.id}`,{config:{broadcast:{self:false}}}).on("broadcast",{event:"typing"},(payload)=>{ if(payload.payload?.userId!==activeChat.otherUserId) return; setIsOtherTyping(true); clearTimeout(typingClearTimeoutRef.current); typingClearTimeoutRef.current=setTimeout(()=>setIsOtherTyping(false),TYPING_IDLE_MS); }).subscribe();
    typingChannelRef.current=channel;
    return ()=>{ supabase.removeChannel(channel); clearTimeout(typingClearTimeoutRef.current); typingChannelRef.current=null; };
  }, [activeChat?.id, activeChat?.otherUserId]);

  const handleTypingInput=(value)=>{ setNewMessage(value); if(!typingChannelRef.current||!id) return; const now=Date.now(); if(now-lastTypingSentRef.current<TYPING_SEND_THROTTLE_MS) return; lastTypingSentRef.current=now; typingChannelRef.current.send({type:"broadcast",event:"typing",payload:{userId:id}}); };

  useEffect(() => {
    if (!activeChat?.id) return;
    const fetchMessages=async()=>{ const { data }=await supabase.from("messages").select("id, text, created_at, sender_id, type, media_url, media_mime, media_size, media_duration, file_name, thumbnail_url, read_at, edited_at, deleted_at").eq("conversation_id", activeChat.id).order("created_at",{ascending:true}).limit(200); if(data) setMessages(data); const { data: reacts }=await supabase.from("message_reactions").select("message_id, user_id, emoji").eq("conversation_id", activeChat.id); const grouped={}; (reacts||[]).forEach((r)=>{ grouped[r.message_id]=grouped[r.message_id]||[]; grouped[r.message_id].push(r); }); setMessageReactions(grouped); };
    fetchMessages();
    const channel=supabase.channel(`room_${activeChat.id}`).on("postgres_changes",{event:"*",schema:"public",table:"messages",filter:`conversation_id=eq.${activeChat.id}`},(payload)=>{ if(payload.eventType==="INSERT") setMessages((prev)=> prev.some(m=>m.id===payload.new.id)? prev : [...prev,payload.new]); else if(payload.eventType==="UPDATE") setMessages((prev)=> prev.map(m=>m.id===payload.new.id? payload.new : m)); else if(payload.eventType==="DELETE") setMessages((prev)=> prev.filter(m=>m.id!==payload.old.id)); }).on("postgres_changes",{event:"*",schema:"public",table:"message_reactions",filter:`conversation_id=eq.${activeChat.id}`},(payload)=>{ setMessageReactions((prev)=>{ const next={...prev}; if(payload.eventType==="INSERT"){ const r=payload.new; next[r.message_id]=[...(next[r.message_id]||[]),r]; } else if(payload.eventType==="DELETE"){ const r=payload.old; next[r.message_id]=(next[r.message_id]||[]).filter(x=>!(x.user_id===r.user_id&&x.emoji===r.emoji)); } return next; }); }).subscribe();
    return ()=>{ supabase.removeChannel(channel); };
  }, [activeChat?.id]);

  useEffect(()=>{ if(!activeChat?.id||!id) return; const unread=messages.filter(m=>m.sender_id!==id&&!m.read_at&&!m.deleted_at); if(unread.length===0) return; const ids=unread.map(m=>m.id); supabase.from("messages").update({read_at:new Date().toISOString()}).in("id",ids).then(()=>{},()=>{}); },[messages,activeChat?.id,id]);
  useEffect(()=>{ if(showChatSearch) return; messagesEndRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,showChatSearch]);

  const loadFriends=useCallback(async()=>{ if(!id) return; setLoadingFriends(true); try{ const [{data:friendIds},{data:followingIds},{data:followerIds}]=await Promise.all([getFriends(),getFollowing(),getFollowers()]); const ids=[...new Set([...(friendIds||[]),...(followingIds||[]),...(followerIds||[])])].filter(uid=>uid&&uid!==id); if(ids.length===0){ setFriends([]); return; } await fetchProfiles(ids); setFriends(ids.map(uid=>{ const p=profilesCache.current[uid]||{}; return { id: uid, display_name:p.display_name||"Membre", handle:p.handle||`@user_${String(uid).slice(0,8)}`, avatar_url:p.avatar_url, flag:p.flag||"🌍", isFriend:(friendIds||[]).includes(uid) }; })); } catch(e){ console.error(e); setFriends([]); } finally{ setLoadingFriends(false); } },[id,fetchProfiles]);
  useEffect(()=>{ if(showNewChat&&pickerTab==="friends") loadFriends(); },[showNewChat,pickerTab,loadFriends]);

  useEffect(()=>{ if(!showNewChat||pickerTab!=="search") return; const q=searchQuery.trim(); if(q.length<2){ setSearchResults([]); return; } const t=setTimeout(async()=>{ setSearching(true); try{ const pattern=`%${q}%`; const {data,error}=await supabase.from("profiles").select("id, display_name, handle, avatar_url, flag").or(`display_name.ilike.${pattern},handle.ilike.${pattern}`).neq("id",id).limit(25); if(error) throw error; setSearchResults(data||[]); } catch(e){ console.error(e); setSearchResults([]); } finally{ setSearching(false); } },300); return()=>clearTimeout(t); },[searchQuery,showNewChat,pickerTab,id]);

  const createOrOpenConversation=async(otherUserId,name,avatar,flag)=>{ if(!id||!otherUserId){ alert("Tu n'es pas connecté"); return; } if(otherUserId===id){ alert("Tu ne peux pas discuter avec toi-même"); return; } const chatData={ otherUserId, otherUserName:name||"Membre", otherUserAvatar:avatar, otherUserFlag:flag||"🌍" }; try{ const {data:existingList,error:findErr}=await supabase.from("conversations").select("id, user1_id, user2_id").or(`and(user1_id.eq.${id},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${id})`).limit(1); if(findErr&&/relation.*conversations.* does not exist/i.test(findErr.message)){ alert("Table conversations absente. Exécute supabase-fix-conversations.sql"); return; } const existing=existingList?.[0]; if(existing){ setActiveChat({id:existing.id,...chatData}); setShowNewChat(false); return; } const u1=id<otherUserId? id : otherUserId; const u2=id<otherUserId? otherUserId : id; const {data:newConv,error}=await supabase.from("conversations").insert({user1_id:u1,user2_id:u2}).select("id").single(); if(error){ if(error.code==="23505"){ const {data:again}=await supabase.from("conversations").select("id").or(`and(user1_id.eq.${u1},user2_id.eq.${u2}),and(user1_id.eq.${u2},user2_id.eq.${u1})`).limit(1); if(again?.[0]){ setActiveChat({id:again[0].id,...chatData}); setShowNewChat(false); return; } } alert("Impossible de créer la conversation\n"+(error.message||error.code)); return; } setActiveChat({id:newConv.id,...chatData}); setShowNewChat(false); fetchConversations(); } catch(e){ console.error(e); alert("Erreur : "+(e.message||String(e))); } };

  const handleSendMessage=async(e)=>{ e?.preventDefault?.(); if(!newMessage.trim()||!activeChat||!id) return; const text=newMessage.trim(); setNewMessage(""); try{ const {error}=await supabase.from("messages").insert({ conversation_id:activeChat.id, sender_id:id, recipient_id:activeChat.otherUserId, text, type:"text" }); if(error) throw error; } catch(err){ console.error("Erreur envoi:",err); setNewMessage(text); } };

  const handleFileSelect=async(e)=>{ const file=e.target?.files?.[0]; try{ e.target.value=""; } catch{} if(!file||!activeChat||!id) return; setUploading(true); try{ const uploaded=await uploadChatFile(file,id); const msgType=mimeToMessageType(uploaded.mime); const {error}=await supabase.from("messages").insert({ conversation_id:activeChat.id, sender_id:id, recipient_id:activeChat.otherUserId, text:uploaded.fileName||"Fichier", type:msgType==="voice"? "audio":msgType, media_url:uploaded.url, media_mime:uploaded.mime, media_size:uploaded.size, file_name:uploaded.fileName }); if(error) throw error; } catch(err){ console.error("Upload fichier:",err); alert("Échec envoi fichier : "+(err?.message||String(err))); } finally{ setUploading(false); } };

  const openFilePicker=()=>{ if(uploading||recording) return; const input=fileInputRef.current; if(!input){ alert("Sélecteur de fichiers indisponible"); return; } input.click(); };

  const startRecording=async()=>{ if(recording) return; try{ const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}); const mime=getBestAudioMime(); const recorder=new MediaRecorder(stream,{mimeType:mime}); recordChunksRef.current=[]; recorder.ondataavailable=(ev)=>{ if(ev.data.size>0) recordChunksRef.current.push(ev.data); }; recorder.onstop=async()=>{ stream.getTracks().forEach(t=>t.stop()); clearInterval(recordTimerRef.current); const duration=Math.round((Date.now()-(recordStartRef.current||Date.now()))/1000); const blob=new Blob(recordChunksRef.current,{type:mime}); if(blob.size<500){ setRecording(false); setRecordSeconds(0); return; } setUploading(true); try{ const uploaded=await uploadVoiceBlob(blob,id,duration); const {error}=await supabase.from("messages").insert({ conversation_id:activeChat.id, sender_id:id, recipient_id:activeChat.otherUserId, text:"🎤 Message vocal", type:"voice", media_url:uploaded.url, media_mime:uploaded.mime, media_size:uploaded.size, media_duration:uploaded.duration, file_name:uploaded.fileName||"voice.m4a" }); if(error) throw error; } catch(err){ console.error(err); alert(err.message||"Échec envoi vocal"); } finally{ setUploading(false); setRecording(false); setRecordSeconds(0); } }; mediaRecorderRef.current=recorder; recordStartRef.current=Date.now(); recorder.start(250); setRecording(true); setRecordSeconds(0); recordTimerRef.current=setInterval(()=>setRecordSeconds(s=>s+1),1000); } catch(err){ console.error(err); alert("Micro inaccessible. Autorise le micro."); } };
  const stopRecording=()=>{ if(mediaRecorderRef.current&&recording) mediaRecorderRef.current.stop(); };

  const startOutgoingCall=async(type="voice")=>{ if(!activeChat||!id) return; try{ const res=await createCallRoom({userName:activeChat.otherUserName||"BAARO"}); const roomName=res.roomName; const url=res.url||res.roomUrl; const token=res.token; if(!roomName||!url||!token) throw new Error("Réponse Daily incomplète. Vérifie DAILY_API_KEY"); let record=null; try{ record=await createCallRecord({ conversationId:activeChat.id, callerId:id, calleeId:activeChat.otherUserId, type, dailyRoomName:roomName }); } catch(dbErr){ console.warn("Table calls absente:",dbErr.message); record={id:null,daily_room_name:roomName}; } setCallState({ mode:"outgoing", callType:type, callRecord:record, roomUrl:url, token, otherUser:{name:activeChat.otherUserName,avatar:activeChat.otherUserAvatar,flag:activeChat.otherUserFlag}, isCaller:true }); } catch(err){ console.error(err); alert("Impossible de démarrer l'appel : "+(err.message||String(err))); } };

  const startEditMessage=(msg)=>{ setReactionPickerFor(null); setEditingMessageId(msg.id); setEditingText(msg.text||""); };
  const cancelEditMessage=()=>{ setEditingMessageId(null); setEditingText(""); };
  const submitEditMessage=async(e)=>{ e?.preventDefault?.(); if(!editingMessageId) return; const text=editingText.trim(); if(!text) return; try{ const {error}=await supabase.from("messages").update({text,edited_at:new Date().toISOString()}).eq("id",editingMessageId).eq("sender_id",id); if(error) throw error; } catch(err){ console.error("Erreur édition:",err); } finally{ setEditingMessageId(null); setEditingText(""); } };
  const deleteMessage=async(msg)=>{ if(!window.confirm("Supprimer ce message?")) return; try{ const {error}=await supabase.from("messages").update({deleted_at:new Date().toISOString(),text:null,media_url:null}).eq("id",msg.id).eq("sender_id",id); if(error) throw error; } catch(err){ console.error("Erreur suppression:",err); } };
  const toggleReaction=async(messageId,emoji)=>{ setReactionPickerFor(null); const already=(messageReactions[messageId]||[]).some(r=>r.user_id===id&&r.emoji===emoji); try{ if(already){ await supabase.from("message_reactions").delete().eq("message_id",messageId).eq("user_id",id).eq("emoji",emoji); } else{ await supabase.from("message_reactions").insert({message_id:messageId,conversation_id:activeChat.id,user_id:id,emoji}); } } catch(err){ console.error("Erreur réaction:",err); } };

  const renderMessageContent=(msg,isMe)=>{ const type=msg.type||"text"; const url=msg.media_url; if((type==="voice"||type==="audio")&&url){ return(<div className="flex flex-col gap-1.5 min-w-[180px]"><audio controls playsInline preload="metadata" src={url} className="w-full max-w-[240px]" style={{minHeight:36}} onError={async(e)=>{ try{ const pathMatch=url.match(/chat-media\/(.+?)(?:\?|$)/); if(pathMatch){ const fresh=await getReadableUrl(decodeURIComponent(pathMatch[1])); if(fresh&&e.currentTarget) e.currentTarget.src=fresh; } } catch{} }} /><div className="flex items-center justify-between gap-2">{msg.media_duration!=null&&<span className={`text-[10px] ${isMe?"text-black/60":"text-gray-400"}`}>🎤 {formatDuration(msg.media_duration)}</span>}<a href={url} target="_blank" rel="noreferrer" download={msg.file_name||"vocal"} className={`text-[10px] underline ${isMe?"text-black/50":"text-gray-400"}`}>Télécharger</a></div></div>); } if(type==="image"&&url){ return(<a href={url} target="_blank" rel="noreferrer"><img src={url} alt={msg.file_name||"image"} className="max-w-[220px] max-h-[280px] rounded-xl object-cover" /></a>); } if(type==="video"&&
