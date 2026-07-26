import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseClient.js";
import { API_BASE } from "./config.js";
import { Heart, MessageCircle, Share2, Wallet, Send, Sparkles, Globe2, ArrowUpRight, Play, Users, UserPlus, TrendingUp, Check, Lock, ShieldCheck, Coins, ArrowRightLeft, AlertTriangle, Settings, Bell, Moon, LogOut, ChevronRight, Languages, Vote, Menu, X, HelpCircle, Radio, Smartphone, Bookmark, Music2, Volume2, BadgeCheck, Briefcase, FileText, Copy, BarChart3, Clock, PlusCircle, Search, Flag, UserX, Download, Trash2, ShieldAlert, WifiOff, Swords, Plus, MessageSquare, ArrowRight, LogIn, ChevronDown, Zap, Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { isNearbyAvailable, startNearby, stopNearby, sendNearbyMessage, onNearbyEvent } from "./nearby.js";
import { useMessaging } from "./hooks/useMessaging.js";
import { useDebates } from "./hooks/useDebates.js";
import { createLiveSession, getLocalMedia } from "./lib/webrtc.js";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { TurnstileWidget } from "./Turnstile.jsx";
import { COLORS } from "./theme.js";
import {
  useSession,
  useWallet,
  useCrypto,
  usePosts,
  useVideos,
  useFollowers,
  useGovernance,
  useNotifications,
  useStories,
} from "./hooks/dataHooks.js";

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" },
  { code: "de", label: "Deutsch" },
  { code: "sw", label: "Kiswahili" },
  { code: "bn", label: "বাংলা" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ko", label: "한국어" },
];

const I18N = {
  fr: { feed: "Fil", videos: "Vidéos", messages: "Messages", wallet: "Portefeuille", crypto: "Crypto", profits: "Profits", followers: "Abonnés", subscription: "Abonnement", assistant: "Assistant IA", settings: "Paramètres", pts: "pts", translate: "Traduire", translating: "Traduction…", language: "Langue" },
  en: { feed: "Feed", videos: "Videos", messages: "Messages", wallet: "Wallet", crypto: "Crypto", profits: "Earnings", followers: "Followers", subscription: "Subscription", assistant: "AI Assistant", settings: "Settings", pts: "pts", translate: "Translate", translating: "Translating…", language: "Language" },
  es: { feed: "Inicio", videos: "Vídeos", messages: "Mensajes", wallet: "Cartera", crypto: "Cripto", profits: "Ganancias", followers: "Seguidores", subscription: "Suscripción", assistant: "Asistente IA", settings: "Ajustes", pts: "pts", translate: "Traducir", translating: "Traduciendo…", language: "Idioma" },
  zh: { feed: "动态", videos: "视频", messages: "消息", wallet: "钱包", crypto: "加密货币", profits: "收益", followers: "粉丝", subscription: "订阅", assistant: "AI 助手", settings: "设置", pts: "积分", translate: "翻译", translating: "翻译中…", language: "语言" },
  hi: { feed: "फ़ीड", videos: "वीडियो", messages: "संदेश", wallet: "वॉलेट", crypto: "क्रिप्टो", profits: "कमाई", followers: "फॉलोअर्स", subscription: "सदस्यता", assistant: "एआई सहायक", settings: "सेटिंग्स", pts: "अंक", translate: "अनुवाद करें", translating: "अनुवाद हो रहा है…", language: "भाषा" },
  ar: { feed: "الخلاصة", videos: "الفيديوهات", messages: "الرسائل", wallet: "المحفظة", crypto: "العملات الرقمية", profits: "الأرباح", followers: "المتابعون", subscription: "الاشتراك", assistant: "المساعد الذكي", settings: "الإعدادات", pts: "نقطة", translate: "ترجمة", translating: "جارٍ الترجمة…", language: "اللغة" },
  pt: { feed: "Feed", videos: "Vídeos", messages: "Mensagens", wallet: "Carteira", crypto: "Cripto", profits: "Ganhos", followers: "Seguidores", subscription: "Assinatura", assistant: "Assistente IA", settings: "Ajustes", pts: "pts", translate: "Traduzir", translating: "Traduzindo…", language: "Idioma" },
  ru: { feed: "Лента", videos: "Видео", messages: "Сообщения", wallet: "Кошелёк", crypto: "Крипто", profits: "Доход", followers: "Подписчики", subscription: "Подписка", assistant: "ИИ-ассистент", settings: "Настройки", pts: "очков", translate: "Перевести", translating: "Перевод…", language: "Язык" },
  ja: { feed: "フィード", videos: "動画", messages: "メッセージ", wallet: "ウォレット", crypto: "暗号資産", profits: "収益", followers: "フォロワー", subscription: "サブスク", assistant: "AIアシスタント", settings: "設定", pts: "pt", translate: "翻訳", translating: "翻訳中…", language: "言語" },
  de: { feed: "Feed", videos: "Videos", messages: "Nachrichten", wallet: "Wallet", crypto: "Krypto", profits: "Einnahmen", followers: "Follower", subscription: "Abo", assistant: "KI-Assistent", settings: "Einstellungen", pts: "Pkt.", translate: "Übersetzen", translating: "Übersetzen…", language: "Sprache" },
  sw: { feed: "Mlisho", videos: "Video", messages: "Ujumbe", wallet: "Pochi", crypto: "Sarafu ya Kripto", profits: "Mapato", followers: "Wafuasi", subscription: "Usajili", assistant: "Msaidizi wa AI", settings: "Mipangilio", pts: "pointi", translate: "Tafsiri", translating: "Inatafsiri…", language: "Lugha" },
  bn: { feed: "ফিড", videos: "ভিডিও", messages: "বার্তা", wallet: "ওয়ালেট", crypto: "ক্রিপ্টো", profits: "আয়", followers: "অনুসারী", subscription: "সাবস্ক্রিপশন", assistant: "এআই সহকারী", settings: "সেটিংস", pts: "পয়েন্ট", translate: "অনুবাদ করুন", translating: "অনুবাদ হচ্ছে…", language: "ভাষা" },
  id: { feed: "Beranda", videos: "Video", messages: "Pesan", wallet: "Dompet", crypto: "Kripto", profits: "Penghasilan", followers: "Pengikut", subscription: "Langganan", assistant: "Asisten AI", settings: "Pengaturan", pts: "poin", translate: "Terjemahkan", translating: "Menerjemahkan…", language: "Bahasa" },
  ko: { feed: "피드", videos: "동영상", messages: "메시지", wallet: "지갑", crypto: "암호화폐", profits: "수익", followers: "팔로워", subscription: "구독", assistant: "AI 어시스턴트", settings: "설정", pts: "포인트", translate: "번역", translating: "번역 중…", language: "언어" },
};

function t(lang, key) {
  return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}

const TICKER_EVENTS = [
  "🇰🇷 Séoul — +12 pts pour une publication engageante",
  "🇧🇷 São Paulo — +8 pts pour un commentaire utile",
  "🇩🇪 Berlin — +20 pts pour un parrainage validé",
  "🇮🇳 Mumbai — +15 pts pour une vidéo partagée 340 fois",
  "🇺🇸 Austin — +6 pts pour une interaction avec l'assistant IA",
  "🇰🇪 Nairobi — +18 pts pour un contenu certifié qualité",
  "🇯🇵 Osaka — +10 pts pour une série de 7 jours actifs",
];

const EARN_RULES = [
  { label: "Publication engageante", pts: "5–20 pts" },
  { label: "Like reçu", pts: "0.2 pt" },
  { label: "Commentaire pertinent reçu", pts: "1 pt" },
  { label: "Parrainage validé", pts: "20 pts" },
  { label: "Série d'activité (7 jours)", pts: "10 pts" },
  { label: "Question posée à l'assistant IA", pts: "0.5 pt" },
];

const PROFIT_HISTORY = [
  { month: "Fév", revenue: 210 },
  { month: "Mar", revenue: 340 },
  { month: "Avr", revenue: 295 },
  { month: "Mai", revenue: 410 },
  { month: "Juin", revenue: 480 },
  { month: "Juil", revenue: 560 },
];

const PROFIT_SOURCES = [
  { label: "Points convertis en récompenses", amount: 218 },
  { label: "Part publicitaire sur vos vidéos", amount: 195 },
  { label: "Abonnements de vos abonnés", amount: 147 },
];

const SUBSCRIPTION_TIERS = [
  { id: "free", name: "Découverte", price: "Gratuit", features: ["Fil et interactions de base", "Gain de points standard", "Accès limité à l'assistant IA"] },
  { id: "plus", name: "Plus", price: "4,99 €/mois", features: ["Points x1.5 sur toutes les actions", "Assistant IA illimité", "Badge visible sur le profil"] },
  { id: "pro", name: "Créateur Pro", price: "14,99 €/mois", features: ["Part publicitaire prioritaire sur vos vidéos", "Statistiques avancées de profit", "Support dédié et boosts hebdomadaires offerts"] },
];

const BARO_PRICE_HISTORY = [
  { t: "J-6", price: 0.82 },
  { t: "J-5", price: 0.88 },
  { t: "J-4", price: 0.85 },
  { t: "J-3", price: 0.94 },
  { t: "J-2", price: 1.02 },
  { t: "J-1", price: 0.98 },
  { t: "Auj.", price: 1.06 },
];

const POINTS_PER_BARO = 100; // 100 points = 1 BARO

function Ticker() {
  return (
    <div className="overflow-hidden border-y" style={{ borderColor: "rgba(212,169,62,0.2)", background: COLORS.surface }}>
      <div className="flex whitespace-nowrap py-2 animate-[scroll_32s_linear_infinite]" style={{ animation: "meridian-scroll 32s linear infinite" }}>
        {[...TICKER_EVENTS, ...TICKER_EVENTS].map((t, i) => (
          <span key={i} className="mx-6 text-xs tracking-wide" style={{ color: COLORS.muted, fontFamily: "'IBM Plex Mono', monospace" }}>
            {t}
          </span>
        ))}
      </div>
      <style>{`@keyframes meridian-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

function ProfileModal({ authorId, userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [authorPosts, setAuthorPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionDone, setActionDone] = useState(null);

  useEffect(() => {
    if (!authorId) return;
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: posts }] = await Promise.all([
        supabase.from("profiles").select("display_name, flag, handle, bio, created_at").eq("user_id", authorId).single(),
        supabase.from("posts").select("id, text, created_at").eq("author_id", authorId).order("created_at", { ascending: false }).limit(10),
      ]);
      setProfile(p);
      setAuthorPosts(posts || []);
      setLoading(false);
    })();
  }, [authorId]);

  const report = async () => {
    if (!userId) return;
    await supabase.from("reports").insert({ reporter_id: userId, target_type: "user", target_id: authorId, reason: "Signalement depuis le profil" });
    setActionDone("Signalement envoyé. Merci, notre équipe va l'examiner.");
  };
  const block = async () => {
    if (!userId) return;
    await supabase.from("blocks").insert({ blocker_id: userId, blocked_id: authorId });
    setActionDone("Ce membre a été bloqué. Vous ne verrez plus son contenu.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl rounded-t-2xl p-6 max-h-[85%] overflow-y-auto" style={{ background: COLORS.surface2 }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }} />
        {loading ? (
          <div className="text-sm text-center py-8" style={{ color: COLORS.muted }}>Chargement du profil…</div>
        ) : !profile ? (
          <div className="text-sm text-center py-8" style={{ color: COLORS.muted }}>Profil introuvable.</div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-semibold text-lg" style={{ background: COLORS.surface, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
                {(profile.display_name || "?").charAt(0)}
              </div>
              <div className="flex-1">
                <div className="text-base font-medium" style={{ color: COLORS.ivory }}>{profile.display_name} {profile.flag}</div>
                <div className="text-xs" style={{ color: COLORS.muted }}>{profile.handle}</div>
              </div>
              <button onClick={report} title="Signaler" className="p-2 rounded-md" style={{ background: COLORS.surface, color: COLORS.muted }}><Flag size={15} /></button>
              <button onClick={block} title="Bloquer" className="p-2 rounded-md" style={{ background: COLORS.surface, color: "#E27D60" }}><UserX size={15} /></button>
            </div>
            {actionDone && (
              <div className="text-xs px-3 py-2 rounded-md mb-4" style={{ background: "rgba(212,169,62,0.12)", color: COLORS.gold }}>{actionDone}</div>
            )}
            {profile.bio ? (
              <p className="text-sm mb-4" style={{ color: COLORS.ivory }}>{profile.bio}</p>
            ) : (
              <p className="text-sm mb-4 italic" style={{ color: COLORS.muted }}>Aucune bio pour l'instant.</p>
            )}
            <div className="text-xs mb-5" style={{ color: COLORS.muted }}>
              Membre depuis {profile.created_at ? new Date(profile.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "récemment"}
            </div>

            <div className="flex gap-2 mb-6">
              <button className="flex-1 py-2 rounded-md text-sm font-medium" style={{ background: COLORS.teal, color: COLORS.bg }}>Suivre</button>
              <button className="flex-1 py-2 rounded-md text-sm" style={{ background: COLORS.surface, color: COLORS.ivory }}>Message</button>
            </div>

            <div className="text-xs uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Publications récentes</div>
            {authorPosts.length === 0 ? (
              <div className="text-xs" style={{ color: COLORS.muted }}>Aucune publication pour l'instant.</div>
            ) : (
              <div className="space-y-2">
                {authorPosts.map((p) => (
                  <div key={p.id} className="px-4 py-3 rounded-md text-sm" style={{ background: COLORS.surface, color: COLORS.ivory }}>{p.text}</div>
                ))}
              </div>
            )}
          </>
        )}
        <button onClick={onClose} className="text-xs mt-5" style={{ color: COLORS.muted }}>Fermer</button>
      </div>
    </div>
  );
}

function NotificationsPanel({ notifications, onClose, onMarkRead }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm m-4 rounded-lg p-4 max-h-[70vh] overflow-y-auto" style={{ background: COLORS.surface2 }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium" style={{ color: COLORS.ivory }}>Notifications</div>
          <button onClick={onMarkRead} className="text-xs" style={{ color: COLORS.teal }}>Tout marquer lu</button>
        </div>
        {notifications.length === 0 ? (
          <div className="text-xs py-6 text-center" style={{ color: COLORS.muted }}>Rien de nouveau pour l'instant.</div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div key={n.id} className="px-3 py-2.5 rounded-md text-sm" style={{ background: n.read ? COLORS.surface : "rgba(212,169,62,0.1)", color: COLORS.ivory }}>
                {n.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StoriesBar({ stories, onAdd }) {
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [text, setText] = useState("");

  const submit = async () => {
    if (!text.trim()) return;
    await onAdd(text);
    setText("");
    setComposing(false);
  };

  return (
    <div className="max-w-xl mx-auto px-4 pt-4 flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <button onClick={() => setComposing(true)} className="flex flex-col items-center gap-1 flex-shrink-0">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: COLORS.surface, border: `2px dashed rgba(212,169,62,0.4)` }}>
          <PlusCircle size={20} style={{ color: COLORS.gold }} />
        </div>
        <span className="text-[10px]" style={{ color: COLORS.muted }}>Ajouter</span>
      </button>
      {stories.map((s) => (
        <button key={s.id} onClick={() => setViewing(s)} className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="w-14 h-14 rounded-full flex items-center justify-center font-semibold" style={{ background: COLORS.surface2, color: COLORS.gold, border: `2px solid ${COLORS.gold}`, fontFamily: "'Fraunces', serif" }}>
            {(s.profiles?.display_name || "?").charAt(0)}
          </div>
          <span className="text-[10px] truncate w-14 text-center" style={{ color: COLORS.muted }}>{s.profiles?.display_name || "Membre"}</span>
        </button>
      ))}

      {composing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setComposing(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-lg p-5" style={{ background: COLORS.surface2 }}>
            <div className="text-sm font-medium mb-3" style={{ color: COLORS.ivory }}>Nouvelle story (24h)</div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus className="w-full bg-transparent text-sm outline-none resize-none mb-3 p-2 rounded-md" style={{ color: COLORS.ivory, background: COLORS.surface }} placeholder="Un mot, une pensée…" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setComposing(false)} className="text-xs px-3 py-2" style={{ color: COLORS.muted }}>Annuler</button>
              <button onClick={submit} className="text-xs px-4 py-2 rounded-md font-medium" style={{ background: COLORS.gold, color: COLORS.bg }}>Publier</button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setViewing(null)}>
          <div className="w-full max-w-sm rounded-lg p-6 text-center" style={{ background: `linear-gradient(160deg, ${COLORS.surface2}, ${COLORS.bg})`, border: "1px solid rgba(212,169,62,0.25)" }}>
            <div className="text-sm font-medium mb-3" style={{ color: COLORS.gold }}>{viewing.profiles?.display_name || "Membre"} {viewing.profiles?.flag}</div>
            <div className="text-lg" style={{ color: COLORS.ivory }}>{viewing.text}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PostComposer({ onPost }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef(null);

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const removeFile = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!text.trim() && !file) return;
    setPosting(true);
    try {
      await onPost(text, file);
      setText("");
      removeFile();
      setOpen(false);
    } finally {
      setPosting(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full flex items-center gap-2 px-4 py-3 rounded-lg text-sm mb-1" style={{ background: COLORS.surface, color: COLORS.muted, border: "1px solid rgba(255,255,255,0.06)" }}>
        <PlusCircle size={16} /> Partager quelque chose…
      </button>
    );
  }
  return (
    <div className="rounded-lg p-4 mb-1" style={{ background: COLORS.surface, border: "1px solid rgba(212,169,62,0.2)" }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        rows={3}
        placeholder="Quoi de neuf ?"
        className="w-full bg-transparent text-sm outline-none resize-none mb-3"
        style={{ color: COLORS.ivory }}
      />
      {preview && (
        <div className="relative mb-3 rounded-md overflow-hidden" style={{ background: COLORS.surface2 }}>
          {file?.type.startsWith("video") ? (
            <video src={preview} controls className="w-full max-h-56 object-contain" />
          ) : (
            <img src={preview} alt="Aperçu" className="w-full max-h-56 object-contain" />
          )}
          <button onClick={removeFile} className="absolute top-2 right-2 p-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.6)", color: COLORS.ivory }}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: COLORS.teal }}>
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={pickFile} className="hidden" />
          <Play size={14} /> Photo / vidéo
        </label>
        <div className="flex gap-2">
          <button onClick={() => setOpen(false)} className="text-xs px-3 py-2 rounded-md" style={{ color: COLORS.muted }}>Annuler</button>
          <button onClick={submit} disabled={posting} className="text-xs px-4 py-2 rounded-md font-medium disabled:opacity-50" style={{ background: COLORS.gold, color: COLORS.bg }}>
            {posting ? "Envoi…" : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentsSheet({ postId, onClose }) {
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("comments")
        .select("id, text, created_at, profiles(display_name, flag)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      setComments(data || []);
      setLoading(false);
    })();
  }, [postId]);

  const send = async () => {
    if (!draft.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    const { data } = await supabase.from("comments").insert({ post_id: postId, author_id: uid, text: draft.trim() }).select("id, text, created_at").single();
    setComments((prev) => [...prev, { ...data, profiles: { display_name: "Vous", flag: "🌍" } }]);
    setDraft("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl rounded-t-2xl p-5 max-h-[75%] flex flex-col" style={{ background: COLORS.surface2 }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "rgba(255,255,255,0.15)" }} />
        <div className="text-sm font-medium mb-3" style={{ color: COLORS.ivory }}>Commentaires</div>
        <div className="flex-1 overflow-y-auto space-y-3 mb-3">
          {loading ? (
            <div className="text-xs" style={{ color: COLORS.muted }}>Chargement…</div>
          ) : comments.length === 0 ? (
            <div className="text-xs" style={{ color: COLORS.muted }}>Aucun commentaire pour l'instant. Soyez le premier !</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0" style={{ background: COLORS.surface, color: COLORS.gold }}>
                  {(c.profiles?.display_name || "?").charAt(0)}
                </div>
                <div>
                  <div className="text-xs font-medium" style={{ color: COLORS.ivory }}>{c.profiles?.display_name || "Membre BAARO"} {c.profiles?.flag}</div>
                  <div className="text-sm" style={{ color: COLORS.muted }}>{c.text}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ajouter un commentaire…"
            className="flex-1 px-4 py-2.5 rounded-md text-sm outline-none"
            style={{ background: COLORS.surface, color: COLORS.ivory, border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <button onClick={send} className="p-2.5 rounded-md" style={{ background: COLORS.gold, color: COLORS.bg }}><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function FeedTab({ posts, onLike, onPost, lang, loading, userId }) {
  const [translations, setTranslations] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [verifications, setVerifications] = useState({});
  const [verifyingId, setVerifyingId] = useState(null);
  const [openProfileId, setOpenProfileId] = useState(null);
  const [openCommentsId, setOpenCommentsId] = useState(null);

  const translatePost = async (post) => {
    const targetLabel = LANGUAGES.find((l) => l.code === lang)?.label || lang;
    setLoadingId(post.id);
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 300,
          system: `Traduis le texte donné en ${targetLabel}. Réponds uniquement avec la traduction, sans commentaire ni guillemets.`,
          messages: [{ role: "user", content: post.text }],
        }),
      });
      const data = await response.json();
      const block = (data.content || []).find((b) => b.type === "text");
      setTranslations((prev) => ({ ...prev, [post.id]: block ? block.text : null }));
    } catch (e) {
      setTranslations((prev) => ({ ...prev, [post.id]: null }));
    } finally {
      setLoadingId(null);
    }
  };

  const verifyPost = async (post) => {
    setVerifyingId(post.id);
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 200,
          system: "Tu évalues un post de réseau social pour repérer des signes de désinformation, d'exagération non vérifiable ou de contenu généré pour manipuler. Réponds en français, en 1 phrase courte, avec un verdict clair (ex: « Aucun signe préoccupant » ou « Affirmation à vérifier : ... »). Pas de préambule.",
          messages: [{ role: "user", content: post.text }],
        }),
      });
      const data = await response.json();
      const block = (data.content || []).find((b) => b.type === "text");
      setVerifications((prev) => ({ ...prev, [post.id]: block ? block.text : "Analyse indisponible." }));
    } catch (e) {
      setVerifications((prev) => ({ ...prev, [post.id]: "Analyse indisponible." }));
    } finally {
      setVerifyingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        <PostSkeleton />
        <PostSkeleton />
        <PostSkeleton />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
      <PostComposer onPost={onPost} />
      {posts.map((p) => (
        <article key={p.id} className="rounded-lg p-5" style={{ background: COLORS.surface, border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold" style={{ background: COLORS.surface2, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
              {p.name.charAt(0)}
            </div>
            <div>
              <button onClick={() => setOpenProfileId(p.authorId)} className="font-medium text-left hover:opacity-80" style={{ color: COLORS.ivory }}>{p.name} <span className="ml-1">{p.flag}</span></button>
              <div className="text-xs" style={{ color: COLORS.muted }}>{p.handle}</div>
            </div>
          </div>
          <p className="text-sm leading-relaxed mb-2" style={{ color: COLORS.ivory }}>{p.text}</p>
          {p.mediaUrl && (
            <div className="mb-3 rounded-md overflow-hidden" style={{ background: COLORS.surface2 }}>
              {p.mediaType === "video" ? (
                <video src={p.mediaUrl} controls className="w-full max-h-96 object-contain" />
              ) : (
                <img src={p.mediaUrl} alt="" className="w-full max-h-96 object-contain" />
              )}
            </div>
          )}
          {translations[p.id] && (
            <p className="text-sm leading-relaxed mb-2 pl-3" style={{ color: COLORS.teal, borderLeft: `2px solid ${COLORS.teal}` }}>{translations[p.id]}</p>
          )}
          {verifications[p.id] && (
            <div className="flex items-start gap-1.5 text-xs mb-3 px-3 py-2 rounded-md" style={{ background: "rgba(212,169,62,0.1)", color: COLORS.gold }}>
              <ShieldCheck size={13} className="mt-0.5 flex-shrink-0" /> {verifications[p.id]}
            </div>
          )}
          <div className="flex items-center gap-4 mb-3">
            {lang !== "fr" && (
              <button onClick={() => translatePost(p)} disabled={loadingId === p.id} className="text-xs flex items-center gap-1.5" style={{ color: COLORS.gold }}>
                <Languages size={12} /> {loadingId === p.id ? t(lang, "translating") : t(lang, "translate")}
              </button>
            )}
            {!verifications[p.id] && (
              <button onClick={() => verifyPost(p)} disabled={verifyingId === p.id} className="text-xs flex items-center gap-1.5" style={{ color: COLORS.muted }}>
                <ShieldCheck size={12} /> {verifyingId === p.id ? "Analyse…" : "Vérifier ce contenu"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-6 text-sm" style={{ color: COLORS.muted }}>
            <button onClick={() => onLike(p.id)} className="flex items-center gap-1.5 hover:opacity-80 transition">
              <Heart size={16} className={p.liked ? "fill-current" : ""} style={{ color: p.liked ? COLORS.teal : COLORS.muted }} />
              {p.likes}
            </button>
            <button onClick={() => setOpenCommentsId(p.id)} className="flex items-center gap-1.5 hover:opacity-80"><MessageCircle size={16} /> {p.comments}</button>
            <span className="flex items-center gap-1.5"><Share2 size={16} /></span>
            {p.earned > 0 && (
              <span className="ml-auto text-xs font-medium" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>
                +{p.earned} {t(lang, "pts")}
              </span>
            )}
          </div>
        </article>
      ))}
      {openProfileId && <ProfileModal authorId={openProfileId} userId={userId} onClose={() => setOpenProfileId(null)} />}
      {openCommentsId && <CommentsSheet postId={openCommentsId} onClose={() => setOpenCommentsId(null)} />}
    </div>
  );
}

const REDEEM_OPTIONS = [
  { id: "r1", label: "Carte cadeau partenaire — 5 €", cost: 500 },
  { id: "r2", label: "Virement via Stripe Connect — 10 €", cost: 1000 },
  { id: "r3", label: "Badge Créateur Premium (statut, pas d'argent)", cost: 300 },
  { id: "r4", label: "Boost de visibilité 48h", cost: 150 },
];

function WalletTab({ balance, history, onRedeem }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  const handleRedeem = async (opt) => {
    const success = await onRedeem(opt.id);
    setNotice(success
      ? { ok: true, text: `${opt.label} — rachat confirmé.` }
      : { ok: false, text: "Solde insuffisant pour cette récompense." });
    if (success) setTimeout(() => setModalOpen(false), 1200);
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="rounded-lg p-6 mb-6 text-center" style={{ background: `linear-gradient(135deg, ${COLORS.surface2}, ${COLORS.surface})`, border: "1px solid rgba(212,169,62,0.25)" }}>
        <div className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: COLORS.muted }}>Solde BAARO Points</div>
        <div className="text-5xl font-semibold mb-4" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>
          {balance.toLocaleString("fr-FR")}
        </div>
        <button onClick={() => { setNotice(null); setModalOpen(true); }} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition hover:opacity-90" style={{ background: COLORS.teal, color: COLORS.bg }}>
          Convertir en récompense <ArrowUpRight size={16} />
        </button>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center px-4 z-50" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-lg p-5" style={{ background: COLORS.surface2, border: "1px solid rgba(212,169,62,0.25)" }}>
            <div className="text-sm uppercase tracking-[0.15em] mb-4" style={{ color: COLORS.muted }}>Choisir une récompense</div>
            <div className="space-y-2 mb-3">
              {REDEEM_OPTIONS.map((opt) => (
                <button key={opt.id} onClick={() => handleRedeem(opt)} disabled={balance < opt.cost}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-md text-left text-sm transition hover:opacity-90 disabled:opacity-40"
                  style={{ background: COLORS.surface, color: COLORS.ivory }}>
                  <span>{opt.label}</span>
                  <span style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{opt.cost} pts</span>
                </button>
              ))}
            </div>
            {notice && (
              <div className="text-xs mb-2" style={{ color: notice.ok ? COLORS.teal : "#E27D60" }}>{notice.text}</div>
            )}
            <button onClick={() => setModalOpen(false)} className="text-xs" style={{ color: COLORS.muted }}>Fermer</button>
          </div>
        </div>
      )}

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Historique</h3>
      <div className="space-y-2 mb-8">
        {history.map((h) => (
          <div key={h.id} className="flex items-center justify-between px-4 py-3 rounded-md" style={{ background: COLORS.surface }}>
            <div>
              <div className="text-sm" style={{ color: COLORS.ivory }}>{h.label}</div>
              <div className="text-xs" style={{ color: COLORS.muted }}>{h.ts}</div>
            </div>
            <div className="text-sm font-medium" style={{ color: h.pts < 0 ? "#E27D60" : COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{h.pts > 0 ? "+" : ""}{h.pts}</div>
          </div>
        ))}
      </div>

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Comment gagner des points</h3>
      <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        {EARN_RULES.map((r, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 text-sm" style={{ background: i % 2 ? COLORS.surface : COLORS.surface2, color: COLORS.ivory }}>
            <span>{r.label}</span>
            <span style={{ color: COLORS.muted, fontFamily: "'IBM Plex Mono', monospace" }}>{r.pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const VIDEO_EXTRAS = {
  v1: { caption: "Jollof rice prêt en 10 minutes, sans four 🔥 #cuisine #afrique", music: "Son original — Amara K.", commentsSeed: [{ name: "Yuki", text: "Je tente ce soir !" }, { name: "Kwame", text: "La texture du riz 😍" }] },
  v2: { caption: "L'astuce IA qui m'a fait gagner des heures de traduction ⚡ #astuce #ia", music: "Lo-fi calme — audio BAARO", commentsSeed: [{ name: "Elena", text: "Merci pour le tuto !" }] },
  v3: { caption: "Studio de danse un dimanche à Taipei 💃 #danse #taiwan", music: "Beat énergique — DJ Lin", commentsSeed: [{ name: "Tom", text: "Le style est incroyable" }, { name: "Sofia", text: "On sent l'énergie 🔥" }] },
};

function VideoCard({ v, liked, saved, onLike, onSave, onShare, onWatched }) {
  const ref = useRef(null);
  const watchedRef = useRef(false);
  const [showComments, setShowComments] = useState(false);
  const extras = VIDEO_EXTRAS[v.id] || { caption: v.title, music: "Son original", commentsSeed: [] };

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !watchedRef.current) {
          watchedRef.current = true;
          onWatched(v);
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [v, onWatched]);

  return (
    <div ref={ref} className="relative w-full flex-shrink-0 snap-start rounded-xl overflow-hidden" style={{ height: "100%", background: `linear-gradient(160deg, ${v.color}44, ${COLORS.bg} 70%)` }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
          <Play size={26} style={{ color: COLORS.ivory }} fill={COLORS.ivory} />
        </div>
      </div>

      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
        <button onClick={() => onLike(v)} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
            <Heart size={22} className={liked ? "fill-current" : ""} style={{ color: liked ? COLORS.teal : COLORS.ivory }} />
          </div>
          <span className="text-xs font-medium" style={{ color: COLORS.ivory }}>{v.likes ?? 0}</span>
        </button>
        <button onClick={() => setShowComments(true)} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
            <MessageCircle size={22} style={{ color: COLORS.ivory }} />
          </div>
          <span className="text-xs font-medium" style={{ color: COLORS.ivory }}>{extras.commentsSeed.length}</span>
        </button>
        <button onClick={() => onSave(v)} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
            <Bookmark size={22} className={saved ? "fill-current" : ""} style={{ color: saved ? COLORS.gold : COLORS.ivory }} />
          </div>
          <span className="text-xs font-medium" style={{ color: COLORS.ivory }}>{saved ? "Enregistré" : "Enreg."}</span>
        </button>
        <button onClick={() => onShare(v)} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
            <Share2 size={20} style={{ color: COLORS.ivory }} />
          </div>
          <span className="text-xs font-medium" style={{ color: COLORS.ivory }}>Partager</span>
        </button>
      </div>

      <div className="absolute left-3 right-16 bottom-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs" style={{ background: COLORS.surface2, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>{v.author?.charAt(0)}</div>
          <span className="text-sm font-medium" style={{ color: COLORS.ivory }}>{v.author} {v.flag}</span>
          <button className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: COLORS.gold, color: COLORS.bg }}>Suivre</button>
        </div>
        <div className="text-sm mb-2 leading-snug" style={{ color: COLORS.ivory }}>{extras.caption}</div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.ivory }}>
          <Music2 size={12} /> {extras.music}
        </div>
      </div>

      {showComments && (
        <div className="absolute inset-0 z-10 flex items-end" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setShowComments(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl p-5 max-h-[70%] overflow-y-auto" style={{ background: COLORS.surface2 }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "rgba(255,255,255,0.15)" }} />
            <div className="text-sm font-medium mb-3" style={{ color: COLORS.ivory }}>{extras.commentsSeed.length} commentaires</div>
            <div className="space-y-3">
              {extras.commentsSeed.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: COLORS.surface, color: COLORS.gold }}>{c.name.charAt(0)}</div>
                  <div>
                    <div className="text-xs font-medium" style={{ color: COLORS.ivory }}>{c.name}</div>
                    <div className="text-sm" style={{ color: COLORS.muted }}>{c.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowComments(false)} className="text-xs mt-4" style={{ color: COLORS.muted }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function VideosTab({ videos, onWatch }) {
  const [filter, setFilter] = useState("pourToi");
  const [liked, setLiked] = useState({});
  const [saved, setSaved] = useState({});

  const toggleLike = (v) => {
    const wasLiked = !!liked[v.id];
    setLiked((prev) => ({ ...prev, [v.id]: !wasLiked }));
    if (!wasLiked) onWatch(v);
  };
  const toggleSave = (v) => setSaved((prev) => ({ ...prev, [v.id]: !prev[v.id] }));
  const share = () => {};

  return (
    <div className="max-w-xl mx-auto px-3 pt-3" style={{ height: "80vh" }}>
      <div className="flex items-center justify-center gap-6 mb-3">
        <button onClick={() => setFilter("abonnements")} className="text-sm pb-1" style={{ color: filter === "abonnements" ? COLORS.ivory : COLORS.muted, borderBottom: filter === "abonnements" ? `2px solid ${COLORS.gold}` : "2px solid transparent" }}>
          Abonnements
        </button>
        <button onClick={() => setFilter("pourToi")} className="text-sm pb-1 font-medium" style={{ color: filter === "pourToi" ? COLORS.ivory : COLORS.muted, borderBottom: filter === "pourToi" ? `2px solid ${COLORS.gold}` : "2px solid transparent" }}>
          Pour toi
        </button>
      </div>
      <div className="overflow-y-auto snap-y snap-mandatory rounded-xl" style={{ height: "calc(100% - 40px)", scrollSnapType: "y mandatory" }}>
        {videos.map((v) => (
          <div key={v.id} className="snap-start" style={{ height: "100%", marginBottom: 8 }}>
            <VideoCard
              v={{ ...v, likes: v.likes ?? 0 }}
              liked={!!liked[v.id]}
              saved={!!saved[v.id]}
              onLike={toggleLike}
              onSave={toggleSave}
              onShare={share}
              onWatched={onWatch}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowersTab({ followers, counts }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-lg p-4 text-center" style={{ background: COLORS.surface }}>
          <div className="text-2xl font-semibold" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{counts.followers.toLocaleString("fr-FR")}</div>
          <div className="text-xs mt-1" style={{ color: COLORS.muted }}>Abonnés</div>
        </div>
        <div className="rounded-lg p-4 text-center" style={{ background: COLORS.surface }}>
          <div className="text-2xl font-semibold" style={{ color: COLORS.teal, fontFamily: "'IBM Plex Mono', monospace" }}>{counts.following.toLocaleString("fr-FR")}</div>
          <div className="text-xs mt-1" style={{ color: COLORS.muted }}>Abonnements</div>
        </div>
      </div>
      <h3 className="text-sm uppercase tracking-[0.15em] mb-3 mt-6" style={{ color: COLORS.muted }}>Abonnés récents</h3>
      {followers.length === 0 ? (
        <div className="text-sm px-4 py-6 rounded-md text-center" style={{ background: COLORS.surface, color: COLORS.muted }}>
          Pas encore d'abonnés — invitez vos premiers contacts pour démarrer votre communauté.
        </div>
      ) : (
        <div className="space-y-2">
          {followers.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3 rounded-md" style={{ background: COLORS.surface }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold" style={{ background: COLORS.surface2, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
                {f.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="text-sm" style={{ color: COLORS.ivory }}>{f.name} {f.flag}</div>
                <div className="text-xs" style={{ color: COLORS.muted }}>{f.handle}</div>
              </div>
              <div className="text-xs" style={{ color: COLORS.muted }}>{f.since}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfitsTab() {
  const total = PROFIT_SOURCES.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="rounded-lg p-6 mb-6" style={{ background: `linear-gradient(135deg, ${COLORS.surface2}, ${COLORS.surface})`, border: "1px solid rgba(212,169,62,0.25)" }}>
        <div className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: COLORS.muted }}>Revenus ce mois-ci</div>
        <div className="text-4xl font-semibold" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{total} €</div>
      </div>

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Tendance sur 6 mois</h3>
      <div className="rounded-lg p-4 mb-6" style={{ background: COLORS.surface, height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={PROFIT_HISTORY}>
            <XAxis dataKey="month" stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ background: COLORS.surface2, border: "none", borderRadius: 6, fontSize: 12, color: COLORS.ivory }} labelStyle={{ color: COLORS.ivory }} />
            <Bar dataKey="revenue" fill={COLORS.gold} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Sources de revenu</h3>
      <div className="space-y-2">
        {PROFIT_SOURCES.map((s, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 rounded-md" style={{ background: COLORS.surface }}>
            <span className="text-sm" style={{ color: COLORS.ivory }}>{s.label}</span>
            <span className="text-sm font-medium" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{s.amount} €</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubscriptionTab({ current, onSubscribe }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      {SUBSCRIPTION_TIERS.map((t) => {
        const active = current === t.id;
        return (
          <div key={t.id} className="rounded-lg p-5" style={{ background: active ? `linear-gradient(135deg, ${COLORS.surface2}, ${COLORS.surface})` : COLORS.surface, border: active ? `1px solid ${COLORS.gold}` : "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-medium" style={{ color: COLORS.ivory, fontFamily: "'Fraunces', serif" }}>{t.name}</div>
              <div className="text-sm" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{t.price}</div>
            </div>
            <ul className="space-y-1.5 mb-4">
              {t.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: COLORS.muted }}>
                  <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: COLORS.teal }} /> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => onSubscribe(t.id)}
              disabled={active}
              className="w-full py-2.5 rounded-md text-sm font-medium transition hover:opacity-90 disabled:opacity-60"
              style={{ background: active ? COLORS.surface2 : COLORS.teal, color: active ? COLORS.muted : COLORS.bg }}
            >
              {active ? "Formule actuelle" : "S'abonner"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Messagerie réelle : contacts, conversation et envoi viennent de
// useMessaging (Supabase + chiffrement de bout en bout, voir
// src/hooks/useMessaging.js et src/lib/crypto.js). Le serveur ne voit
// jamais le texte en clair.
function ActiveConversation({ contact, userId, messaging, onBack }) {
  const { messages, loading } = messaging.useConversation(contact.id);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setSendError(null);
    const result = await messaging.send(contact.id, text);
    if (!result.ok) setSendError(result.reason || "Envoi impossible");
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col" style={{ height: "72vh" }}>
      <div className="flex items-center gap-3 mb-3 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} className="text-sm" style={{ color: COLORS.muted }}>←</button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold" style={{ background: COLORS.surface2, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
          {(contact.display_name || "?").charAt(0)}
        </div>
        <div className="flex-1">
          <div className="text-sm" style={{ color: COLORS.ivory }}>{contact.display_name} {contact.flag}</div>
          <div className="text-xs flex items-center gap-1" style={{ color: COLORS.teal }}><ShieldCheck size={11} /> Conversation chiffrée de bout en bout</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
        {loading && <div className="text-xs text-center py-4" style={{ color: COLORS.muted }}>Déchiffrement des messages…</div>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[75%] px-4 py-2.5 rounded-lg text-sm" style={{ background: m.from === "me" ? COLORS.teal : COLORS.surface, color: m.from === "me" ? COLORS.bg : COLORS.ivory }}>
              {m.text}
              <div className="text-[10px] mt-1 opacity-60">{new Date(m.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {sendError && <div className="text-xs mb-2" style={{ color: "#E27D60" }}>{sendError}</div>}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Écrire un message chiffré…"
          className="flex-1 px-4 py-2.5 rounded-md text-sm outline-none"
          style={{ background: COLORS.surface, color: COLORS.ivory, border: "1px solid rgba(255,255,255,0.08)" }}
        />
        <button onClick={send} className="p-2.5 rounded-md transition hover:opacity-90" style={{ background: COLORS.gold, color: COLORS.bg }}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Live BAARO (texte / vocal / vidéo + IA en co-animatrice), façon
// TikTok LIVE : un·e hôte diffuse, des spectateur·ices regardent,
// commentent et envoient des cœurs. Logique de données dans
// src/hooks/useDebates.js, diffusion WebRTC en étoile dans
// src/lib/webrtc.js — voir ces fichiers pour le détail du fonctionnement.
//
// Ce n'est pas l'infrastructure de TikTok (pas de CDN/serveur média) :
// l'hôte diffuse en direct, en pair-à-pair, à chaque spectateur·ice.
// Ça tient bien jusqu'à une vingtaine de spectateurs simultanés environ,
// selon le débit montant de l'hôte — voir le commentaire en tête de
// src/lib/webrtc.js pour l'évolution possible vers un vrai service de
// diffusion à grande échelle (LiveKit, Agora, Daily.co...).
// ---------------------------------------------------------------------

function ControlButton({ onClick, active, activeColor, icon: Icon, label, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex flex-col items-center gap-1">
      <span className="p-3 rounded-full transition" style={{ background: active ? COLORS.surface : activeColor, color: active ? COLORS.ivory : COLORS.bg, opacity: disabled ? 0.5 : 1 }}>
        <Icon size={17} />
      </span>
      <span className="text-[10px]" style={{ color: COLORS.muted }}>{label}</span>
    </button>
  );
}

function DebateVideoTile({ stream, label, muted, isSelf, camOff, fullBleed }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null;
  }, [stream]);
  return (
    <div className={`relative flex items-center justify-center ${fullBleed ? "w-full h-full" : "rounded-lg overflow-hidden aspect-video"}`} style={{ background: COLORS.surface2 }}>
      {stream && !camOff ? (
        <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover" style={{ transform: isSelf ? "scaleX(-1)" : "none" }} />
      ) : (
        <div className="w-12 h-12 rounded-full flex items-center justify-center font-semibold" style={{ background: COLORS.surface, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
          {(label || "?").charAt(0).toUpperCase()}
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.55)", color: COLORS.ivory }}>
        {label}
      </div>
    </div>
  );
}

// Cœurs flottants façon TikTok, purement visuels (rien n'est stocké en
// base — chaque appareil les rejoue localement à réception de l'événement
// "reaction" diffusé par le salon).
function FloatingHearts({ hearts }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {hearts.map((h) => (
        <Heart
          key={h.id}
          size={20}
          fill="#E27D60"
          style={{ position: "absolute", right: `${h.offset}%`, bottom: 70, color: "#E27D60", animation: "baaroFloatHeart 2.2s ease-out forwards" }}
        />
      ))}
    </div>
  );
}

// Salon Live actif : un·e hôte diffuse (ou anime, en mode écrit), les
// spectateur·ices regardent, commentent en direct et envoient des cœurs.
// `debates` = objet retourné par useDebates(userId).
function DebateRoom({ room, userId, displayName, debates, onLeave }) {
  const isHost = room.host_id === userId;
  const chat = debates.useRoomChat(room.id);
  const [text, setText] = useState("");
  const [micOn, setMicOn] = useState(room.mode !== "text");
  const [camOn, setCamOn] = useState(room.mode === "video");
  const [stageStream, setStageStream] = useState(null); // mon propre flux si hôte, celui de l'hôte si spectateur·ice
  const [mediaError, setMediaError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [hintOpen, setHintOpen] = useState(() => !localStorage.getItem("baaro:debate_hint_seen"));
  const [viewerCount, setViewerCount] = useState(0);
  const [hearts, setHearts] = useState([]);
  const [liveEnded, setLiveEnded] = useState(false);
  const sessionRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  const pushHeart = useCallback(() => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setHearts((prev) => [...prev, { id, offset: 8 + Math.random() * 55 }]);
    setTimeout(() => setHearts((prev) => prev.filter((h) => h.id !== id)), 2200);
  }, []);

  // Établit la diffusion (étoile WebRTC, hôte -> chaque spectateur·ice) et
  // le suivi du nombre de spectateur·ices en direct (Presence Supabase).
  useEffect(() => {
    let localMedia = null;
    const session = createLiveSession({
      supabase,
      roomId: room.id,
      selfId: userId,
      hostId: room.host_id,
      onRemoteStream: (stream) => setStageStream(stream),
      onViewerCountChange: setViewerCount,
      onHostLeft: () => setLiveEnded(true),
      onReaction: () => pushHeart(),
    });
    sessionRef.current = session;

    (async () => {
      if (!isHost || room.mode === "text") return;
      try {
        localMedia = await getLocalMedia(room.mode);
        localMedia.getAudioTracks().forEach((t) => (t.enabled = micOn));
        localMedia.getVideoTracks().forEach((t) => (t.enabled = camOn));
        setStageStream(localMedia);
        await session.setLocalStream(localMedia);
      } catch {
        setMediaError("Micro/caméra inaccessible — vérifiez les autorisations du navigateur. Le direct continue en mode dégradé.");
      }
    })();

    return () => {
      sessionRef.current = null;
      session.leave();
      localMedia?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, room.host_id, isHost, room.mode]);

  const react = () => {
    pushHeart();
    sessionRef.current?.sendReaction();
  };

  const toggleMic = () => {
    setMicOn((on) => {
      stageStream?.getAudioTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  };
  const toggleCam = () => {
    setCamOn((on) => {
      stageStream?.getVideoTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  };

  const leave = async () => {
    await debates.leaveRoom(room.id);
    onLeave();
  };

  const endLive = async () => {
    await debates.endRoom(room.id);
    await debates.leaveRoom(room.id);
    onLeave();
  };

  const send = () => {
    if (!text.trim()) return;
    chat.sendText(text);
    setText("");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible, sans conséquence */
    }
  };

  const shareInvite = async () => {
    const message = `Rejoins mon live « ${room.title} » sur BAARO ! Code : ${room.invite_code}`;
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        /* partage annulé par l'utilisateur, sans conséquence */
      }
    }
    copyCode();
  };

  const dismissHint = () => {
    localStorage.setItem("baaro:debate_hint_seen", "1");
    setHintOpen(false);
  };

  const showVideo = room.mode !== "text";

  if (liveEnded && !isHost) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center">
        <Radio size={22} style={{ color: COLORS.muted, margin: "0 auto 10px" }} />
        <div className="text-sm mb-1" style={{ color: COLORS.ivory }}>Ce live est terminé</div>
        <div className="text-xs mb-5" style={{ color: COLORS.muted }}>L'hôte a quitté le direct.</div>
        <button onClick={onLeave} className="px-5 py-2.5 rounded-md text-sm font-medium" style={{ background: COLORS.gold, color: COLORS.bg }}>
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col" style={{ height: "82vh" }}>
      <style>{`@keyframes baaroFloatHeart { 0% { transform: translateY(0) scale(0.6); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-240px) scale(1.1); opacity: 0; } }`}</style>

      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0" style={{ background: "#B84A3E", color: "#fff" }}>
            <Radio size={10} /> LIVE
          </span>
          <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full flex-shrink-0" style={{ background: COLORS.surface, color: COLORS.ivory }}>
            <Users size={11} /> {viewerCount}
          </span>
          <div className="text-sm font-medium truncate" style={{ color: COLORS.ivory }}>{room.title}</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={copyCode} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full" style={{ background: COLORS.surface, color: COLORS.gold }}>
            <Copy size={12} /> {copied ? "Copié !" : room.invite_code}
          </button>
          <button onClick={shareInvite} className="p-1.5 rounded-full" style={{ background: COLORS.surface, color: COLORS.teal }} aria-label="Inviter">
            <Share2 size={14} />
          </button>
        </div>
      </div>

      {hintOpen && (
        <div className="flex items-start gap-2 mb-3 text-xs px-3 py-2.5 rounded-md" style={{ background: "rgba(212,169,62,0.12)", color: COLORS.gold }}>
          <div className="flex-1">Touchez <Heart size={11} style={{ display: "inline", verticalAlign: -1 }} /> pour envoyer un cœur, <Share2 size={11} style={{ display: "inline", verticalAlign: -1 }} /> pour inviter, ou <Sparkles size={11} style={{ display: "inline", verticalAlign: -1 }} /> pour faire intervenir l'IA (hôte).</div>
          <button onClick={dismissHint} aria-label="Fermer"><X size={13} /></button>
        </div>
      )}

      {mediaError && (
        <div className="flex items-center gap-2 mb-3 text-xs px-3 py-2 rounded-md" style={{ background: "rgba(226,125,96,0.12)", color: "#E27D60" }}>
          <ShieldAlert size={14} /> {mediaError}
        </div>
      )}

      {showVideo ? (
        <div className="relative rounded-lg overflow-hidden mb-3" style={{ background: COLORS.surface2, aspectRatio: "3 / 4" }}>
          {stageStream ? (
            <DebateVideoTile stream={stageStream} label={isHost ? `${displayName || "Vous"} (en direct)` : "Hôte"} muted={isHost} isSelf={isHost} camOff={isHost && !camOn} fullBleed />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-center px-6" style={{ color: COLORS.muted }}>
              {isHost ? "Activation de la caméra…" : "En attente du flux de l'hôte…"}
            </div>
          )}
          <FloatingHearts hearts={hearts} />
        </div>
      ) : (
        <div className="relative flex-1 mb-3 rounded-lg flex items-center justify-center" style={{ background: COLORS.surface2, minHeight: 160 }}>
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-2 rounded-full flex items-center justify-center font-semibold text-lg" style={{ background: COLORS.surface, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
              {(room.title || "?").charAt(0).toUpperCase()}
            </div>
            <div className="text-xs" style={{ color: COLORS.muted }}>Live à l'écrit</div>
          </div>
          <FloatingHearts hearts={hearts} />
        </div>
      )}

      <div className="flex items-center justify-center gap-4 mb-3">
        {isHost && room.mode !== "text" && (
          <ControlButton onClick={toggleMic} active={micOn} activeColor="#E27D60" icon={micOn ? Mic : MicOff} label={micOn ? "Micro" : "Coupé"} />
        )}
        {isHost && room.mode === "video" && (
          <ControlButton onClick={toggleCam} active={camOn} activeColor="#E27D60" icon={camOn ? Video : VideoOff} label={camOn ? "Caméra" : "Coupée"} />
        )}
        {isHost && room.ai_enabled && (
          <ControlButton onClick={() => chat.askAI(room.topic)} active={false} activeColor={COLORS.gold} icon={Sparkles} label={chat.aiThinking ? "…" : "IA"} disabled={chat.aiThinking} />
        )}
        <ControlButton onClick={react} active={false} activeColor="#E27D60" icon={Heart} label="J'aime" />
        <ControlButton onClick={isHost ? endLive : leave} active={false} activeColor="#B84A3E" icon={PhoneOff} label={isHost ? "Terminer" : "Quitter"} />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 mb-3 pr-1 rounded-md p-3" style={{ background: COLORS.surface }}>
        {chat.loading && <div className="text-xs text-center py-4" style={{ color: COLORS.muted }}>Chargement du live…</div>}
        {chat.messages.map((m) => {
          const isMe = m.sender_type === "user" && m.sender_id === userId;
          const isAI = m.sender_type === "ai";
          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[85%] px-3.5 py-2 rounded-lg text-sm leading-relaxed" style={{ background: isMe ? COLORS.teal : isAI ? "rgba(212,169,62,0.15)" : COLORS.surface2, color: isMe ? COLORS.bg : COLORS.ivory, border: isAI ? `1px solid ${COLORS.gold}` : "none" }}>
                {isAI && (
                  <div className="flex items-center gap-1.5 mb-1 text-xs font-medium" style={{ color: COLORS.gold }}>
                    <Sparkles size={11} /> IA du live
                  </div>
                )}
                {m.text}
              </div>
            </div>
          );
        })}
        {chat.aiThinking && <div className="text-xs" style={{ color: COLORS.muted }}>L'IA réfléchit…</div>}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Commentez en direct…"
          className="flex-1 px-4 py-2.5 rounded-md text-sm outline-none"
          style={{ background: COLORS.surface, color: COLORS.ivory, border: "1px solid rgba(255,255,255,0.08)" }}
        />
        <button onClick={send} className="p-2.5 rounded-md transition hover:opacity-90" style={{ background: COLORS.gold, color: COLORS.bg }}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

const DEBATE_MODES = [
  { id: "video", label: "Vidéo", icon: Video, hint: "Vous diffusez caméra + micro, les spectateur·ices regardent et commentent" },
  { id: "audio", label: "Vocal", icon: Mic, hint: "Vous diffusez le micro seul, comme un talk audio en direct" },
  { id: "text", label: "Écrit", icon: MessageSquare, hint: "Live à l'écrit uniquement, sans caméra ni micro" },
];

const DEBATE_TOPIC_IDEAS = [
  "Le télétravail devrait-il être la norme ?",
  "L'IA va-t-elle créer plus d'emplois qu'elle n'en supprime ?",
  "Faut-il interdire les réseaux sociaux aux moins de 16 ans ?",
  "La voiture électrique est-elle vraiment écologique ?",
];

function CreateDebateModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("video");
  const [maxParticipants, setMaxParticipants] = useState(20);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    const finalTitle = title.trim() || topic.trim() || "Nouveau live";
    setBusy(true);
    const res = await onCreate({ title: finalTitle, topic: topic.trim(), mode, maxParticipants, aiEnabled });
    setBusy(false);
    if (!res.ok) setError(res.reason || "Impossible de démarrer le live.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl rounded-t-2xl p-5 pb-8 max-h-[85vh] overflow-y-auto" style={{ background: COLORS.surface2 }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }} />
        <div className="text-sm font-medium mb-1" style={{ color: COLORS.ivory }}>Nouveau live</div>
        <div className="text-xs mb-4" style={{ color: COLORS.muted }}>Choisissez un sujet, le format, puis démarrez — c'est prêt en 10 secondes.</div>

        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="De quoi va parler votre live ?"
          className="w-full px-4 py-2.5 rounded-md text-sm outline-none mb-2.5"
          style={{ background: COLORS.surface, color: COLORS.ivory, border: "1px solid rgba(255,255,255,0.08)" }}
        />
        <div className="flex flex-wrap gap-1.5 mb-4">
          {DEBATE_TOPIC_IDEAS.map((idea) => (
            <button
              key={idea}
              onClick={() => setTopic(idea)}
              className="text-xs px-2.5 py-1.5 rounded-full text-left transition hover:opacity-90"
              style={{ background: COLORS.surface, color: COLORS.muted, border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {idea}
            </button>
          ))}
        </div>

        <div className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: COLORS.muted }}>Format</div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {DEBATE_MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)} className="flex flex-col items-center gap-1 py-3 rounded-lg text-xs transition" style={{ background: active ? COLORS.gold : COLORS.surface, color: active ? COLORS.bg : COLORS.ivory }}>
                <Icon size={16} />
                {m.label}
              </button>
            );
          })}
        </div>
        <div className="text-xs mb-4" style={{ color: COLORS.muted }}>{DEBATE_MODES.find((m) => m.id === mode)?.hint}</div>

        <button
          onClick={() => setAiEnabled((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-md mb-3"
          style={{ background: COLORS.surface }}
        >
          <div className="flex items-center gap-2 text-sm" style={{ color: COLORS.ivory }}>
            <Sparkles size={15} style={{ color: COLORS.gold }} /> IA en co-animatrice du live
          </div>
          <div className="w-11 h-6 rounded-full relative" style={{ background: aiEnabled ? COLORS.teal : "rgba(255,255,255,0.12)" }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full transition" style={{ left: aiEnabled ? "22px" : "2px", background: COLORS.ivory }} />
          </div>
        </button>

        <button onClick={() => setAdvancedOpen((v) => !v)} className="w-full flex items-center justify-between px-1 py-2 mb-2 text-xs" style={{ color: COLORS.muted }}>
          <span>Options avancées (titre, nombre de spectateur·ices)</span>
          <ChevronDown size={14} style={{ transform: advancedOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>
        {advancedOpen && (
          <div className="mb-4 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre personnalisé (sinon, le sujet sert de titre)"
              className="w-full px-4 py-2.5 rounded-md text-sm outline-none"
              style={{ background: COLORS.surface, color: COLORS.ivory, border: "1px solid rgba(255,255,255,0.08)" }}
            />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm" style={{ color: COLORS.ivory }}>Spectateur·ices max</div>
                <div className="text-xs" style={{ color: COLORS.muted }}>Au-delà d'une vingtaine, la qualité dépend surtout de votre débit montant</div>
              </div>
              <input
                type="number"
                min={2}
                max={50}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Number(e.target.value))}
                className="w-16 text-center px-2 py-2 rounded-md text-sm outline-none"
                style={{ background: COLORS.surface, color: COLORS.ivory, border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
          </div>
        )}

        {error && <div className="text-xs mb-3" style={{ color: "#E27D60" }}>{error}</div>}

        <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-md text-sm font-medium transition hover:opacity-90" style={{ background: COLORS.gold, color: COLORS.bg }}>
          {busy ? "Démarrage…" : "Démarrer le live"}
        </button>
      </div>
    </div>
  );
}

function JoinDebateByCodeRow({ onJoin }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    const res = await onJoin(code);
    setBusy(false);
    if (!res.ok) setError(res.reason);
    else setCode("");
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Rejoindre un live avec un code (ex. a1b2c3d4)"
          className="flex-1 px-4 py-2.5 rounded-md text-sm outline-none"
          style={{ background: COLORS.surface, color: COLORS.ivory, border: "1px solid rgba(255,255,255,0.08)" }}
        />
        <button onClick={submit} disabled={busy} className="p-2.5 rounded-md transition hover:opacity-90" style={{ background: COLORS.surface2, color: COLORS.teal }}>
          <LogIn size={18} />
        </button>
      </div>
      {error && <div className="text-xs mt-1.5" style={{ color: "#E27D60" }}>{error}</div>}
    </div>
  );
}

const DEBATE_MODE_ICON = { video: Video, audio: Mic, text: MessageSquare };

// Onglet "Live" : liste des lives auxquels je participe (les miens et
// ceux que j'ai rejoints), démarrer un live, rejoindre par code.
function DebatesTab({ userId }) {
  const debates = useDebates(userId);
  const [creating, setCreating] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [starting, setStarting] = useState(false);
  const [displayName, setDisplayName] = useState("");

  // Nom affiché sur ma propre vignette quand je suis hôte (récupéré une
  // fois ici plutôt que de dépendre d'un état déjà présent ailleurs dans
  // l'app, pour garder ce composant autonome).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setDisplayName(data?.display_name || "");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (activeRoom) {
    return <DebateRoom room={activeRoom} userId={userId} displayName={displayName} debates={debates} onLeave={() => { setActiveRoom(null); debates.refreshRooms(); }} />;
  }

  const quickStart = async () => {
    setStarting(true);
    const res = await debates.createRoom({ title: "Live rapide", topic: "", mode: "video", maxParticipants: 20, aiEnabled: true });
    setStarting(false);
    if (res.ok) setActiveRoom(res.room);
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4 text-xs px-3 py-2 rounded-md" style={{ background: COLORS.surface, color: COLORS.teal }}>
        <Radio size={14} /> Passez en live à l'écrit, en vocal ou en vidéo — les spectateur·ices regardent, commentent et envoient des cœurs, avec ou sans l'IA en co-animatrice.
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        <button onClick={() => setCreating(true)} className="flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium transition hover:opacity-90" style={{ background: COLORS.gold, color: COLORS.bg }}>
          <Plus size={16} /> Créer
        </button>
        <button onClick={quickStart} disabled={starting} className="flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium transition hover:opacity-90" style={{ background: COLORS.surface2, color: COLORS.ivory, border: `1px solid ${COLORS.gold}` }}>
          <Zap size={15} style={{ color: COLORS.gold }} /> {starting ? "Démarrage…" : "Live rapide"}
        </button>
      </div>

      <JoinDebateByCodeRow onJoin={debates.joinByCode} />

      {debates.loadingRooms && <div className="text-xs text-center py-6" style={{ color: COLORS.muted }}>Chargement…</div>}
      {!debates.loadingRooms && debates.rooms.length === 0 && (
        <div className="text-center py-8 px-4 rounded-md" style={{ background: COLORS.surface }}>
          <Radio size={22} style={{ color: COLORS.muted, margin: "0 auto 10px" }} />
          <div className="text-sm mb-1" style={{ color: COLORS.ivory }}>Aucun live pour l'instant</div>
          <div className="text-xs" style={{ color: COLORS.muted }}>Touchez « Live rapide » pour démarrer en un geste, ou « Créer » pour choisir le sujet et le format.</div>
        </div>
      )}

      <div className="space-y-2">
        {debates.rooms.map((room) => {
          const Icon = DEBATE_MODE_ICON[room.mode] || MessageSquare;
          return (
            <button key={room.id} onClick={() => setActiveRoom(room)} className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-left transition hover:opacity-90" style={{ background: COLORS.surface }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: COLORS.surface2, color: COLORS.gold }}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: COLORS.ivory }}>{room.title}</div>
                <div className="text-xs flex items-center gap-2" style={{ color: COLORS.muted }}>
                  {room.status === "active" ? (
                    <span className="flex items-center gap-1" style={{ color: "#E27D60" }}><Radio size={10} /> En direct</span>
                  ) : (
                    <span>Terminé</span>
                  )}
                  {room.ai_enabled && <span className="flex items-center gap-1"><Sparkles size={11} /> IA</span>}
                  {room.host_id === userId && <span>Vous hébergez</span>}
                </div>
              </div>
              <ArrowRight size={15} style={{ color: COLORS.muted }} />
            </button>
          );
        })}
      </div>

      {creating && (
        <CreateDebateModal
          onClose={() => setCreating(false)}
          onCreate={async (params) => {
            const res = await debates.createRoom(params);
            if (res.ok) {
              setCreating(false);
              setActiveRoom(res.room);
            }
            return res;
          }}
        />
      )}
    </div>
  );
}

function MessagesTab({ userId }) {
  const messaging = useMessaging(userId);
  const [activeId, setActiveId] = useState(null);

  const active = messaging.contacts.find((c) => c.id === activeId);

  if (active) {
    return <ActiveConversation contact={active} userId={userId} messaging={messaging} onBack={() => setActiveId(null)} />;
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4 text-xs px-3 py-2 rounded-md" style={{ background: COLORS.surface, color: COLORS.teal }}>
        <ShieldCheck size={14} /> Messages chiffrés de bout en bout — seuls vous et votre correspondant pouvez les lire
      </div>
      {messaging.loadingContacts && <div className="text-xs text-center py-6" style={{ color: COLORS.muted }}>Chargement des contacts…</div>}
      {!messaging.loadingContacts && messaging.contacts.length === 0 && (
        <div className="text-xs text-center py-6" style={{ color: COLORS.muted }}>
          Aucune conversation pour l'instant — suivez quelqu'un pour pouvoir lui écrire.
        </div>
      )}
      <div className="space-y-2">
        {messaging.contacts.map((c) => (
          <button key={c.id} onClick={() => setActiveId(c.id)} className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-left transition hover:opacity-90" style={{ background: COLORS.surface }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold" style={{ background: COLORS.surface2, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
              {(c.display_name || "?").charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm" style={{ color: COLORS.ivory }}>{c.display_name} {c.flag}</div>
              <div className="text-xs truncate" style={{ color: COLORS.muted }}>{c.handle}</div>
            </div>
            <Lock size={13} style={{ color: COLORS.muted }} />
          </button>
        ))}
      </div>
    </div>
  );
}

function CryptoTab({ balance, holdings, onConvert }) {
  const [amountPts, setAmountPts] = useState(100);
  const [notice, setNotice] = useState(null);
  const currentPrice = BARO_PRICE_HISTORY[BARO_PRICE_HISTORY.length - 1].price;
  const holdingsValue = (holdings * currentPrice).toFixed(2);
  const baroFromPts = (amountPts / POINTS_PER_BARO).toFixed(3);

  const handleConvert = async () => {
    if (amountPts > balance) {
      setNotice({ ok: false, text: "Solde de points insuffisant." });
      return;
    }
    if (amountPts <= 0) return;
    const success = await onConvert(amountPts);
    setNotice(success
      ? { ok: true, text: `${baroFromPts} BARO ajoutés à votre portefeuille crypto.` }
      : { ok: false, text: "La conversion a échoué, réessayez." });
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4 text-xs px-3 py-2 rounded-md" style={{ background: "rgba(226,125,96,0.12)", color: "#E27D60" }}>
        <AlertTriangle size={14} /> Actif volatil et non garanti — la conversion réelle en cryptomonnaie dépend d'un partenaire agréé selon votre pays.
      </div>

      <div className="rounded-lg p-6 mb-6" style={{ background: `linear-gradient(135deg, ${COLORS.surface2}, ${COLORS.surface})`, border: "1px solid rgba(212,169,62,0.25)" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: COLORS.muted }}>Portefeuille BARO Coin</div>
          <div className="flex items-center gap-1 text-xs" style={{ color: COLORS.teal }}><Coins size={13} /> BARO</div>
        </div>
        <div className="text-4xl font-semibold mb-1" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{holdings.toFixed(3)}</div>
        <div className="text-sm" style={{ color: COLORS.muted }}>≈ {holdingsValue} € · cours actuel {currentPrice.toFixed(2)} €</div>
      </div>

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Cours sur 7 jours</h3>
      <div className="rounded-lg p-4 mb-6" style={{ background: COLORS.surface, height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={BARO_PRICE_HISTORY}>
            <XAxis dataKey="t" stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis hide domain={["dataMin - 0.1", "dataMax + 0.1"]} />
            <Tooltip contentStyle={{ background: COLORS.surface2, border: "none", borderRadius: 6, fontSize: 12, color: COLORS.ivory }} labelStyle={{ color: COLORS.ivory }} />
            <Line type="monotone" dataKey="price" stroke={COLORS.teal} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Convertir des points en BARO</h3>
      <div className="rounded-lg p-5" style={{ background: COLORS.surface, border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="number"
            min="0"
            step="10"
            value={amountPts}
            onChange={(e) => setNotice(null) || setAmountPts(Number(e.target.value))}
            className="flex-1 px-4 py-2.5 rounded-md text-sm outline-none"
            style={{ background: COLORS.surface2, color: COLORS.ivory, border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <ArrowRightLeft size={16} style={{ color: COLORS.muted }} />
          <div className="text-sm whitespace-nowrap" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{baroFromPts} BARO</div>
        </div>
        <div className="text-xs mb-4" style={{ color: COLORS.muted }}>Taux fixe : {POINTS_PER_BARO} points = 1 BARO · solde disponible : {balance.toLocaleString("fr-FR")} pts</div>
        <button onClick={handleConvert} className="w-full py-2.5 rounded-md text-sm font-medium transition hover:opacity-90" style={{ background: COLORS.teal, color: COLORS.bg }}>
          Convertir
        </button>
        {notice && (
          <div className="text-xs mt-3" style={{ color: notice.ok ? COLORS.teal : "#E27D60" }}>{notice.text}</div>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-11 h-6 rounded-full relative transition flex-shrink-0"
      style={{ background: checked ? COLORS.teal : "rgba(255,255,255,0.12)" }}
    >
      <span className="absolute top-0.5 w-5 h-5 rounded-full transition" style={{ left: checked ? "22px" : "2px", background: COLORS.ivory }} />
    </button>
  );
}

function SettingsRow({ label, sub, right }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div>
        <div className="text-sm" style={{ color: COLORS.ivory }}>{label}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: COLORS.muted }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

const LEGAL_TEXT = {
  terms: "Conditions d'utilisation (résumé) — En utilisant BAARO, vous acceptez de respecter la communauté : pas de contenu haineux, illégal ou trompeur. Le système de points et de conversion en récompenses peut évoluer. Ce texte est un exemple simplifié à faire relire par un professionnel du droit avant tout lancement public réel.",
  privacy: "Politique de confidentialité (résumé) — BAARO collecte les données nécessaires au fonctionnement du service (publications, interactions, portefeuille de points). Vous pouvez exporter ou supprimer vos données à tout moment depuis Paramètres. Ce texte est un exemple simplifié, à faire rédiger par un professionnel avant un vrai lancement.",
};

function LegalModal({ type, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-lg p-6" style={{ background: COLORS.surface2 }}>
        <div className="text-sm font-medium mb-3" style={{ color: COLORS.ivory }}>{type === "terms" ? "Conditions d'utilisation" : "Politique de confidentialité"}</div>
        <p className="text-xs leading-relaxed mb-5" style={{ color: COLORS.muted }}>{LEGAL_TEXT[type]}</p>
        <button onClick={onClose} className="w-full py-2.5 rounded-md text-sm font-medium" style={{ background: COLORS.gold, color: COLORS.bg }}>Fermer</button>
      </div>
    </div>
  );
}

function SettingsTab({ subscription, lang, setLang, userId }) {
  const [notifPush, setNotifPush] = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);
  const [privateAccount, setPrivateAccount] = useState(false);
  const [twoFactor, setTwoFactor] = useState(true);
  const [langOpen, setLangOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    if (!userId) return;
    setExporting(true);
    const [wallet, transactions, holdings, myPosts] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", userId).single(),
      supabase.from("transactions").select("*").eq("user_id", userId),
      supabase.from("crypto_holdings").select("*").eq("user_id", userId).single(),
      supabase.from("posts").select("*").eq("author_id", userId),
    ]);
    const bundle = {
      exported_at: new Date().toISOString(),
      wallet: wallet.data,
      transactions: transactions.data,
      crypto_holdings: holdings.data,
      posts: myPosts.data,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "baaro-mes-donnees.json";
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const deleteAccountData = async () => {
    if (!userId) return;
    await Promise.all([
      supabase.from("posts").delete().eq("author_id", userId),
      supabase.from("post_likes").delete().eq("user_id", userId),
      supabase.from("comments").delete().eq("author_id", userId),
      supabase.from("transactions").delete().eq("user_id", userId),
      supabase.from("wallets").delete().eq("user_id", userId),
      supabase.from("crypto_holdings").delete().eq("user_id", userId),
      supabase.from("profiles").delete().eq("user_id", userId),
    ]);
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6 px-4 py-4 rounded-lg" style={{ background: COLORS.surface }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg" style={{ background: COLORS.surface2, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
          V
        </div>
        <div>
          <div className="text-sm font-medium" style={{ color: COLORS.ivory }}>Votre profil</div>
          <div className="text-xs" style={{ color: COLORS.muted }}>Formule {subscription === "free" ? "Découverte" : subscription === "plus" ? "Plus" : "Créateur Pro"}</div>
        </div>
        <ChevronRight size={16} className="ml-auto" style={{ color: COLORS.muted }} />
      </div>

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Notifications</h3>
      <div className="rounded-lg mb-6 overflow-hidden" style={{ background: COLORS.surface }}>
        <SettingsRow label="Notifications push" sub="Likes, commentaires, abonnés" right={<Toggle checked={notifPush} onChange={setNotifPush} />} />
        <SettingsRow label="Notifications par e-mail" sub="Résumés hebdomadaires" right={<Toggle checked={notifEmail} onChange={setNotifEmail} />} />
      </div>

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Confidentialité & sécurité</h3>
      <div className="rounded-lg mb-6 overflow-hidden" style={{ background: COLORS.surface }}>
        <SettingsRow label="Compte privé" sub="Seuls vos abonnés voient vos publications" right={<Toggle checked={privateAccount} onChange={setPrivateAccount} />} />
        <SettingsRow label="Vérification en deux étapes" sub="Recommandé pour protéger votre portefeuille" right={<Toggle checked={twoFactor} onChange={setTwoFactor} />} />
        <SettingsRow label="Messages chiffrés" sub="Toujours activé" right={<Lock size={16} style={{ color: COLORS.teal }} />} />
      </div>

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Paiements</h3>
      <div className="rounded-lg mb-6 overflow-hidden" style={{ background: COLORS.surface }}>
        <SettingsRow label="Moyen de paiement" sub="Géré via Stripe Connect" right={<ChevronRight size={16} style={{ color: COLORS.muted }} />} />
        <SettingsRow label="Historique de conversion" sub="Points, BARO Coin, récompenses" right={<ChevronRight size={16} style={{ color: COLORS.muted }} />} />
      </div>

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Vos données</h3>
      <div className="rounded-lg mb-6 overflow-hidden" style={{ background: COLORS.surface }}>
        <button onClick={exportData} disabled={exporting} className="w-full">
          <SettingsRow label="Exporter mes données" sub={exporting ? "Préparation…" : "Télécharger un fichier avec vos points, publications, etc."} right={<Download size={16} style={{ color: COLORS.teal }} />} />
        </button>
        <button onClick={() => setDeleteConfirm(true)} className="w-full">
          <SettingsRow label="Supprimer mon compte" sub="Efface vos données de l'application" right={<Trash2 size={16} style={{ color: "#E27D60" }} />} />
        </button>
      </div>

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Application</h3>
      <div className="rounded-lg mb-2 overflow-hidden" style={{ background: COLORS.surface }}>
        <SettingsRow label="Mode sombre" sub="Bientôt disponible — BAARO est en thème sombre fixe pour l'instant" right={<span className="text-[10px] px-2 py-1 rounded-full" style={{ background: COLORS.surface2, color: COLORS.muted }}>Bientôt</span>} />
        <button onClick={() => setLangOpen((o) => !o)} className="w-full">
          <SettingsRow label={t(lang, "language")} sub={LANGUAGES.find((l) => l.code === lang)?.label} right={<ChevronRight size={16} style={{ color: COLORS.muted, transform: langOpen ? "rotate(90deg)" : "none" }} />} />
        </button>
      </div>
      {langOpen && (
        <div className="grid grid-cols-2 gap-2 mb-6">
          {LANGUAGES.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)} className="px-3 py-2.5 rounded-md text-sm text-left transition"
              style={{ background: l.code === lang ? COLORS.gold : COLORS.surface, color: l.code === lang ? COLORS.bg : COLORS.ivory }}>
              {l.label}
            </button>
          ))}
        </div>
      )}
      {!langOpen && <div className="mb-6" />}

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Légal</h3>
      <div className="rounded-lg mb-6 overflow-hidden" style={{ background: COLORS.surface }}>
        <button onClick={() => setLegalOpen("terms")} className="w-full">
          <SettingsRow label="Conditions d'utilisation" right={<FileText size={16} style={{ color: COLORS.muted }} />} />
        </button>
        <button onClick={() => setLegalOpen("privacy")} className="w-full">
          <SettingsRow label="Politique de confidentialité" right={<FileText size={16} style={{ color: COLORS.muted }} />} />
        </button>
      </div>
      {legalOpen && <LegalModal type={legalOpen} onClose={() => setLegalOpen(null)} />}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setDeleteConfirm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-lg p-6" style={{ background: COLORS.surface2 }}>
            <div className="flex items-center gap-2 mb-3" style={{ color: "#E27D60" }}>
              <ShieldAlert size={18} /> <span className="text-sm font-medium">Supprimer votre compte ?</span>
            </div>
            <p className="text-xs leading-relaxed mb-5" style={{ color: COLORS.muted }}>
              Vos publications, points et données seront effacés de l'application. Cette action est irréversible.
              Note technique : la suppression complète de votre identifiant d'authentification nécessite une fonction serveur dédiée (à ajouter plus tard) ; ceci efface déjà toutes vos données visibles.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 py-2.5 rounded-md text-sm" style={{ background: COLORS.surface, color: COLORS.muted }}>Annuler</button>
              <button onClick={deleteAccountData} className="flex-1 py-2.5 rounded-md text-sm font-medium" style={{ background: "#E27D60", color: COLORS.bg }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition hover:opacity-90" style={{ background: "rgba(226,125,96,0.12)", color: "#E27D60" }}>
        <LogOut size={15} /> Se déconnecter
      </button>
    </div>
  );
}

const AUDIENCE_COUNTRIES = [
  { country: "Nigéria", pct: 24 }, { country: "France", pct: 18 }, { country: "Taïwan", pct: 15 },
  { country: "Argentine", pct: 12 }, { country: "Ghana", pct: 9 }, { country: "Autres", pct: 22 },
];
const AUDIENCE_AGE = [
  { range: "13-17", pct: 8 }, { range: "18-24", pct: 34 }, { range: "25-34", pct: 31 },
  { range: "35-44", pct: 17 }, { range: "45+", pct: 10 },
];
const ENGAGEMENT_TREND = [
  { day: "Lun", rate: 4.2 }, { day: "Mar", rate: 5.1 }, { day: "Mer", rate: 4.8 },
  { day: "Jeu", rate: 6.3 }, { day: "Ven", rate: 7.1 }, { day: "Sam", rate: 8.4 }, { day: "Dim", rate: 6.9 },
];
const BEST_TIMES = [
  { slot: "Mercredi, 18h-20h", note: "Pic d'engagement le plus élevé" },
  { slot: "Samedi, 10h-12h", note: "Bonne portée sur le fil « Pour toi »" },
  { slot: "Dimanche, 20h-22h", note: "Audience Amérique latine active" },
];
const BRAND_DEALS = [
  { id: "b1", brand: "Terra Café", flag: "🇧🇷", offer: "Post sponsorisé — café équitable", pay: "180 €", tag: "Nourriture" },
  { id: "b2", brand: "Wovin Studio", flag: "🇳🇬", offer: "Vidéo intégration app mobile", pay: "320 €", tag: "Tech" },
  { id: "b3", brand: "Lumé Skincare", flag: "🇫🇷", offer: "3 stories + 1 post dédié", pay: "250 €", tag: "Beauté" },
];

function SearchTab({ userId }) {
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [posts, setPosts] = useState([]);
  const [searching, setSearching] = useState(false);
  const [openProfileId, setOpenProfileId] = useState(null);

  const runSearch = async (q) => {
    if (!q.trim()) { setProfiles([]); setPosts([]); return; }
    setSearching(true);
    const [{ data: pRows }, { data: postRows }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, flag, handle").ilike("display_name", `%${q}%`).limit(10),
      supabase.from("posts").select("id, text, author_id, profiles(display_name, flag)").ilike("text", `%${q}%`).limit(10),
    ]);
    setProfiles(pRows || []);
    setPosts(postRows || []);
    setSearching(false);
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-md mb-5" style={{ background: COLORS.surface, border: "1px solid rgba(255,255,255,0.08)" }}>
        <Search size={16} style={{ color: COLORS.muted }} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value); }}
          placeholder="Rechercher une personne, un mot, un hashtag…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: COLORS.ivory }}
        />
      </div>

      {searching && <div className="text-xs" style={{ color: COLORS.muted }}>Recherche…</div>}

      {profiles.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: COLORS.muted }}>Personnes</div>
          <div className="space-y-2 mb-5">
            {profiles.map((p) => (
              <button key={p.user_id} onClick={() => setOpenProfileId(p.user_id)} className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-left" style={{ background: COLORS.surface }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm" style={{ background: COLORS.surface2, color: COLORS.gold }}>{(p.display_name || "?").charAt(0)}</div>
                <div>
                  <div className="text-sm" style={{ color: COLORS.ivory }}>{p.display_name} {p.flag}</div>
                  <div className="text-xs" style={{ color: COLORS.muted }}>{p.handle}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {posts.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: COLORS.muted }}>Publications</div>
          <div className="space-y-2">
            {posts.map((p) => (
              <div key={p.id} className="px-4 py-3 rounded-md text-sm" style={{ background: COLORS.surface, color: COLORS.ivory }}>
                <span className="font-medium">{p.profiles?.display_name}</span> — {p.text}
              </div>
            ))}
          </div>
        </>
      )}

      {!searching && query && profiles.length === 0 && posts.length === 0 && (
        <div className="text-xs text-center py-8" style={{ color: COLORS.muted }}>Aucun résultat pour "{query}".</div>
      )}
      {openProfileId && <ProfileModal authorId={openProfileId} userId={userId} onClose={() => setOpenProfileId(null)} />}
    </div>
  );
}

function CreatorStudioTab({ followers, balance }) {
  const [section, setSection] = useState("analytics");
  const [applied, setApplied] = useState({});
  const [verifStatus, setVerifStatus] = useState("none");
  const sections = [
    { id: "analytics", label: "Analytique", icon: BarChart3 },
    { id: "deals", label: "Partenariats", icon: Briefcase },
    { id: "kit", label: "Kit média", icon: FileText },
    { id: "verify", label: "Vérification", icon: BadgeCheck },
  ];

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex gap-2 mb-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => setSection(s.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs flex-shrink-0" style={{ background: section === s.id ? COLORS.gold : COLORS.surface, color: section === s.id ? COLORS.bg : COLORS.muted }}>
              <Icon size={13} /> {s.label}
            </button>
          );
        })}
      </div>

      {section === "analytics" && (
        <div className="space-y-5">
          <div className="rounded-lg p-4" style={{ background: COLORS.surface, height: 160 }}>
            <div className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: COLORS.muted }}>Taux d'engagement (7 jours)</div>
            <ResponsiveContainer width="100%" height="80%">
              <LineChart data={ENGAGEMENT_TREND}>
                <XAxis dataKey="day" stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ background: COLORS.surface2, border: "none", borderRadius: 6, fontSize: 12, color: COLORS.ivory }} formatter={(v) => `${v}%`} />
                <Line type="monotone" dataKey="rate" stroke={COLORS.teal} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: COLORS.muted }}>Audience par pays</div>
            <div className="space-y-1.5">
              {AUDIENCE_COUNTRIES.map((c) => (
                <div key={c.country} className="flex items-center gap-3">
                  <span className="text-xs w-20 flex-shrink-0" style={{ color: COLORS.ivory }}>{c.country}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: COLORS.surface }}>
                    <div className="h-full" style={{ width: `${c.pct}%`, background: COLORS.gold }} />
                  </div>
                  <span className="text-xs w-8 text-right" style={{ color: COLORS.muted }}>{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: COLORS.muted }}>Tranches d'âge</div>
            <div className="grid grid-cols-5 gap-1.5">
              {AUDIENCE_AGE.map((a) => (
                <div key={a.range} className="rounded-md p-2 text-center" style={{ background: COLORS.surface }}>
                  <div className="text-sm font-semibold" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{a.pct}%</div>
                  <div className="text-[10px] mt-0.5" style={{ color: COLORS.muted }}>{a.range}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: COLORS.muted }}>Meilleurs moments pour publier</div>
            <div className="space-y-2">
              {BEST_TIMES.map((b, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-md" style={{ background: COLORS.surface }}>
                  <Clock size={15} style={{ color: COLORS.teal }} />
                  <div><div className="text-sm" style={{ color: COLORS.ivory }}>{b.slot}</div><div className="text-xs" style={{ color: COLORS.muted }}>{b.note}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === "deals" && (
        <div className="space-y-3">
          <div className="text-xs px-3 py-2 rounded-md mb-2" style={{ background: "rgba(212,169,62,0.1)", color: COLORS.gold }}>
            Des marques proposent des collaborations rémunérées à des créateurs comme vous.
          </div>
          {BRAND_DEALS.map((d) => (
            <div key={d.id} className="rounded-lg p-4" style={{ background: COLORS.surface }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium" style={{ color: COLORS.ivory }}>{d.brand} {d.flag}</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: COLORS.surface2, color: COLORS.muted }}>{d.tag}</span>
              </div>
              <div className="text-xs mb-3" style={{ color: COLORS.muted }}>{d.offer}</div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{d.pay}</span>
                <button onClick={() => setApplied((p) => ({ ...p, [d.id]: true }))} disabled={applied[d.id]} className="text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-50" style={{ background: applied[d.id] ? COLORS.surface2 : COLORS.teal, color: applied[d.id] ? COLORS.muted : COLORS.bg }}>
                  {applied[d.id] ? "Candidature envoyée" : "Postuler"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === "kit" && (
        <div>
          <div className="text-xs mb-4" style={{ color: COLORS.muted }}>Une fiche résumant votre profil, prête à partager avec des marques.</div>
          <div className="rounded-xl p-6" style={{ background: `linear-gradient(135deg, ${COLORS.surface2}, ${COLORS.surface})`, border: "1px solid rgba(212,169,62,0.25)" }}>
            <div className="text-lg font-semibold mb-1" style={{ color: COLORS.ivory, fontFamily: "'Fraunces', serif" }}>Vous — Créateur BAARO</div>
            <div className="text-xs mb-5" style={{ color: COLORS.muted }}>Kit média généré automatiquement</div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div><div className="text-xl font-semibold" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{followers?.toLocaleString?.("fr-FR") ?? "3 842"}</div><div className="text-[10px]" style={{ color: COLORS.muted }}>Abonnés</div></div>
              <div><div className="text-xl font-semibold" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>6,4%</div><div className="text-[10px]" style={{ color: COLORS.muted }}>Engagement moyen</div></div>
              <div><div className="text-xl font-semibold" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>{balance?.toLocaleString?.("fr-FR") ?? "1 284"}</div><div className="text-[10px]" style={{ color: COLORS.muted }}>Points cumulés</div></div>
            </div>
            <div className="text-xs mb-1" style={{ color: COLORS.muted }}>Top audience : Nigéria, France, Taïwan</div>
            <div className="text-xs" style={{ color: COLORS.muted }}>Formats : vidéos courtes, cuisine, tech</div>
          </div>
          <button className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium" style={{ background: COLORS.teal, color: COLORS.bg }}>
            <Copy size={14} /> Copier le lien du kit média
          </button>
        </div>
      )}

      {section === "verify" && (
        <div className="rounded-lg p-6 text-center" style={{ background: COLORS.surface }}>
          <BadgeCheck size={32} className="mx-auto mb-3" style={{ color: verifStatus === "approved" ? COLORS.teal : COLORS.muted }} />
          {verifStatus === "none" && (
            <>
              <div className="text-sm mb-2" style={{ color: COLORS.ivory }}>Demander le badge vérifié</div>
              <div className="text-xs mb-4" style={{ color: COLORS.muted }}>Réservé aux comptes actifs, identifiables, respectant les règles de la communauté.</div>
              <button onClick={() => setVerifStatus("pending")} className="px-5 py-2.5 rounded-md text-sm font-medium" style={{ background: COLORS.gold, color: COLORS.bg }}>Envoyer ma demande</button>
            </>
          )}
          {verifStatus === "pending" && (
            <>
              <div className="text-sm mb-1" style={{ color: COLORS.ivory }}>Demande en cours d'examen</div>
              <div className="text-xs" style={{ color: COLORS.muted }}>Réponse généralement sous 5 jours.</div>
              <button onClick={() => setVerifStatus("approved")} className="text-xs mt-4" style={{ color: COLORS.teal }}>(Démo) Simuler l'approbation</button>
            </>
          )}
          {verifStatus === "approved" && (
            <>
              <div className="text-sm flex items-center justify-center gap-1.5" style={{ color: COLORS.ivory }}>Compte vérifié <BadgeCheck size={14} style={{ color: COLORS.teal }} /></div>
              <div className="text-xs mt-1" style={{ color: COLORS.muted }}>Le badge apparaît désormais à côté de votre nom.</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function GovernanceTab({ votes, myVotes, castVote }) {
  const countsFor = (proposalId) => {
    const relevant = votes.filter((v) => v.proposal_id === proposalId);
    const pour = relevant.filter((v) => v.choice === "pour").length;
    const contre = relevant.filter((v) => v.choice === "contre").length;
    const total = pour + contre;
    return { pour, contre, total, pctPour: total ? Math.round((pour / total) * 100) : 0 };
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-5 text-xs px-3 py-2 rounded-md" style={{ background: "rgba(63,167,150,0.12)", color: COLORS.teal }}>
        <Users size={14} /> BAARO est piloté par sa communauté — chaque membre vote directement sur les décisions produit, une voix par personne.
      </div>
      <div className="space-y-4">
        {PROPOSALS.map((p) => {
          const c = countsFor(p.id);
          const myChoice = myVotes[p.id];
          return (
            <div key={p.id} className="rounded-lg p-5" style={{ background: COLORS.surface, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-sm font-medium mb-1" style={{ color: COLORS.ivory }}>{p.title}</div>
              <div className="text-xs mb-4" style={{ color: COLORS.muted }}>{p.description}</div>

              <div className="w-full h-2 rounded-full mb-2 overflow-hidden" style={{ background: COLORS.surface2 }}>
                <div className="h-full" style={{ width: `${c.pctPour}%`, background: COLORS.teal }} />
              </div>
              <div className="flex items-center justify-between text-xs mb-4" style={{ color: COLORS.muted }}>
                <span>{c.pour} pour ({c.pctPour}%)</span>
                <span>{c.contre} contre</span>
              </div>

              {myChoice ? (
                <div className="text-xs" style={{ color: COLORS.gold }}>Vous avez voté « {myChoice} »</div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => castVote(p.id, "pour")} className="flex-1 py-2 rounded-md text-sm font-medium transition hover:opacity-90" style={{ background: COLORS.teal, color: COLORS.bg }}>
                    Pour
                  </button>
                  <button onClick={() => castVote(p.id, "contre")} className="flex-1 py-2 rounded-md text-sm font-medium transition hover:opacity-90" style={{ background: COLORS.surface2, color: COLORS.ivory }}>
                    Contre
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NearbyTab() {
  const available = isNearbyAvailable();
  const [active, setActive] = useState(false);
  const [devices, setDevices] = useState(0);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!available) return;
    const foundSub = onNearbyEvent("deviceFound", () => setDevices((d) => d + 1));
    const lostSub = onNearbyEvent("deviceLost", () => setDevices((d) => Math.max(0, d - 1)));
    const msgSub = onNearbyEvent("messageReceived", (data) => {
      setMessages((prev) => [...prev, { from: "eux", text: data.text }]);
    });
    return () => {
      foundSub?.remove?.();
      lostSub?.remove?.();
      msgSub?.remove?.();
    };
  }, [available]);

  const toggle = async () => {
    if (active) {
      await stopNearby();
      setActive(false);
      setDevices(0);
    } else {
      await startNearby("Membre BAARO");
      setActive(true);
    }
  };

  const send = async () => {
    if (!draft.trim()) return;
    await sendNearbyMessage(draft.trim());
    setMessages((prev) => [...prev, { from: "moi", text: draft.trim() }]);
    setDraft("");
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-5 text-xs px-3 py-2 rounded-md" style={{ background: "rgba(63,167,150,0.12)", color: COLORS.teal }}>
        <Radio size={14} /> Communique via Bluetooth et Wi-Fi à proximité — fonctionne sans Internet ni forfait data.
      </div>

      {!available ? (
        <div className="rounded-lg p-6 text-center" style={{ background: COLORS.surface }}>
          <Smartphone size={28} className="mx-auto mb-3" style={{ color: COLORS.muted }} />
          <div className="text-sm mb-1" style={{ color: COLORS.ivory }}>Disponible uniquement dans l'app Android installée</div>
          <div className="text-xs" style={{ color: COLORS.muted }}>
            Cette fonctionnalité utilise le Bluetooth et le Wi-Fi de votre téléphone directement — elle ne peut pas
            fonctionner dans un navigateur web, seulement dans BAARO installé depuis le Play Store ou un .apk.
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-lg p-5 mb-5" style={{ background: `linear-gradient(135deg, ${COLORS.surface2}, ${COLORS.surface})`, border: "1px solid rgba(63,167,150,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-medium" style={{ color: COLORS.ivory }}>{active ? "Recherche active" : "Hors ligne"}</div>
                <div className="text-xs" style={{ color: COLORS.muted }}>{active ? `${devices} appareil(s) BAARO à proximité` : "Activez pour découvrir les appareils proches"}</div>
              </div>
              <button onClick={toggle} className="px-4 py-2 rounded-md text-sm font-medium" style={{ background: active ? COLORS.surface : COLORS.teal, color: active ? COLORS.ivory : COLORS.bg }}>
                {active ? "Arrêter" : "Activer"}
              </button>
            </div>
          </div>

          {active && (
            <>
              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.from === "moi" ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[75%] px-4 py-2.5 rounded-lg text-sm" style={{ background: m.from === "moi" ? COLORS.teal : COLORS.surface, color: m.from === "moi" ? COLORS.bg : COLORS.ivory }}>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Message aux appareils proches…"
                  className="flex-1 px-4 py-2.5 rounded-md text-sm outline-none"
                  style={{ background: COLORS.surface, color: COLORS.ivory, border: "1px solid rgba(255,255,255,0.08)" }}
                />
                <button onClick={send} className="p-2.5 rounded-md" style={{ background: COLORS.gold, color: COLORS.bg }}>
                  <Send size={18} />
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function AssistantTab({ onEarn }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Bonjour, je suis l'assistant BAARO. Je peux résumer votre fil, traduire vos publications ou répondre à vos questions sur la plateforme. Que puis-je faire pour vous ?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    setInput("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1000,
          system: "Tu es l'assistant intégré à BAARO, un réseau social mondial. Réponds en français, de façon brève, chaleureuse et utile, en te concentrant sur l'aide à la création de contenu, la traduction, ou la compréhension du fonctionnement de la plateforme (points, portefeuille, monétisation).",
          messages: [{ role: "user", content: userMsg }],
        }),
      });
      const data = await response.json();
      const textBlock = (data.content || []).find((b) => b.type === "text");
      const reply = textBlock ? textBlock.text : "Désolé, je n'ai pas pu générer de réponse.";
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
      onEarn(0.5, "Question posée à l'assistant IA");
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Une erreur est survenue. Réessayez dans un instant." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col" style={{ height: "72vh" }}>
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] px-4 py-2.5 rounded-lg text-sm leading-relaxed" style={{
              background: m.role === "user" ? COLORS.teal : COLORS.surface,
              color: m.role === "user" ? COLORS.bg : COLORS.ivory,
            }}>
              {m.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1 text-xs font-medium" style={{ color: COLORS.gold }}>
                  <Sparkles size={12} /> Assistant BAARO
                </div>
              )}
              {m.text}
            </div>
          </div>
        ))}
        {loading && <div className="text-xs" style={{ color: COLORS.muted }}>L'assistant réfléchit…</div>}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Posez une question à l'assistant…"
          className="flex-1 px-4 py-2.5 rounded-md text-sm outline-none"
          style={{ background: COLORS.surface, color: COLORS.ivory, border: "1px solid rgba(255,255,255,0.08)" }}
        />
        <button onClick={send} disabled={loading} className="p-2.5 rounded-md transition hover:opacity-90" style={{ background: COLORS.gold, color: COLORS.bg }}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

const ONBOARDING_STEPS = [
  { icon: Globe2, title: "Bienvenue sur BAARO", text: "Un réseau social simple : publiez, regardez des vidéos, discutez — comme les applications que vous connaissez déjà." },
  { icon: Wallet, title: "Gagnez des points en participant", text: "Chaque like, chaque vidéo regardée vous rapporte des points. Ils sont visibles en haut de l'écran, et échangeables contre des récompenses." },
  { icon: Sparkles, title: "Un assistant toujours disponible", text: "Une question ? Besoin d'une traduction ? Touchez « Assistant IA » à tout moment, il répond en français." },
  { icon: Menu, title: "Tout est à portée de main", text: "Les 5 boutons du bas suffisent pour l'essentiel. Le bouton « Plus » range tout le reste (portefeuille crypto, paramètres...)." },
];

function OnboardingModal({ onFinish }) {
  const [step, setStep] = useState(0);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const current = ONBOARDING_STEPS[step];
  const Icon = current.icon;
  const isLast = step === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-sm rounded-2xl p-7 text-center" style={{ background: COLORS.surface2, border: "1px solid rgba(212,169,62,0.25)" }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(212,169,62,0.15)" }}>
          <Icon size={28} style={{ color: COLORS.gold }} />
        </div>
        <div className="text-lg font-semibold mb-2" style={{ color: COLORS.ivory, fontFamily: "'Fraunces', serif" }}>{current.title}</div>
        <div className="text-sm leading-relaxed mb-6" style={{ color: COLORS.muted }}>{current.text}</div>

        {isLast && (
          <label className="flex items-start gap-2 text-left text-xs mb-5 px-1" style={{ color: COLORS.muted }}>
            <input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} className="mt-0.5" />
            J'ai au moins 13 ans et j'accepte les Conditions d'utilisation et la Politique de confidentialité de BAARO.
          </label>
        )}

        <div className="flex items-center justify-center gap-1.5 mb-6">
          {ONBOARDING_STEPS.map((_, i) => (
            <div key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === step ? 18 : 6, background: i === step ? COLORS.gold : "rgba(255,255,255,0.15)" }} />
          ))}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="flex-1 py-2.5 rounded-md text-sm" style={{ background: COLORS.surface, color: COLORS.muted }}>
              Retour
            </button>
          )}
          <button
            onClick={() => (isLast ? (ageConfirmed && onFinish()) : setStep((s) => s + 1))}
            disabled={isLast && !ageConfirmed}
            className="flex-1 py-2.5 rounded-md text-sm font-medium disabled:opacity-40"
            style={{ background: COLORS.gold, color: COLORS.bg }}
          >
            {isLast ? "Commencer" : "Suivant"}
          </button>
        </div>
        {!isLast && (
          <button onClick={onFinish} className="text-xs mt-4" style={{ color: COLORS.muted }}>
            Passer l'introduction
          </button>
        )}
      </div>
    </div>
  );
}

function CaptchaGate({ onVerify, error }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center" style={{ background: COLORS.bg }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&display=swap');`}</style>
      <div className="text-2xl font-semibold" style={{ color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>BAARO</div>
      <div className="text-sm max-w-xs" style={{ color: COLORS.muted }}>
        Une vérification rapide avant d'entrer — ça protège la communauté contre les faux comptes.
      </div>
      <TurnstileWidget onVerify={(token) => token && onVerify(token)} />
      {error && <div className="text-xs" style={{ color: "#E27D60" }}>{error}</div>}
    </div>
  );
}

function SplashScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: COLORS.bg }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&display=swap');
        @keyframes baaro-pulse { 0%, 100% { opacity: 0.4; transform: scale(0.96); } 50% { opacity: 1; transform: scale(1); } }
      `}</style>
      <div
        className="text-3xl font-semibold"
        style={{ color: COLORS.gold, fontFamily: "'Fraunces', serif", animation: "baaro-pulse 1.6s ease-in-out infinite" }}
      >
        BAARO
      </div>
      <div className="w-32 h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full w-1/3 rounded-full" style={{ background: COLORS.teal, animation: "baaro-pulse 1.6s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="rounded-lg p-5 animate-pulse" style={{ background: COLORS.surface, border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full" style={{ background: COLORS.surface2 }} />
        <div className="space-y-2">
          <div className="h-3 w-24 rounded" style={{ background: COLORS.surface2 }} />
          <div className="h-2 w-16 rounded" style={{ background: COLORS.surface2 }} />
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 w-full rounded" style={{ background: COLORS.surface2 }} />
        <div className="h-3 w-4/5 rounded" style={{ background: COLORS.surface2 }} />
      </div>
      <div className="h-3 w-1/3 rounded" style={{ background: COLORS.surface2 }} />
    </div>
  );
}

export default function BaaroApp() {
  const [tab, setTab] = useState("feed");
  const [subscription, setSubscription] = useState("free");
  const [lang, setLang] = useState("fr");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("baaro:onboarding_seen");
    if (!seen) setShowOnboarding(true);
  }, []);

  const finishOnboarding = () => {
    localStorage.setItem("baaro:onboarding_seen", "1");
    setShowOnboarding(false);
  };
  const { userId, ready, needsCaptcha, authError, completeCaptcha } = useSession();
  const { balance, history, earn, redeem, setBalanceDirect } = useWallet(userId);
  const { holdings, convert } = useCrypto(userId);
  const { posts, likePost: likePostDb, createPost, loading: postsLoading } = usePosts(userId);
  const { stories, addStory } = useStories(userId);
  const { notifications, unreadCount, markAllRead } = useNotifications(userId);
  const [notifOpen, setNotifOpen] = useState(false);
  const { videos, watchVideo: watchVideoDb } = useVideos(userId);
  const { followers, counts: followerCounts } = useFollowers(userId);
  const { votes, myVotes, castVote } = useGovernance(userId);

  const convertToCrypto = async (pts) => {
    const result = await convert(pts);
    if (result.success) setBalanceDirect(result.balance);
    return result.success;
  };

  const likePost = async (id) => {
    await likePostDb(id);
    earn("like_post");
  };

  const publishPost = async (text, file) => {
    await createPost(text, file);
    earn(file ? "publish_post_media" : "publish_post");
  };

  const watchVideo = async (v) => {
    await watchVideoDb(v);
    earn("watch_video", v.title);
  };

  const subscribe = (tierId) => {
    setSubscription(tierId);
    const tier = SUBSCRIPTION_TIERS.find((tr) => tr.id === tierId);
    if (tier && tierId !== "free") earn("subscribe", tier.name);
  };

  const primaryTabs = [
    { id: "feed", label: t(lang, "feed"), icon: Globe2 },
    { id: "videos", label: t(lang, "videos"), icon: Play },
    { id: "messages", label: t(lang, "messages"), icon: Lock },
    { id: "wallet", label: t(lang, "wallet"), icon: Wallet },
    { id: "assistant", label: t(lang, "assistant"), icon: Sparkles },
  ];
  const moreTabs = [
    { id: "debates", label: "Débats", icon: Swords },
    { id: "search", label: "Recherche", icon: Search },
    { id: "studio", label: "Studio", icon: Briefcase },
    { id: "nearby", label: "Hors-ligne", icon: Radio },
    { id: "crypto", label: t(lang, "crypto"), icon: Coins },
    { id: "profits", label: t(lang, "profits"), icon: TrendingUp },
    { id: "followers", label: t(lang, "followers"), icon: Users },
    { id: "governance", label: "Gouvernance", icon: Vote },
    { id: "subscription", label: t(lang, "subscription"), icon: UserPlus },
    { id: "settings", label: t(lang, "settings"), icon: Settings },
  ];
  const tabs = [...primaryTabs, ...moreTabs];

  if (!ready) {
    return needsCaptcha ? (
      <CaptchaGate onVerify={completeCaptcha} error={authError} />
    ) : (
      <SplashScreen />
    );
  }

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg, fontFamily: "'Inter', sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
      `}</style>

      {showOnboarding && <OnboardingModal onFinish={finishOnboarding} />}
      {notifOpen && <NotificationsPanel notifications={notifications} onClose={() => setNotifOpen(false)} onMarkRead={markAllRead} />}

      <div className="pointer-events-none fixed top-0 left-0 right-0 h-64 -z-10" style={{ background: `radial-gradient(ellipse at top, rgba(212,169,62,0.08), transparent 70%)` }} />

      <header className="px-4 pt-6 pb-4 flex items-center justify-between max-w-xl mx-auto gap-2">
        <div className="text-2xl font-semibold" style={{ color: COLORS.ivory, fontFamily: "'Fraunces', serif" }}>
          BAARO
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setNotifOpen(true)} className="relative p-1.5 rounded-full" style={{ background: COLORS.surface, color: COLORS.muted }} aria-label="Notifications">
            <Bell size={15} />
            {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: COLORS.gold }} />}
          </button>
          <button onClick={() => setShowOnboarding(true)} className="p-1.5 rounded-full" style={{ background: COLORS.surface, color: COLORS.muted }} aria-label="Aide">
            <HelpCircle size={15} />
          </button>
          <div className="relative">
            <button onClick={() => setLangMenuOpen((o) => !o)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ background: COLORS.surface, color: COLORS.ivory }}>
              <Languages size={13} /> {LANGUAGES.find((l) => l.code === lang)?.label}
            </button>
            {langMenuOpen && (
              <div className="absolute right-0 mt-2 w-44 max-h-64 overflow-y-auto rounded-md py-1 z-50" style={{ background: COLORS.surface2, border: "1px solid rgba(255,255,255,0.08)" }}>
                {LANGUAGES.map((l) => (
                  <button key={l.code} onClick={() => { setLang(l.code); setLangMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:opacity-80"
                    style={{ color: l.code === lang ? COLORS.gold : COLORS.ivory }}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ background: COLORS.surface, color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>
            <Wallet size={13} /> {balance.toLocaleString("fr-FR")} {t(lang, "pts")}
          </div>
        </div>
      </header>

      <Ticker />
      {tab === "feed" && <StoriesBar stories={stories} onAdd={addStory} />}


      <nav className="flex gap-1 py-3 max-w-xl mx-auto px-4">
        {primaryTabs.map((pt) => {
          const Icon = pt.icon;
          const active = tab === pt.id;
          return (
            <button
              key={pt.id}
              onClick={() => setTab(pt.id)}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs transition-all active:scale-95"
              style={{
                background: active ? COLORS.gold : "transparent",
                color: active ? COLORS.bg : COLORS.muted,
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon size={18} />
              {pt.label}
            </button>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs transition-all active:scale-95"
          style={{ color: moreTabs.some((mt) => mt.id === tab) ? COLORS.gold : COLORS.muted, fontWeight: moreTabs.some((mt) => mt.id === tab) ? 600 : 400 }}
        >
          <Menu size={18} />
          Plus
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setMoreOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl rounded-t-2xl p-5 pb-8" style={{ background: COLORS.surface2 }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }} />
            <div className="grid grid-cols-3 gap-3">
              {moreTabs.map((mt) => {
                const Icon = mt.icon;
                return (
                  <button
                    key={mt.id}
                    onClick={() => { setTab(mt.id); setMoreOpen(false); }}
                    className="flex flex-col items-center gap-2 py-4 rounded-lg text-xs transition active:scale-95"
                    style={{ background: COLORS.surface, color: tab === mt.id ? COLORS.gold : COLORS.ivory }}
                  >
                    <Icon size={20} />
                    {mt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "feed" && <FeedTab posts={posts} onLike={likePost} onPost={publishPost} lang={lang} loading={postsLoading} userId={userId} />}
      {tab === "videos" && <VideosTab videos={videos} onWatch={watchVideo} />}
      {tab === "messages" && <MessagesTab userId={userId} />}
      {tab === "debates" && <DebatesTab userId={userId} />}
      {tab === "wallet" && <WalletTab balance={balance} history={history} onRedeem={redeem} />}
      {tab === "search" && <SearchTab userId={userId} />}
      {tab === "studio" && <CreatorStudioTab followers={followerCounts.followers} balance={balance} />}
      {tab === "nearby" && <NearbyTab />}
      {tab === "crypto" && <CryptoTab balance={balance} holdings={holdings} onConvert={convertToCrypto} />}
      {tab === "profits" && <ProfitsTab />}
      {tab === "followers" && <FollowersTab followers={followers} counts={followerCounts} />}
      {tab === "governance" && <GovernanceTab votes={votes} myVotes={myVotes} castVote={castVote} />}
      {tab === "subscription" && <SubscriptionTab current={subscription} onSubscribe={subscribe} />}
      {tab === "assistant" && <AssistantTab onEarn={earn} />}
      {tab === "settings" && <SettingsTab subscription={subscription} lang={lang} setLang={setLang} userId={userId} />}
    </div>
  );
}
