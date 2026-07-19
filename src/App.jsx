import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient.js";
import { API_BASE } from "./config.js";
import { Heart, MessageCircle, Share2, Wallet, Send, Sparkles, Globe2, ArrowUpRight, Play, Users, UserPlus, TrendingUp, Check, Lock, ShieldCheck, Coins, ArrowRightLeft, AlertTriangle, Settings, Bell, Moon, LogOut, ChevronRight, Languages, Vote, Menu, X, HelpCircle, Radio, Smartphone, Bookmark, Music2, Volume2, BadgeCheck, Briefcase, FileText, Copy, BarChart3, Clock } from "lucide-react";
import { isNearbyAvailable, startNearby, stopNearby, sendNearbyMessage, onNearbyEvent } from "./nearby.js";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = {
  bg: "#0B1526",
  surface: "#121F35",
  surface2: "#182948",
  gold: "#D4A93E",
  teal: "#3FA796",
  ivory: "#EDEAE0",
  muted: "#7C879C",
};

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

const SEED_POSTS = [
  { id: 1, name: "Amara K.", flag: "🇳🇬", handle: "Lagos", text: "Premier live de cuisine sur BAARO aujourd'hui — merci pour vos retours, la communauté grandit vite ici.", likes: 214, comments: 38, earned: 0 },
  { id: 2, name: "Louis F.", flag: "🇫🇷", handle: "Lyon", text: "L'assistant IA m'a aidé à traduire mon post en 6 langues en un clic. Portée x4 sur ma dernière publication.", likes: 156, comments: 22, earned: 0 },
  { id: 3, name: "Mei T.", flag: "🇹🇼", handle: "Taipei", text: "3 mois sur la plateforme, déjà convertis mes premiers points en récompense réelle. Simple et transparent.", likes: 341, comments: 54, earned: 0 },
  { id: 4, name: "Diego R.", flag: "🇦🇷", handle: "Rosario", text: "Le fil d'actualité résumé par l'IA le matin me fait gagner un temps fou avant le travail.", likes: 98, comments: 11, earned: 0 },
];

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

const SEED_VIDEOS = [
  { id: "v1", title: "Recette de jollof rice en 10 minutes", author: "Amara K.", flag: "🇳🇬", views: "128K", likes: 4200, duration: "9:41", earned: 62, color: COLORS.teal },
  { id: "v2", title: "Comment j'utilise l'IA pour traduire mes vidéos", author: "Louis F.", flag: "🇫🇷", views: "84K", likes: 2600, duration: "6:12", earned: 38, color: COLORS.gold },
  { id: "v3", title: "Studio de danse à Taipei — vlog", author: "Mei T.", flag: "🇹🇼", views: "210K", likes: 9100, duration: "12:04", earned: 97, color: "#6C7FD1" },
  { id: "v4", title: "Marché de rue à Rosario, en direct", author: "Diego R.", flag: "🇦🇷", views: "45K", likes: 1800, duration: "18:30", earned: 21, color: "#E27D60" },
];

