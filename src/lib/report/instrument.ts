import { readUpload } from "@/lib/storage";
import { safe } from "@/lib/report/theme";
import { readCalibration, type Calibration } from "@/lib/report/calibration";
import { readCertificate, type Certificate } from "@/lib/report/certificate";

/**
 * The instrument a set of readings was taken with.
 *
 * Shared by every report that quotes a measurement, because the question a
 * client asks about a number is the same whichever report it is printed in:
 * what took it, and was that thing in calibration at the time.
 */

export type Instrument = {
  name: string;
  serialNo: string | null;
  modelNo: string | null;
  /** A photograph of it, already loaded. */
  photo: Buffer | null;
  /** Its calibration certificate, ready to be stamped into the report. */
  certificate: Certificate | null;
  /** True where a certificate was filed but could not be opened. */
  certificateUnreadable: boolean;
  /** What the certificate itself says, where it could be read. */
  calibration: Calibration;
};

type InstrumentRow = {
  name: string;
  serialNo: string | null;
  modelNo: string | null;
  certFile: { storedName: string } | null;
  photoFile: { storedName: string } | null;
} | null;

/**
 * The instrument, with its certificate and photograph read off disk.
 *
 * Neither file is allowed to take the report down with it. A missing photo
 * leaves the block without one; a certificate that will not open is reported
 * on the page rather than swallowed, because a report that silently drops the
 * evidence for its own numbers is worse than one that says the evidence is
 * missing.
 */
export async function readInstrument(row: InstrumentRow): Promise<Instrument | null> {
  if (!row) return null;

  let photo: Buffer | null = null;
  if (row.photoFile) {
    photo = await readUpload(row.photoFile.storedName).catch(() => null);
  }

  let certificate: Certificate | null = null;
  let certificateUnreadable = false;
  let calibration: Calibration = {
    serialNo: null,
    modelNo: null,
    calibratedOn: null,
    expiresOn: null,
  };
  if (row.certFile) {
    const bytes = await readUpload(row.certFile.storedName).catch(() => null);
    certificate = bytes ? await readCertificate(bytes) : null;
    certificateUnreadable = certificate === null;
    if (bytes) calibration = await readCalibration(bytes);
  }

  // The name is whatever the instrument is called under Equipment, full stop.
  // That is the name the person picked it by, and a certificate's own wording
  // for the same meter is somebody else's cataloguing. The serial and model
  // numbers do fall back to the certificate, but only where they were left
  // blank: there they are facts about one object rather than a choice of name.
  return {
    name: safe(row.name),
    serialNo: pick(row.serialNo, calibration.serialNo),
    modelNo: pick(row.modelNo, calibration.modelNo),
    photo,
    certificate,
    certificateUnreadable,
    calibration,
  };
}

/** The typed answer where there is one, else the certificate's. */
export function pick(typed: string | null, read: string | null): string | null {
  const value = typed?.trim() || read?.trim();
  return value ? safe(value) : null;
}
