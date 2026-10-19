import { X } from 'lucide-react';

export function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="p-3 rounded-xl border" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm">{message}</span>
        <button onClick={onClose} className="p-1 hover:opacity-70"><X size={14} /></button>
      </div>
    </div>
  );
}
