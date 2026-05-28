import { NewClientForm } from "@/components/admin/new-client-form";

export default function NewClientPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Add client</h1>
        <p className="mt-1 text-sm text-zinc-500">Create a new client record</p>
      </div>
      <NewClientForm />
    </div>
  );
}
