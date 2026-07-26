import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";
import { getDeviceId } from "../device.js";

// ---------------------------------------------------------------------
// Session : connexion anonyme protégée par Turnstile, puis enregistrement
// de l'appareil (signal anti-abus côté serveur, voir api/register-device.js).
// ---------------------------------------------------------------------
export function useSession() {
  const [userId, setUserId] = useState(null);
  const [ready, setReady] = useState(false);
  const [needsCaptcha, setNeedsCaptcha] = useState(false);
  const [authError, setAuthError] = useState(null);
  const finalizing = useRef(false);

  const finalizeSession = useCallback(async (session) => {
    if (!session?.user || finalizing.current) return;
    finalizing.current = true;
    const uid = session.user.id;

    // Crée la ligne de profil si elle n'existe pas encore.
    await supabase
      .from("profiles")
      .upsert({ user_id: uid }, { onConflict: "user_id", ignoreDuplicates: true });

    // Signal anti-abus (non bloquant : l'app reste utilisable même si ça échoue).
    try {
      await fetch(`${API_BASE}/api/register-device`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ deviceId: getDeviceId() }),
      });
    } catch (e) {
      console.warn("register-device a échoué :", e);
    }

    setUserId(uid);
    setNeedsCaptcha(false);
    setReady(true);
    finalizing.current = false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data?.session?.user) {
        await finalizeSession(data.session);
      } else {
        setNeedsCaptcha(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) finalizeSession(session);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, [finalizeSession]);

  const completeCaptcha = useCallback(
    async (token) => {
      setAuthError(null);
      const useCaptcha = token && token !== "dev-bypass";
      const { data, error } = await supabase.auth.signInAnonymously(
        useCaptcha ? { options: { captchaToken: token } } : undefined
      );
      if (error) {
        console.error("Connexion anonyme impossible :", error);
        setAuthError(
          "Vérification impossible. Si le problème persiste, l'inscription anonyme est peut-être désactivée côté Supabase (Authentication → Providers → Anonymous)."
        );
        return;
      }
      if (data?.session) await finalizeSession(data.session);
    },
    [finalizeSession]
  );

  return { userId, ready, needsCaptcha, authError, completeCaptcha };
}

// ---------------------------------------------------------------------
// Aides communes
// ---------------------------------------------------------------------
async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

