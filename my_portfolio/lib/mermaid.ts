import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { errorMessage } from "@/lib/error-message";

const markdownParser = unified().use(remarkParse).use(remarkGfm);
const maxTextSize = 50_000;
let nextDiagramId = 0;
let renderer: Promise<typeof import("mermaid").default> | undefined;

export function mermaidCodeBlocks(markdown: string) {
  const blocks: string[] = [];
  visit(markdownParser.parse(markdown), "code", (node) => {
    if (node.lang?.split(/\s+/, 1)[0] === "mermaid") blocks.push(node.value);
  });
  return blocks;
}

function loadMermaid() {
  renderer ??= import("mermaid")
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
        suppressErrorRendering: true,
        maxTextSize,
      });
      return mermaid;
    })
    .catch((error: unknown) => {
      renderer = undefined;
      throw new Error("Mermaid 라이브러리를 불러오지 못했습니다.", {
        cause: error,
      });
    });
  return renderer;
}

export async function renderMermaid(code: string, signal: AbortSignal) {
  signal.throwIfAborted();
  // Mermaid replaces oversized input with a placeholder diagram.
  if (code.length > maxTextSize)
    throw new Error(
      `다이어그램 원본이 ${maxTextSize.toLocaleString("ko-KR")}자를 초과합니다.`,
    );
  const mermaid = await loadMermaid();
  signal.throwIfAborted();

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.visibility = "hidden";
  container.setAttribute("aria-hidden", "true");
  document.body.append(container);
  let svg: string;
  try {
    const result = await mermaid.render(
      `mermaid-diagram-${++nextDiagramId}`,
      code,
      container,
    );
    if (result.diagramType === "error")
      throw new Error("다이어그램 유형을 확인할 수 없습니다.");
    svg = result.svg;
  } finally {
    container.remove();
  }
  signal.throwIfAborted();

  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch (error) {
    throw new Error("생성된 SVG를 이미지로 열 수 없습니다.", { cause: error });
  }
  signal.throwIfAborted();
  return src;
}

export async function validateMermaid(blocks: string[], signal: AbortSignal) {
  signal.throwIfAborted();
  let rejectValidation: (reason: unknown) => void;
  const onAbort = () => rejectValidation(signal.reason);
  const aborted = new Promise<never>((_, reject) => {
    rejectValidation = reject;
  });
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (const [index, code] of blocks.entries()) {
      try {
        await Promise.race([renderMermaid(code, signal), aborted]);
      } catch (error) {
        signal.throwIfAborted();
        throw new Error(
          `Mermaid 블록 ${index + 1} 렌더링 실패. ${errorMessage(error, "다이어그램을 렌더링하지 못했습니다.")}`,
          { cause: error },
        );
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
