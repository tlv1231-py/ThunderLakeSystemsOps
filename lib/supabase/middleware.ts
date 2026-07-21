import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { ADMIN_EMAIL } from "@/lib/constants";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isAuthRoute     = pathname.startsWith("/auth");
  const isStrategyRoute = pathname.startsWith("/strategy");
  const isPortalRoute   = pathname.startsWith("/portal");

  const isAdminRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/time") ||
    pathname.startsWith("/expenses") ||
    pathname.startsWith("/invoices") ||
    pathname.startsWith("/payments") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/settings");

  // Unauthenticated users trying to access protected routes → login
  if (!user && (isAdminRoute || isStrategyRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Team members (non-admin) can only access /strategy
  if (user && user.email !== ADMIN_EMAIL && !isStrategyRoute && !isAuthRoute && !isPortalRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/strategy";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
