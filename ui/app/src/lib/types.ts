export type Role = "user" | "assistant";

export type Jurisdiction = "Cth" | "NSW";

export interface Citation {
  /** Display section token, e.g. "70.2(1)" or "59" or "25A". Shown as "§ {key}". */
  key: string;
  /** Unique grouping/focus id: section token + Act (two Acts may share a §). */
  groupId: string;
  /** Section number without subsection, e.g. "70.2" or "11.2A". */
  section: string;
  /** Ordinal index within the message (1-based), for numbered chips. */
  index: number;
  /** The raw matched citation text as it appeared. */
  raw: string;
  /** Short Act title, e.g. "Crimes Act 1900" or "Criminal Code Act 1995". */
  act: string;
  /** Jurisdiction of the cited Act. */
  jurisdiction: Jurisdiction;
  /**
   * The verifiable statutory text this citation supports, taken from the
   * retrieved section payload the backend returns in `sources` — NEVER scraped
   * from the model's prose. Empty when no retrieved section matched this
   * citation; the UI then falls back to "quoted inline" rather than ever
   * showing the model's own words as a quote.
   */
  quote: string;
}

/**
 * A retrieved statute section the backend used, with its REAL text. Returned by
 * the workflow alongside the answer so the UI can show a trustworthy quote per
 * citation instead of reconstructing one from the answer prose.
 */
export interface SourceSection {
  section: string;
  act: string;
  jurisdiction: Jurisdiction | "";
  citation: string;
  quote: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  /** Full text. For assistant, may contain inline citations + trailing disclaimer. */
  content: string;
  /** Deduped, ordered citations found in an assistant message. */
  citations?: Citation[];
  createdAt: number;
  /** Set on an assistant message that failed. */
  error?: string;
  /** True while the answer is being revealed (post-fetch presentation). */
  revealing?: boolean;
}
