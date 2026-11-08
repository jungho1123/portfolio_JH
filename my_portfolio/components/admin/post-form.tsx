"use client";
import { useEffect, useRef, useState } from "react";
import { Field } from "@/components/admin/shared";
import { errorMessage } from "@/lib/error-message";
import { api } from "@/lib/admin-api";
import { MediaField } from "@/components/admin/media-field";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import type { PostData, HomeData, PostKind } from "@/lib/schemas";
import type { TaxonItem, AdminDocument, DataChange } from "@/lib/admin-types";
export function PostForm(props: {
  kind: PostKind;
  data: PostData;
  onChange: DataChange<PostData>;
}) {
  const [taxons, setTaxons] = useState<TaxonItem[]>([]);
  const [stack, setStack] = useState<HomeData["stack"]>([]);
  const [newName, setNewName] = useState("");
  const [taxonType, setTaxonType] = useState<"CATEGORY" | "TAG">("TAG");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const session = useRef({ active: false, request: 0 });
  const set = <K extends keyof PostData>(
    key: K,
    value: PostData[K] | ((current: PostData[K]) => PostData[K]),
  ) =>
    props.onChange((current) => ({
      ...current,
      [key]: typeof value === "function" ? value(current[key]) : value,
    }));
  useEffect(() => {
    const scope = { active: true, request: 1 };
    session.current = scope;
    api<TaxonItem[]>("/api/admin/taxonomy")
      .then((items) => {
        if (scope.active && scope.request === 1) setTaxons(items);
      })
      .catch((e) => {
        if (scope.active && scope.request === 1) setError(errorMessage(e));
      });
    if (props.kind === "PROJECT")
      api<AdminDocument>("/api/admin/content/home")
        .then((h) => {
          if (scope.active && h.kind === "HOME")
            setStack(h.published?.data.stack || []);
        })
        .catch((e) => {
          if (scope.active) setError(errorMessage(e));
        });

    return () => {
      scope.active = false;
      setCreating(false);
    };
  }, [props.kind]);
  async function createTaxon() {
    const scope = session.current;
    const request = ++scope.request;
    const ownsRequest = () => scope.active && request === scope.request;
    setCreating(true);
    try {
      const t = await api<TaxonItem>("/api/admin/taxonomy", "POST", {
        kind: props.kind,
        type: taxonType,
        name: newName,
      });
      if (!ownsRequest()) return;
      setTaxons((prev) => [...prev, t]);
      if (taxonType === "TAG")
        set("tagIds", (ids) => [...new Set([...ids, t.id])]);
      else set("categoryId", t.id);
      setNewName("");
      setError("");
    } catch (e) {
      if (ownsRequest()) setError(errorMessage(e));
    } finally {
      if (ownsRequest()) setCreating(false);
    }
  }
  return (
    <>
      <div className="form-panel">
        <h2>기본 정보</h2>
        <Field label="제목">
          <input
            value={props.data.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field
          label="slug"
          hint="제목을 바꿔도 주소는 유지됩니다. 게시 후 직접 변경한 이전 주소는 새 주소로 연결됩니다."
        >
          <input
            value={props.data.slug}
            onChange={(e) => set("slug", e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field label="짧은 요약">
          <textarea
            rows={3}
            value={props.data.summary}
            onChange={(e) => set("summary", e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <MediaField
            label="대표 이미지"
            value={props.data.imageId}
            onChange={(id) => set("imageId", id)}
          />
          <div>
            <Field label="대표 이미지 대체 텍스트">
              <input
                value={props.data.imageAlt}
                onChange={(e) => set("imageAlt", e.target.value)}
              />
            </Field>
            <Field label={`자르기 위치: ${props.data.imagePosition}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={props.data.imagePosition}
                onChange={(e) => set("imagePosition", Number(e.target.value))}
              />
            </Field>
            <MediaField
              label="별도 공유 이미지"
              value={props.data.shareImageId}
              onChange={(id) => set("shareImageId", id)}
            />
          </div>
        </div>
      </div>
      <div className="form-panel">
        <h2>분류</h2>
        <Field label="카테고리">
          <select
            value={props.data.categoryId || ""}
            onChange={(e) => set("categoryId", e.target.value || null)}
          >
            <option value="">선택 안 함</option>
            {taxons
              .filter((t) => t.kind === props.kind && t.type === "CATEGORY")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </Field>
        <fieldset className="checkbox-group">
          <legend>태그</legend>
          {taxons
            .filter((t) => t.kind === props.kind && t.type === "TAG")
            .map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={props.data.tagIds.includes(t.id)}
                  onChange={(e) =>
                    set(
                      "tagIds",
                      e.target.checked
                        ? [...props.data.tagIds, t.id]
                        : props.data.tagIds.filter((id) => id !== t.id),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
        </fieldset>
        <div className="inline-form">
          <select
            aria-label="새 분류 유형"
            disabled={creating}
            value={taxonType}
            onChange={(e) => setTaxonType(e.target.value as "TAG" | "CATEGORY")}
          >
            <option value="TAG">태그</option>
            <option value="CATEGORY">카테고리</option>
          </select>
          <input
            aria-label="새 분류 이름"
            disabled={creating}
            placeholder="새 분류 이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="button secondary"
            disabled={creating || !newName.trim()}
            onClick={createTaxon}
          >
            추가
          </button>
        </div>
        {error && (
          <p className="notice error-notice" role="alert">
            {error}
          </p>
        )}
      </div>
      {props.kind === "PROJECT" && (
        <div className="form-panel">
          <h2>프로젝트 정보</h2>
          <div className="form-grid">
            <Field label="시작일">
              <input
                type="date"
                value={props.data.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
            <Field label="종료일">
              <input
                type="date"
                value={props.data.endDate}
                onChange={(e) => set("endDate", e.target.value)}
              />
            </Field>
            <Field label="진행 상태">
              <select
                value={props.data.progress}
                onChange={(e) =>
                  set("progress", e.target.value as PostData["progress"])
                }
              >
                {["진행 중", "완료", "보관"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="프로젝트 구분">
              <select
                value={props.data.teamType}
                onChange={(e) =>
                  set("teamType", e.target.value as PostData["teamType"])
                }
              >
                <option>개인</option>
                <option>팀</option>
              </select>
            </Field>
            <Field label="담당 역할">
              <input
                value={props.data.role}
                onChange={(e) => set("role", e.target.value)}
              />
            </Field>
            <Field label="팀 규모">
              <input
                type="number"
                min={1}
                value={props.data.teamSize}
                onChange={(e) => set("teamSize", Number(e.target.value))}
              />
            </Field>
          </div>
          <fieldset className="checkbox-group">
            <legend>사용 기술 · 홈에서 게시한 Stack</legend>
            {stack.length ? (
              stack.map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    checked={props.data.technologyIds.includes(t.id)}
                    onChange={(e) =>
                      set(
                        "technologyIds",
                        e.target.checked
                          ? [...props.data.technologyIds, t.id]
                          : props.data.technologyIds.filter(
                              (id) => id !== t.id,
                            ),
                      )
                    }
                  />
                  {t.name}
                </label>
              ))
            ) : (
              <p className="muted small">
                홈 편집에서 Stack을 먼저 게시하세요.
              </p>
            )}
            {props.data.technologyIds
              .filter((id) => !stack.some((t) => t.id === id))
              .map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked
                    onChange={() =>
                      set(
                        "technologyIds",
                        props.data.technologyIds.filter(
                          (value) => value !== id,
                        ),
                      )
                    }
                  />
                  {props.data.technologies.find((t) => t.id === id)?.name ||
                    "선택한 기술"}{" "}
                  (현재 Stack에서 제거됨 · 해제 후 다시 선택하세요)
                </label>
              ))}
          </fieldset>
          {(
            [
              ["githubUrl", "GitHub 링크"],
              ["serviceUrl", "서비스 링크"],
              ["demoUrl", "데모 링크"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type="url"
                value={props.data[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
      )}
      <div className="form-panel wide-panel">
        <h2>본문</h2>
        <MarkdownEditor
          value={props.data.markdown}
          onChange={(markdown) => set("markdown", markdown)}
        />
      </div>
    </>
  );
}
