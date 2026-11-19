import { useEffect, useState } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { X } from "lucide-react";
import { API } from "../config";

const getToken = () => localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface UserOption { id: string; name: string; }

interface UserAccountFieldProps {
  /** Input id / label text. */
  label?: string;
  inputId?: string;
  /** Linked user id — empty string means "no account linked". */
  value: string;
  /** Chip label when linked, or the live search text when not. */
  name: string;
  /** Called with (userId, displayName) — ("", text) while typing. */
  onChange: (value: string, name: string) => void;
}

/**
 * Search-and-link field for user accounts. Shows a removable chip once a
 * user is picked; otherwise a debounced name/email search with results.
 */
export default function UserAccountField({ label = "Linked Account", inputId, value, name, onChange }: Readonly<UserAccountFieldProps>) {
  const [results, setResults] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (value || !name.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `${API}/users/search?include_self=1&q=${encodeURIComponent(name.trim())}`,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        const data = await res.json();
        if (data.success) setResults((data.data || []).slice(0, 8));
      } catch { /* ignore */ } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [name, value]);

  return (
    <div className="space-y-2">
      {label ? <Label htmlFor={inputId}>{label}</Label> : null}
      {value ? (
        <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
          <span className="truncate">{name || "Linked account"}</span>
          <button
            type="button"
            aria-label="Unlink account"
            className="text-gray-400 hover:text-red-500 ml-2"
            onClick={() => { onChange("", ""); setResults([]); }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <Input
            id={inputId}
            value={name}
            placeholder="Search user by name or email…"
            onChange={(e) => onChange("", e.target.value)}
          />
          {searching && <p className="text-xs text-gray-400">Searching…</p>}
          {!searching && name.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-gray-400">No active accounts found — the member's account may be deactivated or not registered yet.</p>
          )}
          {results.length > 0 && (
            <div className="border rounded-md max-h-32 overflow-y-auto">
              {results.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
                  onClick={() => { onChange(u.id, u.name); setResults([]); }}
                >
                  {u.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
