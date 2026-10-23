import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import {
  Swords,
  Plus,
  Hash,
  KeyRound,
  Video,
  Mic,
  MessageSquare,
  Radio,
  Sparkles,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { CreateDebateModal } from "./CreateDebateModal.jsx";
import { DebateRoom } from "./DebateRoom.jsx";
import { useDebates } from "../hooks/useDebates.js";

// Couleurs avec valeurs de secours : évite un bouton invisible si une clé manque dans theme.js
const C = {
  bg: (COLORS && COLORS.bg) || "#0f172a",
  surface: (COLORS && COLORS.surface) || "#111c33",
  surface2: (COLORS && COLORS.surface2) || "#1a2740",
  border: (COLORS && COLORS.border) || "rgba(148,163,184,0.2)",
  borderGold: (COLORS && COLORS.borderGold) || "rgba(217,174,82,0.4)",
  ivory: (COLORS && COLORS.ivory) || "#f8f5ec",
  muted: (COLORS && COLORS.muted) || "#94a3b8",
  gold: (COLORS && COLORS.gold) || "#d9ae52",
  teal: (COLORS && COLORS.teal) || "#2dbfa6",
};

const FILTERS = [
  { id: "all", label: "Tous" },
  { id: "video", label: "Vidéo", icon: Video },
  { id: "audio", label: "Audio", icon: Mic },
  { id: "text", label: "Texte", icon: MessageSquare },
];

function modeIcon(mode) {
  if (mode === "video") return Video;
  if (mode === "audio") return Mic;
  return MessageSquare;
}

function modeLabel(mode) {
  if (mode === "video") return "Vidéo";
  if (mode === "audio") return "Audio";
  return "Texte";
}

function formatWhen(iso) {
  try {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return "À l'instant";
    if (diff < 60) return `Il y a ${diff} min`;
    if (diff < 1440) return `Il y a ${Math.floor(diff / 60)} h`;
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const DebateCard = memo(function DebateCard({ debate, onOpen }) {
  const Icon = modeIcon(debate.mode);
  return (
    <button
      type="button"
      onClick={() => onOpen(debate.invite_code || debate.id)}
      className="w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.99] group"
      style={{
        background:
          "linear-gradient(135deg, rgba(26,39,64,0.95) 0%, rgba(15,23,42,0.98) 100%)",
        borderColor: C.border,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = C.borderGold;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = C.border;
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 relative"
          style={{
            background:
              debate.mode === "video"
                ? "rgba(217,174,82,0.15)"
                : debate.mode === "audio"
                  ? "rgba(45,191,166,0.15)"
                  : "rgba(148,163,184,0.12)",
            color:
              debate.mode === "video"
                ? C.gold
                : debate.mode === "audio"
                  ? C.teal
                  : C.muted,
          }}
        >
          <Icon size={22} />
          <span
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
            style={{
              background: "#ef4444",
              boxShadow: "0 0 0 0 rgba(239,68,68,0.7)",
            }}
          >
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ background: "#ef4444", opacity: 0.6 }}
            />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3
              className="font-bold text-sm truncate"
              style={{ color: C.ivory }}
            >
              {debate.title || "Débat"}
            </h3>
            <span
              className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded tracking-wider"
              style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}
            >
              LIVE
            </span>
          </div>
          <div
            className="flex items-center gap-1.5 text-xs mb-2 truncate"
            style={{ color: C.muted }}
          >
            <Hash size={12} className="shrink-0" />
            <span className="truncate">{debate.topic || "Général"}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span
              className="px-2 py-0.5 rounded-md font-medium"
              style={{ background: C.surface2, color: C.muted }}
            >
              {modeLabel(debate.mode)}
            </span>
            <span style={{ color: C.muted }}>
              {formatWhen(debate.created_at)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
});

function SkeletonCard() {
  return (
    <div
      className="p-4 rounded-2xl border animate-pulse"
      style={{ background: C.surface, borderColor: C.border }}
    >
      <div className="flex gap-3">
        <div
          className="w-12 h-12 rounded-xl"
          style={{ background: C.surface2 }}
        />
        <div className="flex-1 space-y-2">
          <div
            className="h-4 w-2/3 rounded"
            style={{ background: C.surface2 }}
          />
          <div
            className="h-3 w-1/2 rounded"
            style={{ background: C.surface2 }}
          />
          <div
            className="h-3 w-1/3 rounded"
            style={{ background: C.surface2 }}
          />
        </div>
      </div>
    </div>
  );
}

export default function DebatesTab({
  id,
  currentUserId,
  onRewardPoints,
  onOpenProfile,
}) {
  const user_id = currentUserId || id || null;
  const { rooms: myRooms } = useDebates(user_id) || {};
  const [debates, setDebates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeDebateCode, setActiveDebateCode] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [filter, setFilter] = useState("all");
  const refetchTimer = useRef(null);

  useEffect(() => {
    const openRoom = (roomId) => {
      if (roomId) setActiveDebateCode(String(roomId).trim());
    };

    const onOpenDebate = (event) => {
      try {
        sessionStorage.removeItem("baaro:open_debate");
      } catch {}
      openRoom(event.detail?.roomId || event.detail?.room_id);
    };

    window.addEventListener("baaro:open-debate", onOpenDebate);
    try {
      const pending = sessionStorage.getItem("baaro:open_debate");
      if (pending) {
        sessionStorage.removeItem("baaro:open_debate");
        openRoom(pending);
      }
    } catch {}

    return () => window.removeEventListener("baaro:open-debate", onOpenDebate);
  }, []);

  // Fusionne mes salles (hook) sans écraser la liste
  useEffect(() => {
    if (!myRooms?.length) return;
    setDebates((prev) => {
      const ids = new Set(prev.map((d) => d.id));
      const extra = myRooms.filter(
        (r) => r?.id && r.status !== "ended" && !ids.has(r.id)
      );
      return extra.length ? [...extra, ...prev] : prev;
    });
  }, [myRooms]);

  const fetchDebates = useCallback(async () => {
    try {
      const { data, error: qErr } = await supabase
        .from("debate_rooms")
        .select(
          "id, title, topic, mode, invite_code, status, created_at, host_id, daily_room_name"
        )
        .eq("status", "active")
        .gte(
          "created_at",
          new Date(Date.now() - 12 * 3600 * 1000).toISOString()
        )
        .order("created_at", { ascending: false })
        .limit(40);
      if (qErr) {
        setError(qErr.message);
      } else {
        setError(null);
        // Garde les salles ajoutées localement qui ne seraient pas encore visibles
        setDebates((prev) => {
          const list = data || [];
          const ids = new Set(list.map((d) => d.id));
          const localOnly = prev.filter(
            (d) =>
              d?.id &&
              !ids.has(d.id) &&
              Date.now() - new Date(d.created_at || 0).getTime() < 60000
          );
          return [...localOnly, ...list];
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDebates();
    const channel = supabase
      .channel("debates_lobby")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "debate_rooms" },
        () => {
          // Débounce pour éviter les rafales de requêtes
          clearTimeout(refetchTimer.current);
          refetchTimer.current = setTimeout(fetchDebates, 400);
        }
      )
      .subscribe();
    return () => {
      clearTimeout(refetchTimer.current);
      supabase.removeChannel(channel);
    };
  }, [fetchDebates]);

  const filtered = useMemo(
    () =>
      filter === "all" ? debates : debates.filter((d) => d.mode === filter),
    [debates, filter]
  );

  const handleJoinByCode = async () => {
    const raw = joinCode.trim();
    if (!raw || joining) return;
    setJoining(true);
    setError(null);
    try {
      // Normaliser en minuscules (aligné CreateDebateModal)
      const code = raw.toLowerCase();
      const { data, error: rpcErr } = await supabase.rpc(
        "join_debate_by_code",
        { p_code: code }
      );
      if (rpcErr) throw rpcErr;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Code invalide");
      const resolved = String(row.invite_code || code).trim() || code;
      setActiveDebateCode(resolved);
      setJoinCode("");
      fetchDebates();
    } catch (err) {
      setError(err.message || "Impossible de rejoindre");
    } finally {
      setJoining(false);
    }
  };

  const openRoom = useCallback((code) => {
    if (code) setActiveDebateCode(String(code).trim());
  }, []);

  if (activeDebateCode) {
    return (
      <DebateRoom
        inviteCode={activeDebateCode}
        id={user_id}
        onBack={() => {
          setActiveDebateCode(null);
          fetchDebates();
        }}
        onRewardPoints={onRewardPoints}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full pb-32 px-1">
        <div
          className="rounded-3xl p-5 border relative overflow-hidden"
          style={{
            borderColor: C.borderGold,
            background:
              "linear-gradient(135deg, rgba(217,174,82,0.12) 0%, rgba(45,191,166,0.08) 50%, rgba(15,23,42,0.9) 100%)",
          }}
        >
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Radio size={20} style={{ color: C.gold }} />
                <h2 className="text-xl font-bold" style={{ color: C.ivory }}>
                  Lives & Débats
                </h2>
              </div>
              <p className="text-xs" style={{ color: C.muted }}>
                Rejoins un live, débat en texte, audio ou vidéo.
              </p>
              {!loading && (
                <p
                  className="text-[11px] mt-2 font-mono"
                  style={{ color: C.teal }}
                >
                  {debates.length} salle{debates.length !== 1 ? "s" : ""} active
                  {debates.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg transition active:scale-95"
              style={{ background: C.gold, color: C.bg }}
            >
              <Plus size={16} /> Créer
            </button>
          </div>
        </div>

        <div
          className="flex gap-2 p-3 rounded-2xl border"
          style={{ background: C.surface, borderColor: C.border }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <KeyRound
              size={16}
              className="shrink-0"
              style={{ color: C.muted }}
            />
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Code d'invitation"
              maxLength={8}
              className="flex-1 bg-transparent outline-none text-sm uppercase tracking-widest font-mono min-w-0"
              style={{ color: C.ivory }}
              onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
            />
          </div>
          <button
            type="button"
            onClick={handleJoinByCode}
            disabled={!joinCode.trim() || joining}
            className="px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-40 shrink-0"
            style={{ background: C.teal, color: C.bg }}
          >
            {joining ? "…" : "Rejoindre"}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border shrink-0 transition"
                style={{
                  background: active ? `${C.gold}22` : C.surface,
                  borderColor: active ? C.gold : C.border,
                  color: active ? C.gold : C.muted,
                }}
              >
                {Icon && <Icon size={12} />} {f.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div
            className="p-3 rounded-xl text-xs border break-words"
            style={{
              background: "rgba(239,68,68,0.1)",
              borderColor: "rgba(239,68,68,0.3)",
              color: "#f87171",
            }}
          >
            {error}
            <button
              type="button"
              onClick={fetchDebates}
              className="ml-2 underline font-bold"
            >
              Réessayer
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 px-4">
              <div
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: C.surface }}
              >
                <Swords size={28} style={{ color: C.muted }} />
              </div>
              <p className="font-bold mb-1" style={{ color: C.ivory }}>
                {filter === "all"
                  ? "Aucun live pour le moment"
                  : "Aucun live dans ce format"}
              </p>
              <p className="text-xs mb-5" style={{ color: C.muted }}>
                Lance un débat ou entre un code d&apos;invitation
              </p>
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold"
                style={{ background: C.gold, color: C.bg }}
              >
                <Sparkles size={14} /> Créer un débat
              </button>
            </div>
          ) : (
            filtered.map((d) => (
              <DebateCard key={d.id} debate={d} onOpen={openRoom} />
            ))
          )}
        </div>
      </div>

      {/* Bouton flottant : toujours visible, au-dessus de la barre de navigation */}
      <button
        type="button"
        onClick={() => setIsCreateOpen(true)}
        aria-label="Créer un débat ou un live"
        className="fixed right-4 flex items-center gap-2 px-5 py-3.5 rounded-full text-sm font-bold shadow-2xl active:scale-95 transition"
        style={{
          background: C.gold,
          color: C.bg,
          bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
          zIndex: 40,
        }}
      >
        <Plus size={18} /> Créer
      </button>

      <CreateDebateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        id={user_id}
        onSuccess={(room) => {
          setIsCreateOpen(false);
          if (room?.id) {
            setDebates((prev) =>
              prev.some((d) => d.id === room.id) ? prev : [room, ...prev]
            );
          }
          const code = room?.invite_code || room?.id;
          if (code) setActiveDebateCode(String(code));
          fetchDebates();
        }}
      />
    </>
  );
}
