import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, requestContentAction } from "@/lib/admin-api";
import { useEditorRecovery } from "@/components/admin/use-editor-recovery";
import type { AdminDocument, ContentAction } from "@/lib/admin-types";
import {
  createEditorState,
  editorReducer,
  isDirty,
  type DraftUpdate,
  type EditorEvent,
} from "@/lib/editor-state";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "작업에 실패했습니다.";

export function useContentEditor(initial: AdminDocument, accountId: string) {
  const router = useRouter();
  const [state, setState] = useState(() => createEditorState(initial));
  const current = useRef(state);
  // Event handlers need an immediate snapshot, including multiple changes in one turn.
  // This is the only place that updates both the snapshot and React's render state.
  const transition = useCallback((event: EditorEvent) => {
    const next = editorReducer(current.current, event);
    current.current = next;
    setState(next);
    return next;
  }, []);
  const onRecoveryError = useCallback(
    (message: string) => transition({ type: "error", message }),
    [transition],
  );
  const recovery = useEditorRecovery(
    accountId,
    initial.id,
    initial.draft?.data,
    onRecoveryError,
  );
  const clearRecovery = recovery.clear;
  const session = useRef({ active: false });
  const saving = useRef<Promise<void> | null>(null);
  const acting = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const compositionWaiters = useRef(new Set<() => void>());
  const cancelTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => {
    const scope = { active: true };
    session.current = scope;
    const waiters = compositionWaiters.current;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty(current.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const guardNavigation = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (
        a &&
        a.target !== "_blank" &&
        isDirty(current.current) &&
        !window.confirm(
          "저장하지 못한 변경사항이 있습니다. 기기 복구본을 남기고 이동할까요?",
        )
      )
        e.preventDefault();
    };
    addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      scope.active = false;
      cancelTimer();
      // Activity retains input state, but old work must not own the resumed editor.
      saving.current = null;
      acting.current = null;
      composing.current = false;
      transition({ type: "deactivate" });
      removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardNavigation, true);
      waiters.forEach((resolve) => resolve());
      waiters.clear();
    };
  }, [accountId, initial.id, cancelTimer, transition]);

  const flush = useCallback(
    async function flushDraft(): Promise<void> {
      const scope = session.current;
      const checkActive = () => {
        if (!scope.active || current.current.deleted)
          throw new DOMException("Editor session ended", "AbortError");
      };
      checkActive();
      if (saving.current) await saving.current;
      checkActive();
      if (current.current.conflict)
        throw new Error("충돌을 해결한 뒤 저장하세요.");
      if (!isDirty(current.current)) return;
      if (saving.current) return flushDraft();
      const task = (async () => {
        while (isDirty(current.current)) {
          checkActive();
          if (current.current.conflict)
            throw new Error("충돌을 해결한 뒤 저장하세요.");
          if (composing.current) {
            await new Promise<void>((resolve) =>
              compositionWaiters.current.add(resolve),
            );
            checkActive();
            continue;
          }
          const snapshot = current.current;
          transition({ type: "save-start" });
          try {
            const doc = await api<AdminDocument>(
              `/api/admin/content/${initial.id}`,
              "PUT",
              {
                revision: snapshot.doc.revision,
                data: snapshot.content.data,
              },
            );
            checkActive();
            transition({ type: "saved", doc, generation: snapshot.generation });
            // Serialized recovery operations keep a newer write after this deletion.
            if (!isDirty(current.current))
              await clearRecovery().catch(() => {});
          } catch (error) {
            if (scope.active)
              transition({
                type: "failed",
                message: message(error),
                conflict:
                  error instanceof ApiError && error.code === "CONFLICT",
              });
            throw error;
          }
        }
      })();
      saving.current = task;
      try {
        await task;
      } finally {
        if (saving.current === task) saving.current = null;
      }
      checkActive();
    },
    [initial.id, clearRecovery, transition],
  );
  const save = useCallback(async () => {
    const scope = session.current;
    if (acting.current) await acting.current;
    if (!scope.active)
      throw new DOMException("Editor session ended", "AbortError");
    await flush();
  }, [flush]);
  const schedule = useCallback(() => {
    cancelTimer();
    timer.current = setTimeout(() => {
      if (
        !composing.current &&
        !current.current.conflict &&
        !current.current.deleted &&
        !acting.current
      )
        void save().catch(() => {});
    }, 1000);
  }, [cancelTimer, save]);
  const change = (update: DraftUpdate) => {
    if (!session.current.active || current.current.deleted) return;
    const previous = current.current;
    const next = transition({ type: "change", update });
    if (next === previous) return;
    recovery.persist(next.content.data, next.doc.revision);
    schedule();
  };
  const action = async (name: ContentAction) => {
    if (acting.current) return acting.current;
    const scope = session.current;
    if (!scope.active || current.current.deleted) return;
    const generation = current.current.generation;
    let committed = false;
    transition({ type: "action-start", action: name });
    cancelTimer();
    const task = (async () => {
      try {
        if (saving.current) await saving.current;
        if (name !== "discard" && name !== "delete" && name !== "restore")
          await flush();
        if (!scope.active) return;
        const result = await requestContentAction(
          initial.id,
          current.current.doc.revision,
          name,
        );
        if (!scope.active) return;
        committed = true;
        transition({
          type: "committed",
          action: name,
          doc: result.content,
          cacheError: result.cacheError,
        });
        if (name === "discard" || name === "delete") {
          await clearRecovery().catch(() => {
            if (scope.active)
              onRecoveryError(
                "서버 반영은 완료했지만 기기 복구본을 정리하지 못했습니다.",
              );
          });
          if (!scope.active) return;
        }
        if (result.content === null && !result.cacheError) {
          router.replace("/admin");
          router.refresh();
        }
      } catch (error) {
        if (scope.active)
          transition({
            type: "failed",
            message: message(error),
            conflict: error instanceof ApiError && error.code === "CONFLICT",
          });
        throw error;
      }
    })();
    acting.current = task;
    try {
      await task;
    } finally {
      if (acting.current === task) acting.current = null;
      if (scope.active) {
        transition({ type: "action-end" });
        if (
          !current.current.deleted &&
          isDirty(current.current) &&
          !current.current.conflict &&
          (committed || current.current.generation > generation)
        )
          schedule();
      }
    }
  };
  const retryCache = async () => {
    const scope = session.current;
    const version = current.current.cacheVersion;
    try {
      await api("/api/admin/cache", "POST", {});
      if (!scope.active || current.current.cacheVersion !== version) return;
      transition({ type: "cache-cleared", version });
      if (current.current.deleted) {
        router.replace("/admin");
        router.refresh();
      }
    } catch (error) {
      if (scope.active)
        transition({ type: "cache-error", message: message(error), version });
    }
  };
  return {
    ...state,
    busy: state.operation !== null,
    savedAt: state.doc.draft.updatedAt,
    recovery: recovery.candidate,
    change,
    save,
    action,
    retryCache,
    recover: () => {
      if (
        !recovery.candidate ||
        !session.current.active ||
        current.current.deleted
      )
        return;
      try {
        const next = transition({
          type: "recover",
          data: recovery.candidate.data,
        });
        recovery.persist(next.content.data, next.doc.revision);
        recovery.consume(recovery.candidate);
        schedule();
      } catch {
        onRecoveryError(
          "복구본의 형식이 현재 문서와 맞지 않습니다. 복구본을 내려받아 확인하세요.",
        );
      }
    },
    keepServer: recovery.dismiss,
    compositionStart: () => {
      composing.current = true;
    },
    compositionEnd: () => {
      composing.current = false;
      compositionWaiters.current.forEach((resolve) => resolve());
      compositionWaiters.current.clear();
      schedule();
    },
  };
}
