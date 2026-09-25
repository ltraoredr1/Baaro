import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Compass,
  Send,
  ArrowLeft,
  Home,
  MessageCircle,
  Users,
  Phone,
  Search,
  Plus,
  Hash,
  Volume2,
  Loader2,
  X,
  Lock,
  Globe,
  Link2,
  Megaphone,
  Copy,
  Trash2,
} from "lucide-react";
import {
  useCommunity,
  useChannelMessages,
  useCurrentUser,
} from "../hooks/useCommunity.js";
import { FriendsTab } from "../features/friends/index.js";
import ContactsTab from "../features/contacts/ContactsTab.jsx";
import { COLORS as THEME_COLORS } from "../theme.js";
import ChannelItem from "./community/ChannelItem.jsx";

const FALLBACK = {
  bg: "#0B1220",
  surface: "#111A2C",
  surface2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.5)",
  gold: "#D9AE52",
  teal: "#2DBFA6",
};

const CATEGORIES = [
  { id: "all", label: "Tous" },
  { id: "community", label: "Communauté", emoji: "🌍" },
  { id: "business", label: "Business", emoji: "💼" },
  { id: "tech", label: "Tech", emoji: "💻" },
  { id: "etudes", label: "Études", emoji: "📚" },
  { id: "divertissement", label: "Fun", emoji: "🎮" },
];

