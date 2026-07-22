import { DomainChecker } from "@/components/tools/DomainChecker";

export default function ToolsPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">Tools</h1>
        <p className="mt-1 text-sm text-zinc-500">Internal utilities</p>
      </div>
      <DomainChecker />
    </div>
  );
}
