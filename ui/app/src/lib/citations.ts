import type { Citation, Jurisdiction, SourceSection } from "./types";

// Matches section citations to any in-scope Act — Commonwealth Criminal Code
// and the NSW criminal statutes the service covers. Real answer formats:
//   (s 59 Crimes Act 1900 (NSW))
//   (s 25A Drug Misuse and Trafficking Act 1985 (NSW))
//   (s 307.1 Criminal Code Act 1995 (Cth))
//   (s 21(1) Crimes (Sentencing Procedure) Act 1999)   -> jurisdiction inferred NSW
//   s 5.4(1) Criminal Code Act 1995 (Cth)              (outer parens optional)
//   (ss 70.2 and 70.3 Criminal Code Act 1995 (Cth))    -> captured as one, section = first
//
// Groups: 1 = section token, 2 = Act title, 3 = explicit jurisdiction (if present).

// In-scope Act titles. Order longest-first so the alternation prefers the most
// specific match (e.g. "Crimes (Sentencing Procedure) Act 1999" over "Crimes Act").
interface ActDef {
  title: string; // regex-safe literal
  jurisdiction: Jurisdiction;
}
export const SCOPE_ACTS: ActDef[] = [
  { title: "Criminal Code Act 1995", jurisdiction: "Cth" },
  { title: "Crimes \\(Sentencing Procedure\\) Act 1999", jurisdiction: "NSW" },
  { title: "Crimes \\(Domestic and Personal Violence\\) Act 2007", jurisdiction: "NSW" },
  { title: "Crimes \\(Domestic & Personal Violence\\) Act 2007", jurisdiction: "NSW" },
  { title: "Drug Misuse and Trafficking Act 1985", jurisdiction: "NSW" },
  { title: "Road Transport Act 2013", jurisdiction: "NSW" },
  { title: "Road Rules 2014", jurisdiction: "NSW" },
  { title: "Summary Offences Act 1988", jurisdiction: "NSW" },
  { title: "Bail Act 2013", jurisdiction: "NSW" },
  { title: "Crimes Act 1900", jurisdiction: "NSW" },
];

const ACT_ALT = SCOPE_ACTS.map((a) => a.title).join("|");
// Section token: base number + optional letter (59, 25A), optional dotted parts
// (307.1, 5.4), an optional inserted-section suffix like "300-1" (NSW renumbered
// sections use a hyphen, which is NOT a range here), and optional subsection
// parens ((1)(d)). The "-1" suffix must be part of the token, not treated as a
// "300 to 1" range by the separator alternation below.
const SECTION = "\\d+[A-Z]*(?:\\.\\d+[A-Z]*)*(?:[-–]\\d+[A-Z]*)?(?:\\([0-9a-zA-Z]+\\))*";
export const CITATION_RE = new RegExp(
  `\\(?\\bss?\\s?(${SECTION})(?:\\s*(?:,|and|&|–|-|to)\\s*${SECTION})*\\s+(${ACT_ALT})(?:\\s+\\((NSW|Cth)\\))?\\)?`,
  "g",
);

/** Human-readable Act title (unescaped) + jurisdiction for a matched Act string. */
function resolveAct(
  matchedTitle: string,
  explicitJurisdiction?: string,
): { act: string; jurisdiction: Jurisdiction } {
  const normalised = matchedTitle.replace(/\s+/g, " ").trim();
  const def = SCOPE_ACTS.find(
    (a) => a.title.replace(/\\/g, "") === normalised,
  );
  const jurisdiction = (explicitJurisdiction as Jurisdiction) ||
    def?.jurisdiction ||
    "NSW";
  return { act: normalised, jurisdiction };
}

/** Section number without subsection parens, e.g. "70.4(1)(a)" -> "70.4". */
export function baseSection(sectionToken: string): string {
  const paren = sectionToken.indexOf("(");
  return (paren === -1 ? sectionToken : sectionToken.slice(0, paren)).trim();
}

/**
 * The quote that supports a citation must be REAL statutory text from the
 * retrieved section payload the backend returns in `sources` — never prose
 * scraped from the model's answer (which could show the model's own commentary
 * as if it were the statute). We match a cited section against the sources by
 * base section number + Act (jurisdiction-tolerant). If nothing matches, the
 * quote is left empty and the UI falls back to "quoted inline".
 */
