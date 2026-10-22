// Interrupteur réutilisable (réglages des sons de notification)
//
// Corrections :
// - Rendu cassé en langues RTL (arabe, n'ko) : le bouton est forcé en dir="ltr"
//   et la pastille a une position `left` explicite.
// - Accessibilité : role="switch", aria-checked, aria-label.
export default function SwitchButton({
  checked,
  onChange,
  C,
  onColor,
  disabled = false,
  label,
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      dir="ltr"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="relative w-12 h-6 shrink-0 rounded-full transition-colors disabled:opacity-40"
      style={{ background: checked ? onColor || C.teal : C.border }}
    >
      <span
        className="absolute top-0.5 left-0 block w-5 h-5 rounded-full transition-transform"
        style={{
          background: "#fff",
          transform: checked ? "translateX(26px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}
