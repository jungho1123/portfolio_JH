"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, ExternalLink, Send } from "lucide-react";
import { api, Confirm } from "@/components/admin/shared";
import { HomeForm } from "@/components/admin/home-form";
import { PostForm } from "@/components/admin/post-form";
import {
  readRecovery,
  recoveryKey,
  writeRecovery,
  removeRecovery,
  type Recovery,
} from "@/lib/recovery";
import { formatDate, type HomeData, type PostData } from "@/lib/schemas";
import type { AdminDocument } from "@/lib/admin-types";
type Data = HomeData | PostData;
export function Editor({
  initial,
  accountId,
}: {
  initial: AdminDocument;
  accountId: string;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState(initial);
  const [data, setData] = useState<Data>(initial.draft!.data);
  const [status, setStatus] = useState("저장 완료");
  const [savedAt, setSavedAt] = useState(initial.draft!.updatedAt);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<Recovery<Data> | null>(null);
  const [conflict, setConflict] = useState(false);
  const [cachePending, setCachePending] = useState(false);
  const current = useRef({
    data: initial.draft!.data,
    revision: initial.revision,
    generation: 0,
    savedGeneration: 0,
    conflict: false,
  });
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const save = useCallback(async (): Promise<void> => {
    if (saving.current) {
      await saving.current;
      if (current.current.generation !== current.current.savedGeneration)
        return save();
      return;
    }
    if (current.current.conflict)
      throw new Error("충돌을 해결한 뒤 저장하세요.");
    if (
      current.current.generation === current.current.savedGeneration ||
      composing.current
    )
      return;
    const task = (async () => {
      const snapshot = { ...current.current };
      setStatus("저장 중");
      setError("");
      try {
        const result = await api<AdminDocument>(
          `/api/admin/content/${initial.id}`,
          "PUT",
          { revision: snapshot.revision, data: snapshot.data },
        );
        current.current.revision = result.revision;
        current.current.savedGeneration = snapshot.generation;
        setDoc(result);
        setSavedAt(result.draft!.updatedAt);
        setStatus(
          current.current.generation === snapshot.generation
            ? "저장 완료"
            : "저장 대기",
        );
        // Keep a local copy through session expiry; remove only when it matches the saved generation.
        if (current.current.generation === snapshot.generation)
          await removeRecovery(accountId, initial.id).catch(() => {});
      } catch (e) {
        const error = e as Error & { code?: string };
        setError(error.message);
        setStatus("저장 실패");
        if (error.code === "CONFLICT") {
          current.current.conflict = true;
          setConflict(true);
        }
        throw e;
      }
    })();
    saving.current = task;
    try {
      await task;
    } finally {
      saving.current = null;
    }
    if (current.current.generation !== current.current.savedGeneration)
      return save();
  }, [initial.id, accountId]);
  const change = (next: Data) => {
    setData(next);
    current.current.data = next;
    current.current.generation++;
    setStatus("저장 대기");
    void writeRecovery({
      key: recoveryKey(accountId, initial.id),
      accountId,
      contentId: initial.id,
      baseRevision: current.current.revision,
      data: next,
      updatedAt: new Date().toISOString(),
    }).catch(() =>
      setError(
        "기기 임시복구를 사용할 수 없습니다. 서버 저장 상태를 확인하세요.",
      ),
    );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!composing.current && !current.current.conflict)
        void save().catch(() => {});
    }, 1000);
  };
  useEffect(() => {
    void readRecovery(accountId, initial.id, initial.draft!.data)
      .then((value) => {
        if (
          value &&
          JSON.stringify(value.data) !== JSON.stringify(initial.draft!.data)
        )
          setRecovery(value as Recovery<Data>);
      })
      .catch(() => {});
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (current.current.generation !== current.current.savedGeneration) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const guardNavigation = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (
        a &&
        a.target !== "_blank" &&
        current.current.generation !== current.current.savedGeneration &&
        !window.confirm(
          "저장하지 못한 변경사항이 있습니다. 기기 복구본을 남기고 이동할까요?",
        )
      )
        e.preventDefault();
    };
    addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardNavigation, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [accountId, initial.id, initial.draft]);
  async function action(action: string) {
    setBusy(true);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    try {
      if (saving.current) await saving.current;
      if (action !== "discard" && action !== "delete" && action !== "restore")
        await save();
      const result = await api<AdminDocument | null>(
        `/api/admin/content/${initial.id}`,
        "POST",
        { action, revision: current.current.revision },
      );
      if (!result) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      current.current.revision = result.revision;
      if (action === "discard") {
        current.current.data = result.draft!.data;
        current.current.savedGeneration = ++current.current.generation;
        setData(result.draft!.data);
        await removeRecovery(accountId, initial.id);
      }
      setDoc(result);
      setStatus(action === "publish" ? "게시 완료" : "처리 완료");
    } catch (e) {
      const detail = e as Error & { content?: AdminDocument; code?: string };
      if (detail.content) {
        setDoc(detail.content);
        current.current.revision = detail.content.revision;
      }
      if (detail.code === "CACHE_PENDING") setCachePending(true);
      setError(detail.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void save().catch(() => {}), 1000);
      }}
    >
      <div className="editor-sticky">
        <div>
          <span className="eyebrow">
            {initial.kind === "HOME" ? "HOME" : initial.kind} ·{" "}
            {
              {
                DRAFT: "초안",
                PUBLISHED: "게시",
                PRIVATE: "비공개",
                TRASH: "휴지통",
              }[doc.state]
            }
          </span>
          <h1>{initial.kind === "HOME" ? "홈 편집" : "콘텐츠 편집"}</h1>
        </div>
        <div className="editor-main-actions">
          <button
            className="button secondary"
            disabled={busy || conflict || doc.state === "TRASH"}
            onClick={() => void save().catch(() => {})}
          >
            <Save size={14} />
            저장
          </button>
          <button
            className="button secondary"
            disabled={busy || conflict || doc.state === "TRASH"}
            onClick={() => {
              const preview = window.open("about:blank", "_blank");
              if (preview) preview.opener = null;
              void save()
                .then(() => {
                  if (preview)
                    preview.location.href = `/admin/preview/${initial.id}`;
                })
                .catch(() => preview?.close());
            }}
          >
            <ExternalLink size={14} />
            미리보기
          </button>
          <button
            className="button"
            disabled={busy || conflict || doc.state === "TRASH"}
            onClick={() => void action("publish").catch(() => {})}
          >
            <Send size={14} />
            {busy
              ? "처리 중…"
              : initial.kind === "HOME"
                ? "홈 변경사항 게시"
                : "수정사항 게시"}
          </button>
        </div>
      </div>
      <div className="save-status" aria-live="polite">
        <span className={status === "저장 실패" ? "accent" : "muted"}>
          {status}
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
            <button
              className="button secondary"
              onClick={() => {
                change(recovery.data);
                if (recovery.key !== recoveryKey(accountId, initial.id))
                  void removeRecovery(accountId, initial.id, recovery.key);
                setRecovery(null);
              }}
            >
              기기 내용으로 복구
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setRecovery(null);
                void removeRecovery(accountId, initial.id, recovery.key);
              }}
            >
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
            {cachePending && (
              <button
                className="button secondary"
                onClick={() => {
                  void api("/api/admin/cache", "POST", {})
                    .then(() => {
                      setCachePending(false);
                      setError("");
                      setStatus("캐시 갱신 완료");
                    })
                    .catch((e) => setError(e.message));
                }}
              >
                캐시 갱신 재시도
              </button>
            )}
          </div>
        </div>
      )}
      {doc.state !== "TRASH" ? (
        initial.kind === "HOME" ? (
          <HomeForm data={data as HomeData} onChange={change} />
        ) : (
          <PostForm
            kind={initial.kind}
            data={data as PostData}
            onChange={change}
          />
        )
      ) : (
        <div className="empty-state">
          <h2>휴지통에 있는 콘텐츠입니다.</h2>
          <p>복원하면 초안 또는 비공개 상태가 됩니다.</p>
        </div>
      )}
      <div className="form-actions editor-bottom-actions">
        {doc.state !== "TRASH" && (
          <Confirm
            label="수정사항 폐기"
            title="초안 변경사항을 폐기할까요?"
            description="기존 공개본으로 초안을 되돌립니다. 공개본은 유지됩니다."
            disabled={busy}
            onConfirm={() => action("discard")}
          />
        )}{" "}
        {initial.kind !== "HOME" && (
          <>
            {doc.state === "PUBLISHED" && (
              <Confirm
                label="비공개 전환"
                title="공개를 중지할까요?"
                description="홈·목록·상세·공유에서 이 콘텐츠가 제외됩니다."
                disabled={busy}
                onConfirm={() => action("private")}
              />
            )}{" "}
            {doc.state !== "TRASH" ? (
              <Confirm
                label="휴지통으로 이동"
                title="휴지통으로 이동할까요?"
                description="공개를 중지하고 복원할 수 있는 상태로 보관합니다."
                danger
                disabled={busy}
                onConfirm={() => action("trash")}
              />
            ) : (
              <>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void action("restore").catch(() => {})}
                >
                  복원
                </button>
                <Confirm
                  label="영구 삭제"
                  title="영구 삭제할까요?"
                  description="공개본과 초안을 되돌릴 수 없게 삭제합니다. 연결된 파일은 별도로 보존됩니다."
                  danger
                  disabled={busy}
                  onConfirm={() => action("delete")}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
