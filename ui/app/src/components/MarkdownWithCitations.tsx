import { Fragment, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "../lib/types";
import { segmentLine, isDisclaimerLine } from "../lib/citations";
import { CitationChip } from "./CitationChip";

interface Props {
  content: string;
  citations: Citation[];
  onOpenSource: (key: string) => void;
}

/** Replace citation substrings inside a plain string with chip elements. */
function renderStringWithChips(
  text: string,
  citations: Citation[],
  onOpenSource: (key: string) => void,
  keyPrefix: string,
): ReactNode[] {
  const segs = segmentLine(text, citations);
  return segs.map((s, i) => {
    if (s.type === "citation" && s.citation) {
      return (
        <CitationChip
          key={`${keyPrefix}-c${i}`}
          citation={s.citation}
          onOpenSource={onOpenSource}
        />
      );
    }
    return <Fragment key={`${keyPrefix}-t${i}`}>{s.value}</Fragment>;
  });
}

/** Walk react-markdown children; swap citations inside string leaves only. */
function transformChildren(
  children: ReactNode,
  citations: Citation[],
  onOpenSource: (key: string) => void,
  keyPrefix: string,
): ReactNode {
  if (typeof children === "string") {
    return renderStringWithChips(children, citations, onOpenSource, keyPrefix);
  }
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === "string" ? (
        <Fragment key={`${keyPrefix}-${i}`}>
          {renderStringWithChips(child, citations, onOpenSource, `${keyPrefix}-${i}`)}
        </Fragment>
      ) : (
        <Fragment key={`${keyPrefix}-${i}`}>{child}</Fragment>
      ),
    );
  }
  return children;
}

export function MarkdownWithCitations({ content, citations, onOpenSource }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) {
          // Detect the mandated disclaimer line and render as a quiet inset.
          const asText =
            typeof children === "string"
              ? children
              : Array.isArray(children)
                ? children.filter((c) => typeof c === "string").join("")
                : "";
          if (asText && isDisclaimerLine(asText)) {
            return <p className="disclaimer-inline">{children}</p>;
          }
          return (
            <p>{transformChildren(children, citations, onOpenSource, "p")}</p>
          );
        },
        li({ children }) {
          return (
            <li>{transformChildren(children, citations, onOpenSource, "li")}</li>
          );
        },
        strong({ children }) {
          return (
            <strong>
              {transformChildren(children, citations, onOpenSource, "st")}
            </strong>
          );
        },
        em({ children }) {
          return (
            <em>{transformChildren(children, citations, onOpenSource, "em")}</em>
          );
        },
        // No raw HTML is rendered (react-markdown default); links open safely.
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
