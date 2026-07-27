"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  Clock,
  Receipt,
  FileText,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  Package,
  Map,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients",    label: "Clients",   icon: Users           },
  { href: "/projects",   label: "Projects",  icon: FolderOpen      },
  { href: "/time",       label: "Time",      icon: Clock           },
  { href: "/expenses",   label: "Expenses",  icon: Receipt         },
  { href: "/invoices",   label: "Invoices",  icon: FileText        },
  { href: "/payments",   label: "Payments",  icon: CreditCard      },
  { href: "/reports",    label: "Reports",   icon: BarChart3       },
  { href: "/strategy",   label: "Strategy",  icon: Compass         },
  { href: "/tools",      label: "Products",  icon: Package         },
];

const OWNER_ITEMS = [
  { href: "/map", label: "Live Map", icon: Map },
];

const COLLAPSE_DEFAULT_SLUGS = ["mark", "didi", "kelsea"];

export function AdminNav({ isAdmin, userEmail = "" }: { isAdmin: boolean; userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("nav-collapsed");
    if (saved !== null) {
      setCollapsed(saved === "true");
    } else {
      const slug = userEmail.split("@")[0].split(/[._-]/)[0].toLowerCase();
      if (COLLAPSE_DEFAULT_SLUGS.includes(slug)) setCollapsed(true);
    }
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("nav-collapsed", String(next));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  // Suppress width flash on first render before localStorage is read
  const navWidth = !mounted ? "w-56" : collapsed ? "w-14" : "w-56";

  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={0}>
      <nav
        className={cn(
          "flex flex-col shrink-0 border-r border-zinc-800 bg-zinc-950 py-6 transition-all duration-200",
          navWidth,
          collapsed ? "px-2" : "px-3"
        )}
      >
        {/* Logo */}
        <div className={cn("mb-8 overflow-hidden", collapsed ? "flex justify-center" : "px-3")}>
          {collapsed ? (
            <a
              href="https://tlv1231-py.github.io/ThunderLakeSystems/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-zinc-100 select-none hover:text-zinc-300 transition-colors"
              title="Thunder Lake Systems"
            >
              T
            </a>
          ) : (
            <a
              href="https://tlv1231-py.github.io/ThunderLakeSystems/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-zinc-100 whitespace-nowrap hover:text-zinc-300 transition-colors"
            >
              Thunder Lake
            </a>
          )}
        </div>

        {/* Nav links */}
        <ul className="flex flex-1 flex-col gap-0.5">
          {isAdmin
            ? NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <li key={href}>
                    <NavItem
                      href={href}
                      label={label}
                      icon={<Icon className="h-4 w-4 flex-shrink-0" />}
                      active={active}
                      collapsed={collapsed}
                    />
                  </li>
                );
              })
            : (
              <li>
                <NavItem
                  href="/strategy"
                  label="Strategy"
                  icon={<Compass className="h-4 w-4 flex-shrink-0" />}
                  active={true}
                  collapsed={collapsed}
                />
              </li>
            )
          }
          {/* Owner-only items */}
          {isAdmin && userEmail === "tlevander.py@gmail.com" && OWNER_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <NavItem
                  href={href}
                  label={label}
                  icon={<Icon className="h-4 w-4 flex-shrink-0" />}
                  active={active}
                  collapsed={collapsed}
                />
              </li>
            );
          })}
        </ul>

        {/* Bottom section */}
        <div className="border-t border-zinc-800 pt-4 mt-4 space-y-0.5">
          {isAdmin && (
            <NavItem
              href="/settings"
              label="Settings"
              icon={<Settings className="h-4 w-4 flex-shrink-0" />}
              active={pathname.startsWith("/settings")}
              collapsed={collapsed}
            />
          )}

          <NavButton
            label="Sign out"
            icon={<LogOut className="h-4 w-4 flex-shrink-0" />}
            collapsed={collapsed}
            onClick={handleSignOut}
          />

          {/* Collapse toggle */}
          <NavButton
            label={collapsed ? "Expand" : "Collapse"}
            icon={
              collapsed
                ? <ChevronsRight className="h-4 w-4 flex-shrink-0" />
                : <ChevronsLeft className="h-4 w-4 flex-shrink-0" />
            }
            collapsed={collapsed}
            onClick={toggle}
            subtle
          />
        </div>
      </nav>
    </Tooltip.Provider>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      href={href}
      className={cn(
        "flex items-center rounded-lg py-2 text-sm transition-colors",
        collapsed ? "justify-center px-2" : "gap-2.5 px-3",
        active
          ? "bg-zinc-800 font-medium text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={10}
          className="z-50 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-100 shadow-xl"
        >
          {label}
          <Tooltip.Arrow className="fill-zinc-800" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function NavButton({
  label,
  icon,
  collapsed,
  onClick,
  subtle = false,
}: {
  label: string;
  icon: React.ReactNode;
  collapsed: boolean;
  onClick: () => void;
  subtle?: boolean;
}) {
  const btn = (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center rounded-lg py-2 text-sm transition-colors",
        collapsed ? "justify-center px-2" : "gap-2.5 px-3",
        subtle
          ? "text-zinc-600 hover:text-zinc-400"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );

  if (!collapsed) return btn;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{btn}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={10}
          className="z-50 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-100 shadow-xl"
        >
          {label}
          <Tooltip.Arrow className="fill-zinc-800" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
