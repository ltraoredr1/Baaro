import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HardDrive, Image, MessageCircle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { getCachedUsers } from "../../data/users.js";
import {
  flushOfflineActions,
  getOfflineActionDeadLetters,
  getOfflineActionDeadLetterCount,
  getOfflineActionQueueSize,
  retryOfflineActionDeadLetters,
} from "../../lib/offlineActions.js";
import {
  flushOfflineEvents,
  getOfflineEventDeadLetters,
  getOfflineEventDeadLetterCount,
  getOfflineEventQueueSize,
  retryOfflineEventDeadLetters,
} from "../../lib/feedEvents.js";
import { getOutboxSize, initOutbox } from "../../lib/messageOutbox.js";
import {
  clearOfflineContentCache,
  getOfflineCacheStats,
  getOfflineStorageLimitMb,
  OFFLINE_CACHE_LIMITS_MB,
  setOfflineStorageLimitMb,
} from "../../lib/offlineContentCache.js";

const syncKey = (userId) => `baaro:offline:last-success:${userId || "anonymous"}`;
const errorText = (item) => String(item?.last_error || item?.error || "Erreur définitive sans détail.");

function Stat({ icon: Icon, label, value, hint, tone = COLORS.teal }) {
  return (
    <div className="rounded-2xl border p-3 min-w-0" style={{ borderColor: COLORS.border, background: COLORS.surface }}>
      <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: COLORS.muted }}>
        <Icon size={15} style={{ color: tone }} />{label}
      </div>
      <div className="mt-1 text-xl font-bold" style={{ color: COLORS.ivory }}>{value}</div>
      {hint && <p className="mt-1 text-[10px] leading-4" style={{ color: COLORS.muted }}>{hint}</p>}
    </div>
  );
}

