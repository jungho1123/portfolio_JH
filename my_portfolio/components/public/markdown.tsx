"use client";
import { useEffect, useState, useRef, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { Copy, Check } from "lucide-react";
import { safeHref, readingMinutes } from "@/lib/schemas";
import { markdownHeadings } from "@/lib/markdown-toc";
import { renderMermaid } from "@/lib/mermaid";
import { ZoomImage } from "@/components/public/actions";
async function highlight(code: string, language: string) {
  try {
    const shiki = await import("shiki");
    return await shiki.codeToHtml(code, {
      lang: language,
      themes: { light: "github-light", dark: "github-dark" },
    });
  } catch {
    return "";
  }
}
function CodeBlock(props: {
  code: string;
  language: string;
  plain?: boolean;
  action?: React.ReactNode;
}) {
  const code = props.code;
  const language = props.language;
  const plain = props.plain;
  const [rendered, setRendered] = useState({
    code: "",
    language: "",
    html: "",
  });
  const [copied, setCopied] = useState(false);
  const session = useRef({
    active: false,
    copyRequest: 0,
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  useEffect(() => {
    const scope = {
      active: true,
      copyRequest: 0,
      timer: null as ReturnType<typeof setTimeout> | null,
    };
    session.current = scope;
    if (!plain)
      void highlight(code, language).then((html) => {
        if (scope.active) setRendered({ code, language, html });
      });
    return () => {
      scope.active = false;
      if (scope.timer !== null) clearTimeout(scope.timer);
      setCopied(false);
    };
  }, [code, language, plain]);
  async function copyCode() {
    const scope = session.current;
    const request = ++scope.copyRequest;
    try {
      await navigator.clipboard.writeText(code);
      if (!scope.active || request !== scope.copyRequest) return;
      if (scope.timer !== null) clearTimeout(scope.timer);
      setCopied(true);
      scope.timer = setTimeout(() => {
        scope.timer = null;
        if (scope.active) setCopied(false);
      }, 2000);
    } catch {
      if (scope.active && request === scope.copyRequest) setCopied(false);
    }
  }
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language}</span>
        <div className="code-actions">
          {props.action}
          <button type="button" aria-label="코드 복사" onClick={copyCode}>
            {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      </div>
      {!plain &&
      rendered.html &&
      rendered.code === code &&
      rendered.language === language ? (
        <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
      ) : (
        <pre>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

type Diagram =
  | { status: "pending" | "retrying" | "failed" }
  | { status: "rendered"; src: string };

function MermaidBlock(props: { code: string }) {
  const [diagram, setDiagram] = useState<Diagram>({ status: "pending" });
  const status = diagram.status;
  const code = props.code;
  useEffect(() => {
    if (status !== "pending" && status !== "retrying") return;
    const controller = new AbortController();
    void renderMermaid(code, controller.signal).then(
      (src) => {
        if (!controller.signal.aborted) setDiagram({ status: "rendered", src });
      },
      () => {
        if (!controller.signal.aborted) setDiagram({ status: "failed" });
      },
    );
    return () => controller.abort();
  }, [code, status]);
  if (diagram.status === "rendered")
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Mermaid SVG is a browser-generated image URL.
      <img
        className="mermaid-diagram"
        src={diagram.src}
        alt="Mermaid 다이어그램"
        onError={() => setDiagram({ status: "failed" })}
      />
    );
  return (
    <CodeBlock
      code={props.code}
      language="mermaid"
      plain
      action={
        (status === "failed" || status === "retrying") && (
          <button
            type="button"
            disabled={status === "retrying"}
            onClick={() =>
              setDiagram((previous) =>
                previous.status === "failed"
                  ? { status: "retrying" }
                  : previous,
              )
            }
          >
            다이어그램 다시 시도
          </button>
        )
      }
    />
  );
}

function CodePre(props: { children?: React.ReactNode; mermaid?: boolean }) {
  const child = isValidElement<{ className?: string; children?: string }>(
    props.children,
  )
    ? props.children
    : null;
  const code = String(child?.props.children ?? "").replace(/\n$/, "");
  const className = child?.props.className || "";
  if (props.mermaid && className === "language-mermaid")
    return <MermaidBlock key={code} code={code} />;
  const language = /language-([\w+-]+)/.exec(className)?.[1] || "text";
  return <CodeBlock code={code} language={language} />;
}

function BlogCodePre(props: { children?: React.ReactNode }) {
  return <CodePre mermaid>{props.children}</CodePre>;
}

export function Markdown(props: { source: string; mermaid?: boolean }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSlug, { prefix: "heading-" }]]}
        skipHtml
        components={{
          a: (props: { href?: string; children?: React.ReactNode }) => {
            const safe = safeHref(props.href);
            return (
              <a
                href={safe}
                {...(safe?.startsWith("http")
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {props.children}
              </a>
            );
          },
          img: (props: { src?: string | Blob; alt?: string }) =>
            typeof props.src === "string" &&
            /^\/media\/[a-zA-Z0-9_-]+(?:\?.*)?$/.test(props.src) ? (
              <ZoomImage src={props.src} alt={props.alt || ""} />
            ) : (
              <span className="muted">
                [이미지는 관리자에서 가져온 뒤 삽입하세요: {props.alt}]
              </span>
            ),
          pre: props.mermaid ? BlogCodePre : CodePre,
          table: (props: { children?: React.ReactNode }) => (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="표 가로 스크롤"
            >
              <table>{props.children}</table>
            </div>
          ),
        }}
      >
        {props.source}
      </ReactMarkdown>
    </div>
  );
}
export function TableOfContents(props: { source: string }) {
  const headings = markdownHeadings(props.source);
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
export function ReadingTime(props: { markdown: string }) {
  return <span>{readingMinutes(props.markdown)}분 읽기</span>;
}
