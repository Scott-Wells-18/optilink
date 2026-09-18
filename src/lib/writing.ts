/**
 * Tidying up what was typed at a switchboard.
 *
 * Notes get written one-handed on a phone, in a hurry: no capitals, no full
 * stops, "gpo" and "rcd" in lower case, two spaces here and none there. None
 * of that belongs in something a client reads.
 *
 * What this does NOT do is rewrite. It will not lengthen a note that says too
 * little or cut one that rambles, because deciding what a sentence means — and
 * saying it better — takes a language model, and there is no honest way to
 * fake that with rules. What it does instead is everything that IS mechanical:
 * sentence case, trade terms spelled the way the trade spells them, spacing
 * and punctuation, and a full stop at the end. That covers the bulk of what
 * makes a hurried note look hurried.
 */

/**
 * Trade shorthand, written the way it should appear. The key is matched as a
 * whole word, ignoring case; the value is what replaces it.
 */
const TERMS: Record<string, string> = {
  gpo: "GPO",
  gpos: "GPOs",
  rcd: "RCD",
  rcds: "RCDs",
  rcbo: "RCBO",
  rcbos: "RCBOs",
  cb: "CB",
  cbs: "CBs",
  mcb: "MCB",
  mcbs: "MCBs",
  db: "DB",
  dbs: "DBs",
  msb: "MSB",
  sb: "SB",
  led: "LED",
  leds: "LEDs",
  hvac: "HVAC",
  ups: "UPS",
  tv: "TV",
  ct: "CT",
  cts: "CTs",
  ip: "IP",
  swa: "SWA",
  tps: "TPS",
  pvc: "PVC",
  ka: "kA",
  ma: "mA",
  kw: "kW",
  kva: "kVA",
  hz: "Hz",
  swbd: "switchboard",
  swb: "switchboard",
  brkr: "breaker",
  brk: "breaker",
  isol: "isolator",
  term: "termination",
  terms: "terminations",
  temp: "temperature",
  temps: "temperatures",
  approx: "approximately",
  thru: "through",
  i: "I",
};

/** Terms that are an acronym followed by a number: cb32, db1, mcb6. */
const NUMBERED = new Set(["cb", "mcb", "db", "msb", "sb", "rcd", "rcbo", "gpo"]);

/** Words that stay lower case inside a title, unless they open or close it. */
const SMALL = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "of", "on",
  "or", "the", "to", "via", "with", "per",
]);

/**
 * One typed note, cleaned up.
 *
 * Nothing is invented and nothing is thrown away: every word that went in
 * comes out, spelled properly and punctuated.
 */
export function tidy(raw: string): string {
  const text = collapse(raw);
  if (!text) return "";

  // Work paragraph by paragraph, so a note written as a list stays one.
  return text
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => tidyLine(line))
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n\n");
}

function tidyLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  // A bullet stays a bullet; the text after it is treated as its own note.
  const bullet = /^([-*•]\s*)(.*)$/.exec(trimmed);
  if (bullet) {
    const body = tidyLine(bullet[2]);
    return body ? `- ${body}` : "";
  }

  const spelled = respell(trimmed);
  const sentences = splitSentences(spelled);
  const written = sentences.map(capitaliseFirst).join(" ");
  return punctuate(written);
}

/** Runs of whitespace go, but the blank line between paragraphs stays. */
function collapse(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/** Trade terms, and the spacing around punctuation. */
function respell(text: string): string {
  return (
    text
      // "w/" and "w/o" before the slash spacing below eats them.
      .replace(/\bw\/o\b/gi, "without")
      .replace(/\bw\/\b/gi, "with")
      // A bare "w" is "with" — unless a number is in front of it, where it is
      // watts: "block w new GPO" against "a 20 w lamp".
      .replace(/(?<!\d\s?)\bw\b/gi, "with")
      // " ," and " ." are what a thumb produces.
      .replace(/\s+([,.;:!?])/g, "$1")
      // And a comma, or a full stop, with nothing after it.
      .replace(/([,;:])(?=[^\s])/g, "$1 ")
      .replace(/([.!?])(?=[A-Za-z])/g, "$1 ")
      .replace(/\s*\/\s*/g, "/")
      .replace(/\.{4,}/g, "...")
      .replace(/[A-Za-z][A-Za-z'’]*\d*/g, (word) => {
        // "cb32" is CB32: the acronym is spelled out, the number left alone.
        const numbered = /^([A-Za-z]+)(\d+)$/.exec(word);
        if (numbered && NUMBERED.has(numbered[1].toLowerCase())) {
          return `${TERMS[numbered[1].toLowerCase()] ?? numbered[1].toUpperCase()}${numbered[2]}`;
        }
        return TERMS[word.toLowerCase()] ?? word;
      })
      // "30ma" and "20 mm" both come out with one space.
      .replace(/(\d)\s*(mA|kW|kVA|kA|Hz|mm|V|A|W|°C)\b/g, "$1 $2")
  );
}

/**
 * Sentences, by what ends them.
 *
 * A note typed without full stops is one sentence, which is correct — it is
 * not this function's business to guess where the author would have put them.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function capitaliseFirst(sentence: string): string {
  // Past any opening bracket or quote, so ("found loose") capitalises the F.
  const at = sentence.search(/[A-Za-z0-9]/);
  if (at < 0) return sentence;
  const letter = sentence[at];
  // A term already spelled in caps is left exactly as it is.
  if (letter === letter.toUpperCase()) return sentence;
  return sentence.slice(0, at) + letter.toUpperCase() + sentence.slice(at + 1);
}

/** A note ends in something. A full stop, unless it already ends in one. */
function punctuate(text: string): string {
  if (!text) return "";
  return /[.!?:;]$/.test(text) ? text : `${text}.`;
}

/**
 * A place or a title, in title case: "Meal Room, North Wall".
 *
 * Trade terms keep their own spelling, so "meal room gpo" comes out as
 * "Meal Room GPO" rather than "Meal Room Gpo".
 */
export function titleCase(raw: string): string {
  const text = collapse(raw);
  if (!text) return "";

  const words = respell(text).split(/(\s+)/);
  const letters = words.filter((part) => part.trim());
  let seen = 0;

  return words
    .map((part) => {
      if (!part.trim()) return part;
      seen += 1;
      const first = seen === 1;
      const last = seen === letters.length;
      return titleWord(part, first || last);
    })
    .join("");
}

function titleWord(word: string, always: boolean): string {
  // Anything already in caps was meant that way: GPO, DB1, RCD.
  if (word === word.toUpperCase() && /[A-Z]/.test(word)) return word;

  const bare = word.replace(/[^A-Za-z'’-]/g, "").toLowerCase();
  if (!always && SMALL.has(bare)) return word.toLowerCase();

  // A hyphenated pair gets both halves: "north-west" to "North-West".
  return word
    .split("-")
    .map((part) => {
      const at = part.search(/[A-Za-z]/);
      if (at < 0) return part;
      return part.slice(0, at) + part[at].toUpperCase() + part.slice(at + 1).toLowerCase();
    })
    .join("-");
}
