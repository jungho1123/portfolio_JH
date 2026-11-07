"use client";
import { useEffect, useState, isValidElement, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { Copy, Check } from "lucide-react";
import { safeHref, readingMinutes } from "@/lib/schemas";
import { markdownHeadings } from "@/lib/markdown-toc";
import { ZoomImage } from "@/components/public/actions";
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const child = isValidElement<{ className?: string; children?: string }>(
    children,
  )
    ? children
    : null;
  const code = String(child?.props.children ?? "").replace(/\n$/, "");
  const language =
    /language-([\w+-]+)/.exec(child?.props.className || "")?.[1] || "text";
  const [rendered, setRendered] = useState({ code: "", html: "" });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    import("shiki").then(async ({ codeToHtml }) => {
      const html = await codeToHtml(code, {
        lang: language,
        themes: { light: "github-light", dark: "github-dark" },
      }).catch(() => "");
      if (active) setRendered({ code, html });
    });
    return () => {
      active = false;
    };
  }, [code, language]);
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language}</span>
        <button
          aria-label="코드 복사"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      {rendered.html && rendered.code === code ? (
        <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
      ) : (
        <pre>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSlug, { prefix: "heading-" }]]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const safe = safeHref(href);
            return (
              <a
                href={safe}
                {...(safe?.startsWith("http")
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) =>
            typeof src === "string" &&
            /^\/media\/[a-zA-Z0-9_-]+(?:\?.*)?$/.test(src) ? (
              <ZoomImage src={src} alt={alt || ""} />
            ) : (
              <span className="muted">
                [이미지는 관리자에서 가져온 뒤 삽입하세요: {alt}]
              </span>
            ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          table: ({ children }) => (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="표 가로 스크롤"
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
export function TableOfContents({ source }: { source: string }) {
  const headings = useMemo(() => markdownHeadings(source), [source]);
  if (!headings.length) return null;
  return (
    <nav className="toc" aria-label="본문 목차">
      <p className="eyebrow">ON THIS PAGE</p>
      <ol>
        {headings.map((h) => (
          <li
            key={h.id}
            style={{ paddingLeft: `${Math.max(0, h.level - 2) * 12}px` }}
          >
            <a href={`#${h.id}`}>{h.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function ReadingTime({ markdown }: { markdown: string }) {
  return <span>{readingMinutes(markdown)}분 읽기</span>;
}
