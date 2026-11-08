import {
  homeSchema,
  postSchema,
  type HomeData,
  type PostData,
  type PostKind,
} from "@/lib/schemas";
import type { AdminDocument, ContentAction } from "@/lib/admin-types";

export type EditorData = HomeData | PostData;
export type EditorContent =
  { kind: "HOME"; data: HomeData } | { kind: PostKind; data: PostData };
export type DraftUpdate =
  | { kind: "HOME"; apply: (current: HomeData) => HomeData }
  | { kind: PostKind; apply: (current: PostData) => PostData };
export type EditorStatus =
  | "saved"
  | "pending"
  | "saving"
  | "failed"
  | "published"
  | "processed"
  | "cache-refreshed";
type HomeDocument = Extract<AdminDocument, { kind: "HOME" }>;
type PostDocument = Extract<AdminDocument, { kind: PostKind }>;
export type EditableDocument =
  | (HomeDocument & { draft: NonNullable<HomeDocument["draft"]> })
  | (PostDocument & { draft: NonNullable<PostDocument["draft"]> });

function editable(document: AdminDocument): EditableDocument {
  if (!document.draft) throw new Error("편집할 초안이 없습니다.");
  return document.kind === "HOME"
    ? { ...document, draft: document.draft }
    : { ...document, draft: document.draft };
}
export function editorContent(
  kind: AdminDocument["kind"],
  data: unknown,
): EditorContent {
  return kind === "HOME"
    ? { kind, data: homeSchema.parse(data) }
    : { kind, data: postSchema.parse(data) };
}
export type EditorState = {
  doc: EditableDocument;
  content: EditorContent;
  generation: number;
  savedGeneration: number;
  status: EditorStatus;
  operation: ContentAction | null;
  error: string;
  cacheError: string | null;
  cacheVersion: number;
  conflict: boolean;
  deleted: boolean;
  formVersion: number;
  reconciliation: "ready" | "pending" | "failed";
};
export function createEditorState(initial: AdminDocument): EditorState {
  const doc = editable(initial);
  return {
    doc,
    content: editorContent(doc.kind, doc.draft.data),
    generation: 0,
    savedGeneration: 0,
    status: "saved",
    operation: null,
    error: "",
    cacheError: null,
    cacheVersion: 0,
    conflict: false,
    deleted: false,
    formVersion: 0,
    reconciliation: "ready",
  };
}
export function isDirty(state: EditorState) {
  return state.generation !== state.savedGeneration;
}
export type MutationAcknowledgement = {
  baseRevision: number;
  generation: number;
} & (
  | { type: "save"; doc: AdminDocument }
  | {
      type: "action";
      action: ContentAction;
      doc: AdminDocument | null;
      cacheError: string | null;
    }
);
export type EditorEvent =
  | { type: "change"; update: DraftUpdate }
  | { type: "recover"; data: unknown }
  | { type: "save-start" }
  | { type: "saved"; doc: AdminDocument; generation: number }
  | { type: "failed"; message: string; conflict: boolean; reconcile?: boolean }
  | { type: "action-start"; action: ContentAction }
  | {
      type: "committed";
      action: ContentAction;
      doc: AdminDocument | null;
      cacheError: string | null;
      generation?: number;
    }
  | { type: "action-end" }
  | { type: "deactivate" }
  | { type: "reconcile-start" }
  | { type: "reconcile-failed"; message: string }
  | {
      type: "reconciled";
      doc: AdminDocument | null;
      acknowledgement?: MutationAcknowledgement;
    }
  | { type: "error"; message: string }
  | { type: "cache-error"; message: string; version: number }
  | { type: "cache-cleared"; version: number };

