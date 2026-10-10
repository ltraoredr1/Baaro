import { User, ChevronDown, ChevronUp } from "lucide-react";
import { COLORS } from "../../theme.js";

export function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="relative inline-flex h-[30px] w-[52px] shrink-0 items-center rounded-full transition-colors"
      style={{
        backgroundColor: enabled ? COLORS.teal : "rgba(255,255,255,0.12)",
      }}
    >
      <span
        className="inline-block h-[22px] w-[22px] rounded-full bg-white shadow-md transition-transform"
        style={{ transform: enabled ? "translateX(26px)" : "translateX(4px)" }}
      />
    </button>
  );
}

export function ToggleRow({
  title,
  desc,
  enabled,
  onChange,
}: {
  title: string;
  desc: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5 border-t first:border-t-0"
      style={{ borderColor: COLORS.border }}
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium" style={{ color: COLORS.ivory }}>
          {title}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: COLORS.muted }}>
          {desc}
        </p>
      </div>
      <Toggle enabled={enabled} onChange={onChange} />
    </div>
  );
}

export function ActionRow({
  icon: Icon,
  label,
  onClick,
  tone = "default",
  disabled,
}: {
  icon: typeof User;
  label: string;
  onClick?: () => void;
  tone?: "default" | "gold" | "danger";
  disabled?: boolean;
}) {
  const color =
    tone === "danger" ? "#F87171" : tone === "gold" ? COLORS.gold : COLORS.ivory;
  const badgeColor = tone === "default" ? COLORS.teal : color;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 py-3.5 text-left disabled:opacity-50"
    >
      <div
        className="grid h-8 w-8 place-items-center rounded-lg shrink-0"
        style={{ background: `${badgeColor}1A`, color: badgeColor }}
      >
        <Icon size={15} />
      </div>
      <span className="flex-1 text-sm font-medium" style={{ color }}>
        {label}
      </span>
      <ChevronDown
        size={14}
        className="-rotate-90"
        style={{ color: COLORS.muted, opacity: 0.6 }}
      />
    </button>
  );
}

export function CollapsibleSection({
  id,
  icon: Icon,
  title,
  desc,
  accent = COLORS.teal,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: typeof User;
  title: string;
  desc?: string;
  accent?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{ background: COLORS.surface, borderColor: COLORS.border }}
      data-section={id}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-4 flex items-center gap-3 text-left"
        aria-expanded={open}
      >
        <div
          className="grid h-9 w-9 place-items-center rounded-xl shrink-0"
          style={{ background: `${accent}1A`, color: accent }}
        >
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-[14.5px] font-semibold leading-tight"
            style={{ color: COLORS.ivory }}
          >
            {title}
          </h3>
          {desc && open ? (
            <p
              className="text-[11px] mt-1 leading-relaxed"
              style={{ color: COLORS.muted }}
            >
              {desc}
            </p>
          ) : null}
        </div>
        {open ? (
          <ChevronUp size={16} style={{ color: COLORS.muted }} />
        ) : (
          <ChevronDown size={16} style={{ color: COLORS.muted }} />
        )}
      </button>
      {open && (
        <div
          className="px-4 pb-5 pt-1 flex flex-col gap-3 border-t"
          style={{ borderColor: COLORS.border }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

export const inputStyle = {
  background: COLORS.surface2,
  borderColor: COLORS.border,
  color: COLORS.ivory,
} as const;
