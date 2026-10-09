/**
 * What a saved gate is allowed to hold, and how a request becomes one.
 *
 * Shared between the collection route and the single-asset route. It lives
 * here rather than being exported from a route file because a Next route
 * module may only export route handlers — exporting anything else from one
 * fails the build.
 */

export type AssetBody = {
  siteId?: string;
  assetNumber?: string | null;
  gateLocation?: string | null;
  kind?: string;
  model?: string | null;
  serialNumber?: string | null;
  controllerModel?: string | null;
  controllerFirmware?: string | null;
  armLengthMetres?: number | string | null;
  accessories?: string[];
  accessoryNotes?: string | null;
  manualRef?: string | null;
  previousService?: string | null;
};

const text = (value: unknown, limit = 200): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, limit);
  return trimmed || null;
};

export function assetData(body: AssetBody) {
  const metres =
    body.armLengthMetres === null || body.armLengthMetres === undefined || body.armLengthMetres === ""
      ? null
      : Number(body.armLengthMetres);

  return {
    assetNumber: text(body.assetNumber, 60),
    gateLocation: text(body.gateLocation),
    kind: (body.kind === "SLIDING" ? "SLIDING" : "BOOM") as "BOOM" | "SLIDING",
    model: text(body.model),
    serialNumber: text(body.serialNumber, 80),
    controllerModel: text(body.controllerModel),
    controllerFirmware: text(body.controllerFirmware, 80),
    armLengthMetres: Number.isFinite(metres) ? metres : null,
    accessories: Array.isArray(body.accessories)
      ? body.accessories.filter((item) => typeof item === "string").slice(0, 40)
      : [],
    accessoryNotes: text(body.accessoryNotes, 2000),
    manualRef: text(body.manualRef, 400),
    previousService: text(body.previousService, 400),
  };
}

