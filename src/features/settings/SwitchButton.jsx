// Interrupteur réutilisable (réglages des sons de notification)
export default function SwitchButton({
  checked,
  onChange,
  C,
  onColor,
  disabled = false,
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="relative w-12 h-6 rounded-full transition-colors disabled:opacity-40"
      style={{ background: checked ? onColor || C.teal : C.border }}
    >
      <div
        className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
        style={{
          background: "#fff",
          transform: checked ? "translateX(26px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}
