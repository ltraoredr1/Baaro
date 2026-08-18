import { useState, useEffect, useMemo, useCallback, memo } from "react";
import {
  Swords,
  Plus,
  Hash,
  KeyRound,
  Video,
  Mic,
  MessageSquare,
  Radio,
  Users,
  Sparkles,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { CreateDebateModal } from "./CreateDebateModal.jsx";
import { DebateRoom } from "./DebateRoom.jsx";

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
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 60000);
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

/** Carte live — memo pour éviter re-render de toute la liste */
const DebateCard = memo(function DebateCard({ debate, onOpen }) {
  const Icon = modeIcon(debate.mode);
  return (
    <button
      type="button"
      onClick={() => onOpen(debate.invite_code)}
      className="w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.99] group"
      style={{
        background:
          "linear-gradient(135deg, rgba(26,39,64,0.95) 0%, rgba(15,23,42,0.98) 100%)",
        borderColor: COLORS.border,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderGold;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
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
                ? COLORS.gold
                : debate.mode === "audio"
                  ? COLORS.teal
                  : COLORS.muted,
          }}
        >
          <Icon size={22} />
          {/* Pulse LIVE */}
          <span
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
            style={{ background: "#ef4444", boxShadow: "0 0 0 0 rgba(239,68,68,0.7)" }}
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
              style={{ color: COLORS.ivory }}
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
            style={{ color: COLORS.muted }}
          >
            <Hash size={12} className="shrink-0" />
            <span className="truncate">{debate.topic || "Général"}</span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span
              className="px-2 py-0.5 rounded-md font-medium"
              style={{
                background: COLORS.surface2,
                color: COLORS.muted,
              }}
            >
              {modeLabel(debate.mode)}
            </span>
            <span style={{ color: COLORS.muted }}>{formatWhen(debate.created_at)}</span>
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
      style={{ background: COLORS.surface, borderColor: COLORS.border }}
    >
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-xl" style={{ background: COLORS.surface2 }} />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded" style={{ background: COLORS.surface2 }} />
          <div className="h-3 w-1/2 rounded" style={{ background: COLORS.surface2 }} />
          <div className="h-3 w-1/3 rounded" style={{ background: COLORS.surface2 }} />
        </div>
      </div>
    </div>
  );
}

export default function DebatesTab({ currentUserId, onRewardPoints }) {
  const [debates, setDebates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeDebateCode, setActiveDebateCode] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [filter, setFilter] = useState("all");

  const fetchDebates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("debate_rooms")
        .select(
          "id, title, topic, mode, invite_code, status, created_at, host_id, daily_room_name"
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(40);

      if (qErr) {
        setError(qErr.message);
        setDebates([]);
      } else {
        setDebates(data || []);
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
        () => fetchDebates()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDebates]);

  const filtered = useMemo(() => {
    if (filter === "all") return debates;
    return debates.filter((d) => d.mode === filter);
  }, [debates, filter]);

  const handleJoinByCode = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code || joining) return;
    setJoining(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc("join_debate_by_code", {
        p_code: code,
      });
      if (rpcErr) throw rpcErr;
      if (!data) throw new Error("Code invalide");
      setActiveDebateCode(data.invite_code || code);
      setJoinCode("");
      fetchDebates();
    } catch (err) {
      setError(err.message || "Impossible de rejoindre");
    } finally {
      setJoining(false);
    }
  };

  const openRoom = useCallback((code) => {
    if (code) setActiveDebateCode(code);
  }, []);

  if (activeDebateCode) {
    return (
      <DebateRoom
        inviteCode={activeDebateCode}
        currentUserId={currentUserId}
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
      <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full pb-24 px-1">
        {/* Hero */}
        <div
          className="rounded-3xl p-5 border relative overflow-hidden"
          style={{
            borderColor: COLORS.borderGold,
            background:
              "linear-gradient(135deg, rgba(217,174,82,0.12) 0%, rgba(45,191,166,0.08) 50%, rgba(15,23,42,0.9) 100%)",
          }}
        >
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Radio size={20} style={{ color: COLORS.gold }} />
                <h2 className="text-xl font-bold" style={{ color: COLORS.ivory }}>
                  Lives & Débats
                </h2>
              </div>
              <p className="text-xs" style={{ color: COLORS.muted }}>
                Rejoins un live, débat en texte, audio ou vidéo.
              </p>
              {!loading && (
                <p className="text-[11px] mt-2 font-mono" style={{ color: COLORS.teal }}>
                  {debates.length} salle{debates.length !== 1 ? "s" : ""} active
                  {debates.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg transition active:scale-95"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              <Plus size={16} />
              Créer
            </button>
          </div>
        </div>

        {/* Code invitation */}
        <div
          className="flex gap-2 p-3 rounded-2xl border"
          style={{ background: COLORS.surface, borderColor: COLORS.border }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <KeyRound size={16} className="shrink-0" style={{ color: COLORS.muted }} />
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Code d'invitation"
              maxLength={8}
              className="flex-1 bg-transparent outline-none text-sm uppercase tracking-widest font-mono min-w-0"
              style={{ color: COLORS.ivory }}
              onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
            />
          </div>
          <button
            onClick={handleJoinByCode}
            disabled={!joinCode.trim() || joining}
            className="px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-40 shrink-0"
            style={{ background: COLORS.teal, color: COLORS.bg }}
          >
            {joining ? "…" : "Rejoindre"}
          </button>
        </div>

        {/* Filtres */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border shrink-0 transition"
                style={{
                  background: active ? `${COLORS.gold}22` : COLORS.surface,
                  borderColor: active ? COLORS.gold : COLORS.border,
                  color: active ? COLORS.gold : COLORS.muted,
                }}
              >
                {Icon && <Icon size={12} />}
                {f.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div
            className="p-3 rounded-xl text-xs border"
            style={{
              background: "rgba(239,68,68,0.1)",
              borderColor: "rgba(239,68,68,0.3)",
              color: "#f87171",
            }}
          >
            {error}
            <button
              onClick={fetchDebates}
              className="ml-2 underline font-bold"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Liste */}
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
                style={{ background: COLORS.surface }}
              >
                <Swords size={28} style={{ color: COLORS.muted }} />
              </div>
              <p className="font-bold mb-1" style={{ color: COLORS.ivory }}>
                {filter === "all" ? "Aucun live pour le moment" : "Aucun live dans ce format"}
              </p>
              <p className="text-xs mb-5" style={{ color: COLORS.muted }}>
                Lance un débat ou entre un code d&apos;invitation
              </p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold"
                style={{ background: COLORS.gold, color: COLORS.bg }}
              >
                <Sparkles size={14} />
                Créer un débat
              </button>
            </div>
          ) : (
            filtered.map((d) => (
              <DebateCard key={d.id} debate={d} onOpen={openRoom} />
            ))
          )}
        </div>
      </div>

      <CreateDebateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        currentUserId={currentUserId}
        onSuccess={(room) => {
          setIsCreateOpen(false);
          if (room?.invite_code) setActiveDebateCode(room.invite_code);
          fetchDebates();
        }}
      />
    </>
  );
}