async function callWalletApi(action, payload) {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "Non authentifié" };
  try {
    const res = await fetch(`${API_BASE}/api/wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Erreur serveur" };
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: "Impossible de joindre le serveur" };
  }
}

function formatTs(iso) {
  try {
    return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}

// ---------------------------------------------------------------------
// Portefeuille : solde et historique lus directement (RLS "own"),
// tout gain/dépense passe par l'API serveur (jamais calculé côté client).
// ---------------------------------------------------------------------
export function useWallet(userId) {
  const [balance, setBalance] = useState(1284);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ data: wallet }, { data: txs }] = await Promise.all([
        supabase.from("wallets").select("balance").eq("user_id", userId).single(),
        supabase.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
      ]);
      if (wallet) setBalance(Number(wallet.balance));
      setHistory((txs || []).map((tx) => ({ id: tx.id, label: tx.label, pts: Number(tx.pts), ts: formatTs(tx.created_at) })));
    })();
  }, [userId]);

  const earn = useCallback(async (actionKey, detail) => {
    const result = await callWalletApi("earn", { actionKey, detail });
    if (result.ok) {
      setBalance(result.balance);
      if (result.transaction) {
        const tx = result.transaction;
        setHistory((prev) => [{ id: tx.id, label: tx.label, pts: Number(tx.pts), ts: formatTs(tx.created_at) }, ...prev]);
      }
    }
    return result.ok;
  }, []);

  const redeem = useCallback(async (optionId) => {
    const result = await callWalletApi("redeem", { optionId });
    if (result.ok) {
      setBalance(result.balance);
      if (result.transaction) {
        const tx = result.transaction;
        setHistory((prev) => [{ id: tx.id, label: tx.label, pts: Number(tx.pts), ts: formatTs(tx.created_at) }, ...prev]);
      }
      return true;
    }
    return false;
  }, []);

  const setBalanceDirect = useCallback((value) => setBalance(value), []);

  return { balance, history, earn, redeem, setBalanceDirect };
}

// ---------------------------------------------------------------------
// BARO (crypto interne) : solde détenu, conversion via l'API sécurisée.
// ---------------------------------------------------------------------
export function useCrypto(userId) {
  const [holdings, setHoldings] = useState(0);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.from("crypto_holdings").select("holdings").eq("user_id", userId).single();
      if (data) setHoldings(Number(data.holdings));
    })();
  }, [userId]);

  const convert = useCallback(async (pts) => {
    const result = await callWalletApi("convert", { pts });
    if (result.ok) {
      setHoldings(result.holdings);
      return { success: true, balance: result.balance };
    }
    return { success: false, balance: null };
  }, []);

  return { holdings, convert };
}

// ---------------------------------------------------------------------
// Publications (fil d'actualité)
// ---------------------------------------------------------------------
async function uploadPostMedia(userId, file) {
  try {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return { url: data?.publicUrl || null, type: file.type.startsWith("video") ? "video" : "image" };
  } catch (e) {
    // Le bucket de stockage "media" doit être créé (public) dans Supabase
    // Storage pour que les photos/vidéos fonctionnent. En son absence, la
    // publication texte se fait quand même, sans média.
    console.warn("Upload média impossible :", e.message);
    return { url: null, type: null };
  }
}

export function usePosts(userId) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("posts")
      .select("id, author_id, text, media_url, media_type, created_at, profiles(display_name, handle, flag)")
      .order("created_at", { ascending: false })
      .limit(50);

    const ids = (rows || []).map((p) => p.id);
    let likeRows = [];
    let commentRows = [];
    if (ids.length > 0) {
      const [{ data: likes }, { data: comments }] = await Promise.all([
        supabase.from("post_likes").select("post_id, user_id").in("post_id", ids),
        supabase.from("comments").select("post_id").in("post_id", ids),
      ]);
      likeRows = likes || [];
      commentRows = comments || [];
    }

    setPosts(
      (rows || []).map((p) => ({
        id: p.id,
        authorId: p.author_id,
        name: p.profiles?.display_name || "Membre BAARO",
        flag: p.profiles?.flag || "🌍",
        handle: p.profiles?.handle || "",
        text: p.text,
        mediaUrl: p.media_url,
        mediaType: p.media_type,
        liked: likeRows.some((l) => l.post_id === p.id && l.user_id === userId),
        likes: likeRows.filter((l) => l.post_id === p.id).length,
        comments: commentRows.filter((c) => c.post_id === p.id).length,
        earned: 0,
      }))
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const likePost = useCallback(
    async (postId) => {
      if (!userId) return;
      const current = posts.find((p) => p.id === postId);
      const alreadyLiked = !!current?.liked;
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, liked: !alreadyLiked, likes: p.likes + (alreadyLiked ? -1 : 1) } : p))
      );
      if (alreadyLiked) {
        await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
      } else {
        await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
      }
    },
    [userId, posts]
  );

  const createPost = useCallback(
    async (text, file) => {
      if (!userId) return;
      let media = { url: null, type: null };
      if (file) media = await uploadPostMedia(userId, file);
      await supabase.from("posts").insert({
        author_id: userId,
        text: text || "",
        media_url: media.url,
        media_type: media.type,
      });
      await load();
    },
    [userId, load]
  );

  return { posts, loading, likePost, createPost, reload: load };
}

// ---------------------------------------------------------------------
// Stories (24h)
// ---------------------------------------------------------------------
export function useStories(userId) {
  const [stories, setStories] = useState([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("stories")
      .select("id, text, created_at, profiles(display_name, flag)")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    setStories(data || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addStory = useCallback(
    async (text) => {
      if (!userId || !text.trim()) return;
      await supabase.from("stories").insert({ author_id: userId, text: text.trim() });
      await load();
    },
    [userId, load]
  );

  return { stories, addStory };
}

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------
export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([]);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications(data || []);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markAllRead };
}

// ---------------------------------------------------------------------
// Vidéos
// ---------------------------------------------------------------------
const VIDEO_COLORS = ["#D9AE52", "#2DBFA6", "#B84A3E", "#5B7FBF", "#8A6FD1"];

export function useVideos(userId) {
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, duration, views, created_at, profiles(display_name, flag)")
        .order("created_at", { ascending: false })
        .limit(30);
      setVideos(
        (data || []).map((v, i) => ({
          id: v.id,
          title: v.title,
          duration: v.duration,
          views: v.views,
          likes: 0,
          author: v.profiles?.display_name || "Membre BAARO",
          flag: v.profiles?.flag || "🌍",
          color: VIDEO_COLORS[i % VIDEO_COLORS.length],
        }))
      );
    })();
  }, []);

  const watchVideo = useCallback(async (v) => {
    await supabase
      .from("videos")
      .update({ views: (v.views || 0) + 1 })
      .eq("id", v.id);
  }, []);

  return { videos, watchVideo };
}

// ---------------------------------------------------------------------
// Abonnés / abonnements
// ---------------------------------------------------------------------
export function useFollowers(userId) {
  const [followers, setFollowers] = useState([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ data: followerRows }, { count: followerCount }, { count: followingCount }] = await Promise.all([
        supabase
          .from("follows")
          .select("follower_id, created_at, profiles!follows_follower_id_fkey(display_name, flag, handle)")
          .eq("followed_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", userId),
        supabase.from("follows").select("followed_id", { count: "exact", head: true }).eq("follower_id", userId),
      ]);

      setCounts({ followers: followerCount || 0, following: followingCount || 0 });
      setFollowers(
        (followerRows || []).map((f) => ({
          id: f.follower_id,
          name: f.profiles?.display_name || "Membre BAARO",
          flag: f.profiles?.flag || "🌍",
          handle: f.profiles?.handle || "",
          since: formatTs(f.created_at),
        }))
      );
    })();
  }, [userId]);

  return { followers, counts };
}

// ---------------------------------------------------------------------
// Gouvernance (votes communautaires)
// ---------------------------------------------------------------------
export function useGovernance(userId) {
  const [votes, setVotes] = useState([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("votes").select("*");
    setVotes(data || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const myVotes = votes
    .filter((v) => v.user_id === userId)
    .reduce((acc, v) => ({ ...acc, [v.proposal_id]: v.choice }), {});

  const castVote = useCallback(
    async (proposalId, choice) => {
      if (!userId) return;
      setVotes((prev) => [...prev.filter((v) => !(v.proposal_id === proposalId && v.user_id === userId)), { proposal_id: proposalId, user_id: userId, choice }]);
      await supabase.from("votes").upsert({ proposal_id: proposalId, user_id: userId, choice }, { onConflict: "proposal_id,user_id" });
    },
    [userId]
  );

  return { votes, myVotes, castVote };
}
