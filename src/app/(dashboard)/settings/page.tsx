import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/PageHeader";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your branding and the details that appear on every report."
      />
      <div className="mx-auto max-w-4xl px-5 py-6 sm:px-8">
        <SettingsForm settings={settings} />
      </div>
    </>
  );
}
