"use client";
import { useEffect, useState } from "react";
import { Field, api } from "@/components/admin/shared";
import { MediaField } from "@/components/admin/media-field";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import type { PostData, HomeData, PostKind } from "@/lib/schemas";
import type { TaxonItem, AdminDocument } from "@/lib/admin-types";
export function PostForm({
  kind,
  data,
  onChange,
}: {
  kind: PostKind;
  data: PostData;
  onChange: (data: PostData) => void;
}) {
  const [taxons, setTaxons] = useState<TaxonItem[]>([]);
  const [stack, setStack] = useState<HomeData["stack"]>([]);
  const [newName, setNewName] = useState("");
  const [taxonType, setTaxonType] = useState<"CATEGORY" | "TAG">("TAG");
  const [error, setError] = useState("");
  const set = <K extends keyof PostData>(key: K, value: PostData[K]) =>
    onChange({ ...data, [key]: value });
  useEffect(() => {
    api<TaxonItem[]>("/api/admin/taxonomy")
      .then(setTaxons)
      .catch((e) => setError(e.message));
    if (kind === "PROJECT")
      api<AdminDocument>("/api/admin/content/home")
        .then((h) => setStack((h.published?.data as HomeData)?.stack || []))
        .catch((e) => setError(e.message));
  }, [kind]);
  return (
    <>
      <div className="form-panel">
        <h2>기본 정보</h2>
        <Field label="제목">
          <input
            value={data.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field
          label="slug"
          hint="제목을 바꿔도 주소는 유지됩니다. 게시 후 직접 변경한 이전 주소는 새 주소로 연결됩니다."
        >
          <input
            value={data.slug}
            onChange={(e) => set("slug", e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field label="짧은 요약">
          <textarea
            rows={3}
            value={data.summary}
            onChange={(e) => set("summary", e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <MediaField
            label="대표 이미지"
            value={data.imageId}
            onChange={(id) => set("imageId", id)}
          />
          <div>
            <Field label="대표 이미지 대체 텍스트">
              <input
                value={data.imageAlt}
                onChange={(e) => set("imageAlt", e.target.value)}
              />
            </Field>
            <Field label={`자르기 위치: ${data.imagePosition}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={data.imagePosition}
                onChange={(e) => set("imagePosition", Number(e.target.value))}
              />
            </Field>
            <MediaField
              label="별도 공유 이미지"
              value={data.shareImageId}
              onChange={(id) => set("shareImageId", id)}
            />
          </div>
        </div>
      </div>
      <div className="form-panel">
        <h2>분류</h2>
        <Field label="카테고리">
          <select
            value={data.categoryId || ""}
            onChange={(e) => set("categoryId", e.target.value || null)}
          >
            <option value="">선택 안 함</option>
            {taxons
              .filter((t) => t.kind === kind && t.type === "CATEGORY")
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
            .filter((t) => t.kind === kind && t.type === "TAG")
            .map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={data.tagIds.includes(t.id)}
                  onChange={(e) =>
                    set(
                      "tagIds",
                      e.target.checked
                        ? [...data.tagIds, t.id]
                        : data.tagIds.filter((id) => id !== t.id),
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
            value={taxonType}
            onChange={(e) => setTaxonType(e.target.value as "TAG" | "CATEGORY")}
          >
            <option value="TAG">태그</option>
            <option value="CATEGORY">카테고리</option>
          </select>
          <input
            aria-label="새 분류 이름"
            placeholder="새 분류 이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="button secondary"
            disabled={!newName.trim()}
            onClick={async () => {
              try {
                const t = await api<TaxonItem>("/api/admin/taxonomy", "POST", {
                  kind,
                  type: taxonType,
                  name: newName,
                });
                setTaxons((prev) => [...prev, t]);
                if (taxonType === "TAG") set("tagIds", [...data.tagIds, t.id]);
                else set("categoryId", t.id);
                setNewName("");
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
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
      {kind === "PROJECT" && (
        <div className="form-panel">
          <h2>프로젝트 정보</h2>
          <div className="form-grid">
            <Field label="시작일">
              <input
                type="date"
                value={data.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
            <Field label="종료일">
              <input
                type="date"
                value={data.endDate}
                onChange={(e) => set("endDate", e.target.value)}
              />
            </Field>
            <Field label="진행 상태">
              <select
                value={data.progress}
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
                value={data.teamType}
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
                value={data.role}
                onChange={(e) => set("role", e.target.value)}
              />
            </Field>
            <Field label="팀 규모">
              <input
                type="number"
                min={1}
                value={data.teamSize}
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
                    checked={data.technologyIds.includes(t.id)}
                    onChange={(e) =>
                      set(
                        "technologyIds",
                        e.target.checked
                          ? [...data.technologyIds, t.id]
                          : data.technologyIds.filter((id) => id !== t.id),
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
            {data.technologyIds
              .filter((id) => !stack.some((t) => t.id === id))
              .map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked
                    onChange={() =>
                      set(
                        "technologyIds",
                        data.technologyIds.filter((value) => value !== id),
                      )
                    }
                  />
                  {data.technologies.find((t) => t.id === id)?.name ||
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
                value={data[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
      )}
      <div className="form-panel wide-panel">
        <h2>본문</h2>
        <MarkdownEditor
          value={data.markdown}
          onChange={(markdown) => set("markdown", markdown)}
        />
      </div>
    </>
  );
}
