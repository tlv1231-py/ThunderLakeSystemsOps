import { LoginForm } from "@/components/admin/login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md px-8 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Thunder Lake Systems
          </h1>
          <p className="mt-2 text-sm text-zinc-500">Sign in to your workspace</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
