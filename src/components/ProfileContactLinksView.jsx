import {
  Globe,
  Phone,
  Mail,
  ExternalLink,
  Facebook,
  Youtube,
  Instagram,
  Linkedin,
  MessageCircle,
} from "lucide-react";
import { COLORS } from "../theme.js";

const PLATFORM_META = {
  facebook: { label: "Facebook", Icon: Facebook },
  youtube: { label: "YouTube", Icon: Youtube },
  tiktok: { label: "TikTok", Icon: MessageCircle },
  bigo: { label: "Bigo", Icon: MessageCircle },
  instagram: { label: "Instagram", Icon: Instagram },
  x: { label: "X", Icon: MessageCircle },
  linkedin: { label: "LinkedIn", Icon: Linkedin },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle },
  telegram: { label: "Telegram", Icon: MessageCircle },
  snapchat: { label: "Snapchat", Icon: MessageCircle },
  other: { label: "Autre", Icon: Globe },
};

/**
 * Affichage public des contacts, liens et réseaux d'un profil.
 * Props alignées sur useProfile / ProfileModal.
 */
export default function ProfileContactLinksView({
  contacts = { phones: [], emails: [] },
  links = [],
  socials = [],
}) {
  const phones = contacts.phones || [];
  const emails = contacts.emails || [];
  const hasAnything =
    phones.length > 0 || emails.length > 0 || links.length > 0 || socials.length > 0;

  if (!hasAnything) return null;

  const chip = {
    borderColor: COLORS.border,
    color: COLORS.ivory,
    background: COLORS.surface,
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: COLORS.muted }}>
        Coordonnées & réseaux
      </h3>

      {/* Téléphones & e-mails */}
      {(phones.length > 0 || emails.length > 0) && (
        <div className="flex flex-col gap-2">
          {phones.map((x) => (
            <a
              key={`phone-${x.id}`}
              href={`tel:${x.value}`}
              className="flex items-center gap-2 text-sm rounded-xl border px-3 py-2.5 baaro-tap"
              style={chip}
            >
              <Phone size={16} style={{ color: COLORS.gold }} aria-hidden />
              <span className="min-w-0 truncate">
                {x.label ? `${x.label} · ` : ""}
                {x.value}
              </span>
            </a>
          ))}
          {emails.map((x) => (
            <a
              key={`email-${x.id}`}
              href={`mailto:${x.value}`}
              className="flex items-center gap-2 text-sm rounded-xl border px-3 py-2.5 baaro-tap"
              style={chip}
            >
              <Mail size={16} style={{ color: COLORS.gold }} aria-hidden />
              <span className="min-w-0 truncate">
                {x.label ? `${x.label} · ` : ""}
                {x.value}
              </span>
            </a>
          ))}
        </div>
      )}

      {/* Liens web */}
      {links.length > 0 && (
        <div className="flex flex-col gap-2">
          {links.map((x) => (
            <a
              key={x.id}
              href={x.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm rounded-xl border px-3 py-2.5 baaro-tap"
              style={chip}
            >
              <Globe size={16} style={{ color: COLORS.gold }} aria-hidden />
              <span className="min-w-0 truncate flex-1">{x.label || "Site Web"}</span>
              <ExternalLink size={13} style={{ color: COLORS.muted }} aria-hidden />
            </a>
          ))}
        </div>
      )}

      {/* Réseaux sociaux — grille compacte */}
      {socials.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {socials.map((x) => {
            const meta = PLATFORM_META[x.platform] || PLATFORM_META.other;
            const Icon = meta.Icon;
            return (
              <a
                key={x.id}
                href={x.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs rounded-xl border px-3 py-2.5 baaro-tap min-w-0"
                style={chip}
                title={meta.label}
              >
                <Icon size={15} style={{ color: COLORS.gold }} aria-hidden />
                <span className="truncate font-medium">
                  {x.username ? `@${String(x.username).replace(/^@/, "")}` : meta.label}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
