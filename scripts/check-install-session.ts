/**
 * Scenario checks for the installation-report grouping rules.
 *
 *   npx tsx scripts/check-install-session.ts
 *
 * Builds tester exports as text in the instrument's confirmed shapes, reads
 * them through the real parser, and checks the grouping that results.
 */
import assert from "node:assert/strict";
import { readInstallExport } from "../src/lib/install/parse";
import { analyse, recordId, type Input, type TestFile } from "../src/lib/install/session";

let at = 0;
const stamp = () => {
  at += 120;
  const t = new Date(Date.UTC(2026, 9, 9, 8, 0, 0) + at * 1000).toISOString();
  return `${t.slice(0, 10)} ${t.slice(11, 13)} ${t.slice(14, 16)} ${t.slice(17, 19)}`;
};
const ir = (n: number, value: string, pair = "") =>
  `S_${n} INSULATION Terminal Voltage=500V${pair ? `,${pair}` : ""} ${value} ${stamp()}`;
const volt = (n: number, pair: string, v: Record<string, number>) =>
  `S_${n} VOLTAGE/PHASE,Voltage V/Phase=${pair} 50HZ,L-PE=${v["L-PE"]}V,N-PE=${v["N-PE"]}V,L-N=${v["L-N"]}V ${stamp()}`;
const auto = (n: number, rated = "18ms") =>
  `S_${n} Auto Trip current=30mA,Type Of RCD=AC G x1/2 0° :>2000ms,x1/2 180°:>2000ms,x1 0° :${rated},x1 180°:20ms,x5 0° :8ms,x5 180°:9ms,UF:0.0V,UL 50V ${stamp()}`;
const ok = { "L-PE": 240, "L-N": 241, "N-PE": 0.2 };

function file(id: string, section: TestFile["section"], lines: string[], excludeFirst?: boolean): TestFile {
  const parsed = readInstallExport(`Header\nName Function Parameters Result\n${lines.join("\n")}`);
  return {
    fileId: id,
    originalName: `${id}.pdf`,
    section,
    rows: parsed.rows,
    excludeFirst: excludeFirst ?? section !== "RCD",
    dummyConfirmed: true,
  };
}

function run(partial: Partial<Input> & Pick<Input, "phases" | "files">) {
  return analyse({ marks: {}, arrangements: {}, groupNames: {}, assignments: {}, verification: {}, ...partial });
}
const names = (slots: { record: { name: string; fileNo: number } | null }[]) =>
  slots.map((slot) => (slot.record ? `${slot.record.fileNo}:${slot.record.name}` : "-")).join(",");

/* 1. Single-phase insulation: S1 dummy, S2/S3 one phase group. */
{
  const a = run({ phases: "SINGLE", files: [file("ir1", "INSULATION", [ir(1, "0.00MΩ"), ir(2, ">200MΩ"), ir(3, ">200MΩ")])] });
  const g = a.sections.INSULATION.groups;
  assert.equal(g.length, 1);
  assert.equal(names(g[0].slots), "1:S_2,1:S_3");
  assert.equal(a.excluded.length, 1);
  assert.match(a.excluded[0].why ?? "", /dummy/);
  console.log("ok  single-phase insulation pair S2/S3, S1 dummy excluded");
}

/* 2. Three-phase insulation across two files with a restart; S3 accidental. */
{
  const f1 = file("irA", "INSULATION", [ir(1, ">200MΩ"), ir(2, ">200MΩ"), ir(3, ">200MΩ"), ir(4, ">200MΩ")]);
  const f2 = { ...file("irB", "INSULATION", [ir(1, ">200MΩ"), ir(2, ">200MΩ"), ir(3, ">200MΩ"), ir(4, "0.00MΩ")], false), dummyConfirmed: true };
  const a = run({
    phases: "THREE",
    files: [f1, f2],
    marks: { [recordId("irA", "S_3")]: { mark: "ACCIDENTAL", reason: "pressed early" } },
  });
  const g = a.sections.INSULATION.groups;
  assert.equal(names(g[0].slots), "1:S_2,1:S_4,2:S_1,2:S_2,2:S_3,2:S_4");
  assert.deepEqual(g[0].slots.map((s) => s.phase), ["L1 / red", "L1 / red", "L2 / white", "L2 / white", "L3 / blue", "L3 / blue"]);
  // Restarted S numbers are distinct records.
  assert.notEqual(g[0].slots[1].record!.id, g[0].slots[3].record!.id);
  // The failed reading is kept and flagged.
  const failed = a.records.find((r) => r.id === recordId("irB", "S_4"))!;
  assert.equal(failed.state, "ACCEPTED");
  assert.ok(failed.flags.some((f) => f.failureLike));
  assert.ok(a.issues.some((i) => /Low insulation/.test(i.title)));
  console.log("ok  three-phase insulation over a restart, accidental S3 consumes no slot, failed 0 MΩ kept");
}

