// Links a cited section to its authoritative source register. We can't reliably
// deep-link to an exact section anchor across compilations, so we link to each
// Act's landing/text page — the lawyer opens and verifies (the verifiability
// principle from the design research).
//
// Commonwealth: Federal Register of Legislation (legislation.gov.au).
// NSW:          NSW legislation register (legislation.nsw.gov.au).
import type { Jurisdiction } from "./types";

// Commonwealth Criminal Code Act 1995 title id on legislation.gov.au.
const CTH_CRIMINAL_CODE_ID = "C2004A04868";
const CTH_CRIMINAL_CODE_URL = `https://www.legislation.gov.au/${CTH_CRIMINAL_CODE_ID}/latest/text`;

// NSW Acts — link to the current in-force version on the NSW register. The
// register resolves "/view/html/inforce/current/act-YYYY-NNN" by Act number.
const NSW_ACT_IDS: Record<string, string> = {
  "Crimes Act 1900": "act-1900-040",
  "Crimes (Sentencing Procedure) Act 1999": "act-1999-092",
  "Bail Act 2013": "act-2013-026",
  "Drug Misuse and Trafficking Act 1985": "act-1985-226",
  "Road Transport Act 2013": "act-2013-018",
  "Summary Offences Act 1988": "act-1988-025",
  "Crimes (Domestic and Personal Violence) Act 2007": "act-2007-080",
  "Crimes (Domestic & Personal Violence) Act 2007": "act-2007-080",
};

const NSW_REGISTER_SEARCH = "https://legislation.nsw.gov.au/inforce";

function nswUrlForAct(act: string): string {
  const id = NSW_ACT_IDS[act];
  return id
    ? `https://legislation.nsw.gov.au/view/html/inforce/current/${id}`
    : NSW_REGISTER_SEARCH;
}

/** Authoritative source URL for a citation, chosen by jurisdiction + Act. */
export function sourceUrlForCitation(c: {
  jurisdiction: Jurisdiction;
  act: string;
}): string {
  return c.jurisdiction === "Cth"
    ? CTH_CRIMINAL_CODE_URL
    : nswUrlForAct(c.act);
}

/** Label for the register a citation links to. */
export function registerLabel(jurisdiction: Jurisdiction): string {
  return jurisdiction === "Cth" ? "legislation.gov.au" : "legislation.nsw.gov.au";
}

/** Guards against rendering any non-official-register link as a "source". */
export function isAllowedSourceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "www.legislation.gov.au" ||
        u.hostname === "legislation.gov.au" ||
        u.hostname === "legislation.nsw.gov.au" ||
        u.hostname === "www.legislation.nsw.gov.au")
    );
  } catch {
    return false;
  }
}

// Backwards-compatible helpers (section-only, Cth default) kept for any callers
// that only have a section string.
export const ACT_SERIES_URL = CTH_CRIMINAL_CODE_URL;
export function sourceUrlForSection(_section: string): string {
  return CTH_CRIMINAL_CODE_URL;
}
