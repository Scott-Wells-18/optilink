import { cookies } from "next/headers";
import { Suspense } from "react";
import { SESSION_COOKIE, usingDefaultPassword, verifySessionToken } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { BrandStyle } from "@/components/BrandStyle";
import { Gateway } from "./Gateway";

export const dynamic = "force-dynamic";

export default async function EntryPage() {
  const cookieStore = await cookies();
  const authed = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);

  // The sign-in screen has to render even if the database is unreachable.
  const settings = await getSettings().catch(() => null);

  return (
    <>
      <BrandStyle
        primary={settings?.primaryColour ?? "#0B3B60"}
        accent={settings?.accentColour ?? "#F5A623"}
      />
      <Suspense>
        <Gateway
          authed={authed}
          companyName={settings?.companyName ?? "OptiLink"}
          logoUrl={settings?.logoFileId ? `/api/files/${settings.logoFileId}` : null}
          defaultPassword={usingDefaultPassword()}
        />
      </Suspense>
    </>
  );
}