/* 3. Continuation file without a dummy: must be confirmed. */
{
  const f2 = { ...file("v2", "VOLTAGE", [volt(1, "L-PE", ok), volt(2, "L-N", ok), volt(3, "N-PE", ok)]), dummyConfirmed: false };
  const f1 = file("v1", "VOLTAGE", [volt(1, "L-PE", ok), volt(2, "L-PE", ok), volt(3, "L-N", ok), volt(4, "N-PE", ok)]);
  let a = run({ phases: "SINGLE", files: [f1, f2] });
  assert.ok(a.issues.some((i) => /Confirm whether v2.pdf/.test(i.title)));
  a = run({ phases: "SINGLE", files: [f1, { ...f2, excludeFirst: false, dummyConfirmed: true }] });
  const g = a.sections.VOLTAGE.groups;
  assert.equal(g.length, 2);
  assert.equal(names(g[0].slots), "1:S_2,1:S_3,1:S_4");
  assert.equal(names(g[1].slots), "2:S_1,2:S_2,2:S_3");
  assert.ok(g.every((group) => group.complete));
  // Genuine zero-ish N-PE is not flagged.
  assert.ok(!a.records.some((r) => r.flags.some((f) => /N–PE/.test(f.text))));
  console.log("ok  continuation file without dummy, two outlet groups, near-zero N–PE not flagged");
}

/* 4. Three-phase voltage, nine per group, and a repeat that is flagged not dropped. */
{
  const lines = [volt(1, "L-PE", ok)];
  let n = 2;
  for (let p = 0; p < 3; p += 1) for (const pair of ["L-PE", "L-N", "N-PE"]) lines.push(volt(n++, pair, ok));
  // A repeated L-N inside the next group's first block.
  lines.push(volt(n++, "L-PE", ok), volt(n++, "L-N", ok), volt(n++, "L-N", ok), volt(n++, "N-PE", ok));
  const a = run({ phases: "THREE", files: [file("v3", "VOLTAGE", lines)], groupNames: { VOLTAGE: ["Motor isolator"] } });
  const g = a.sections.VOLTAGE.groups;
  assert.equal(g[0].name, "Motor isolator");
  assert.equal(g[0].slots.length, 9);
  assert.ok(g[0].complete);
  assert.equal(g[1].extras.length, 1);
  assert.equal(g[1].extras[0].record.name, "S_13");
  assert.ok(!g[1].complete);
  // Marking it as a repeat resolves the extras.
  const b = run({ phases: "THREE", files: [file("v3", "VOLTAGE", lines)], marks: { [recordId("v3", "S_13")]: { mark: "REPEAT" } } });
  assert.equal(b.sections.VOLTAGE.groups[1].extras.length, 0);
  console.log("ok  three-phase voltage: 9 per group, repeated L–N flagged, resolved when marked");
}

/* 5. RCD: S1 genuine, three-phase = three records; manual move between groups. */
{
  const f = file("r1", "RCD", [auto(1), auto(2), auto(3), auto(4, ">2000ms")]);
  const a = run({ phases: "THREE", files: [f] });
  const g = a.sections.RCD.groups;
  assert.equal(names(g[0].slots), "1:S_1,1:S_2,1:S_3");
  assert.equal(g[1].missing.length, 2);
  assert.ok(a.records.find((r) => r.name === "S_4")!.flags.some((x) => x.failureLike));
  const b = run({ phases: "THREE", files: [f], assignments: { [recordId("r1", "S_4")]: { section: "RCD", group: 2 } } });
  assert.equal(names(b.sections.RCD.groups[2].slots), "1:S_4,-,-");
  console.log("ok  RCD: S1 genuine, three per device, no-trip flagged, manual move honoured");
}

/* 6. Mixed function in a section is held, not reclassified. */
{
  const a = run({ phases: "SINGLE", files: [file("m1", "INSULATION", [ir(1, ">200MΩ"), ir(2, ">200MΩ"), volt(3, "L-PE", ok), ir(4, ">200MΩ")])] });
  const held = a.held.map((r) => r.name);
  assert.deepEqual(held, ["S_3"]);
  assert.equal(a.sections.VOLTAGE.accepted.length, 0);
  assert.ok(a.issues.some((i) => /unexpected/.test(i.title)));
  console.log("ok  unexpected function held for review");
}

/* 7. Verification never claims completeness from partial selection. */
{
  const a = run({ phases: "SINGLE", files: [file("ir9", "INSULATION", [ir(1, ">200MΩ"), ir(2, ">200MΩ"), ir(3, ">200MΩ")])] });
  assert.equal(a.verification.INSULATION.status, "RECORDED");
  assert.equal(a.verification.POLARITY.status, "PENDING");
  assert.equal(a.complete, false);
  console.log("ok  partial verification is never complete");
}

console.log("\nAll installation grouping checks passed.");
