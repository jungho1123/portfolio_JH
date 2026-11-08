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

test("restoration confirms the submitted generation and preserves edits made during reconciliation", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("제출한 입력"),
  );
  const generation = state.generation;
  state = editorReducer(state, { type: "deactivate" });
  state = editorReducer(state, { type: "reconcile-start" });
  state = editorReducer(state, editTitle("조정 중 새 입력"));
  const acknowledged = document("제출한 입력", 2);
  state = editorReducer(state, {
    type: "reconciled",
    doc: acknowledged,
    acknowledgement: {
      type: "save",
      baseRevision: 1,
      generation,
      doc: acknowledged,
    },
  });
  assert.equal(state.savedGeneration, generation);
  assert.equal(state.doc.revision, 2);
  assert.equal(
    state.content.kind !== "HOME" && state.content.data.title,
    "조정 중 새 입력",
  );
  assert.equal(isDirty(state), true);
  assert.equal(state.reconciliation, "ready");
  assert.equal(state.conflict, false);
});

test("matching server text without an acknowledgement remains a revision conflict", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("같은 입력"),
  );
  state = editorReducer(state, { type: "deactivate" });
  state = editorReducer(state, {
    type: "reconciled",
    doc: document("같은 입력", 2),
  });
  assert.equal(state.conflict, true);
  assert.equal(state.doc.revision, 1);
  assert.equal(state.savedGeneration, 0);
  assert.equal(isDirty(state), true);
});

test("a server edit after an acknowledged save is still a conflict", () => {
  const state = editorReducer(
    createEditorState(document()),
    editTitle("제출한 입력"),
  );
  const next = editorReducer(state, {
    type: "reconciled",
    doc: document("다른 탭", 3),
    acknowledgement: {
      type: "save",
      baseRevision: 1,
      generation: 1,
      doc: document("제출한 입력", 2),
    },
  });
  assert.equal(next.conflict, true);
  assert.equal(next.savedGeneration, 0);
  assert.equal(next.content, state.content);
});

test("failed reconciliation retains local state and cache retry cannot resume autosave", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("기기 입력"),
  );
  state = editorReducer(state, {
    type: "reconcile-failed",
    message: "재조회 실패",
  });
  state = editorReducer(state, {
    type: "cache-cleared",
    version: state.cacheVersion,
  });
  assert.equal(state.reconciliation, "failed");
  assert.equal(state.error, "재조회 실패");
  assert.equal(isDirty(state), true);
});

test("restoring a confirmed discard retains input newer than the submitted action", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("폐기 대상"),
  );
  const generation = state.generation;
  state = editorReducer(state, { type: "deactivate" });
  state = editorReducer(state, editTitle("폐기 요청 이후의 입력"));
  const acknowledged = document("공개본", 2);
  state = editorReducer(state, {
    type: "reconciled",
    doc: acknowledged,
    acknowledgement: {
      type: "action",
      action: "discard",
      generation,
      baseRevision: 1,
      doc: acknowledged,
      cacheError: null,
    },
  });
  assert.equal(
    state.content.kind !== "HOME" && state.content.data.title,
    "폐기 요청 이후의 입력",
  );
  assert.equal(state.savedGeneration, generation);
  assert.equal(isDirty(state), true);
});

test("acknowledgements for another document or revision cannot confirm recovery deletion", () => {
  const state = editorReducer(
    createEditorState(document()),
    editTitle("보존할 입력"),
  );
  for (const doc of [
    { ...document("보존할 입력", 2), id: "other" },
    document("보존할 입력", 3),
  ]) {
    const next = editorReducer(state, {
      type: "reconciled",
      doc,
      acknowledgement: { type: "save", baseRevision: 1, generation: 1, doc },
    });
    assert.equal(next.conflict, true);
    assert.equal(isDirty(next), true);
  }
});

test("an older acknowledgement cannot move the document revision or saved generation backwards", () => {
  let state = editorReducer(
    createEditorState(document()),
    editTitle("현재 입력"),
  );
  state = editorReducer(state, {
    type: "saved",
    doc: document("현재 입력", 3),
    generation: 1,
  });
  const next = editorReducer(state, {
    type: "saved",
    doc: document("예전 입력", 2),
    generation: 0,
  });
  assert.equal(next, state);
});