// All render state and async snapshots advance through the same pure transitions.
export function editorReducer(
  state: EditorState,
  event: EditorEvent,
): EditorState {
  switch (event.type) {
    case "change": {
      if (state.deleted || state.content.kind !== event.update.kind)
        return state;
      const content = state.content;
      const update = event.update;
      const next: EditorContent =
        content.kind === "HOME" && update.kind === "HOME"
          ? { kind: "HOME", data: update.apply(content.data) }
          : content.kind !== "HOME" && update.kind !== "HOME"
            ? { kind: content.kind, data: update.apply(content.data) }
            : content;
      return {
        ...state,
        content: next,
        generation: state.generation + 1,
        status:
          state.conflict || state.reconciliation === "failed"
            ? "failed"
            : "pending",
      };
    }
    case "recover":
      return {
        ...state,
        content: editorContent(state.doc.kind, event.data),
        generation: state.generation + 1,
        status: "pending",
        formVersion: state.formVersion + 1,
      };
    case "save-start":
      return { ...state, status: "saving", error: "" };
    case "saved":
      if (
        event.doc.id !== state.doc.id ||
        event.doc.kind !== state.doc.kind ||
        event.doc.revision < state.doc.revision ||
        event.generation > state.generation
      )
        return state;
      return {
        ...state,
        doc: editable(event.doc),
        savedGeneration: Math.max(state.savedGeneration, event.generation),
        status:
          state.generation === Math.max(state.savedGeneration, event.generation)
            ? "saved"
            : "pending",
      };
    case "failed":
      return {
        ...state,
        status: "failed",
        error: event.message,
        conflict: state.conflict || event.conflict,
        reconciliation: event.reconcile ? "failed" : state.reconciliation,
      };
    case "action-start":
      return { ...state, operation: event.action, error: "" };
    case "committed": {
      if (event.doc === null)
        return {
          ...state,
          deleted: true,
          savedGeneration: state.generation,
          status: "processed",
          error: "",
          cacheError: event.cacheError,
          cacheVersion: state.cacheVersion + 1,
        };
      const doc = editable(event.doc);
      if (
        event.action === "discard" &&
        (event.generation === undefined ||
          event.generation === state.generation)
      ) {
        const generation = state.generation + 1;
        return {
          ...state,
          doc,
          content: editorContent(doc.kind, doc.draft.data),
          generation,
          savedGeneration: generation,
          status: "processed",
          conflict: false,
          error: "",
          cacheError: event.cacheError,
          cacheVersion: state.cacheVersion + 1,
          formVersion: state.formVersion + 1,
        };
      }
      return {
        ...state,
        doc,
        savedGeneration:
          event.action === "discard" && event.generation !== undefined
            ? Math.max(state.savedGeneration, event.generation)
            : state.savedGeneration,
        status: isDirty(state)
          ? "pending"
          : event.action === "publish"
            ? "published"
            : "processed",
        error: "",
        cacheError: event.cacheError,
        cacheVersion: state.cacheVersion + 1,
      };
    }
    case "action-end":
      return { ...state, operation: null };
    case "deactivate":
      return {
        ...state,
        operation: null,
        status: state.status === "saving" ? "pending" : state.status,
        reconciliation: "pending",
      };
    case "reconcile-start":
      return { ...state, reconciliation: "pending", operation: null };
    case "reconcile-failed":
      return {
        ...state,
        reconciliation: "failed",
        status: "failed",
        error: event.message,
      };
    case "reconciled": {
      const acknowledgement = event.acknowledgement;
      const expected = acknowledgement ? acknowledgement.doc : state.doc;
      const sameDocument =
        event.doc?.id === state.doc.id && event.doc?.kind === state.doc.kind;
      // A matching body alone cannot prove who advanced the revision. A submitted
      // operation must also have a valid acknowledgement and authoritative snapshot.
      const confirmed =
        acknowledgement &&
        acknowledgement.baseRevision === state.doc.revision &&
        acknowledgement.generation <= state.generation &&
        (expected === null
          ? acknowledgement.type === "action" &&
            acknowledgement.action === "delete" &&
            event.doc === null
          : expected.id === state.doc.id &&
            expected.kind === state.doc.kind &&
            expected.revision === acknowledgement.baseRevision + 1 &&
            JSON.stringify(expected) === JSON.stringify(event.doc));
      if (
        (acknowledgement && !confirmed) ||
        (!acknowledgement &&
          (!sameDocument || event.doc?.revision !== state.doc.revision))
      )
        return {
          ...state,
          reconciliation: "ready",
          status: "failed",
          conflict: true,
          error:
            "다른 변경과 충돌했습니다. 기기 복구본을 보존하고 서버 초안을 다시 조회하세요.",
        };
      const next = confirmed
        ? acknowledgement.type === "save"
          ? editorReducer(state, {
              type: "saved",
              doc: acknowledgement.doc,
              generation: acknowledgement.generation,
            })
          : editorReducer(state, {
              type: "committed",
              action: acknowledgement.action,
              doc: acknowledgement.doc,
              cacheError: acknowledgement.cacheError,
              generation: acknowledgement.generation,
            })
        : event.doc
          ? { ...state, doc: editable(event.doc) }
          : state;
      return {
        ...next,
        reconciliation: "ready",
        operation: null,
        error: next.conflict ? next.error : "",
        status: next.conflict
          ? "failed"
          : isDirty(next)
            ? "pending"
            : confirmed
              ? next.status
              : "saved",
      };
    }
    case "error":
      return { ...state, error: event.message };
    case "cache-error":
      if (state.cacheVersion !== event.version) return state;
      return { ...state, cacheError: event.message };
    case "cache-cleared":
      if (state.cacheVersion !== event.version) return state;
      return {
        ...state,
        cacheError: null,
        cacheVersion: state.cacheVersion + 1,
        status:
          !isDirty(state) && !state.conflict && !state.error
            ? "cache-refreshed"
            : state.status,
      };
  }
}
