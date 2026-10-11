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
  LucideIcon,
} from "lucide-react";
import { COLORS } from "../theme.js";

interface ContactItem {
  id: string | number;
  value: string;
  label?: string | null;
}

interface LinkItem {
  id: string | number;
  url: string;
  label?: string | null;
}

interface SocialItem {
  id: string | number;
  platform: string;
  url: string;
  username?: string | null;
}

interface ProfileContactLinksViewProps {
  contacts?: {
    phones?: ContactItem[];
    emails?: ContactItem[];
  };
  links?: LinkItem[];
  socials?: SocialItem[];
}

const PLATFORM_META: Record<string, { label: string; Icon: LucideIcon }> = {
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

function safeWebUrl(value?: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function telHref(value?: string | null): string | null {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

function mailHref(value?: string | null): string | null {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : null;
}

export default function ProfileContactLinksView({
  contacts = { phones: [], emails: [] },
  links = [],
  socials = [],
}: ProfileContactLinksViewProps) {
  const phones = (contacts.phones || [])
    .map((x) => ({ ...x, href: telHref(x.value) }))
    .filter((x): x is ContactItem & { href: string } => Boolean(x.href));
    
  const emails = (contacts.emails || [])
    .map((x) => ({ ...x, href: mailHref(x.value) }))
    .filter((x): x is ContactItem & { href: string } => Boolean(x.href));
    
  const safeLinks = links
    .map((x) => ({ ...x, href: safeWebUrl(x.url) }))
    .filter((x): x is LinkItem & { href: string } => Boolean(x.href));
    
  const safeSocials = socials
    .map((x) => ({ ...x, href: safeWebUrl(x.url) }))
    .filter((x): x is SocialItem & { href: string } => Boolean(x.href));

  const hasAnything =
    phones.length > 0 ||
    emails.length > 0 ||
    safeLinks.length > 0 ||
    safeSocials.length > 0;

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

      {(phones.length > 0 || emails.length > 0) && (
        <div className="flex flex-col gap-2">
          {phones.map((x) => (
            <a
              key={`phone-${x.id}`}
              href={x.href}
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
              href={x.href}
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

      {safeLinks.length > 0 && (
        <div className="flex flex-col gap-2">
          {safeLinks.map((x) => (
            <a
              key={x.id}
              href={x.href}
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

      {safeSocials.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {safeSocials.map((x) => {
            const meta = PLATFORM_META[x.platform] || PLATFORM_META.other;
            const Icon = meta.Icon;
            return (
              <a
                key={x.id}
                href={x.href}
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
