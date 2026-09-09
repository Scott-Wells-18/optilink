import type { ReportFull } from "@/lib/report";

export type ClientOption = {
  id: string;
  name: string;
  addressLine1: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
};

export type ThermalRow = ReportFull["thermalFindings"][number];
export type RcdRow = ReportFull["rcdTests"][number];
export type ObservationRow = ReportFull["observations"][number];
export type PhotoRow = ReportFull["photos"][number];

export type TabProps = {
  report: ReportFull;
  setReport: (updater: (current: ReportFull) => ReportFull) => void;
  patchReport: (update: Record<string, unknown>) => void;
};
