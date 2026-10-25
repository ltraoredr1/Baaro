import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getKnownAccounts, forgetAccount } from "../../lib/knownAccounts.js";

export default function AccountSuggestions({ type, query, onPick }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setItems(getKnownAccounts(type));
  }, [type, query]);

  const q = String(query || "").trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");

  const matches = items
    .filter((v) => {
      if (v.toLowerCase() === q) return false;
      if (type === "phone") return qDigits && v.replace(/\D/g, "").includes(qDigits);
      return q && v.toLowerCase().includes(q);
    })
    .slice(0, 3);

  if (matches.length === 0) return null;

  return (
    <div className="mt-1 rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
      {matches.map((v) => (
        <div
          key={v}
          className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800"
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(v)}
            className="flex-1 text-left text-slate-200 truncate"
          >
            {v}
          </button>
          <button
            type="button"
            aria-label="Oublier ce compte"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              forgetAccount(type, v);
              setItems(getKnownAccounts(type));
            }}
            className="p-1 text-slate-500 hover:text-rose-400"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
