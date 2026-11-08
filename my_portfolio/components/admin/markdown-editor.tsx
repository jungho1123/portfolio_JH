"use client";
import { useState, useSyncExternalStore } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { useTheme } from "next-themes";
import { Markdown } from "@/components/public/markdown";
import { MediaField } from "@/components/admin/media-field";
import type { DataChange } from "@/lib/admin-types";

const emptySubscribe = () => () => {};

export function MarkdownEditor(props: {
  value: string;
  onChange: DataChange<string>;
}) {
  const { resolvedTheme } = useTheme();
  // Match the server's theme during hydration before applying browser preferences.
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [tab, setTab] = useState("write");
  const [showUpload, setShowUpload] = useState(false);
  return (
    <div className="markdown-editor">
      <div className="editor-tabs">
        <div className="editor-tab-buttons">
          <button
            className={tab === "write" ? "selected" : ""}
            aria-pressed={tab === "write"}
            onClick={() => setTab("write")}
          >
            입력
          </button>
          <button
            className={tab === "preview" ? "selected" : ""}
            aria-pressed={tab === "preview"}
            onClick={() => setTab("preview")}
          >
            미리보기
          </button>
        </div>
        <span className="muted small">Markdown · HTML 실행 안 함</span>
        <button
          className="text-link small"
          aria-expanded={showUpload}
          onClick={() => setShowUpload(!showUpload)}
        >
          이미지 삽입
        </button>
      </div>
      {showUpload && (
        <MediaField
          label="본문 이미지"
          value={null}
          onChange={(id) => {
            if (id) {
              props.onChange(
                (current) => `${current}\n\n![이미지 설명](/media/${id})\n`,
              );
              setShowUpload(false);
            }
          }}
        />
      )}
      <div className={`editor-panes mode-${tab}`}>
        <div className="editor-input">
          <CodeMirror
            value={props.value}
            height="540px"
            theme={hydrated && resolvedTheme === "dark" ? "dark" : "light"}
            extensions={[markdown()]}
            onChange={(value) => props.onChange(() => value)}
            basicSetup={{ lineNumbers: true, foldGutter: false }}
            aria-label="Markdown 본문 입력"
          />
        </div>
        <div className="editor-preview" aria-label="Markdown 미리보기">
          <Markdown source={props.value} />
        </div>
      </div>
    </div>
  );
}
