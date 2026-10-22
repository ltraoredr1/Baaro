import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { unblockUser } from "../../lib/blocks.js";
import { COLORS } from "../../theme.js";

/**
 * Liste des utilisateurs bloqués, avec « Débloquer ».
 * Props : user_id (UUID auth), t (fonction de traduction de SettingsTab).
 */
export default function BlockedUsersPanel({ user_id, t }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!user_id) return;

    setLoading(true);
    setError("");

    try {
      const { data: blocks, error: blocksError } = await supabase
        .from("user_blocks")
        .select("blocked_id, created_at")
        .eq("blocker_id", user_id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (blocksError) throw blocksError;

      const ids = (blocks || []).map((b) => b.blocked_id);
      let profilesById = new Map();

      if (ids.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url")
          .in("id", ids);

        if (profilesError) throw profilesError;
        profilesById = new Map((profiles || []).map((p) => [p.id, p]));
      }

      if (!mountedRef.current) return;

      setItems(
        (blocks || []).map((b) => ({
          id: b.blocked_id,
          created_at: b.created_at,
          profile: profilesById.get(b.blocked_id) || null,
        })),
      );
    } catch (err) {
      console.error("[blocked] chargement :", err);
      if (mountedRef.current) setError(err?.message || t("action_error"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user_id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUnblock = async (blockedId) => {
    if (busyId) return;

    const previous = items;
    setBusyId(blockedId);
    setItems((list) => list.filter((item) => item.id !== blockedId));

    const res = await unblockUser(blockedId);

    if (!mountedRef.current) return;

    setBusyId(null);

    if (!res.ok) {
      setItems(previous);
      setError(res.error || t("action_error"));
    }
  };

  if (loading) {
    return (
      <p className="text-sm" style={{ color: COLORS.muted }}>
        …
      </p>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm" style={{ color: "#F87171" }}>
          {t("blocked_load_error")}
        </p>
        <button
          type="button"
          onClick={load}
          className="self-start rounded-lg border px-3 py-2 text-xs"
          style={{ color: COLORS.ivory, borderColor: COLORS.border }}
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm" style={{ color: COLORS.muted }}>
        {t("blocked_none")}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {error && (
        <p className="mb-2 text-xs" style={{ color: "#F87171" }}>
          {error}
        </p>
      )}

      {items.map((item) => {
        const name =
          item.profile?.display_name ||
          (item.profile?.handle ? `@${String(item.profile.handle).replace(/^@/, "")}` : "") ||
          t("guest");

        return (
          <div
            key={item.id}
            className="flex items-center gap-3 py-2.5 border-t first:border-t-0"
            style={{ borderColor: COLORS.border }}
          >
            <img
              src={
                item.profile?.avatar_url ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1A2740`
              }
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
              style={{ border: `1px solid ${COLORS.border}` }}
            />

            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-semibold"
                style={{ color: COLORS.ivory }}
              >
                {name}
              </p>
              {item.profile?.handle && (
                <p className="truncate text-xs" style={{ color: COLORS.muted }}>
                  @{String(item.profile.handle).replace(/^@/, "")}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleUnblock(item.id)}
              disabled={busyId === item.id}
              className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50"
              style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}
            >
              {t("unblock")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
