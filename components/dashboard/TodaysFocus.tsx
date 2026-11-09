"use client";

import { useState, useEffect, useRef } from "react";

const FOCUS_KEY = "tls_focus_note";

export function TodaysFocus() {
  const [text, setText]       = useState("");
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved]     = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    setText(localStorage.getItem(FOCUS_KEY) ?? "");
  }, []);

  function handleChange(v: string) {
    setText(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(FOCUS_KEY, v);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1500);
    }, 400);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-medium text-zinc-100">Today&apos;s Focus</h2>
        <span className={`text-xs transition-opacity duration-300 ${saved ? "text-zinc-500 opacity-100" : "opacity-0"}`}>
          Saved
        </span>
      </div>
      {mounted && (
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="What's the focus today?"
          className="flex-1 resize-none bg-transparent px-5 py-4 text-sm text-zinc-300 placeholder:text-zinc-700 outline-none min-h-[120px] leading-relaxed"
          spellCheck={false}
        />
      )}
    </div>
  );
}