export function OfflineSyncDashboard({ userId }) {
  const { showToast } = useToast();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine !== false);
  const [counts, setCounts] = useState({ actions: 0, events: 0, messages: 0, errors: [] });
  const [lastSuccess, setLastSuccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [recentProfiles, setRecentProfiles] = useState(0);
  const [cacheStats, setCacheStats] = useState({ usedBytes: 0, limitBytes: getOfflineStorageLimitMb() * 1024 * 1024, limitMb: getOfflineStorageLimitMb(), publicationCount: 0, photoCount: 0 });

  const refresh = useCallback(async () => {
    if (userId) await initOutbox(userId);
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine !== false);
    const actions = getOfflineActionQueueSize(userId);
    const events = getOfflineEventQueueSize(userId);
    const actionErrors = getOfflineActionDeadLetters(userId);
    const eventErrors = getOfflineEventDeadLetters(userId);
    setCounts({
      actions,
      events,
      messages: getOutboxSize(userId),
      errors: [
        ...actionErrors.map((item) => ({ ...item, queue: "Action" })),
        ...eventErrors.map((item) => ({ ...item, queue: "Événement" })),
      ],
    });
    setRecentProfiles(getCachedUsers().length);
    try { setCacheStats(await getOfflineCacheStats(userId)); } catch { /* l'écran de sync reste utilisable sans IndexedDB */ }
    try { setLastSuccess(localStorage.getItem(syncKey(userId)) || null); } catch { setLastSuccess(null); }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const update = () => { setOnline(navigator.onLine !== false); void refresh(); };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("baaro:outbox", update);
    window.addEventListener("baaro:offline-content-cache", update);
    const timer = window.setInterval(refresh, 3000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("baaro:outbox", update);
      window.removeEventListener("baaro:offline-content-cache", update);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const total = counts.actions + counts.events;
  const pending = total + counts.messages;
  const errorsCount = counts.errors.length;
  const cacheSizeHint = useMemo(() => `${recentProfiles} profil(s) public(s) présents dans le cache local.`, [recentProfiles]);

  const runSync = async (retryFailures = false) => {
    if (busy) return;
    if (!userId) {
      showToast("Connecte-toi pour synchroniser les files associées à ton compte.", "info");
      return;
    }
    if (!online) {
      showToast("Hors connexion : les éléments conservés partiront au retour du réseau.", "info");
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: Math.max(1, pending) });
    try {
      if (retryFailures) {
        await Promise.all([
          retryOfflineActionDeadLetters(userId),
          retryOfflineEventDeadLetters(userId),
        ]);
      }
      const events = await flushOfflineEvents();
      setProgress((value) => ({ done: Math.min(value.total, value.done + (events?.flushed || 0)), total: value.total }));
      const actions = await flushOfflineActions();
      const flushed = (events?.flushed || 0) + (actions?.flushed || 0);
      const outstanding = (events?.remaining || 0) + (actions?.remaining || 0) + counts.messages;
      const permanentErrors = (events?.dead || 0) + (actions?.dead || 0);
      if (!events?.offline && !actions?.offline && !events?.disabled && !actions?.disabled && outstanding === 0 && permanentErrors === 0) {
        try { localStorage.setItem(syncKey(userId), new Date().toISOString()); } catch { /* statut non bloquant */ }
      }
      await refresh();
      const remainingErrors = getOfflineActionDeadLetterCount(userId) + getOfflineEventDeadLetterCount(userId);
      if (events?.offline || actions?.offline) showToast("Hors connexion : la file reste conservée sur cet appareil.", "info");
      else if (events?.disabled || actions?.disabled) showToast("La synchronisation hors ligne est désactivée dans Réglages.", "info");
      else if (remainingErrors) showToast(`${flushed} élément(s) confirmé(s) par le serveur ; ${remainingErrors} erreur(s) à examiner.`, "info");
      else showToast(`${flushed} action(s)/événement(s) confirmés par le serveur.`, "success");
    } catch (error) {
      showToast(error?.message || "Synchronisation partielle ; les éléments non confirmés restent en attente.", "error");
    } finally {
      setProgress(null);
      setBusy(false);
      await refresh();
    }
  };

  const changeStorageLimit = async (event) => {
    try {
      const next = await setOfflineStorageLimitMb(Number(event.target.value));
      setCacheStats(await getOfflineCacheStats(userId));
      showToast(`Limite du cache fixée à ${next.limitMb} Mo.`, "success");
    } catch (error) {
      showToast(error?.message || "Impossible de changer la limite du cache.", "error");
    }
  };

  const clearSavedContent = async () => {
    if (!userId || !window.confirm("Supprimer les publications et photos hors ligne de ce compte sur cet appareil ? Les favoris serveur ne seront pas modifiés.")) return;
    try {
      await clearOfflineContentCache(userId);
      setCacheStats(await getOfflineCacheStats(userId));
      showToast("Copies hors ligne supprimées de cet appareil.", "success");
    } catch (error) {
      showToast(error?.message || "Impossible de vider le cache.", "error");
    }
  };

  const lastLabel = lastSuccess ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastSuccess)) : "Aucune synchronisation confirmée";

  return (
    <section className="rounded-3xl border p-4 sm:p-5 space-y-4" style={{ borderColor: COLORS.borderTeal || COLORS.border, background: COLORS.surface }} aria-labelledby="offline-sync-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="offline-sync-title" className="text-base font-bold" style={{ color: COLORS.ivory }}>Synchronisation hors connexion</h2>
          <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>Le bouton synchronise les files d’actions et d’événements ; les messages repartent via leur conversation. Une file n’est vidée qu’après confirmation serveur.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: online ? "#34d399" : "#fbbf24", background: online ? "rgba(52,211,153,.12)" : "rgba(251,191,36,.12)" }}>
          {online ? <Wifi size={13} /> : <WifiOff size={13} />}{online ? "Connecté" : "Hors connexion"}
        </span>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Stat icon={HardDrive} label="Actions en attente" value={counts.actions + counts.events} hint={`${counts.actions} action(s) · ${counts.events} événement(s)`} />
        <Stat icon={MessageCircle} label="Messages à envoyer" value={counts.messages} hint="Boîte d’envoi chiffrée sur cet appareil" />
        <Stat icon={Image} label="Médias à transférer" value="0" hint="Transfert différé de médias non pris en charge actuellement." tone={COLORS.gold || "#fbbf24"} />
        <Stat icon={CheckCircle2} label="Dernière sync réussie" value={<span className="text-sm">{lastLabel}</span>} hint="Horodatage local après confirmation serveur" tone="#34d399" />
      </div>

      <div className="rounded-xl border p-3" style={{ borderColor: COLORS.border, background: COLORS.bg }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs" style={{ color: COLORS.muted }}>
            <span className="font-bold" style={{ color: COLORS.ivory }}>Progression des transferts</span>
            <div className="mt-1">{busy ? "Envoi séquentiel en cours…" : pending ? `${pending} élément(s) en attente` : "Aucun transfert en cours"}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void runSync(false)} disabled={busy || !online} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ background: COLORS.teal, color: COLORS.bg }}>
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />Tout synchroniser
            </button>
            <button type="button" onClick={() => void runSync(true)} disabled={busy || !online || !errorsCount} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: COLORS.borderTeal || COLORS.border, color: COLORS.ivory }}>
              <RefreshCw size={14} />Réessayer les échecs{errorsCount ? ` (${errorsCount})` : ""}
            </button>
          </div>
        </div>
        {progress && <div className="mt-3 h-2 overflow-hidden rounded-full" role="progressbar" aria-label="Synchronisation en cours" aria-valuemin={0} aria-valuemax={100} style={{ background: COLORS.surface2 || COLORS.bg }}><div className="h-full w-1/3 animate-pulse rounded-full" style={{ background: COLORS.teal }} /></div>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border p-3" style={{ borderColor: COLORS.border }}>
          <h3 className="text-xs font-bold" style={{ color: COLORS.ivory }}>Que signifie le statut ?</h3>
          <ol className="mt-2 space-y-1.5 text-[11px]" style={{ color: COLORS.muted }}>
            <li><strong style={{ color: COLORS.ivory }}>Enregistré sur cet appareil</strong> : présent dans une file locale, pas encore transmis.</li>
            <li><strong style={{ color: COLORS.ivory }}>Envoyé au serveur</strong> : l’API a confirmé l’opération ; elle peut sortir de la file.</li>
            <li><strong style={{ color: COLORS.ivory }}>Reçu par le destinataire</strong> : confirmation distincte ; cet écran ne la déduit pas de l’envoi.</li>
          </ol>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: COLORS.border }}>
          <h3 className="text-xs font-bold" style={{ color: COLORS.ivory }}>Contenus disponibles hors connexion — Niveau 3</h3>
          <ul className="mt-2 space-y-1.5 text-[11px]" style={{ color: COLORS.muted }}>
            <li>Profils publics en cache : <strong style={{ color: COLORS.ivory }}>{recentProfiles}</strong>. {cacheSizeHint}</li>
            <li>Publications enregistrées : <strong style={{ color: COLORS.ivory }}>{cacheStats.publicationCount}</strong> conservée(s) localement ; photos R2 téléchargées : <strong style={{ color: COLORS.ivory }}>{cacheStats.photoCount}</strong>.</li>
            <li>Le feed peut afficher les publications enregistrées et les photos déjà téléchargées si Supabase est inaccessible. Les photos non téléchargées et l’historique des conversations ne sont pas garantis hors ligne.</li>
            <li>Cache PWA : fichiers de l’application seulement. Il ne met pas en cache les données Supabase ni les médias R2.</li>
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: COLORS.border }}>
            <div className="text-[11px]" style={{ color: COLORS.muted }}>
              Cache : <strong style={{ color: COLORS.ivory }}>{(cacheStats.usedBytes / (1024 * 1024)).toFixed(1)} Mo</strong> sur l’appareil · {cacheStats.publicationCount} publication(s) et {cacheStats.photoCount} photo(s) pour ce compte
            </div>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.ivory }}>
              Limite de stockage
              <select value={cacheStats.limitMb} onChange={changeStorageLimit} className="rounded-lg border px-2 py-1" style={{ borderColor: COLORS.border, background: COLORS.bg, color: COLORS.ivory }} aria-label="Limite de stockage hors ligne">
                {OFFLINE_CACHE_LIMITS_MB.map((mb) => <option key={mb} value={mb}>{mb} Mo</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void clearSavedContent()} className="rounded-lg border px-2 py-1 text-[10px]" style={{ borderColor: COLORS.border, color: COLORS.muted }} disabled={!userId || (!cacheStats.publicationCount && !cacheStats.photoCount)}>Vider mes copies</button>
          </div>
          <p className="mt-2 text-[10px]" style={{ color: COLORS.muted }}>À la limite, les éléments les moins récemment consultés sont retirés en premier. Enregistrer un favori télécharge ses photos R2 quand elles sont accessibles ; le cache local ne modifie pas les favoris côté serveur. Désactiver « Cache local » empêche de nouvelles copies.</p>
        </div>
      </div>

      {errorsCount > 0 && <div className="rounded-xl border p-3" style={{ borderColor: "rgba(248,113,113,.4)", background: "rgba(248,113,113,.06)"}}>
        <h3 className="flex items-center gap-2 text-xs font-bold" style={{ color: "#fca5a5" }}><AlertTriangle size={14} />Erreurs à résoudre ({errorsCount})</h3>
        <ul className="mt-2 max-h-32 space-y-2 overflow-auto">
          {counts.errors.map((item, index) => <li key={`${item.queue}-${item.id || index}`} className="text-[11px]" style={{ color: COLORS.muted }}><strong style={{ color: COLORS.ivory }}>{item.queue}</strong> · {errorText(item)} <span>({item.attempts || 0} tentative(s))</span></li>)}
        </ul>
        <p className="mt-2 text-[10px]" style={{ color: COLORS.muted }}>Les erreurs définitives restent visibles jusqu’à une relance ou une suppression explicite.</p>
      </div>}
    </section>
  );
}
