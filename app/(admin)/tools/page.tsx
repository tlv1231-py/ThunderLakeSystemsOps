import { createClient } from "@/lib/supabase/server";
import { ProductsHQ, type ProductRow } from "@/components/admin/ProductsHQ";

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data } = await (supabase as any)
    .from("products")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Products</h1>
        <p className="mt-1 text-sm text-zinc-500">Real-time health across your services</p>
      </div>
      <ProductsHQ initial={(data ?? []) as ProductRow[]} />
    </div>
  );
}