const SEED_FOLLOWERS = [
  { id: "f1", name: "Sofia N.", flag: "🇮🇹", handle: "Milan", since: "Nouvel abonné" },
  { id: "f2", name: "Kwame A.", flag: "🇬🇭", handle: "Accra", since: "Il y a 2 jours" },
  { id: "f3", name: "Yuki S.", flag: "🇯🇵", handle: "Kyoto", since: "Il y a 4 jours" },
  { id: "f4", name: "Elena V.", flag: "🇪🇸", handle: "Séville", since: "Il y a 1 semaine" },
  { id: "f5", name: "Tom B.", flag: "🇬🇧", handle: "Bristol", since: "Il y a 2 semaines" },
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

function useSession() {
  const [userId, setUserId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          session = data.session;
        }
        setUserId(session?.user?.id || null);
      } catch (e) {
        console.error("Erreur de session Supabase :", e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  return { userId, ready };
}

function useWallet(userId) {
  const [balance, setBalance] = useState(1284);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      let { data: wallet } = await supabase.from("wallets").select("*").eq("user_id", userId).single();
      if (!wallet) {
        const { data: created } = await supabase.from("wallets").insert({ user_id: userId, balance: 1284 }).select().single();
        wallet = created;
      }
      setBalance(wallet.balance);

      const { data: txs } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      setHistory(
        (txs || []).map((tx) => ({
          id: tx.id,
          label: tx.label,
          pts: tx.pts,
          ts: new Date(tx.created_at).toLocaleString("fr-FR"),
        }))
      );
    })();
  }, [userId]);

  const earn = async (amount, label) => {
    if (!userId) return;
    setBalance((prevBal) => {
      const newBal = prevBal + amount;
      supabase.from("wallets").update({ balance: newBal }).eq("user_id", userId).then(() => {});
      return newBal;
    });
    const { data: tx } = await supabase.from("transactions").insert({ user_id: userId, label, pts: amount }).select().single();
    if (tx) setHistory((prev) => [{ id: tx.id, label, pts: amount, ts: "À l'instant" }, ...prev].slice(0, 20));
  };

  const redeem = async (cost, label) => {
    if (!userId || balance < cost) return false;
    const newBal = balance - cost;
    setBalance(newBal);
    await supabase.from("wallets").update({ balance: newBal }).eq("user_id", userId);
    const { data: tx } = await supabase.from("transactions").insert({ user_id: userId, label, pts: -cost }).select().single();
    if (tx) setHistory((prev) => [{ id: tx.id, label, pts: -cost, ts: "À l'instant" }, ...prev].slice(0, 20));
    return true;
  };

  return { balance, history, earn, redeem };
}

function useCrypto(userId) {
  const [holdings, setHoldings] = useState(0);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      let { data: row } = await supabase.from("crypto_holdings").select("*").eq("user_id", userId).single();
      if (!row) {
        const { data: created } = await supabase.from("crypto_holdings").insert({ user_id: userId, holdings: 0 }).select().single();
        row = created;
      }
      setHoldings(row.holdings);
    })();
  }, [userId]);

  const addHoldings = async (amount) => {
    const next = holdings + amount;
    setHoldings(next);
    if (userId) await supabase.from("crypto_holdings").update({ holdings: next }).eq("user_id", userId);
  };

  return { holdings, addHoldings };
}

function usePosts(userId) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPosts = async () => {
    const { data: rows } = await supabase
      .from("posts")
      .select("id, text, created_at, author_id, profiles(display_name, flag, handle)")
      .order("created_at", { ascending: false })
      .limit(30);
    const { data: likeRows } = await supabase.from("post_likes").select("post_id, user_id");
    const counts = {};
    const likedByMe = {};
    (likeRows || []).forEach((l) => {
      counts[l.post_id] = (counts[l.post_id] || 0) + 1;
      if (l.user_id === userId) likedByMe[l.post_id] = true;
    });
    setPosts(
      (rows || []).map((r) => ({
        id: r.id,
        name: r.profiles?.display_name || "Membre BAARO",
        flag: r.profiles?.flag || "🌍",
        handle: r.profiles?.handle || "",
        text: r.text,
        likes: counts[r.id] || 0,
        comments: 0,
        liked: !!likedByMe[r.id],
        earned: 0,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    (async () => {
      await supabase.from("profiles").upsert({ user_id: userId, display_name: "Vous", flag: "🌍", handle: "Membre BAARO" });
      const { count } = await supabase.from("posts").select("id", { count: "exact", head: true });
      if (!count) {
        for (const seed of SEED_POSTS) {
          await supabase.from("posts").insert({ author_id: userId, text: seed.text });
        }
      }
      await loadPosts();
    })();
  }, [userId]);

  const likePost = async (id) => {
    setPosts((prev) => prev.map((p) => (p.id === id && !p.liked ? { ...p, liked: true, likes: p.likes + 1, earned: p.earned + 2 } : p)));
    if (userId) await supabase.from("post_likes").insert({ post_id: id, user_id: userId });
  };

  return { posts, likePost, loading };
}

function useVideos(userId) {
  const [videos, setVideos] = useState([]);

  const load = async () => {
    const { data: rows } = await supabase
      .from("videos")
      .select("id, title, duration, views, author_id, profiles(display_name, flag)")
      .order("created_at", { ascending: false })
      .limit(30);
    setVideos(
      (rows || []).map((r, i) => ({
        id: r.id,
        title: r.title,
        author: r.profiles?.display_name || "Membre BAARO",
        flag: r.profiles?.flag || "🌍",
        views: `${r.views}`,
        likes: 0,
        duration: r.duration || "—",
        earned: 0,
        color: [COLORS.teal, COLORS.gold, "#6C7FD1", "#E27D60"][i % 4],
      }))
    );
  };

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { count } = await supabase.from("videos").select("id", { count: "exact", head: true });
      if (!count) {
        for (const seed of SEED_VIDEOS) {
          await supabase.from("videos").insert({ author_id: userId, title: seed.title, duration: seed.duration, views: 0 });
        }
      }
      await load();
    })();
  }, [userId]);

  const watchVideo = async (v) => {
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, views: `${Number(x.views) + 1}` } : x)));
    if (userId) await supabase.from("videos").update({ views: Number(v.views) + 1 }).eq("id", v.id);
  };

  return { videos, watchVideo };
}

