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
  };
}
export function isDirty(state: EditorState) {
  return state.generation !== state.savedGeneration;
}
export type EditorEvent =
  | { type: "change"; update: DraftUpdate }
  | { type: "recover"; data: unknown }
  | { type: "save-start" }
  | { type: "saved"; doc: AdminDocument; generation: number }
  | { type: "failed"; message: string; conflict: boolean }
  | { type: "action-start"; action: ContentAction }
  | {
      type: "committed";
      action: ContentAction;
      doc: AdminDocument | null;
      cacheError: string | null;
    }
  | { type: "action-end" }
  | { type: "deactivate" }
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
        status: state.conflict ? "failed" : "pending",
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
      return {
        ...state,
        doc: editable(event.doc),
        savedGeneration: event.generation,
        status: state.generation === event.generation ? "saved" : "pending",
      };
    case "failed":
      return {
        ...state,
        status: "failed",
        error: event.message,
        conflict: state.conflict || event.conflict,
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
      if (event.action === "discard") {
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
      };
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
