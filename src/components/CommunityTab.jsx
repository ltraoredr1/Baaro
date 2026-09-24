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
  } = useCommunity(id) || {};

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [activeTab, setActiveTab] = useState("groups");
  const [mobileView, setMobileView] = useState("groups");
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);

  // Modals création
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
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

  const messagesEndRef = useRef(null);
  const { messages = [], sendMessage } =
    useChannelMessages(selectedChannel?.id) || {};

  // Sync selected group when list reloads
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
    } else {
      const g = groups[0];
      setSelectedGroup(g);
      setSelectedChannel(
        g.channels?.find((c) => c.type !== "voice") || g.channels?.[0] || null
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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

  const isMember = useCallback(
    (group) => {
      if (!id || !group) return false;
      if (group.owner_id === id) return true;
      return (group.members || []).some((m) => m.user_id === id);
    },
    [id]
  );

  const isOwner = selectedGroup?.owner_id === id;

  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
    setSelectedChannel(
      group.channels?.find((c) => c.type !== "voice") ||
        group.channels?.[0] ||
        null
    );
    setMobileView("channels");
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
      if (group) {
        // rechargé via loadAll ; sélection après tick
        setTimeout(() => {
          loadAll?.();
        }, 100);
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
    if (!isOwner && !isMember(selectedGroup)) {
      setFormError("Tu dois être membre du groupe");
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

  const handleJoin = async () => {
    if (!selectedGroup?.id) return;
    try {
      await joinGroup(selectedGroup.id);
      showToast("Tu as rejoint le groupe");
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
    } catch (err) {
      showToast(err.message || "Erreur");
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault?.();
    if (!msgText.trim() || sending) return;
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
      className="flex flex-col h-[calc(100vh-8rem)] max-w-5xl mx-auto w-full relative"
      style={{ color: C.ivory }}
    >
      {toast && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-bold shadow-lg"
          style={{ background: C.surface, border: `1px solid ${C.gold}`, color: C.gold }}
        >
          {toast}
        </div>
      )}

      {error && (
        <div className="mx-3 mt-2 p-3 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
          {error}
          <button type="button" className="ml-2 underline" onClick={() => loadAll?.()}>
            Réessayer
          </button>
        </div>
      )}

      {/* ===== Onglets desktop ===== */}
      <div className="hidden md:flex gap-2 p-3 border-b" style={{ borderColor: C.border }}>
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

      {/* ===== FRIENDS / CONTACTS ===== */}
      {activeTab === "friends" && (
        <div className="flex-1 overflow-y-auto p-3">
          <FriendsTab id={id} onOpenProfile={onOpenProfile} />
        </div>
      )}
      {activeTab === "contacts" && (
        <div className="flex-1 overflow-y-auto p-3">
          <ContactsTab />
        </div>
      )}

      {/* ===== DISCOVER ===== */}
      {activeTab === "discover" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <h2 className="font-bold text-lg" style={{ color: C.gold }}>
            Découvrir des groupes
          </h2>
          {filteredGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                handleSelectGroup(g);
                setActiveTab("groups");
              }}
              className="w-full text-left p-4 rounded-2xl border"
              style={{ background: C.surface2, borderColor: C.border }}
            >
              <div className="flex items-center justify-between gap-2">
                <b>{g.name}</b>
                {g.is_public ? (
                  <Globe size={14} style={{ color: C.teal }} />
                ) : (
                  <Lock size={14} style={{ color: C.muted }} />
                )}
              </div>
              <p className="text-xs mt-1" style={{ color: C.muted }}>
                {g.description || "Sans description"} · {g.members?.length || 0} membres ·{" "}
                {g.channels?.length || 0} canaux
              </p>
            </button>
          ))}
        </div>
      )}

      {/* ===== GROUPES + CANAUX + CHAT ===== */}
      {(activeTab === "groups" || mobileView === "chat" || mobileView === "channels") &&
        activeTab !== "friends" &&
        activeTab !== "contacts" &&
        activeTab !== "discover" && (
          <div className="flex-1 flex min-h-0">
            {/* Liste groupes */}
            <div
              className={`w-full md:w-72 border-r flex flex-col ${
                mobileView === "groups" || mobileView === "channels"
                  ? ""
                  : "hidden md:flex"
              } ${mobileView === "chat" ? "hidden md:flex" : ""}`}
              style={{ borderColor: C.border }}
            >
              <div className="p-3 space-y-2">
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
                    aria-label="Créer un groupe"
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

              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                {filteredGroups.length === 0 ? (
                  <div className="p-4 text-center text-sm" style={{ color: C.muted }}>
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
                        <div className="font-bold text-sm truncate">{g.name}</div>
                        <div className="text-[10px]" style={{ color: C.muted }}>
                          {g.channels?.length || 0} canaux · {g.members?.length || 0} membres
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Canaux */}
            <div
              className={`w-full md:w-56 border-r flex flex-col ${
                mobileView === "channels" ? "" : "hidden md:flex"
              } ${mobileView === "chat" ? "hidden md:flex" : ""} ${
                mobileView === "groups" ? "hidden md:flex" : ""
              }`}
              style={{ borderColor: C.border }}
            >
              {selectedGroup ? (
                <>
                  <div className="p-3 border-b" style={{ borderColor: C.border }}>
                    <div className="flex items-center gap-2 md:hidden mb-2">
                      <button type="button" onClick={() => setMobileView("groups")}>
                        <ArrowLeft size={18} />
                      </button>
                      <span className="font-bold text-sm truncate">{selectedGroup.name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold" style={{ color: C.gold }}>
                        CANAUX
                      </span>
                      {(isOwner || isMember(selectedGroup)) && (
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
                      )}
                    </div>
                    <p className="text-[10px] mt-1 truncate" style={{ color: C.muted }}>
                      {selectedGroup.description || "—"}
                    </p>
                    {!isMember(selectedGroup) && (
                      <button
                        type="button"
                        onClick={handleJoin}
                        className="mt-2 w-full py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: C.teal, color: "#000" }}
                      >
                        Rejoindre
                      </button>
                    )}
                    {isMember(selectedGroup) && !isOwner && (
                      <button
                        type="button"
                        onClick={handleLeave}
                        className="mt-2 w-full py-1.5 rounded-lg text-xs"
                        style={{ color: C.muted, border: `1px solid ${C.border}` }}
                      >
                        Quitter
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {textChannels.length === 0 && voiceChannels.length === 0 ? (
                      <p className="text-xs p-2" style={{ color: C.muted }}>
                        Aucun canal.{" "}
                        {(isOwner || isMember(selectedGroup)) && (
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
              className={`flex-1 flex flex-col min-w-0 ${
                mobileView === "chat" ? "" : "hidden md:flex"
              }`}
            >
              {selectedChannel ? (
                <>
                  <div
                    className="flex items-center gap-2 p-3 border-b"
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
                    ) : (
                      <Hash size={16} style={{ color: C.gold }} />
                    )}
                    <span className="font-bold text-sm">{selectedChannel.name}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {messages.length === 0 && (
                      <p className="text-center text-sm py-8" style={{ color: C.muted }}>
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
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
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
                            <p className="break-words whitespace-pre-wrap">{m.text}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  <form
                    onSubmit={handleSend}
                    className="p-3 border-t flex gap-2"
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
        className="md:hidden flex justify-around border-t py-1"
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

      {/* ===== Modal Créer groupe ===== */}
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
                <X size={20} style={{ color: C.muted }} />
              </button>
            </div>
            {formError && (
              <p className="text-sm text-red-400">{formError}</p>
            )}
            <input
              required
              value={gName}
              onChange={(e) => setGName(e.target.value)}
              placeholder="Nom du groupe *"
              maxLength={80}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ background: C.surface2, borderColor: C.border, color: C.ivory }}
            />
            <textarea
              value={gDesc}
              onChange={(e) => setGDesc(e.target.value)}
              placeholder="Description (optionnel)"
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
              style={{ background: C.surface2, borderColor: C.border, color: C.ivory }}
            />
            <select
              value={gCategory}
              onChange={(e) => setGCategory(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ background: C.surface2, borderColor: C.border, color: C.ivory }}
            >
              {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={gPublic}
                onChange={(e) => setGPublic(e.target.checked)}
              />
              <span style={{ color: C.muted }}>Groupe public (visible dans Découvrir)</span>
            </label>
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

      {/* ===== Modal Créer canal ===== */}
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
              <button type="button" onClick={() => setShowCreateChannel(false)}>
                <X size={20} style={{ color: C.muted }} />
              </button>
            </div>
            <p className="text-xs" style={{ color: C.muted }}>
              Groupe : {selectedGroup?.name}
            </p>
            {formError && (
              <p className="text-sm text-red-400">{formError}</p>
            )}
            <input
              required
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder="Nom du canal (ex: annonces)"
              maxLength={40}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ background: C.surface2, borderColor: C.border, color: C.ivory }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCType("text")}
                className="flex-1 py-2 rounded-xl text-sm font-bold border"
                style={{
                  borderColor: cType === "text" ? C.gold : C.border,
                  color: cType === "text" ? C.gold : C.muted,
                }}
              >
                <Hash size={14} className="inline mr-1" /> Texte
              </button>
              <button
                type="button"
                onClick={() => setCType("voice")}
                className="flex-1 py-2 rounded-xl text-sm font-bold border"
                style={{
                  borderColor: cType === "voice" ? C.teal : C.border,
                  color: cType === "voice" ? C.teal : C.muted,
                }}
              >
                <Volume2 size={14} className="inline mr-1" /> Vocal
              </button>
            </div>
            <input
              value={cDesc}
              onChange={(e) => setCDesc(e.target.value)}
              placeholder="Description (optionnel)"
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ background: C.surface2, borderColor: C.border, color: C.ivory }}
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