function useFollowers(userId) {
  const [followers, setFollowers] = useState([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: rows } = await supabase
        .from("follows")
        .select("follower_id, created_at, profiles:follower_id(display_name, flag, handle)")
        .eq("followed_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      setFollowers(
        (rows || []).map((r) => ({
          id: r.follower_id,
          name: r.profiles?.display_name || "Membre BAARO",
          flag: r.profiles?.flag || "🌍",
          handle: r.profiles?.handle || "",
          since: new Date(r.created_at).toLocaleDateString("fr-FR"),
        }))
      );
      const { count: followerCount } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("followed_id", userId);
      const { count: followingCount } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId);
      setCounts({ followers: followerCount || 0, following: followingCount || 0 });
    })();
  }, [userId]);

  return { followers, counts };
}

const PROPOSALS = [
  { id: "p1", title: "Plafonner la publicité à 1 post sur 15 dans le fil", description: "Réduit les revenus pub à court terme, mais protège l'expérience des membres." },
  { id: "p2", title: "Reverser 60% (au lieu de 50%) des revenus pub aux créateurs", description: "Plus généreux pour les créateurs, plus lent pour financer la plateforme." },
  { id: "p3", title: "Ajouter un mode « lecture seule sans algorithme »", description: "Fil strictement chronologique, sans recommandation automatique." },
];

function useGovernance(userId) {
  const [votes, setVotes] = useState([]);
  const [myVotes, setMyVotes] = useState({});

  const load = async () => {
    const { data } = await supabase.from("votes").select("proposal_id, choice, user_id");
    setVotes(data || []);
    if (userId) {
      const mine = {};
      (data || []).forEach((v) => { if (v.user_id === userId) mine[v.proposal_id] = v.choice; });
      setMyVotes(mine);
    }
  };

  useEffect(() => {
    if (!userId) return;
    load();
  }, [userId]);

  const castVote = async (proposalId, choice) => {
    if (!userId || myVotes[proposalId]) return;
    setMyVotes((prev) => ({ ...prev, [proposalId]: choice }));
    setVotes((prev) => [...prev, { proposal_id: proposalId, choice, user_id: userId }]);
    await supabase.from("votes").upsert({ proposal_id: proposalId, user_id: userId, choice });
  };

  return { votes, myVotes, castVote };
}

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

