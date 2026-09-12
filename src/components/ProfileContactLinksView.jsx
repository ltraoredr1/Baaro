import { Globe, Phone, Mail, ExternalLink } from "lucide-react";
import { COLORS } from "../theme.js";

export default function ProfileContactLinksView({ contacts = { phones: [], emails: [] }, links = [], socials = [] }) {
  const visibleContacts = [
    ...(contacts.phones || []).map((x) => ({ ...x, icon: Phone, type: "Téléphone" })),
    ...(contacts.emails || []).map((x) => ({ ...x, icon: Mail, type: "E-mail" })),
  ];

  if (!visibleContacts.length && !links.length && !socials.length) return null;

  return (
    <div className="flex flex-col gap-3">
      {visibleContacts.map((x) => {
        const Icon = x.icon;
        const href = x.contact_type === "phone" ? `tel:${x.value}` : `mailto:${x.value}`;
        return (
          <a key={`${x.contact_type}-${x.id}`} href={href}
            className="flex items-center gap-2 text-xs rounded-xl border p-3"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}>
            <Icon size={16} style={{ color: COLORS.gold }} />
            <span>{x.label || x.type}: {x.value}</span>
          </a>
        );
      })}
      {links.map((x) => (
        <a key={x.id} href={x.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs rounded-xl border p-3"
          style={{ borderColor: COLORS.border, color: COLORS.ivory }}>
          <Globe size={16} style={{ color: COLORS.gold }} />
          <span>{x.label || "Site Web"}</span>
          <ExternalLink size={13} className="ml-auto" style={{ color: COLORS.muted }} />
        </a>
      ))}
      {socials.map((x) => (
        <a key={x.id} href={x.url} target="_blank" rel="noopener noreferrer"
          className="text-xs rounded-xl border p-3 flex justify-between"
          style={{ borderColor: COLORS.border, color: COLORS.ivory }}>
          <span>{x.platform}{x.username ? ` · ${x.username}` : ""}</span>
          <ExternalLink size={13} style={{ color: COLORS.muted }} />
        </a>
      ))}
    </div>
  );
}
