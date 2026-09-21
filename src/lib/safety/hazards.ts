/**
 * Extra rows for a JSA's risk table.
 *
 * Every JSA template is already written end to end for the work it covers, and
 * none of that is touched. These are the rows a particular job brings with it —
 * the floodlight that turns out to be going up on a pole in a scissor lift
 * needs the height row, whichever JSA the job started from.
 *
 * They are written once, here, and reviewed once. Nothing is composed per job:
 * an answer either brings a row in whole or it does not. The three risk ratings
 * used are the three that already appear in all four of the company's JSAs, so
 * an added row is a copy of a real one with different words in it — same
 * column widths, same shading, same fonts.
 *
 * They are still the company's to approve. The dialog says which rows a job
 * added and the document is not issued until Scott signs it.
 */

/** The rating shapes that exist in every JSA, so a row can always be cloned. */
export type Rating = "SEVERE_LOW" | "SEVERE_MEDIUM" | "MAJOR_LOW";

export const RATINGS: Record<Rating, string[]> = {
  // consequence, likelihood, initial, residual consequence, residual likelihood, residual
  SEVERE_LOW: ["Severe", "Possible", "High", "Moderate", "Unlikely", "Low"],
  SEVERE_MEDIUM: ["Severe", "Possible", "High", "Major", "Unlikely", "Medium"],
  MAJOR_LOW: ["Major", "Possible", "High", "Moderate", "Unlikely", "Low"],
};

export type Hazard = {
  key: string;
  task: string;
  hazard: string;
  who: string;
  rating: Rating;
  controls: string;
};

