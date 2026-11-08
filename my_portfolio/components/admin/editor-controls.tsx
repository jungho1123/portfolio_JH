import { Save, ExternalLink, Send } from "lucide-react";
import { Confirm } from "@/components/admin/shared";
import { formatDate } from "@/lib/schemas";
import type { AdminDocument, ContentAction } from "@/lib/admin-types";
import type { Recovery } from "@/lib/recovery";
import type { EditorStatus } from "@/lib/editor-state";

const statusLabels: Record<EditorStatus, string> = {
  saved: "저장 완료",
  pending: "저장 대기",
  saving: "저장 중",
  failed: "저장 실패",
  published: "게시 완료",
  processed: "처리 완료",
  "cache-refreshed": "캐시 갱신 완료",
};

type ContentState = Pick<AdminDocument, "kind" | "state">;

export function EditorToolbar({
  id,
  kind,
  state,
  busy,
  conflict,
  onSave,
  onPublish,
}: ContentState & {
  id: string;
  busy: boolean;
  conflict: boolean;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
}) {
  return (
    <div className="editor-sticky">
      <div>
        <span className="eyebrow">
          {kind === "HOME" ? "HOME" : kind} ·{" "}
          {
            {
              DRAFT: "초안",
              PUBLISHED: "게시",
              PRIVATE: "비공개",
              TRASH: "휴지통",
            }[state]
          }
        </span>
        <h1>{kind === "HOME" ? "홈 편집" : "콘텐츠 편집"}</h1>
      </div>
      <div className="editor-main-actions">
        <button
          className="button secondary"
          disabled={busy || conflict || state === "TRASH"}
          onClick={() => void onSave().catch(() => {})}
        >
          <Save size={14} />
          저장
        </button>
        <button
          className="button secondary"
          disabled={busy || conflict || state === "TRASH"}
          onClick={() => {
            const preview = window.open("about:blank", "_blank");
            if (preview) preview.opener = null;
            void onSave()
              .then(() => {
                if (preview) preview.location.href = `/admin/preview/${id}`;
              })
              .catch(() => preview?.close());
          }}
        >
          <ExternalLink size={14} />
          미리보기
        </button>
        <button
          className="button"
          disabled={busy || conflict || state === "TRASH"}
          onClick={() => void onPublish().catch(() => {})}
        >
          <Send size={14} />
          {busy
            ? "처리 중…"
            : kind === "HOME"
              ? "홈 변경사항 게시"
              : "수정사항 게시"}
        </button>
      </div>
    </div>
  );
}

export function EditorNotices({
  doc,
  status,
  savedAt,
  recovery,
  error,
  conflict,
  cacheError,
  onRecover,
  onKeepServer,
  onRetryCache,
}: {
  doc: Pick<AdminDocument, "revision" | "firstPublishedAt">;
  status: EditorStatus;
  savedAt: string;
  recovery: Recovery | null;
  error: string;
  conflict: boolean;
  cacheError: string | null;
  onRecover: () => void;
  onKeepServer: () => void;
  onRetryCache: () => Promise<void>;
}) {
  return (
    <>
      <div className="save-status" aria-live="polite">
        <span className={status === "failed" ? "accent" : "muted"}>
          {statusLabels[status]}
        </span>
        <span className="muted">
          마지막 저장{" "}
          {new Intl.DateTimeFormat("ko-KR", {
            timeZone: "Asia/Seoul",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date(savedAt))}{" "}
          · 버전 {doc.revision}
        </span>
        {doc.firstPublishedAt && (
          <span className="muted">
            최초 게시 {formatDate(doc.firstPublishedAt)}
          </span>
        )}
      </div>
      {recovery && (
        <div className="notice">
          <strong>기기에 남아 있는 편집 내용이 있습니다.</strong>
          <p className="small">
            복구본: {recovery.updatedAt} · 기반 버전 {recovery.baseRevision} /
            서버 버전 {doc.revision}. 복구하면 현재 서버 초안을 기준으로
            저장합니다.
          </p>
          <div className="form-actions">
            <button className="button secondary" onClick={onRecover}>
              기기 내용으로 복구
            </button>
            <button className="button secondary" onClick={onKeepServer}>
              서버 초안 유지
            </button>
            <button
              className="button secondary"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(recovery.data, null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "draft-recovery.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              복구본 다운로드
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="notice error-notice" role="alert">
          {error}
          <div className="form-actions">
            <a
              href="/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              새 창에서 다시 로그인 ↗
            </a>
            {conflict && (
              <button
                className="text-link"
                onClick={() => {
                  if (
                    window.confirm(
                      "기기 복구본을 보존하고 서버 초안을 다시 조회할까요?",
                    )
                  )
                    location.reload();
                }}
              >
                서버 초안 다시 조회
              </button>
            )}
          </div>
        </div>
      )}
      <CacheNotice error={cacheError} onRetry={onRetryCache} />
    </>
  );
}

export function CacheNotice({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => Promise<void>;
}) {
  if (!error) return null;
  return (
    <div className="notice error-notice" role="alert">
      {error}
      <div className="form-actions">
        <button
          className="button secondary"
          onClick={() => void onRetry().catch(() => {})}
        >
          캐시 갱신 재시도
        </button>
      </div>
    </div>
  );
}

export function EditorLifecycleActions({
  kind,
  state,
  busy,
  onAction,
}: ContentState & {
  busy: boolean;
  onAction: (action: ContentAction) => Promise<void>;
}) {
  return (
    <div className="form-actions editor-bottom-actions">
      {state !== "TRASH" && (
        <Confirm
          label="수정사항 폐기"
          title="초안 변경사항을 폐기할까요?"
          description="기존 공개본으로 초안을 되돌립니다. 공개본은 유지됩니다."
          disabled={busy}
          onConfirm={() => onAction("discard")}
        />
      )}{" "}
      {kind !== "HOME" && (
        <>
          {state === "PUBLISHED" && (
            <Confirm
              label="비공개 전환"
              title="공개를 중지할까요?"
              description="홈·목록·상세·공유에서 이 콘텐츠가 제외됩니다."
              disabled={busy}
              onConfirm={() => onAction("private")}
            />
          )}{" "}
          {state !== "TRASH" ? (
            <Confirm
              label="휴지통으로 이동"
              title="휴지통으로 이동할까요?"
              description="공개를 중지하고 복원할 수 있는 상태로 보관합니다."
              danger
              disabled={busy}
              onConfirm={() => onAction("trash")}
            />
          ) : (
            <>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void onAction("restore").catch(() => {})}
              >
                복원
              </button>
              <Confirm
                label="영구 삭제"
                title="영구 삭제할까요?"
                description="공개본과 초안을 되돌릴 수 없게 삭제합니다. 연결된 파일은 별도로 보존됩니다."
                danger
                disabled={busy}
                onConfirm={() => onAction("delete")}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
