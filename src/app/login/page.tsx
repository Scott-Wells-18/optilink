import Image from "next/image";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { BrandStyle } from "@/components/BrandStyle";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const cookieStore = await cookies();
  if (await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)) {
    redirect("/");
  }

  const { next } = await searchParams;
  const settings = await getSettings().catch(() => null);
  const companyName = settings?.companyName || "OptiLink";
  const logoUrl = settings?.logoFileId ? `/api/files/${settings.logoFileId}` : null;

  return (
    <>
      <BrandStyle
        primary={settings?.primaryColour ?? "#0B3B60"}
        accent={settings?.accentColour ?? "#F5A623"}
      />
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(150deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 70%, #000) 60%, #050b12 100%)",
          }}
        />
        <div
          className="absolute -right-32 -top-32 -z-10 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--accent)" }}
        />

        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={companyName}
                width={320}
                height={110}
                className="mx-auto h-16 w-auto object-contain"
                priority
              />
            ) : (
              <div className="mx-auto flex h-16 items-center justify-center">
                <span className="text-3xl font-bold tracking-tight text-white">
                  {companyName}
                </span>
              </div>
            )}
            <p className="mt-4 text-sm text-white/70">
              Electrical inspection reporting
            </p>
          </div>

          <div className="rounded-2xl bg-white/95 p-6 shadow-2xl ring-1 ring-white/20 backdrop-blur">
            <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">
              Enter the office password to open the dashboard.
            </p>
            <LoginForm next={next} />
          </div>

          <p className="mt-6 text-center text-xs text-white/50">
            {companyName} · Reports are confidential to the client they were
            prepared for.
          </p>
        </div>
      </main>
    </>
  );
}