function sourceQuoteFor(
  section: string,
  act: string,
  sources: SourceSection[],
): string {
  // Normalise an Act title for comparison: collapse whitespace, lowercase, and
  // drop a trailing jurisdiction tag like "(NSW)"/"(Cth)". The backend emits
  // "Road Transport Act 2013 (NSW)" while resolveAct() strips the jurisdiction
  // to "Road Transport Act 2013"; without this both sides must match bare.
  const normAct = (a: string): string =>
    a
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s*\((?:nsw|cth|commonwealth)\)\s*$/i, "")
      .toLowerCase();
  // Normalise a section number for comparison: strip whitespace, lowercase, and
  // fold the en-dash the backend emits in inserted sections ("300–1") to a plain
  // hyphen ("300-1"), which is how the answer prose and the citation regex write
  // it. Without this fold the chip's verifiable quote would never match.
  const normSec = (s: string): string =>
    s.replace(/\s+/g, "").replace(/–/g, "-").toLowerCase();
  const wantSec = normSec(section);
  const wantAct = normAct(act);
  const hit = sources.find((s) => {
    const sSec = normSec(baseSection(String(s.section || "")));
    const sAct = normAct(String(s.act || ""));
    return sSec === wantSec && (sAct === wantAct || sAct === "" || wantAct === "");
  });
  return hit ? String(hit.quote || "").trim() : "";
}

/**
 * Extract deduped, ordered citations from an assistant answer, attaching the
 * verifiable quote from the backend `sources` (real statute text). A citation
 * whose section does not appear in `sources` still renders as a chip but with
 * an empty quote (UI shows "quoted inline") — we never fabricate a quote from
 * the answer. When `sources` is provided, a citation that has NO matching
 * source is additionally a signal the model may have disclaimed it; we keep the
 * chip (the inline reference is real) but never give it a prose quote.
 *
 * Dedup key = full section token + Act (so 70.4(1)/70.4(3) are distinct chips,
 * repeats collapse). Index is assigned on first sight.
 */
export function extractCitations(
  text: string,
  sources: SourceSection[] = [],
): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  const re = new RegExp(CITATION_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const token = m[1];
    const key = token.replace(/\s+/g, "");
    const { act, jurisdiction } = resolveAct(m[2], m[3]);
    const groupId = citationKey(token, act);
    if (seen.has(groupId)) continue;
    seen.add(groupId);
    out.push({
      key,
      groupId,
      section: baseSection(token),
      index: out.length + 1,
      raw: m[0],
      act,
      jurisdiction,
      quote: sourceQuoteFor(baseSection(token), act, sources),
    });
  }
  return out;
}

/** Stable grouping key: normalised section token + Act title. */
export function citationKey(sectionToken: string, act: string): string {
  return sectionToken.replace(/\s+/g, "") + "|" + act;
}

export interface Segment {
  type: "text" | "citation";
  value: string;
  citation?: Citation;
}

/**
 * Split a line of text into text/citation segments so an inline renderer can
 * swap each citation for a chip while preserving surrounding prose.
 * Uses the same dedup indexing as extractCitations for consistent chip numbers.
 */
export function segmentLine(line: string, citations: Citation[]): Segment[] {
  const byGroup = new Map(citations.map((c) => [c.groupId, c]));
  const re = new RegExp(CITATION_RE.source, "g");
  const segments: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      segments.push({ type: "text", value: line.slice(last, m.index) });
    }
    const { act } = resolveAct(m[2], m[3]);
    const groupId = citationKey(m[1], act);
    segments.push({
      type: "citation",
      value: m[0],
      citation: byGroup.get(groupId),
    });
    last = m.index + m[0].length;
  }
  if (last < line.length) {
    segments.push({ type: "text", value: line.slice(last) });
  }
  return segments;
}

const DISCLAIMER_RE = /this is general legal information,?\s*not legal advice\.?/i;

/** Detects the mandated trailing disclaimer line so we can style it as an inset. */
export function isDisclaimerLine(line: string): boolean {
  return DISCLAIMER_RE.test(line.trim());
}
