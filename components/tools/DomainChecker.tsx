"use client";

import { useState } from "react";
import { Search, Check, X, Loader2, ExternalLink } from "lucide-react";

type Result = {
  domain: string;
  available: boolean | null;
  price: number | null;
  currency: string;
};

export function DomainChecker() {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");

  async function check() {
    const name = query.trim().replace(/^https?:\/\//, "").replace(/\..+$/, "").toLowerCase();
    if (!name) return;
    setLoading(true);
    setResults([]);
    setSearched(name);
    const res = await fetch(`/api/domain-check?name=${encodeURIComponent(name)}`);
    const data: Result[] = await res.json();
    setResults(data);
    setLoading(false);
  }

  const available   = results.filter((r) => r.available === true);
  const unavailable = results.filter((r) => r.available === false);
  const unknown     = results.filter((r) => r.available === null);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-100">Domain Checker</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Check availability + pricing across TLDs in real time</p>
      </div>

      {/* Search */}
      <div className="px-5 py-4 border-b border-zinc-800">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") check(); }}
            placeholder="e.g. thunderlake"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
          <button
            onClick={check}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-100 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Check
          </button>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking all TLDs…</span>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="divide-y divide-zinc-800">
          {/* Available */}
          {available.map((r) => (
            <div key={r.domain} className="flex items-center gap-3 px-5 py-3">
              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="flex-1 text-sm font-medium text-zinc-100">{r.domain}</span>
              {r.price !== null && (
                <span className="text-sm text-emerald-400 font-medium tabular-nums">
                  ${r.price.toFixed(2)}<span className="text-xs text-zinc-500">/yr</span>
                </span>
              )}
              <a
                href={`https://www.godaddy.com/domainsearch/find?checkAvail=1&tmskey=&domainToCheck=${r.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-300 transition-colors"
                title="Buy on GoDaddy"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}

          {/* Unavailable */}
          {unavailable.map((r) => (
            <div key={r.domain} className="flex items-center gap-3 px-5 py-3 opacity-40">
              <X className="h-4 w-4 text-red-400 shrink-0" />
              <span className="flex-1 text-sm text-zinc-400">{r.domain}</span>
              <span className="text-xs text-zinc-600">taken</span>
            </div>
          ))}

          {/* Unknown */}
          {unknown.map((r) => (
            <div key={r.domain} className="flex items-center gap-3 px-5 py-3 opacity-30">
              <span className="h-4 w-4 rounded-full border border-zinc-600 shrink-0" />
              <span className="flex-1 text-sm text-zinc-500">{r.domain}</span>
              <span className="text-xs text-zinc-600">unknown</span>
            </div>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="flex items-center justify-center py-10">
          <p className="text-xs text-zinc-600">Type a name and hit Check</p>
        </div>
      )}
    </div>
  );
}
