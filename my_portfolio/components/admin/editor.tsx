"use client";
import { HomeForm } from "@/components/admin/home-form";
import { PostForm } from "@/components/admin/post-form";
import {
  CacheNotice,
  EditorToolbar,
  EditorNotices,
  EditorLifecycleActions,
} from "@/components/admin/editor-controls";
import { useContentEditor } from "@/components/admin/use-content-editor";
import type { AdminDocument } from "@/lib/admin-types";

export function Editor(props: { initial: AdminDocument; accountId: string }) {
  const editor = useContentEditor(props.initial, props.accountId);
  const content = editor.content;
  if (editor.deleted)
    return (
      <div>
        <h1>콘텐츠를 삭제했습니다.</h1>
        <CacheNotice error={editor.cacheError} onRetry={editor.retryCache} />
        <a className="button secondary" href="/admin">
          콘텐츠 목록으로
        </a>
      </div>
    );
  return (
    <div
      onCompositionStart={editor.compositionStart}
      onCompositionEnd={editor.compositionEnd}
    >
      <EditorToolbar
        id={props.initial.id}
        kind={props.initial.kind}
        state={editor.doc.state}
        busy={editor.busy}
        conflict={editor.conflict}
        onSave={editor.save}
        onPublish={() => editor.action("publish")}
      />
      <EditorNotices
        doc={editor.doc}
        status={editor.status}
        savedAt={editor.savedAt}
        recovery={editor.recovery}
        error={editor.error}
        conflict={editor.conflict}
        cacheError={editor.cacheError}
        onRecover={editor.recover}
        onKeepServer={editor.keepServer}
        onRetryCache={editor.retryCache}
      />
      {editor.doc.state !== "TRASH" ? (
        content.kind === "HOME" ? (
          <HomeForm
            key={editor.formVersion}
            data={content.data}
            onChange={(apply) => editor.change({ kind: "HOME", apply })}
          />
        ) : (
          <PostForm
            key={editor.formVersion}
            kind={content.kind}
            data={content.data}
            onChange={(apply) => editor.change({ kind: content.kind, apply })}
          />
        )
      ) : (
        <div className="empty-state">
          <h2>휴지통에 있는 콘텐츠입니다.</h2>
          <p>복원하면 초안 또는 비공개 상태가 됩니다.</p>
        </div>
      )}
      <EditorLifecycleActions
        kind={props.initial.kind}
        state={editor.doc.state}
        busy={editor.busy}
        onAction={editor.action}
      />
    </div>
  );
}
