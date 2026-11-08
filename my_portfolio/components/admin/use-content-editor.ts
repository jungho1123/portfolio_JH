import { useLayoutEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, requestContentAction } from "@/lib/admin-api";
import { errorMessage } from "@/lib/error-message";
import { useEditorRecovery } from "@/components/admin/use-editor-recovery";
import {
  adminDocumentSchema,
  type AdminDocument,
  type ContentAction,
} from "@/lib/admin-types";
import {
  createEditorState,
  editorReducer,
  isDirty,
  type DraftUpdate,
  type EditorEvent,
  type MutationAcknowledgement,
} from "@/lib/editor-state";

type Outcome =
  | { ok: true; acknowledgement: MutationAcknowledgement }
  | { ok: false; error: unknown };
type PendingMutation = { promise: Promise<Outcome> };
type Activation = { active: boolean; reconciliation: Promise<void> | null };
type Timer = { current: ReturnType<typeof setTimeout> | null };
function cancelTimer(timer: Timer) {
  if (timer.current !== null) clearTimeout(timer.current);
  timer.current = null;
}
function ended(): never {
  throw new DOMException("Editor session ended", "AbortError");
}
// The result belongs to the submitted operation, even after its activation ends.
async function submitSave(
  document: AdminDocument,
  generation: number,
  data: unknown,
): Promise<Outcome> {
  const { id, revision, kind } = document;
  try {
    const doc = adminDocumentSchema.parse(
      await api<unknown>(`/api/admin/content/${id}`, "PUT", { revision, data }),
    );
    if (doc.id !== id || doc.kind !== kind || doc.revision !== revision + 1)
      throw new Error(
        "저장 결과를 확인하지 못했습니다. 서버 초안을 다시 조회하세요.",
      );
    return {
      ok: true,
      acknowledgement: {
        type: "save",
        baseRevision: revision,
        generation,
        doc,
      },
    };
  } catch (error) {
    return { ok: false, error };
  }
}
async function submitAction(
  document: AdminDocument,
  generation: number,
  action: ContentAction,
): Promise<Outcome> {
  const { id, revision, kind } = document;
  try {
    const result = await requestContentAction(id, revision, action);
    if (
      result.content === null
        ? action !== "delete"
        : action === "delete" ||
          result.content.id !== id ||
          result.content.kind !== kind ||
          result.content.revision !== revision + 1
    )
      throw new Error(
        "작업 결과를 확인하지 못했습니다. 서버 초안을 다시 조회하세요.",
      );
    return {
      ok: true,
      acknowledgement: {
        type: "action",
        baseRevision: revision,
        generation,
        action,
        doc: result.content,
        cacheError: result.cacheError,
      },
    };
  } catch (error) {
    return { ok: false, error };
  }
}

