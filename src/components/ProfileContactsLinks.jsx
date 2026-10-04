import { useEffect, useState } from "react";
import {
  Globe,
  Plus,
  Trash2,
  Facebook,
  Youtube,
  Instagram,
  Linkedin,
  MessageCircle,
  Save,
} from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";

const SOCIALS = [
  ["facebook", "Facebook", Facebook],
  ["youtube", "YouTube", Youtube],
  ["tiktok", "TikTok", MessageCircle],
  ["bigo", "Bigo", MessageCircle],
  ["instagram", "Instagram", Instagram],
  ["x", "X", MessageCircle],
  ["linkedin", "LinkedIn", Linkedin],
  ["whatsapp", "WhatsApp", MessageCircle],
  ["telegram", "Telegram", MessageCircle],
  ["snapchat", "Snapchat", MessageCircle],
];

const cleanUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const validUrl = (value) => {
  try {
    const u = new URL(cleanUrl(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

export default function ProfileContactsLinks({ userId }) {
  const { showToast } = useToast();
  const [phones, setPhones] = useState([]);
  const [emails, setEmails] = useState([]);
  const [links, setLinks] = useState([]);
  const [socials, setSocials] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [c, l, s] = await Promise.all([
        supabase.from("profile_contacts").select("*").eq("user_id", userId).order("position"),
        supabase.from("profile_links").select("*").eq("user_id", userId).order("position"),
        supabase.from("profile_social_links").select("*").eq("user_id", userId).order("platform"),
      ]);
      if (c.error) throw c.error;
      if (l.error) throw l.error;
      if (s.error) throw s.error;
      setPhones((c.data || []).filter((x) => x.contact_type === "phone"));
      setEmails((c.data || []).filter((x) => x.contact_type === "email"));
      setLinks(l.data || []);
      setSocials(s.data || []);
    } catch (e) {
      console.error("[BAARO] profile contacts load", e);
      showToast?.("Impossible de charger les coordonnées", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userId]);

  const addContact = (type) => {
    const setter = type === "phone" ? setPhones : setEmails;
    const current = type === "phone" ? phones : emails;
    if (current.length >= 3) {
      showToast?.(`Maximum de 3 ${type === "phone" ? "numéros" : "e-mails"}`, "error");
      return;
    }
    setter([...current, {
      id: `new-${type}-${Date.now()}`,
      contact_type: type,
      value: "",
      label: "",
      position: current.length + 1,
      is_primary: current.length === 0,
    }]);
  };

  const save = async () => {
    if (!userId || saving) return;
    setSaving(true);
    try {
      if (phones.length > 3 || emails.length > 3) {
        throw new Error("Maximum de 3 numéros et 3 e-mails.");
      }

      const contactRows = [
        ...phones.map((x, i) => ({ ...x, contact_type: "phone", position: i + 1, is_primary: i === 0 })),
        ...emails.map((x, i) => ({ ...x, contact_type: "email", position: i + 1, is_primary: i === 0 })),
      ].map(({ id, ...x }) => ({
        ...x,
        user_id: userId,
        value: x.value.trim(),
        label: x.label?.trim() || "",
      }));

      if (contactRows.some((x) => !x.value)) throw new Error("Tous les contacts ajoutés doivent être remplis.");
      if (emails.some((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.value.trim()))) {
        throw new Error("Un e-mail n'est pas valide.");
      }

      const linkRows = links.map((x, i) => ({
        ...(x.id && !String(x.id).startsWith("new-") ? { id: x.id } : {}),
        user_id: userId,
        link_type: x.link_type || "link",
        label: x.label?.trim() || "Lien",
        url: cleanUrl(x.url),
        position: i + 1,
      }));
      if (linkRows.some((x) => !validUrl(x.url))) throw new Error("Un lien n'est pas valide.");

      const socialRows = socials.map((x) => ({
        ...(x.id && !String(x.id).startsWith("new-") ? { id: x.id } : {}),
        user_id: userId,
        platform: x.platform,
        username: x.username?.trim() || "",
        url: cleanUrl(x.url),
        position: 1,
      }));
      if (socialRows.some((x) => !validUrl(x.url))) throw new Error("Un réseau social contient un lien invalide.");

      const deletes = await Promise.all([
        supabase.from("profile_contacts").delete().eq("user_id", userId),
        supabase.from("profile_links").delete().eq("user_id", userId),
        supabase.from("profile_social_links").delete().eq("user_id", userId),
      ]);
      const deleteError = deletes.find((result) => result.error)?.error;
      if (deleteError) throw deleteError;

      const inserts = [
        contactRows.length ? supabase.from("profile_contacts").insert(contactRows) : null,
        linkRows.length ? supabase.from("profile_links").insert(linkRows) : null,
        socialRows.length ? supabase.from("profile_social_links").insert(socialRows) : null,
      ].filter(Boolean);

      for (const request of inserts) {
        const { error } = await request;
        if (error) throw error;
      }

      showToast?.("Coordonnées et réseaux enregistrés", "success");
      await load();
    } catch (e) {
      showToast?.(e.message || "Impossible d'enregistrer", "error");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    background: COLORS.surface,
    borderColor: COLORS.border,
    color: COLORS.ivory,
  };

  const ContactRows = ({ type, rows, setRows }) => (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={row.id} className="grid grid-cols-[1fr_auto] gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={row.value}
              onChange={(e) => setRows(rows.map((x) => x.id === row.id ? { ...x, value: e.target.value } : x))}
              placeholder={type === "phone" ? "Numéro de téléphone" : "E-mail"}
              type={type === "email" ? "email" : "tel"}
              className="rounded-xl border px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <input
              value={row.label || ""}
              onChange={(e) => setRows(rows.map((x) => x.id === row.id ? { ...x, label: e.target.value } : x))}
              placeholder={i === 0 ? "Principal" : "Personnel / Travail"}
              className="rounded-xl border px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <button type="button" onClick={() => setRows(rows.filter((x) => x.id !== row.id))}
            className="p-2 rounded-xl border" style={{ borderColor: COLORS.border, color: COLORS.muted }}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => addContact(type)}
        className="self-start flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold"
        style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}>
        <Plus size={14} /> Ajouter {type === "phone" ? "un numéro" : "un e-mail"}
      </button>
    </div>
  );


  if (!userId) return null;
  if (loading) return <div className="text-sm" style={{ color: COLORS.muted }}>Chargement...</div>;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border p-4" style={{ borderColor: COLORS.border }}>
        <h3 className="font-bold mb-3" style={{ color: COLORS.ivory }}>Téléphones</h3>
        <ContactRows type="phone" rows={phones} setRows={setPhones} />
      </section>

      <section className="rounded-2xl border p-4" style={{ borderColor: COLORS.border }}>
        <h3 className="font-bold mb-3" style={{ color: COLORS.ivory }}>E-mails</h3>
        <ContactRows type="email" rows={emails} setRows={setEmails} />
      </section>

      <section className="rounded-2xl border p-4" style={{ borderColor: COLORS.border }}>
        <h3 className="font-bold mb-3" style={{ color: COLORS.ivory }}>Site Web et liens</h3>
        {links.map((row) => (
          <div key={row.id} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 mb-2">
            <Globe size={18} className="mt-2" style={{ color: COLORS.gold }} />
            <input value={row.label} onChange={(e) => setLinks(links.map(x => x.id === row.id ? {...x,label:e.target.value} : x))}
              placeholder="Nom" className="rounded-xl border px-3 py-2 text-sm" style={inputStyle} />
            <input value={row.url} onChange={(e) => setLinks(links.map(x => x.id === row.id ? {...x,url:e.target.value} : x))}
              placeholder="https://..." className="rounded-xl border px-3 py-2 text-sm" style={inputStyle} />
            <button type="button" onClick={() => setLinks(links.filter(x => x.id !== row.id))} className="p-2" style={{color:COLORS.muted}}><Trash2 size={16}/></button>
          </div>
        ))}
        <button type="button" onClick={() => setLinks([...links, { id:`new-link-${Date.now()}`, link_type:"link", label:"Site Web", url:"", position:links.length+1 }])}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold" style={{borderColor:COLORS.borderGold,color:COLORS.gold}}>
          <Plus size={14}/> Ajouter un lien
        </button>
      </section>

      <section className="rounded-2xl border p-4" style={{ borderColor: COLORS.border }}>
        <h3 className="font-bold mb-3" style={{ color: COLORS.ivory }}>Réseaux sociaux</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {SOCIALS.map(([key, label, Icon]) => {
            const row = socials.find(x => x.platform === key);
            return (
              <div key={key} className="rounded-xl border p-3" style={{borderColor:COLORS.border}}>
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-2 text-sm font-semibold" style={{color:COLORS.ivory}}><Icon size={16}/> {label}</span>
                  {row && <button type="button" onClick={() => setSocials(socials.filter(x=>x.platform!==key))} style={{color:COLORS.muted}}><Trash2 size={15}/></button>}
                </div>
                {row ? (
                  <div className="flex flex-col gap-2">
                    <input value={row.username || ""} onChange={(e)=>setSocials(socials.map(x=>x.platform===key?{...x,username:e.target.value}:x))}
                      placeholder="@identifiant" className="rounded-xl border px-3 py-2 text-sm" style={inputStyle}/>
                    <input value={row.url || ""} onChange={(e)=>setSocials(socials.map(x=>x.platform===key?{...x,url:e.target.value}:x))}
                      placeholder="Lien du profil" className="rounded-xl border px-3 py-2 text-sm" style={inputStyle}/>
                  </div>
                ) : (
                  <button type="button" onClick={()=>setSocials([...socials,{id:`new-social-${key}`,platform:key,username:"",url:"",position:1}])}
                    className="w-full py-2 rounded-xl border text-xs" style={{borderColor:COLORS.border,color:COLORS.ivory}}>Connecter</button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <button type="button" disabled={saving} onClick={save}
        className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold"
        style={{background:COLORS.gold,color:COLORS.bg,opacity:saving?.6:1}}>
        <Save size={17}/> {saving ? "Enregistrement..." : "Enregistrer"}
      </button>
    </div>
  );
}
