import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { ADMIN_EMAIL } from "@/lib/constants";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const isAdmin = user.email === ADMIN_EMAIL;

  return (
    <div className="flex h-screen bg-zinc-950">
      <AdminNav isAdmin={isAdmin} />
      <main className="flex-1 overflow-y-auto" style={{ overflowX: "clip" }}>
        <div className="px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