function GroupInvitesPanel({
  groupId,
  createInvite,
  listInvites,
  revokeInvite,
  C,
}) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [maxUses, setMaxUses] = useState(0);
  const [hours, setHours] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      setInvites(await listInvites(groupId));
    } catch (e) {
      setErr(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }, [groupId, listInvites]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleCreate = async () => {
    setErr("");
    try {
      const row = await createInvite(groupId, {
        maxUses: Number(maxUses) || 0,
        expiresHours: hours === "" ? null : Number(hours),
      });
      setLastCode(row?.code || "");
      await reload();
    } catch (e) {
      setErr(e.message || "Création impossible");
    }
  };

  const shareLink = lastCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?invite=${lastCode}`
    : "";

  return (
    <div
      className="p-3 space-y-3 rounded-xl border mt-2"
      style={{ borderColor: C.border, background: C.surface2 }}
    >
      <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: C.gold }}>
        <Link2 size={14} /> Invitations
      </p>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-[10px]" style={{ color: C.muted }}>
          Max uses (0 = ∞)
          <input
            type="number"
            min={0}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="block w-20 mt-1 px-2 py-1 rounded-lg border text-sm outline-none"
            style={{ background: C.surface, borderColor: C.border, color: C.ivory }}
          />
        </label>
        <label className="text-[10px]" style={{ color: C.muted }}>
          Expire (h)
          <input
            type="number"
            min={1}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="∞"
            className="block w-20 mt-1 px-2 py-1 rounded-lg border text-sm outline-none"
            style={{ background: C.surface, borderColor: C.border, color: C.ivory }}
          />
        </label>
        <button
          type="button"
          onClick={handleCreate}
          className="px-3 py-2 rounded-xl text-xs font-bold"
          style={{ background: C.gold, color: "#000" }}
        >
          Générer
        </button>
      </div>

      {lastCode && (
        <div className="text-sm space-y-1">
          <p>
            Code : <b style={{ color: C.gold }}>{lastCode}</b>
          </p>
          <button
            type="button"
            className="text-xs underline flex items-center gap-1"
            style={{ color: C.teal }}
            onClick={() => navigator.clipboard?.writeText(shareLink || lastCode)}
          >
            <Copy size={12} /> Copier le lien
          </button>
        </div>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}

      <ul className="space-y-1.5 max-h-36 overflow-y-auto">
        {loading && (
          <li className="text-xs" style={{ color: C.muted }}>
            …
          </li>
        )}
        {invites.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg"
            style={{ background: C.surface }}
          >
            <span>
              <b>{inv.code}</b> · {inv.uses}/{inv.max_uses || "∞"}
              {inv.expires_at
                ? ` · ${new Date(inv.expires_at).toLocaleDateString()}`
                : ""}
            </span>
            <button
              type="button"
              className="text-red-400 p-1"
              title="Révoquer"
              onClick={async () => {
                await revokeInvite(inv.id);
                reload();
              }}
            >
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CommunityTab({ onOpenProfile }) {
  const C = { ...FALLBACK, ...(THEME_COLORS || {}) };
  const { id, loadingUser } = useCurrentUser() || {};
  const {
    groups = [],
    loading,
    error,
    createGroup,
    createChannel,
    joinGroup,
    leaveGroup,
    loadAll,
    myRole,
    isMember,
    isAdmin,
    canPostInChannel,
    createInvite,
    listInvites,
    revokeInvite,
    peekInvite,
  } = useCommunity(id) || {};

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [activeTab, setActiveTab] = useState("groups");
  const [mobileView, setMobileView] = useState("groups");
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [gName, setGName] = useState("");
  const [gDesc, setGDesc] = useState("");
  const [gPublic, setGPublic] = useState(true);
  const [gCategory, setGCategory] = useState("community");
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState("text");
  const [cDesc, setCDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");

  const [inviteCode, setInviteCode] = useState("");
  const [peek, setPeek] = useState(null);
  const [peekLoading, setPeekLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const { messages = [], sendMessage, loading: msgLoading } =
    useChannelMessages(selectedChannel?.id) || {};

  useEffect(() => {
    if (!groups.length) {
      setSelectedGroup(null);
      setSelectedChannel(null);
      return;
    }
    if (selectedGroup) {
      const fresh = groups.find((g) => g.id === selectedGroup.id);
      if (fresh) {
        setSelectedGroup(fresh);
        if (selectedChannel) {
          const ch = fresh.channels?.find((c) => c.id === selectedChannel.id);
          if (ch) setSelectedChannel(ch);
          else
            setSelectedChannel(
              fresh.channels?.find((c) => c.type !== "voice") ||
                fresh.channels?.[0] ||
                null
            );
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Deep-link ?invite=
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const inv = params.get("invite");
      if (inv) {
        setInviteCode(inv);
        setActiveTab("discover");
        setMobileView("discover");
      }
    } catch {}
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  };

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    return groups.filter((g) => {
      const matchesSearch =
        !q ||
        g.name?.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q);
      const matchesCat =
        selectedCategory === "all" || g.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [groups, groupSearch, selectedCategory]);

  const myGroups = useMemo(
    () => groups.filter((g) => isMember?.(g)),
    [groups, isMember]
  );

  const discoverGroups = useMemo(
    () =>
      groups.filter((g) => g.is_public && !isMember?.(g)),
    [groups, isMember]
  );

  const role = selectedGroup ? myRole?.(selectedGroup) : null;
  const member = selectedGroup ? isMember?.(selectedGroup) : false;
  const admin = selectedGroup ? isAdmin?.(selectedGroup) : false;
  const canPost = selectedGroup && selectedChannel
    ? canPostInChannel?.(selectedGroup, selectedChannel)
    : false;

  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
    setSelectedChannel(
      group.channels?.find((c) => c.type !== "voice") ||
        group.channels?.[0] ||
        null
    );
    setMobileView("channels");
    setShowInvites(false);
  };

  const handleSelectChannel = (channel) => {
    setSelectedChannel(channel);
    setMobileView("chat");
  };

  const handleCreateGroup = async (e) => {
    e?.preventDefault?.();
    if (!id) {
      setFormError("Connecte-toi pour créer un groupe");
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      const group = await createGroup({
        name: gName,
        description: gDesc,
        is_public: gPublic,
        category: gCategory,
      });
      setShowCreateGroup(false);
      setGName("");
      setGDesc("");
      setGPublic(true);
      setGCategory("community");
      showToast("Groupe créé");
      setTimeout(() => loadAll?.(true), 100);
      if (group?.id) {
        // après reload, sélection manuelle possible
      }
    } catch (err) {
      setFormError(err.message || "Création impossible");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateChannel = async (e) => {
    e?.preventDefault?.();
    if (!selectedGroup?.id) {
      setFormError("Sélectionne un groupe");
      return;
    }
    if (!admin) {
      setFormError("Seuls les admins peuvent créer un canal");
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      await createChannel(selectedGroup.id, {
        name: cName,
        type: cType,
        description: cDesc,
      });
      setShowCreateChannel(false);
      setCName("");
      setCType("text");
      setCDesc("");
      showToast("Canal créé");
    } catch (err) {
      setFormError(err.message || "Création canal impossible");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (group = selectedGroup, code = null) => {
    try {
      const res = await joinGroup(group?.id || null, code);
      showToast(
        res?.already_member ? "Déjà membre" : "Tu as rejoint le groupe"
      );
      if (res?.group_id) {
        const g = groups.find((x) => x.id === res.group_id);
        if (g) handleSelectGroup(g);
        else setTimeout(() => loadAll?.(true), 200);
      }
    } catch (err) {
      showToast(err.message || "Impossible de rejoindre");
    }
  };

  const handleLeave = async () => {
    if (!selectedGroup?.id) return;
    if (!window.confirm("Quitter ce groupe ?")) return;
    try {
      await leaveGroup(selectedGroup.id);
      showToast("Groupe quitté");
      setSelectedGroup(null);
      setSelectedChannel(null);
      setMobileView("groups");
    } catch (err) {
      showToast(err.message || "Erreur");
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault?.();
    if (!msgText.trim() || sending || !canPost) return;
    setSending(true);
    try {
      await sendMessage(msgText);
      setMsgText("");
    } catch (err) {
      showToast(err.message || "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  const handlePeekInvite = async () => {
    if (!inviteCode.trim()) return;
    setPeekLoading(true);
    setPeek(null);
    try {
      const info = await peekInvite(inviteCode.trim());
      setPeek(info);
    } catch (e) {
      setPeek({ ok: false, error: e.message });
    } finally {
      setPeekLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    try {
      const res = await joinGroup(null, inviteCode.trim());
      showToast(res?.already_member ? "Déjà membre" : "Groupe rejoint");
      setInviteCode("");
      setPeek(null);
      setActiveTab("groups");
      setMobileView("groups");
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch {}
    } catch (e) {
      showToast(e.message || "Invitation invalide");
    }
  };

  if (loadingUser || (loading && !groups.length)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin" size={28} style={{ color: C.gold }} />
      </div>
    );
  }

  if (!id) {
    return (
      <div className="p-6 text-center" style={{ color: C.muted }}>
        Connecte-toi pour accéder à la communauté.
      </div>
    );
  }

  const textChannels =
    selectedGroup?.channels?.filter((c) => c.type !== "voice") || [];
  const voiceChannels =
    selectedGroup?.channels?.filter((c) => c.type === "voice") || [];

  return (
    <div
      className="flex flex-col h-[calc(100dvh-7.5rem)] max-w-5xl mx-auto w-full relative min-h-0"
      style={{ color: C.ivory }}
    >
      {toast && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-bold shadow-lg"
          style={{
            background: C.surface,
            border: `1px solid ${C.gold}`,
            color: C.gold,
          }}
        >
          {toast}
        </div>
      )}

      {error && (
        <div
          className="mx-3 mt-2 p-3 rounded-xl text-sm"
          style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}
        >
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => loadAll?.()}
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Onglets desktop */}
      <div
        className="hidden md:flex gap-2 p-3 border-b shrink-0"
        style={{ borderColor: C.border }}
      >
        {[
          { id: "groups", label: "Groupes", icon: Home },
          { id: "discover", label: "Découvrir", icon: Compass },
          { id: "friends", label: "Amis", icon: Users },
          { id: "contacts", label: "Contacts", icon: Phone },
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTab(t.id);
                setMobileView(t.id === "groups" ? "groups" : t.id);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold"
              style={{
                background: active ? "rgba(217,174,82,0.15)" : "transparent",
                color: active ? C.gold : C.muted,
              }}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "friends" && (
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          <FriendsTab id={id} onOpenProfile={onOpenProfile} />
        </div>
      )}
      {activeTab === "contacts" && (
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          <ContactsTab onOpenProfile={onOpenProfile} />
        </div>
      )}

      {/* Découvrir + invitations */}
      {activeTab === "discover" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
          <div
            className="p-4 rounded-2xl border space-y-2"
            style={{ background: C.surface2, borderColor: C.border }}
          >
            <p className="text-xs font-bold" style={{ color: C.gold }}>
              Rejoindre avec un code
            </p>
            <div className="flex gap-2">
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Ex: BA7K2M9X"
                className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none font-mono"
                style={{
                  background: C.surface,
                  borderColor: C.border,
                  color: C.ivory,
                }}
              />
              <button
                type="button"
                onClick={handlePeekInvite}
                disabled={peekLoading || !inviteCode.trim()}
                className="px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                style={{ background: C.surface, color: C.gold, border: `1px solid ${C.border}` }}
              >
                {peekLoading ? "…" : "Voir"}
              </button>
              <button
                type="button"
                onClick={handleJoinByCode}
                disabled={!inviteCode.trim()}
                className="px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                style={{ background: C.teal, color: "#000" }}
              >
                Rejoindre
              </button>
            </div>
            {peek?.ok && (
              <div className="text-sm pt-1">
                <b>{peek.name}</b>
                <span className="text-xs ml-2" style={{ color: C.muted }}>
                  {peek.member_count} membres
                </span>
                {peek.description && (
                  <p className="text-xs mt-1" style={{ color: C.muted }}>
                    {peek.description}
                  </p>
                )}
              </div>
            )}
            {peek && !peek.ok && (
              <p className="text-xs text-red-400">
                Invitation invalide ou expirée
              </p>
            )}
          </div>

          <h2 className="font-bold text-lg" style={{ color: C.gold }}>
            Groupes publics
          </h2>
          {discoverGroups.length === 0 && (
            <p className="text-sm" style={{ color: C.muted }}>
              Aucun nouveau groupe public pour le moment.
            </p>
          )}
          {discoverGroups.map((g) => (
            <div
              key={g.id}
              className="w-full text-left p-4 rounded-2xl border flex flex-col gap-2"
              style={{ background: C.surface2, borderColor: C.border }}
            >
              <div className="flex items-center justify-between gap-2">
                <b>{g.name}</b>
                <Globe size={14} style={{ color: C.teal }} />
              </div>
              <p className="text-xs" style={{ color: C.muted }}>
                {g.description || "Sans description"} ·{" "}
                {g.members?.length || 0} membres · {g.channels?.length || 0}{" "}
                canaux
              </p>
              <button
                type="button"
                onClick={() => handleJoin(g)}
                className="self-start px-4 py-1.5 rounded-xl text-xs font-bold"
                style={{ background: C.teal, color: "#000" }}
              >
                Rejoindre
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Groupes + canaux + chat */}
      {(activeTab === "groups" ||
        mobileView === "chat" ||
        mobileView === "channels") &&
        activeTab !== "friends" &&
        activeTab !== "contacts" &&
        activeTab !== "discover" && (
          <div className="flex-1 flex min-h-0">
            {/* Liste groupes */}
            <div
              className={`w-full md:w-72 border-r flex flex-col min-h-0 ${
                mobileView === "groups" || mobileView === "channels"
                  ? ""
                  : "hidden md:flex"
              } ${mobileView === "chat" ? "hidden md:flex" : ""}`}
              style={{ borderColor: C.border }}
            >
              <div className="p-3 space-y-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: C.muted }}
                    />
                    <input
                      value={groupSearch}
                      onChange={(e) => setGroupSearch(e.target.value)}
                      placeholder="Rechercher…"
                      className="w-full pl-8 pr-3 py-2 rounded-xl border text-sm outline-none"
                      style={{
                        background: C.surface2,
                        borderColor: C.border,
                        color: C.ivory,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError("");
                      setShowCreateGroup(true);
                    }}
                    className="p-2 rounded-xl"
                    style={{ background: C.gold, color: "#000" }}
                    title="Créer un groupe"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold"
                      style={{
                        background:
                          selectedCategory === cat.id
                            ? "rgba(217,174,82,0.2)"
                            : C.surface2,
                        color:
                          selectedCategory === cat.id ? C.gold : C.muted,
                      }}
                    >
                      {cat.emoji || ""} {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 min-h-0">
                {filteredGroups.length === 0 ? (
                  <div
                    className="p-4 text-center text-sm"
                    style={{ color: C.muted }}
                  >
                    <p>Aucun groupe</p>
                    <button
                      type="button"
                      onClick={() => setShowCreateGroup(true)}
                      className="mt-3 px-4 py-2 rounded-xl text-sm font-bold"
                      style={{ background: C.gold, color: "#000" }}
                    >
                      + Créer le premier
                    </button>
                  </div>
                ) : (
                  filteredGroups.map((g) => {
                    const active = selectedGroup?.id === g.id;
                    const mine = isMember?.(g);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => handleSelectGroup(g)}
                        className="w-full text-left px-3 py-2.5 rounded-xl"
                        style={{
                          background: active
                            ? "rgba(217,174,82,0.12)"
                            : "transparent",
                          borderLeft: active
                            ? `3px solid ${C.gold}`
                            : "3px solid transparent",
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm truncate">
                            {g.name}
                          </span>
                          {g.is_public ? (
                            <Globe size={11} style={{ color: C.teal }} />
                          ) : (
                            <Lock size={11} style={{ color: C.muted }} />
                          )}
                          {mine && (
                            <span
                              className="text-[9px] px-1 rounded"
                              style={{
                                background: "rgba(45,191,166,0.2)",
                                color: C.teal,
                              }}
                            >
                              membre
                            </span>
                          )}
                        </div>
                        <div
                          className="text-[10px]"
                          style={{ color: C.muted }}
                        >
                          {g.channels?.length || 0} canaux ·{" "}
                          {g.members?.length || 0} membres
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Canaux */}
            <div
              className={`w-full md:w-56 border-r flex flex-col min-h-0 ${
                mobileView === "channels" ? "" : "hidden md:flex"
              } ${mobileView === "chat" ? "hidden md:flex" : ""} ${
                mobileView === "groups" ? "hidden md:flex" : ""
              }`}
              style={{ borderColor: C.border }}
            >
              {selectedGroup ? (
                <>
                  <div
                    className="p-3 border-b shrink-0"
                    style={{ borderColor: C.border }}
                  >
                    <div className="flex items-center gap-2 md:hidden mb-2">
                      <button
                        type="button"
                        onClick={() => setMobileView("groups")}
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <span className="font-bold text-sm truncate">
                        {selectedGroup.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-xs font-bold"
                        style={{ color: C.gold }}
                      >
                        CANAUX
                      </span>
                      {admin && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setShowInvites((v) => !v)}
                            className="p-1 rounded-lg"
                            style={{ color: C.teal }}
                            title="Invitations"
                          >
                            <Link2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFormError("");
                              setShowCreateChannel(true);
                            }}
                            className="p-1 rounded-lg"
                            style={{ color: C.gold }}
                            title="Nouveau canal"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    <p
                      className="text-[10px] mt-1 truncate"
                      style={{ color: C.muted }}
                    >
                      {selectedGroup.description || "—"}
                    </p>
                    {!member && (
                      <button
                        type="button"
                        onClick={() => handleJoin(selectedGroup)}
                        className="mt-2 w-full py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: C.teal, color: "#000" }}
                      >
                        Rejoindre
                      </button>
                    )}
                    {member && role !== "owner" && (
                      <button
                        type="button"
                        onClick={handleLeave}
                        className="mt-2 w-full py-1.5 rounded-lg text-xs"
                        style={{
                          color: C.muted,
                          border: `1px solid ${C.border}`,
                        }}
                      >
                        Quitter
                      </button>
                    )}
                    {admin && showInvites && (
                      <GroupInvitesPanel
                        groupId={selectedGroup.id}
                        createInvite={createInvite}
                        listInvites={listInvites}
                        revokeInvite={revokeInvite}
                        C={C}
                      />
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                    {textChannels.length === 0 &&
                    voiceChannels.length === 0 ? (
                      <p className="text-xs p-2" style={{ color: C.muted }}>
                        Aucun canal.{" "}
                        {admin && (
                          <button
                            type="button"
                            className="underline"
                            style={{ color: C.gold }}
                            onClick={() => setShowCreateChannel(true)}
                          >
                            Créer
                          </button>
                        )}
                      </p>
                    ) : (
                      <>
                        {textChannels.map((ch) => (
                          <ChannelItem
                            key={ch.id}
                            channel={ch}
                            isActive={selectedChannel?.id === ch.id}
                            onSelect={handleSelectChannel}
                          />
                        ))}
                        {voiceChannels.map((ch) => (
                          <ChannelItem
                            key={ch.id}
                            channel={ch}
                            isActive={selectedChannel?.id === ch.id}
                            onSelect={handleSelectChannel}
                          />
                        ))}
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-4 text-sm" style={{ color: C.muted }}>
                  Sélectionne un groupe
                </div>
              )}
            </div>

            {/* Chat */}
            <div
              className={`flex-1 flex flex-col min-w-0 min-h-0 ${
                mobileView === "chat" ? "" : "hidden md:flex"
              }`}
            >
              {selectedChannel ? (
                <>
                  <div
                    className="flex items-center gap-2 p-3 border-b shrink-0"
                    style={{ borderColor: C.border }}
                  >
                    <button
                      type="button"
                      className="md:hidden"
                      onClick={() => setMobileView("channels")}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    {selectedChannel.type === "voice" ? (
                      <Volume2 size={16} style={{ color: C.teal }} />
                    ) : selectedChannel.type === "announce" ? (
                      <Megaphone size={16} style={{ color: C.gold }} />
                    ) : (
                      <Hash size={16} style={{ color: C.gold }} />
                    )}
                    <span className="font-bold text-sm">
                      {selectedChannel.name}
                    </span>
                    {selectedChannel.type === "announce" && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                        style={{
                          background: "rgba(217,174,82,0.2)",
                          color: C.gold,
                        }}
                      >
                        Annonces
                      </span>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                    {msgLoading && messages.length === 0 && (
                      <div className="flex justify-center py-8">
                        <Loader2
                          className="animate-spin"
                          size={20}
                          style={{ color: C.muted }}
                        />
                      </div>
                    )}
                    {messages.length === 0 && !msgLoading && (
                      <p
                        className="text-center text-sm py-8"
                        style={{ color: C.muted }}
                      >
                        Aucun message. Dis bonjour 👋
                      </p>
                    )}
                    {messages.map((m) => {
                      const mine = m.sender_id === id;
                      const name =
                        m.profiles?.display_name ||
                        m.profiles?.handle ||
                        "Membre";
                      return (
                        <div
                          key={m.id}
                          className={`flex ${
                            mine ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className="max-w-[80%] px-3 py-2 rounded-2xl text-sm"
                            style={{
                              background: mine ? C.gold : C.surface2,
                              color: mine ? "#000" : C.ivory,
                            }}
                          >
                            {!mine && (
                              <p className="text-[10px] font-bold mb-0.5 opacity-70">
                                {name}
                              </p>
                            )}
                            <p className="break-words whitespace-pre-wrap">
                              {m.text}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  {member ? (
                    canPost ? (
                      <form
                        onSubmit={handleSend}
                        className="p-3 border-t flex gap-2 shrink-0"
                        style={{ borderColor: C.border }}
                      >
                        <input
                          value={msgText}
                          onChange={(e) => setMsgText(e.target.value)}
                          placeholder="Écrire un message…"
                          className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none"
                          style={{
                            background: C.surface2,
                            borderColor: C.border,
                            color: C.ivory,
                          }}
                        />
                        <button
                          type="submit"
                          disabled={!msgText.trim() || sending}
                          className="p-2.5 rounded-xl disabled:opacity-40"
                          style={{ background: C.gold, color: "#000" }}
                        >
                          <Send size={18} />
                        </button>
                      </form>
                    ) : (
                      <div
                        className="p-3 border-t text-center text-xs shrink-0"
                        style={{ borderColor: C.border, color: C.muted }}
                      >
                        Seuls les admins peuvent publier dans ce canal
                        d&apos;annonces
                      </div>
                    )
                  ) : (
                    <div
                      className="p-3 border-t text-center text-xs shrink-0"
                      style={{ borderColor: C.border, color: C.muted }}
                    >
                      Rejoins le groupe pour discuter
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="flex-1 flex items-center justify-center text-sm"
                  style={{ color: C.muted }}
                >
                  Choisis un canal pour discuter
                </div>
              )}
            </div>
          </div>
        )}

      {/* Bottom nav mobile */}
      <div
        className="md:hidden flex justify-around border-t py-1 shrink-0"
        style={{ borderColor: C.border }}
      >
        {[
          { id: "groups", icon: Home, label: "Groupes" },
          { id: "discover", icon: Compass, label: "Découvrir" },
          { id: "friends", icon: Users, label: "Amis" },
          { id: "contacts", icon: Phone, label: "Contacts" },
        ].map((tab) => {
          const Icon = tab.icon;
          const active =
            activeTab === tab.id ||
            (tab.id === "groups" &&
              (mobileView === "channels" || mobileView === "chat"));
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setMobileView(tab.id === "groups" ? "groups" : tab.id);
              }}
              className="flex flex-col items-center py-2 px-3"
            >
              <Icon size={18} style={{ color: active ? C.gold : C.muted }} />
              <span
                className="text-[10px] font-bold"
                style={{ color: active ? C.gold : C.muted }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Modal créer groupe */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleCreateGroup}
            className="w-full max-w-md rounded-2xl border p-5 space-y-3"
            style={{ background: C.surface, borderColor: C.border }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold" style={{ color: C.gold }}>
                Nouveau groupe
              </h3>
              <button type="button" onClick={() => setShowCreateGroup(false)}>
                <X size={18} />
              </button>
            </div>
            {formError && <p className="text-sm text-red-400">{formError}</p>}
            <input
              required
              value={gName}
              onChange={(e) => setGName(e.target.value)}
              placeholder="Nom du groupe"
              maxLength={80}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{
                background: C.surface2,
                borderColor: C.border,
                color: C.ivory,
              }}
            />
            <textarea
              value={gDesc}
              onChange={(e) => setGDesc(e.target.value)}
              placeholder="Description (optionnel)"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
              style={{
                background: C.surface2,
                borderColor: C.border,
                color: C.ivory,
              }}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={gPublic}
                onChange={(e) => setGPublic(e.target.checked)}
              />
              Groupe public
            </label>
            <select
              value={gCategory}
              onChange={(e) => setGCategory(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{
                background: C.surface2,
                borderColor: C.border,
                color: C.ivory,
              }}
            >
              {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating || !gName.trim()}
              className="w-full py-3 rounded-xl font-bold disabled:opacity-40"
              style={{ background: C.gold, color: "#000" }}
            >
              {creating ? "Création…" : "Créer le groupe"}
            </button>
          </form>
        </div>
      )}

      {/* Modal créer canal */}
      {showCreateChannel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleCreateChannel}
            className="w-full max-w-md rounded-2xl border p-5 space-y-3"
            style={{ background: C.surface, borderColor: C.border }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold" style={{ color: C.gold }}>
                Nouveau canal
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateChannel(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs" style={{ color: C.muted }}>
              Groupe : {selectedGroup?.name}
            </p>
            {formError && <p className="text-sm text-red-400">{formError}</p>}
            <input
              required
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder="Nom (ex: annonces)"
              maxLength={40}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{
                background: C.surface2,
                borderColor: C.border,
                color: C.ivory,
              }}
            />
            <div className="flex gap-2">
              {[
                { id: "text", label: "Discussion", icon: Hash },
                { id: "announce", label: "Annonces", icon: Megaphone },
                { id: "voice", label: "Vocal", icon: Volume2 },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCType(t.id)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1"
                    style={{
                      borderColor: cType === t.id ? C.gold : C.border,
                      color: cType === t.id ? C.gold : C.muted,
                    }}
                  >
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>
            <input
              value={cDesc}
              onChange={(e) => setCDesc(e.target.value)}
              placeholder="Description (optionnel)"
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{
                background: C.surface2,
                borderColor: C.border,
                color: C.ivory,
              }}
            />
            <button
              type="submit"
              disabled={creating || !cName.trim()}
              className="w-full py-3 rounded-xl font-bold disabled:opacity-40"
              style={{ background: C.gold, color: "#000" }}
            >
              {creating ? "Création…" : "Créer le canal"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
