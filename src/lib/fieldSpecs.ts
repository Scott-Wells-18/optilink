import type { FieldSpec } from "@/lib/api";

const RISK_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

export const REPORT_FIELDS: Record<string, FieldSpec> = {
  title: { kind: "string", maxLength: 180, nullable: false },
  status: { kind: "enum", values: ["DRAFT", "IN_REVIEW", "ISSUED"] },
  clientId: { kind: "string", maxLength: 40 },
  siteName: { kind: "string", maxLength: 180 },
  siteAddress: { kind: "text", maxLength: 400 },
  siteContact: { kind: "string", maxLength: 180 },
  inspectionDate: { kind: "date" },
  issuedDate: { kind: "date" },
  technicianName: { kind: "string", maxLength: 120 },
  technicianLicence: { kind: "string", maxLength: 60 },
  scopeOfWork: { kind: "text" },
  executiveSummary: { kind: "text" },
  recommendations: { kind: "text" },
  limitations: { kind: "text" },
  ambientTempC: { kind: "number" },
  weatherNotes: { kind: "string", maxLength: 300 },
  equipmentUsed: { kind: "text", maxLength: 500 },
  overallRiskOverride: { kind: "enum", values: RISK_LEVELS },
  includeThermal: { kind: "boolean" },
  includeRcd: { kind: "boolean" },
  includeObservations: { kind: "boolean" },
  includePhotos: { kind: "boolean" },
  includeGlossary: { kind: "boolean" },
};

export const THERMAL_FIELDS: Record<string, FieldSpec> = {
  sortOrder: { kind: "number" },
  location: { kind: "string", maxLength: 200 },
  component: { kind: "string", maxLength: 200 },
  loadAmps: { kind: "number" },
  emissivity: { kind: "number" },
  basis: { kind: "enum", values: ["SIMILAR_COMPONENT", "AMBIENT"] },
  measuredTempC: { kind: "number" },
  referenceTempC: { kind: "number" },
  severityOverride: { kind: "enum", values: RISK_LEVELS },
  findings: { kind: "text" },
  recommendedAction: { kind: "text" },
  clientExplanation: { kind: "text" },
  rectifiedOnSite: { kind: "boolean" },
  thermalImageId: { kind: "string", maxLength: 40 },
  visualImageId: { kind: "string", maxLength: 40 },
};

export const RCD_FIELDS: Record<string, FieldSpec> = {
  sortOrder: { kind: "number" },
  boardName: { kind: "string", maxLength: 160 },
  circuitDescription: { kind: "string", maxLength: 200 },
  rcdKind: { kind: "enum", values: ["TYPE_I", "TYPE_II", "TYPE_III", "DELAYED"] },
  ratedCurrentMa: { kind: "number" },
  poles: { kind: "string", maxLength: 40 },
  make: { kind: "string", maxLength: 120 },
  tripTimeRatedMs: { kind: "number" },
  tripTime5xMs: { kind: "number" },
  rampTripMa: { kind: "number" },
  pushButtonOk: { kind: "boolean" },
  notRequired: { kind: "boolean" },
  resultOverride: { kind: "boolean" },
  notes: { kind: "text" },
};

export const OBSERVATION_FIELDS: Record<string, FieldSpec> = {
  sortOrder: { kind: "number" },
  location: { kind: "string", maxLength: 200 },
  description: { kind: "text" },
  riskLevel: { kind: "enum", values: RISK_LEVELS },
  clauseReference: { kind: "string", maxLength: 120 },
  recommendedAction: { kind: "text" },
  clientExplanation: { kind: "text" },
  rectifiedOnSite: { kind: "boolean" },
  photoId: { kind: "string", maxLength: 40 },
};

export const PHOTO_FIELDS: Record<string, FieldSpec> = {
  sortOrder: { kind: "number" },
  kind: { kind: "enum", values: ["BEFORE", "AFTER", "GENERAL"] },
  pairKey: { kind: "string", maxLength: 60 },
  title: { kind: "string", maxLength: 160 },
  caption: { kind: "text", maxLength: 1000 },
  location: { kind: "string", maxLength: 200 },
};

export const CLIENT_FIELDS: Record<string, FieldSpec> = {
  name: { kind: "string", maxLength: 180, nullable: false },
  contactName: { kind: "string", maxLength: 160 },
  email: { kind: "string", maxLength: 200 },
  phone: { kind: "string", maxLength: 60 },
  addressLine1: { kind: "string", maxLength: 200 },
  addressLine2: { kind: "string", maxLength: 200 },
  suburb: { kind: "string", maxLength: 120 },
  state: { kind: "string", maxLength: 40 },
  postcode: { kind: "string", maxLength: 20 },
  notes: { kind: "text" },
  archived: { kind: "boolean" },
};

export const SETTINGS_FIELDS: Record<string, FieldSpec> = {
  companyName: { kind: "string", maxLength: 160, nullable: false },
  tradingName: { kind: "string", maxLength: 160 },
  abn: { kind: "string", maxLength: 40 },
  licenceNumber: { kind: "string", maxLength: 60 },
  phone: { kind: "string", maxLength: 60 },
  email: { kind: "string", maxLength: 200 },
  website: { kind: "string", maxLength: 200 },
  addressLine1: { kind: "string", maxLength: 200 },
  addressLine2: { kind: "string", maxLength: 200 },
  suburb: { kind: "string", maxLength: 120 },
  state: { kind: "string", maxLength: 40 },
  postcode: { kind: "string", maxLength: 20 },
  primaryColour: { kind: "string", maxLength: 20 },
  accentColour: { kind: "string", maxLength: 20 },
  logoFileId: { kind: "string", maxLength: 40 },
  logoMarkFileId: { kind: "string", maxLength: 40 },
  defaultTechnicianName: { kind: "string", maxLength: 120 },
  defaultTechnicianLicence: { kind: "string", maxLength: 60 },
  reportFooterText: { kind: "text", maxLength: 1000 },
  reportIntroText: { kind: "text", maxLength: 4000 },
};
