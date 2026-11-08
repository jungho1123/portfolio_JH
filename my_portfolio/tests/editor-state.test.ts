import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPost } from "../lib/schemas";
import type { AdminDocument } from "../lib/admin-types";
import { createEditorState, editorReducer, isDirty } from "../lib/editor-state";

function document(
  title = "기준",
  revision = 1,
): Extract<AdminDocument, { kind: "BLOG" | "PROJECT" }> {
  return {
    id: "test",
    kind: "BLOG",
    state: "DRAFT",
    revision,
    createdAt: "2026-11-08T00:00:00.000Z",
    firstPublishedAt: null,
    lastPublishedAt: null,
    draft: {
      data: { ...emptyPost("BLOG"), title },
      updatedAt: "2026-11-08T00:00:00.000Z",
    },
    published: null,
  };
}
const editTitle = (title: string) => ({
  type: "change" as const,
  update: {
    kind: "BLOG" as const,
    apply: (data: ReturnType<typeof emptyPost>) => ({ ...data, title }),
  },
});

test("late save acknowledgements preserve newer input and its dirty generation", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("첫 입력"),
  );
  const savedGeneration = state.generation;
  state = editorReducer(state, editTitle("최신 입력"));
  state = editorReducer(state, {
    type: "saved",
    doc: document("첫 입력", 2),
    generation: savedGeneration,
  });
  assert.equal(state.doc.revision, 2);
  assert.equal(
    state.content.kind !== "HOME" && state.content.data.title,
    "최신 입력",
  );
  assert.equal(isDirty(state), true);
  assert.equal(state.status, "pending");
});

test("a committed discard consumes dirty data even when cache invalidation failed", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("폐기할 입력"),
  );
  state = editorReducer(state, {
    type: "committed",
    action: "discard",
    doc: document("공개본", 2),
    cacheError: "캐시 지연",
  });
  assert.equal(
    state.content.kind !== "HOME" && state.content.data.title,
    "공개본",
  );
  assert.equal(isDirty(state), false);
  assert.equal(state.cacheError, "캐시 지연");
  assert.equal(state.formVersion, 1);
  assert.equal(state.doc.revision, 2);
});

test("publish partial success preserves newer input and its cache notice through autosave", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("게시 중 새 입력"),
  );
  state = editorReducer(state, {
    type: "committed",
    action: "publish",
    doc: document("게시본", 2),
    cacheError: "캐시 지연",
  });
  assert.equal(isDirty(state), true);
  assert.equal(
    state.content.kind !== "HOME" && state.content.data.title,
    "게시 중 새 입력",
  );
  state = editorReducer(state, { type: "save-start" });
  state = editorReducer(state, {
    type: "saved",
    doc: document("게시 중 새 입력", 3),
    generation: state.generation,
  });
  assert.equal(state.cacheError, "캐시 지연");
  assert.equal(isDirty(state), false);
});

test("cache retry cannot erase an unrelated save failure or unlock a conflict", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("충돌 입력"),
  );
  state = editorReducer(state, {
    type: "failed",
    message: "revision 충돌",
    conflict: true,
  });
  state = editorReducer(state, {
    type: "cache-cleared",
    version: state.cacheVersion,
  });
  assert.equal(state.conflict, true);
  assert.equal(state.status, "failed");
  assert.equal(state.error, "revision 충돌");
});

test("a committed delete is terminal even when its content result is null", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("이전 입력"),
  );
  state = editorReducer(state, {
    type: "committed",
    action: "delete",
    doc: null,
    cacheError: "캐시 지연",
  });
  assert.equal(state.deleted, true);
  assert.equal(isDirty(state), false);
  assert.equal(editorReducer(state, editTitle("늦은 입력")), state);
});

test("field updates use current data and reject updates for another document kind", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("최신 제목"),
  );
  state = editorReducer(state, {
    type: "change",
    update: { kind: "BLOG", apply: (data) => ({ ...data, imageId: "image" }) },
  });
  assert.equal(
    state.content.kind !== "HOME" && state.content.data.title,
    "최신 제목",
  );
  assert.equal(
    state.content.kind !== "HOME" && state.content.data.imageId,
    "image",
  );
  assert.equal(
    editorReducer(state, {
      type: "change",
      update: {
        kind: "HOME",
        apply: (data) => ({ ...data, name: "다른 종류" }),
      },
    }),
    state,
  );
});

test("a late cache retry cannot clear a newer mutation's cache failure", () => {
  let state = editorReducer(createEditorState(document()), {
    type: "committed",
    action: "publish",
    doc: document("첫 게시", 2),
    cacheError: "첫 캐시 실패",
  });
  const version = state.cacheVersion;
  state = editorReducer(state, {
    type: "committed",
    action: "publish",
    doc: document("다음 게시", 3),
    cacheError: "다음 캐시 실패",
  });
  assert.equal(editorReducer(state, { type: "cache-cleared", version }), state);
  assert.equal(
    editorReducer(state, {
      type: "cache-error",
      version,
      message: "오래된 재시도 실패",
    }),
    state,
  );
  assert.equal(state.cacheError, "다음 캐시 실패");
});