export function useContentEditor(initial: AdminDocument, accountId: string) {
  const router = useRouter();
  const [state, setState] = useState(() =>
    editorReducer(createEditorState(initial), { type: "reconcile-start" }),
  );
  const current = useRef(state);
  // One reducer transition updates both immediate async snapshots and render state.
  function transition(event: EditorEvent) {
    const next = editorReducer(current.current, event);
    current.current = next;
    setState(next);
    return next;
  }
  function onRecoveryError(message: string) {
    transition({ type: "error", message });
  }
  const recovery = useEditorRecovery(
    accountId,
    initial.id,
    initial.draft?.data,
    onRecoveryError,
  );
  const session = useRef<Activation>({ active: false, reconciliation: null });
  const pending = useRef<PendingMutation | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const acting = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const compositionWaiters = useRef(new Set<() => void>());

  function check(scope: Activation) {
    if (!scope.active || current.current.deleted) ended();
  }
  function persist() {
    const snapshot = current.current;
    recovery.persist(
      snapshot.content.data,
      snapshot.doc.revision,
      snapshot.generation,
    );
  }
  async function clearConfirmedRecovery(scope: Activation, notify = false) {
    const snapshot = current.current;
    if (!isDirty(snapshot) && !snapshot.conflict)
      await recovery.clear(snapshot.savedGeneration).catch(() => {
        if (notify && scope.active)
          onRecoveryError(
            "서버 반영은 완료했지만 기기 복구본을 정리하지 못했습니다.",
          );
      });
  }
  function schedule() {
    cancelTimer(timer);
    if (
      !session.current.active ||
      current.current.reconciliation !== "ready" ||
      current.current.conflict ||
      current.current.deleted ||
      !isDirty(current.current)
    )
      return;
    const scope = session.current;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (scope.active && !composing.current && !acting.current)
        void save().catch(() => {});
    }, 1000);
  }
  async function reconcile(scope: Activation): Promise<void> {
    if (!scope.active) ended();
    if (scope.reconciliation) return scope.reconciliation;
    cancelTimer(timer);
    transition({ type: "reconcile-start" });
    const task = (async () => {
      try {
        const operation = pending.current;
        const outcome = await operation?.promise;
        if (!scope.active) ended();
        let doc: AdminDocument | null;
        try {
          doc = adminDocumentSchema.parse(
            await api<unknown>(`/api/admin/content/${initial.id}`),
          );
        } catch (error) {
          if (
            outcome?.ok &&
            outcome.acknowledgement.type === "action" &&
            outcome.acknowledgement.action === "delete" &&
            outcome.acknowledgement.doc === null &&
            error instanceof ApiError &&
            error.status === 404
          )
            doc = null;
          else throw error;
        }
        if (!scope.active) ended();
        const next = transition({
          type: "reconciled",
          doc,
          acknowledgement: outcome?.ok ? outcome.acknowledgement : undefined,
        });
        if (pending.current === operation) pending.current = null;
        if (isDirty(next)) persist();
        else
          await clearConfirmedRecovery(
            scope,
            outcome?.ok &&
              outcome.acknowledgement.type === "action" &&
              (outcome.acknowledgement.action === "discard" ||
                outcome.acknowledgement.action === "delete"),
          );
        if (!scope.active) ended();
        if (next.deleted && !next.cacheError) {
          router.replace("/admin");
          router.refresh();
        }
        schedule();
      } catch (error) {
        if (scope.active)
          transition({
            type: "reconcile-failed",
            message: errorMessage(error),
          });
        throw error;
      }
    })();
    scope.reconciliation = task;
    try {
      await task;
    } finally {
      if (scope.reconciliation === task) scope.reconciliation = null;
    }
  }
  async function flush(scope: Activation): Promise<void> {
    check(scope);
    if (current.current.reconciliation !== "ready")
      throw new Error("서버 초안을 확인한 뒤 저장하세요.");
    if (saving.current) await saving.current;
    check(scope);
    if (current.current.conflict)
      throw new Error("충돌을 해결한 뒤 저장하세요.");
    if (!isDirty(current.current)) return;
    if (saving.current) return flush(scope);
    const task = (async () => {
      while (isDirty(current.current)) {
        check(scope);
        if (
          current.current.conflict ||
          current.current.reconciliation !== "ready"
        )
          throw new Error("서버 초안을 확인한 뒤 저장하세요.");
        if (composing.current) {
          await new Promise<void>((resolve) =>
            compositionWaiters.current.add(resolve),
          );
          continue;
        }
        const snapshot = current.current;
        transition({ type: "save-start" });
        const operation = {
          promise: submitSave(
            snapshot.doc,
            snapshot.generation,
            snapshot.content.data,
          ),
        };
        pending.current = operation;
        const outcome = await operation.promise;
        check(scope);
        if (!outcome.ok) {
          transition({
            type: "failed",
            message: errorMessage(outcome.error),
            conflict:
              outcome.error instanceof ApiError &&
              outcome.error.code === "CONFLICT",
            reconcile: true,
          });
          throw outcome.error;
        }
        const acknowledgement = outcome.acknowledgement;
        if (acknowledgement.type === "save")
          transition({
            type: "saved",
            doc: acknowledgement.doc,
            generation: acknowledgement.generation,
          });
        pending.current = null;
        await clearConfirmedRecovery(scope);
      }
    })();
    saving.current = task;
    try {
      await task;
    } finally {
      if (saving.current === task) saving.current = null;
    }
    check(scope);
  }
  async function save() {
    const scope = session.current;
    check(scope);
    if (current.current.reconciliation !== "ready") await reconcile(scope);
    if (acting.current) await acting.current;
    check(scope);
    await flush(scope);
  }
  function change(update: DraftUpdate) {
    if (!session.current.active || current.current.deleted) return;
    const previous = current.current;
    const next = transition({ type: "change", update });
    if (next === previous) return;
    persist();
    schedule();
  }
  async function action(name: ContentAction) {
    const scope = session.current;
    if (!scope.active || current.current.deleted) return;
    if (current.current.reconciliation !== "ready") await reconcile(scope);
    check(scope);
    if (acting.current) return acting.current;
    const generation = current.current.generation;
    let committed = false;
    transition({ type: "action-start", action: name });
    cancelTimer(timer);
    const task = (async () => {
      try {
        if (saving.current) await saving.current;
        check(scope);
        if (name !== "discard" && name !== "delete" && name !== "restore")
          await flush(scope);
        check(scope);
        const snapshot = current.current;
        const operation = {
          promise: submitAction(snapshot.doc, snapshot.generation, name),
        };
        pending.current = operation;
        const outcome = await operation.promise;
        check(scope);
        if (!outcome.ok) throw outcome.error;
        const acknowledgement = outcome.acknowledgement;
        if (acknowledgement.type !== "action") return;
        committed = true;
        transition({
          type: "committed",
          action: name,
          doc: acknowledgement.doc,
          cacheError: acknowledgement.cacheError,
          generation: acknowledgement.generation,
        });
        pending.current = null;
        if (name === "discard" || name === "delete")
          await clearConfirmedRecovery(scope, true);
        if (!scope.active) return;
        if (acknowledgement.doc === null && !acknowledgement.cacheError) {
          router.replace("/admin");
          router.refresh();
        }
      } catch (error) {
        if (scope.active)
          transition({
            type: "failed",
            message: errorMessage(error),
            conflict: error instanceof ApiError && error.code === "CONFLICT",
            reconcile: true,
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
        if (committed || current.current.generation > generation) schedule();
      }
    }
  }
  async function retryCache() {
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
        transition({
          type: "cache-error",
          message: errorMessage(error),
          version,
        });
    }
  }
  function recover() {
    if (
      !recovery.candidate ||
      !session.current.active ||
      current.current.deleted
    )
      return;
    try {
      transition({ type: "recover", data: recovery.candidate.data });
      persist();
      recovery.consume(recovery.candidate);
      schedule();
    } catch {
      onRecoveryError(
        "복구본의 형식이 현재 문서와 맞지 않습니다. 복구본을 내려받아 확인하세요.",
      );
    }
  }
  const activate = useEffectEvent((scope: Activation) => {
    if (isDirty(current.current)) persist();
    if (current.current.reconciliation !== "ready")
      void reconcile(scope).catch(() => {});
  });
  const deactivate = useEffectEvent(() => {
    cancelTimer(timer);
    composing.current = false;
    transition({ type: "deactivate" });
    compositionWaiters.current.forEach((resolve) => resolve());
    compositionWaiters.current.clear();
  });
  // Activate before hydration can replay an input or action event.
  useLayoutEffect(() => {
    const scope: Activation = { active: true, reconciliation: null };
    session.current = scope;
    activate(scope);
    function beforeUnload(event: BeforeUnloadEvent) {
      if (isDirty(current.current)) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    function guardNavigation(event: MouseEvent) {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        anchor &&
        anchor.target !== "_blank" &&
        isDirty(current.current) &&
        !window.confirm(
          "저장하지 못한 변경사항이 있습니다. 기기 복구본을 남기고 이동할까요?",
        )
      )
        event.preventDefault();
    }
    addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      scope.active = false;
      // Submitted mutations retain their promises and acknowledgements. Only this
      // activation's UI work, timers and subscriptions end here.
      deactivate();
      removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardNavigation, true);
    };
  }, [accountId, initial.id]);
  return {
    ...state,
    busy: state.operation !== null || state.reconciliation === "pending",
    savedAt: state.doc.draft.updatedAt,
    recovery: recovery.candidate,
    change,
    save,
    action,
    retryCache,
    recover,
    keepServer: recovery.dismiss,
    compositionStart: () => {
      composing.current = true;
      cancelTimer(timer);
    },
    compositionEnd: () => {
      composing.current = false;
      compositionWaiters.current.forEach((resolve) => resolve());
      compositionWaiters.current.clear();
      schedule();
    },
  };
}