export const HAZARDS: Record<string, Hazard> = {
  HEIGHT_EWP: {
    key: "HEIGHT_EWP",
    task: "Work at height from an elevated work platform",
    hazard: "Falls from height; platform overturn; contact with overhead services",
    who: "Workers, others",
    rating: "SEVERE_LOW",
    controls:
      "Licensed and familiarised operators only. Inspect the platform and complete the pre-start before use. Harness and lanyard attached to the designated anchor point at all times in a boom. Set up on firm level ground with outriggers deployed and a barricaded exclusion zone beneath. Identify overhead lines and keep the approach distances required by the network operator. Do not climb or reach beyond the handrails, and lower the platform before travelling.",
  },
  HEIGHT_LADDER: {
    key: "HEIGHT_LADDER",
    task: "Work at height from a ladder or step platform",
    hazard: "Falls; ladder slipping or being struck; overreaching",
    who: "Workers, others",
    rating: "SEVERE_LOW",
    controls:
      "Industrial-rated ladder in sound condition, set at a one-in-four pitch on firm level ground and secured top and bottom. Three points of contact maintained. Do not stand on the top two rungs or reach beyond the stiles. Barricade beneath where anyone can pass. Use a platform ladder or an elevated work platform where the task needs both hands or will take more than a few minutes.",
  },
  HEIGHT_ROOF: {
    key: "HEIGHT_ROOF",
    task: "Work on a roof or other unprotected edge",
    hazard: "Falls from or through the roof; fragile sheeting; weather",
    who: "Workers, others",
    rating: "SEVERE_MEDIUM",
    controls:
      "Confirm the roof will carry the load and identify fragile sheeting and skylights before going up. Work behind a compliant edge protection or use a travel-restraint system anchored to a rated point. Never work on a roof alone, in wet or windy conditions, or without a way down. Barricade beneath and keep tools tethered or contained.",
  },
  ENERGISED: {
    key: "ENERGISED",
    task: "Testing or inspection carried out on energised equipment",
    hazard: "Electric shock; arc flash; burns; unexpected operation",
    who: "Workers, others",
    rating: "SEVERE_MEDIUM",
    controls:
      "Complete the energised work justification and PCBU authorisation (OEC-WHS002) before starting, and do not proceed if no permitted circumstance genuinely applies. Two competent persons present, one trained and current in low voltage rescue and CPR. Arc-rated clothing, insulated gloves and eye protection. Insulated tools and a voltage indicator proven before and after use. Establish an exclusion zone, insulate or barrier adjacent live parts, and keep a rescue kit and an extinguisher at the work point. Stop and isolate if conditions change.",
  },
  BOARD_ISOLATION: {
    key: "BOARD_ISOLATION",
    task: "Isolate a switchboard and gain access to it",
    hazard: "Stored energy; unexpected re-energisation; arc flash; live adjacent parts",
    who: "Workers, others",
    rating: "SEVERE_LOW",
    controls:
      "Agree the point of isolation and the outage with the responsible person, and give affected occupants notice. Isolate, lock and tag, and test for dead with a tester proven before and after. Fit personal danger tags; one lock per person. Remove escutcheons only as far as the work requires and refit before leaving. Do not work alone on a main switchboard, and confirm no life-safety or critical supply is lost before interrupting it.",
  },
  BOARD_WORKS: {
    key: "BOARD_WORKS",
    task: "Install, modify or remove switchboard equipment",
    hazard: "Shock; arc flash; manual handling; sharp edges; unmarked circuits",
    who: "Workers, others",
    rating: "SEVERE_LOW",
    controls:
      "Isolate, lock, tag and prove dead before any work inside the enclosure. Identify and label every circuit before disturbing it. Two people or mechanical aid for anything heavy or awkward. Deburr and grommet penetrations, keep swarf out of live sections, and torque terminations to the manufacturer's figures. Test and verify before re-energising, and reinstate all covers and shrouds.",
  },
  HOT_WORKS: {
    key: "HOT_WORKS",
    task: "Hot works — welding, grinding or cutting",
    hazard: "Fire; sparks and hot metal; fume; eye injury; damage to detection",
    who: "Workers, others",
    rating: "SEVERE_MEDIUM",
    controls:
      "Obtain a hot work permit where the site requires one. Clear combustibles for ten metres or shield them with a fire blanket. Isolate detectors only with the site's written agreement and reinstate them the same day. Extinguisher and fire blanket at the work point. Face, eye, hand and body protection, with extraction or ventilation for fume. Maintain a fire watch during the work and for at least sixty minutes after it finishes.",
  },
  ASBESTOS: {
    key: "ASBESTOS",
    task: "Work on or near material that may contain asbestos",
    hazard: "Inhalation of asbestos fibres",
    who: "Workers, others",
    rating: "SEVERE_MEDIUM",
    controls:
      "Consult the site asbestos register before starting and treat any unidentified material as asbestos until it is proven otherwise. Do not drill, cut, grind or abrade suspect material. Where a switchboard panel may be Zelemite or a similar board, stop and have it assessed. Licensed removalist for anything beyond what the regulation permits unlicensed. Where minor work is permitted: wet methods, H-class shadow vacuuming, disposable coveralls and a correctly fitted P2 respirator, with waste double-bagged and disposed of as asbestos waste.",
  },
  EXCAVATION: {
    key: "EXCAVATION",
    task: "Excavation, trenching and pit installation",
    hazard: "Striking underground services; collapse; falls into the excavation",
    who: "Workers, public",
    rating: "SEVERE_LOW",
    controls:
      "Obtain Before You Dig plans and locate and pothole every service by hand before any machine digging. Isolate services where the work requires it. Batter, bench or shore anything deeper than 1.5 metres and have it inspected by a competent person. Barricade the excavation and keep spoil, plant and materials back from the edge. Provide access and egress within nine metres, and re-inspect after rain or any ground movement.",
  },
  PIT_CABLING: {
    key: "PIT_CABLING",
    task: "Install cabling and conduit into an existing pit",
    hazard: "Confined space; water and contaminants; manual handling; live cables",
    who: "Workers",
    rating: "MAJOR_LOW",
    controls:
      "Treat any pit that cannot be worked from outside as a confined space and apply the permit, atmospheric testing and standby person that requires. Assume every cable in the pit is live until proven otherwise. Use lifting aids for lids and cable drums. Barricade the open pit, never leave it unattended, and pump and clear water before entry.",
  },
  DATA_CABLING: {
    key: "DATA_CABLING",
    task: "Install and terminate communications and data cabling",
    hazard: "Loss of separation from low voltage; fibre and laser hazards; trips",
    who: "Workers, others",
    rating: "MAJOR_LOW",
    controls:
      "Registered cabler to carry out and certify the work to AS/CA S009. Maintain the required separation from low voltage cabling and install approved barriers where a pathway is shared. Never look into a fibre end or a connected port; use a power meter. Contain and bin fibre offcuts. Keep pathways and walkways clear, and cap, test and label every termination.",
  },
  TEMP_POWER: {
    key: "TEMP_POWER",
    task: "Install and maintain a temporary supply",
    hazard: "Shock; overload; damaged leads; inadequate earthing",
    who: "Workers, others",
    rating: "SEVERE_LOW",
    controls:
      "Licensed electrician only. Every outlet RCD protected, with an earth stake and an accessible main switch. Inspect and test to AS/NZS 3012 at the required intervals and record it on the board. Support leads clear of the ground, traffic and water, and never run them through doorways or standing water. Keep the board locked, weatherproof and clear of stored material.",
  },
  MAKE_SAFE: {
    key: "MAKE_SAFE",
    task: "Disconnect the supply and make the installation safe",
    hazard: "Live service; re-energisation; unidentified or unmarked circuits",
    who: "Workers, public",
    rating: "SEVERE_LOW",
    controls:
      "Arrange the disconnection with the network operator or the responsible person and confirm it in writing. Prove dead, then lock, tag and terminate or withdraw redundant conductors. Cap, insulate and label anything left in place. Walk the area and confirm nothing downstream remains energised before handing it over, and record what was made safe.",
  },
  DUCT_REMOVAL: {
    key: "DUCT_REMOVAL",
    task: "Remove ventilation ductwork",
    hazard: "Falling sections; manual handling; dust and deposits; concealed services",
    who: "Workers, others",
    rating: "MAJOR_LOW",
    controls:
      "Support each section before releasing its fixings and lower it under control. Scan and check for concealed cabling and services before cutting. Two people or a mechanical aid for anything heavy, long or awkward. Eye protection and a P2 mask where dust or deposits are disturbed. Barricade beneath the work and clear debris as it comes down.",
  },
  TEST_AND_TAG: {
    key: "TEST_AND_TAG",
    task: "Test, tag and commission",
    hazard: "Shock during testing; wrong circuit interrupted; energising onto a fault",
    who: "Workers, others",
    rating: "MAJOR_LOW",
    controls:
      "Competent person using calibrated, in-date equipment. Confirm the circuit and warn affected occupants before interrupting any supply, and confirm nothing life-safety or critical is on it. Prove the tester before and after each test. Record every result and tag to AS/NZS 3760. Isolate and tag out anything that fails, and do not re-energise until it has been proven safe.",
  },
  OCCUPIED_SITE: {
    key: "OCCUPIED_SITE",
    task: "Work in an occupied or publicly accessible area",
    hazard: "Unauthorised access to the work area; trips; falling objects",
    who: "Workers, public",
    rating: "MAJOR_LOW",
    controls:
      "Barricade and sign the work area and keep a clear, marked path for occupants. Exclude or escort the public through the work zone. Keep tools, leads and materials out of walkways. Never leave an open switchboard, an excavation or a ladder unattended. Brief the site contact before starting and again before leaving.",
  },
  AFTER_HOURS: {
    key: "AFTER_HOURS",
    task: "Attend an emergency or after-hours call-out",
    hazard: "Unknown installation; fatigue; poor lighting; working alone",
    who: "Workers",
    rating: "SEVERE_LOW",
    controls:
      "Assess the site before touching anything and treat every conductor as live until proven dead. Make safe first and defer repairs to normal hours where that is reasonable. Provide task lighting. Keep a check-in arrangement with a second person and do not work alone inside a switchboard. Stop and stand down where fatigue, lighting or conditions make the work unsafe.",
  },
};

export function hazardsFor(keys: string[]): Hazard[] {
  const seen = new Set<string>();
  const out: Hazard[] = [];
  for (const key of keys) {
    const hazard = HAZARDS[key];
    if (!hazard || seen.has(key)) continue;
    seen.add(key);
    out.push(hazard);
  }
  return out;
}
