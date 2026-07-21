"use client";

import { useState, useTransition } from "react";
import { createTeamMemberAction, deleteTeamMemberAction, emailToUsername } from "@/app/actions/team";
import { Trash2, Copy, Check } from "lucide-react";

type Member = { id: string; email: string; created_at: string };

export function TeamMembersSection({
  initialMembers,
  loginUrl,
}: {
  initialMembers: Member[];
  loginUrl: string;
}) {
  const [members, setMembers]     = useState<Member[]>(initialMembers);
  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied]       = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("username", username);
    fd.set("password", password);
    startTransition(async () => {
      try {
        await createTeamMemberAction(fd);
        setLastAdded({ username, password });
        // Optimistic update — server stores username@thunderlake.team as the email
        setMembers((prev) => [...prev, {
          id: crypto.randomUUID(),
          email: `${username.toLowerCase()}@thunderlake.team`,
          created_at: new Date().toISOString(),
        }]);
        setUsername("");
        setPassword("");
      } catch (err: any) {
        setError(err.message ?? "Failed to create member.");
      }
    });
  }

  async function handleDelete(id: string, memberEmail: string) {
    const name = emailToUsername(memberEmail);
    if (!confirm(`Remove "${name}"? They'll immediately lose access.`)) return;
    startTransition(async () => {
      try {
        await deleteTeamMemberAction(id);
        setMembers((prev) => prev.filter((m) => m.id !== id));
        if (lastAdded?.username === name) setLastAdded(null);
      } catch (err: any) {
        setError(err.message ?? "Failed to remove member.");
      }
    });
  }

  function copyInvite() {
    if (!lastAdded) return;
    const text = `Thunder Lake strategy board:\n${loginUrl}\n\nUsername: ${lastAdded.username}\nPassword: ${lastAdded.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-100">Team Members</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Strategy Hub access only — no invoicing or client data visible.
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* Create form */}
        <form onSubmit={handleCreate} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-zinc-500 mb-1.5 block">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alex"
              autoComplete="off"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-zinc-500 mb-1.5 block">Password</label>
            <input
              type="text"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 6 characters"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-zinc-100 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {isPending ? "Adding…" : "Add member"}
          </button>
        </form>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Copy-ready invite block */}
        {lastAdded && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-400">Ready to text</span>
              <button
                onClick={copyInvite}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
{`Thunder Lake strategy board:
${loginUrl}

Username: ${lastAdded.username}
Password: ${lastAdded.password}`}
            </pre>
          </div>
        )}

        {/* Member list */}
        {members.length > 0 ? (
          <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-zinc-200">{emailToUsername(m.email)}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Added {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(m.id, m.email)}
                  disabled={isPending}
                  className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 text-center py-4">No team members yet</p>
        )}
      </div>
    </div>
  );
}
