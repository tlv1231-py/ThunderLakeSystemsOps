"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sun, Moon } from "lucide-react";

export function DashboardThemeShell({
  initialTheme,
  userId,
  children,
}: {
  initialTheme: "dark" | "light";
  userId: string;
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<"dark" | "light">(initialTheme);
  const supabase = createClient();

  // Push background all the way to the main scroll container
  useEffect(() => {
    const el = document.querySelector("main") as HTMLElement | null;
    if (!el) return;
    el.style.background = theme === "light" ? "#ffffff" : "#000000";
    return () => { el.style.background = ""; };
  }, [theme]);

  async function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    await (supabase as any).from("dashboard_preferences").upsert({ user_id: userId, theme: next });
  }

  const isDark = theme === "dark";

  const css = isDark
    ? `
        .db-root { background: #000; }
        .db-root * { color: #fff !important; }
        .db-root [class*="bg-zinc-"] { background-color: transparent !important; }
        .db-root [class*="border-zinc"] { border-color: rgba(255,255,255,0.1) !important; }
        .db-root [class*="divide-zinc"] > * + * { border-color: rgba(255,255,255,0.1) !important; }
        .db-root [class*="text-emerald"] { color: #34d399 !important; }
        .db-root [class*="text-red-4"] { color: #f87171 !important; }
        .db-root [class*="text-green-"] { color: #4ade80 !important; }
        .db-root [class*="text-blue-"] { color: #60a5fa !important; }
        .db-root [class*="text-yellow-"] { color: #facc15 !important; }
      `
    : `
        .db-root { background: #fff; }
        .db-root * { color: #000 !important; }
        .db-root [class*="bg-zinc-"] { background-color: transparent !important; }
        .db-root [class*="border-zinc"] { border-color: rgba(0,0,0,0.1) !important; }
        .db-root [class*="divide-zinc"] > * + * { border-color: rgba(0,0,0,0.1) !important; }
        .db-root [class*="text-emerald"] { color: #059669 !important; }
        .db-root [class*="text-red-4"] { color: #dc2626 !important; }
        .db-root [class*="text-green-"] { color: #16a34a !important; }
        .db-root [class*="text-blue-"] { color: #2563eb !important; }
        .db-root [class*="text-yellow-"] { color: #ca8a04 !important; }
      `;

  return (
    <div className="db-root relative">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <button
        onClick={toggle}
        className="absolute top-0 right-0 z-10 p-2 rounded-lg opacity-40 hover:opacity-100 transition-opacity"
        title={isDark ? "Light mode" : "Dark mode"}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      {children}
    </div>
  );
}
