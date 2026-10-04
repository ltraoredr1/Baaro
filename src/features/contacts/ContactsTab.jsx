import React, { useState } from "react";
import {
  Search,
  RefreshCw,
  Phone,
  Mail,
  Loader2,
  UserCheck,
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { useContacts } from "../../hooks/useContacts.js";
import FriendRequestButton from "../friends/FriendRequestButton.jsx";

export default function ContactsTab({ onOpenProfile }) {
  const {
    syncing,
    matches,
    supported,
    registerMyIdentifiers,
    syncDeviceContacts,
    searchByIdentifier,
  } = useContacts();

  const [myPhone, setMyPhone] = useState("");
  const [myEmail, setMyEmail] = useState("");
  const [savingMine, setSavingMine] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState(undefined);
  const [searching, setSearching] = useState(false);

  const handleSaveMine = async () => {
    if (!myPhone.trim() && !myEmail.trim()) return;
    setSavingMine(true);
    try {
      await registerMyIdentifiers({
        phone: myPhone.trim() || null,
        email: myEmail.trim() || null,
      });
    } catch (e) {
      alert("Impossible d'enregistrer : " + (e.message || ""));
    } finally {
      setSavingMine(false);
    }
  };

  const handleSync = async () => {
    try {
      await syncDeviceContacts();
    } catch (e) {
      alert("Synchronisation impossible : " + (e.message || ""));
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await searchByIdentifier(query.trim());
      setSearchResult(r);
    } catch (e) {
      alert("Recherche impossible : " + (e.message || ""));
    } finally {
      setSearching(false);
    }
  };

  const UserRow = ({ u }) => (
    <div
      className="flex items-center gap-3 p-3 rounded-[14px] border-2"
      style={{ background: COLORS.surface2, borderColor: COLORS.border }}
    >
      <img
        src={
          u.avatar_url ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${u.display_name || "A"}`
        }
        alt=""
        className="w-11 h-11 rounded-full object-cover cursor-pointer"
        onClick={() => onOpenProfile?.(u.id)}
      />
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onOpenProfile?.(u.id)}
      >
        <div
          className="font-black text-[14px] truncate flex items-center gap-1"
          style={{ color: COLORS.ivory }}
        >
          {u.display_name || "Membre"} {u.flag && <span>{u.flag}</span>}
        </div>
        <div
          className="text-[11px] truncate flex items-center gap-1"
          style={{ color: COLORS.muted }}
        >
          @{u.handle || "membre"}
          {u.matched_via && (
            <span>
              • trouvé via {u.matched_via === "phone" ? "téléphone" : "e-mail"}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <FriendRequestButton targetId={u.id} />
      </div>
    </div>
  );

  return (
    <div className="p-3 space-y-6">
      <div className="space-y-2">
        <p
          className="text-[11px] font-black uppercase tracking-widest"
          style={{ color: COLORS.muted }}
        >
          Ajouter via numéro ou e-mail
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: COLORS.muted }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="+223 70 00 00 00 ou nom@exemple.com"
              className="w-full pl-10 pr-3 py-3 rounded-[14px] text-[14px] font-medium outline-none border"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-4 rounded-[14px] font-black text-[13px] disabled:opacity-50"
            style={{ background: COLORS.gold, color: COLORS.bg }}
          >
            {searching ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "Chercher"
            )}
          </button>
        </div>
        {searchResult === null && (
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Personne trouvé avec ce numéro/e-mail sur BAARO.
          </p>
        )}
        {searchResult && <UserRow u={searchResult} />}
      </div>

      <div className="space-y-2">
        <p
          className="text-[11px] font-black uppercase tracking-widest"
          style={{ color: COLORS.muted }}
        >
          Synchroniser mes contacts
        </p>
        {supported ? (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[14px] font-black text-[14px] disabled:opacity-60"
            style={{
              background: `linear-gradient(135deg, ${COLORS.gold}, #ff8c42)`,
              color: COLORS.bg,
            }}
          >
            {syncing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
            {syncing
              ? "Recherche en cours…"
              : "Importer mes contacts du téléphone"}
          </button>
        ) : (
          <p
            className="text-[12px] p-3 rounded-[14px] border"
            style={{
              color: COLORS.muted,
              borderColor: COLORS.border,
              background: COLORS.surface2,
            }}
          >
            La synchronisation directe du répertoire n&apos;est disponible que
            sur certains navigateurs mobiles (Chrome Android) ou dans la version
            app native. Utilise la recherche par numéro/e-mail ci-dessus.
          </p>
        )}

        {matches.length > 0 && (
          <div className="space-y-2 pt-2">
            <p
              className="text-[11px] font-black"
              style={{ color: COLORS.ivory }}
            >
              {matches.length} contact{matches.length > 1 ? "s" : ""} déjà sur
              BAARO
            </p>
            {matches.map((u) => (
              <UserRow key={u.id} u={u} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p
          className="text-[11px] font-black uppercase tracking-widest"
          style={{ color: COLORS.muted }}
        >
          Être trouvable par mes contacts
        </p>
        <div
          className="p-3 rounded-[14px] border-2 space-y-2"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.border,
          }}
        >
          <div className="relative">
            <Phone
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: COLORS.muted }}
            />
            <input
              value={myPhone}
              onChange={(e) => setMyPhone(e.target.value)}
              placeholder="Mon numéro (optionnel)"
              className="w-full pl-9 pr-3 py-2.5 rounded-[12px] text-[13px] outline-none border"
              style={{
                background: COLORS.surface,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            />
          </div>
          <div className="relative">
            <Mail
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: COLORS.muted }}
            />
            <input
              value={myEmail}
              onChange={(e) => setMyEmail(e.target.value)}
              placeholder="Mon e-mail (optionnel)"
              className="w-full pl-9 pr-3 py-2.5 rounded-[12px] text-[13px] outline-none border"
              style={{
                background: COLORS.surface,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleSaveMine}
            disabled={savingMine}
            className="w-full py-2.5 rounded-[12px] font-black text-[13px] disabled:opacity-60 flex items-center justify-center gap-1.5"
            style={{
              background: COLORS.surface,
              color: COLORS.gold,
              border: `1px solid ${COLORS.borderGold || COLORS.border}`,
            }}
          >
            {savingMine ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <UserCheck size={14} />
            )}{" "}
            Enregistrer
          </button>
          <p className="text-[10.5px]" style={{ color: COLORS.muted }}>
            Ton numéro/e-mail ne sont jamais montrés aux autres en clair —
            seuls les membres qui les ont déjà dans leur répertoire peuvent te
            retrouver.
          </p>
        </div>
      </div>
    </div>
  );
}
