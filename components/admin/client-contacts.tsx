"use client";

import { useState, useTransition } from "react";
import { addContact, removeContact } from "@/app/(admin)/clients/[id]/actions";

type Contact = {
  id: string;
  name: string;
  email: string;
  portal_access_enabled: boolean;
};

export function ClientContacts({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: Contact[];
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("email", email);
    startTransition(async () => {
      try {
        await addContact(clientId, fd);
        setName("");
        setEmail("");
        setAdding(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add contact");
      }
    });
  }

  function handleRemove(contactId: string) {
    startTransition(() => removeContact(clientId, contactId));
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-medium text-zinc-900">
          Contacts
          <span className="ml-2 text-xs font-normal text-zinc-400">
            invoices sent to all
          </span>
        </h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            + Add
          </button>
        )}
      </div>

      {contacts.length === 0 && !adding && (
        <p className="px-5 py-4 text-sm text-zinc-400">
          No contacts yet. Add at least one email address.
        </p>
      )}

      {contacts.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-5 py-3 group">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{c.name}</p>
                <p className="text-xs text-zinc-500 truncate">{c.email}</p>
              </div>
              <button
                onClick={() => handleRemove(c.id)}
                disabled={isPending}
                className="ml-4 text-xs text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <form onSubmit={handleAdd} className="px-5 py-4 space-y-3 border-t border-zinc-100">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="jane@example.com"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving…" : "Add contact"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
