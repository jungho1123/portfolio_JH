"use client";
import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { useTheme } from "next-themes";
import { Markdown } from "@/components/public/markdown";
import { MediaField } from "@/components/admin/media-field";
export function MarkdownEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { resolvedTheme } = useTheme();
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
              onChange(`${value}\n\n![이미지 설명](/media/${id})\n`);
              setShowUpload(false);
            }
          }}
        />
      )}
      <div className={`editor-panes mode-${tab}`}>
        <div className="editor-input">
          <CodeMirror
            value={value}
            height="540px"
            theme={resolvedTheme === "dark" ? "dark" : "light"}
            extensions={[markdown()]}
            onChange={onChange}
            basicSetup={{ lineNumbers: true, foldGutter: false }}
            aria-label="Markdown 본문 입력"
          />
        </div>
        <div className="editor-preview" aria-label="Markdown 미리보기">
          <Markdown source={value} />
        </div>
      </div>
    </div>
  );
}