function FeedTab({ posts, onLike, lang, loading }) {
  const [translations, setTranslations] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [verifications, setVerifications] = useState({});
  const [verifyingId, setVerifyingId] = useState(null);

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
      {posts.map((p) => (
        <article key={p.id} className="rounded-lg p-5" style={{ background: COLORS.surface, border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold" style={{ background: COLORS.surface2, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
              {p.name.charAt(0)}
            </div>
            <div>
              <div className="font-medium" style={{ color: COLORS.ivory }}>{p.name} <span className="ml-1">{p.flag}</span></div>
              <div className="text-xs" style={{ color: COLORS.muted }}>{p.handle}</div>
            </div>
          </div>
          <p className="text-sm leading-relaxed mb-2" style={{ color: COLORS.ivory }}>{p.text}</p>
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
            <span className="flex items-center gap-1.5"><MessageCircle size={16} /> {p.comments}</span>
            <span className="flex items-center gap-1.5"><Share2 size={16} /></span>
            {p.earned > 0 && (
              <span className="ml-auto text-xs font-medium" style={{ color: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }}>
                +{p.earned} {t(lang, "pts")}
              </span>
            )}
          </div>
        </article>
      ))}
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
    const success = await onRedeem(opt.cost, opt.label);
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

const SEED_CONVERSATIONS = [
  {
    id: "c1", name: "Sofia N.", flag: "🇮🇹", online: true,
    messages: [
      { from: "them", text: "Salut ! J'ai adoré ta vidéo sur l'IA et la traduction 🎬", ts: "10:12" },
      { from: "me", text: "Merci beaucoup ! Ça t'a aidée pour tes propres publications ?", ts: "10:15" },
      { from: "them", text: "Oui carrément, je vais essayer ce soir.", ts: "10:16" },
    ],
  },
  {
    id: "c2", name: "Kwame A.", flag: "🇬🇭", online: false,
    messages: [
      { from: "them", text: "On peut collaborer sur un live la semaine prochaine ?", ts: "Hier" },
    ],
  },
  {
    id: "c3", name: "Yuki S.", flag: "🇯🇵", online: true,
    messages: [
      { from: "me", text: "Ton dernier post a super bien marché !", ts: "Lun" },
      { from: "them", text: "Merci, l'assistant m'a aidée à le traduire en 4 langues.", ts: "Lun" },
    ],
  },
];

function MessagesTab() {
  const [conversations] = useState(SEED_CONVERSATIONS);
  const [activeId, setActiveId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [threads, setThreads] = useState(() => Object.fromEntries(SEED_CONVERSATIONS.map((c) => [c.id, c.messages])));
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeId, threads]);

  const active = conversations.find((c) => c.id === activeId);

  const send = () => {
    const text = (drafts[activeId] || "").trim();
    if (!text) return;
    setThreads((prev) => ({
      ...prev,
      [activeId]: [...prev[activeId], { from: "me", text, ts: "À l'instant" }],
    }));
    setDrafts((d) => ({ ...d, [activeId]: "" }));
  };

  if (!active) {
    return (
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-4 text-xs px-3 py-2 rounded-md" style={{ background: COLORS.surface, color: COLORS.teal }}>
          <ShieldCheck size={14} /> Messages chiffrés de bout en bout — seuls vous et votre correspondant pouvez les lire
        </div>
        <div className="space-y-2">
          {conversations.map((c) => {
            const last = threads[c.id][threads[c.id].length - 1];
            return (
              <button key={c.id} onClick={() => setActiveId(c.id)} className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-left transition hover:opacity-90" style={{ background: COLORS.surface }}>
                <div className="relative">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold" style={{ background: COLORS.surface2, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
                    {c.name.charAt(0)}
                  </div>
                  {c.online && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full" style={{ background: COLORS.teal, border: `2px solid ${COLORS.surface}` }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm" style={{ color: COLORS.ivory }}>{c.name} {c.flag}</div>
                  <div className="text-xs truncate" style={{ color: COLORS.muted }}>{last.from === "me" ? "Vous : " : ""}{last.text}</div>
                </div>
                <Lock size={13} style={{ color: COLORS.muted }} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col" style={{ height: "72vh" }}>
      <div className="flex items-center gap-3 mb-3 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => setActiveId(null)} className="text-sm" style={{ color: COLORS.muted }}>←</button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold" style={{ background: COLORS.surface2, color: COLORS.gold, fontFamily: "'Fraunces', serif" }}>
          {active.name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="text-sm" style={{ color: COLORS.ivory }}>{active.name} {active.flag}</div>
          <div className="text-xs flex items-center gap-1" style={{ color: COLORS.teal }}><ShieldCheck size={11} /> Conversation chiffrée</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
        {threads[active.id].map((m, i) => (
          <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[75%] px-4 py-2.5 rounded-lg text-sm" style={{ background: m.from === "me" ? COLORS.teal : COLORS.surface, color: m.from === "me" ? COLORS.bg : COLORS.ivory }}>
              {m.text}
              <div className="text-[10px] mt-1 opacity-60">{m.ts}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2">
        <input
          value={drafts[activeId] || ""}
          onChange={(e) => setDrafts((d) => ({ ...d, [activeId]: e.target.value }))}
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
    const success = await onConvert(amountPts, Number(baroFromPts));
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

function SettingsTab({ subscription, lang, setLang }) {
  const [notifPush, setNotifPush] = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);
  const [privateAccount, setPrivateAccount] = useState(false);
  const [twoFactor, setTwoFactor] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [langOpen, setLangOpen] = useState(false);

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

      <h3 className="text-sm uppercase tracking-[0.15em] mb-3" style={{ color: COLORS.muted }}>Application</h3>
      <div className="rounded-lg mb-2 overflow-hidden" style={{ background: COLORS.surface }}>
        <SettingsRow label="Mode sombre" right={<Toggle checked={darkMode} onChange={setDarkMode} />} />
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

      <button className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition hover:opacity-90" style={{ background: "rgba(226,125,96,0.12)", color: "#E27D60" }}>
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
            onClick={() => (isLast ? onFinish() : setStep((s) => s + 1))}
            className="flex-1 py-2.5 rounded-md text-sm font-medium"
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
  const { userId, ready } = useSession();
  const { balance, history, earn, redeem } = useWallet(userId);
  const { holdings, addHoldings } = useCrypto(userId);
  const { posts, likePost: likePostDb, loading: postsLoading } = usePosts(userId);
  const { videos, watchVideo: watchVideoDb } = useVideos(userId);
  const { followers, counts: followerCounts } = useFollowers(userId);
  const { votes, myVotes, castVote } = useGovernance(userId);

  const convertToCrypto = async (pts, baro) => {
    const success = await redeem(pts, `Conversion en ${baro} BARO`);
    if (success) await addHoldings(baro);
    return success;
  };

  const likePost = async (id) => {
    await likePostDb(id);
    earn(2, "Interaction sur une publication");
  };

  const watchVideo = async (v) => {
    await watchVideoDb(v);
    earn(1, `Vue générée sur "${v.title}"`);
  };

  const subscribe = (tierId) => {
    setSubscription(tierId);
    const tier = SUBSCRIPTION_TIERS.find((tr) => tr.id === tierId);
    if (tier && tierId !== "free") earn(5, `Abonnement ${tier.name} activé`);
  };

  const primaryTabs = [
    { id: "feed", label: t(lang, "feed"), icon: Globe2 },
    { id: "videos", label: t(lang, "videos"), icon: Play },
    { id: "messages", label: t(lang, "messages"), icon: Lock },
    { id: "wallet", label: t(lang, "wallet"), icon: Wallet },
    { id: "assistant", label: t(lang, "assistant"), icon: Sparkles },
  ];
  const moreTabs = [
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

  if (!ready) return <SplashScreen />;

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg, fontFamily: "'Inter', sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
      `}</style>

      {showOnboarding && <OnboardingModal onFinish={finishOnboarding} />}

      <div className="pointer-events-none fixed top-0 left-0 right-0 h-64 -z-10" style={{ background: `radial-gradient(ellipse at top, rgba(212,169,62,0.08), transparent 70%)` }} />

      <header className="px-4 pt-6 pb-4 flex items-center justify-between max-w-xl mx-auto gap-2">
        <div className="text-2xl font-semibold" style={{ color: COLORS.ivory, fontFamily: "'Fraunces', serif" }}>
          BAARO
        </div>
        <div className="flex items-center gap-2">
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

      {tab === "feed" && <FeedTab posts={posts} onLike={likePost} lang={lang} loading={postsLoading} />}
      {tab === "videos" && <VideosTab videos={videos} onWatch={watchVideo} />}
      {tab === "messages" && <MessagesTab />}
      {tab === "wallet" && <WalletTab balance={balance} history={history} onRedeem={redeem} />}
      {tab === "studio" && <CreatorStudioTab followers={followerCounts.followers} balance={balance} />}
      {tab === "nearby" && <NearbyTab />}
      {tab === "crypto" && <CryptoTab balance={balance} holdings={holdings} onConvert={convertToCrypto} />}
      {tab === "profits" && <ProfitsTab />}
      {tab === "followers" && <FollowersTab followers={followers} counts={followerCounts} />}
      {tab === "governance" && <GovernanceTab votes={votes} myVotes={myVotes} castVote={castVote} />}
      {tab === "subscription" && <SubscriptionTab current={subscription} onSubscribe={subscribe} />}
      {tab === "assistant" && <AssistantTab onEarn={earn} />}
      {tab === "settings" && <SettingsTab subscription={subscription} lang={lang} setLang={setLang} />}
    </div>
  );
}
