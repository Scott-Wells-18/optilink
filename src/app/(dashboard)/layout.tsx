import Image from "next/image";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { BrandStyle } from "@/components/BrandStyle";
import { NavLinks } from "@/components/NavLinks";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSettings();
  const logoUrl = settings.logoFileId ? `/api/files/${settings.logoFileId}` : null;

  return (
    <>
      <BrandStyle primary={settings.primaryColour} accent={settings.accentColour} />
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside
          className="no-print flex shrink-0 flex-col gap-6 px-4 py-5 text-white lg:w-64 lg:px-5 lg:py-7"
          style={{ background: "var(--brand)" }}
        >
          <Link href="/" className="flex items-center gap-3">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={settings.companyName}
                width={240}
                height={80}
                className="h-9 w-auto max-w-[170px] object-contain object-left"
              />
            ) : (
              <span className="text-xl font-bold tracking-tight">
                {settings.companyName}
              </span>
            )}
          </Link>

          <NavLinks />

          <form action="/api/auth/logout" method="post" className="mt-auto hidden lg:block">
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </form>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
