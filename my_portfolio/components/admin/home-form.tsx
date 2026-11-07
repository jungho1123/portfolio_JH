"use client";
import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Plus, Trash2 } from "lucide-react";
import { Field, api } from "@/components/admin/shared";
import { MediaField } from "@/components/admin/media-field";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import type { HomeData, PostData } from "@/lib/schemas";
import type { AdminDocument } from "@/lib/admin-types";
function reorder<T>(items: T[], index: number, direction: number) {
  const next = [...items];
  const target = index + direction;
  if (target >= 0 && target < next.length)
    [next[index], next[target]] = [next[target], next[index]];
  return next;
}
function RowActions({
  index,
  length,
  move,
  remove,
}: {
  index: number;
  length: number;
  move: (direction: number) => void;
  remove: () => void;
}) {
  return (
    <div className="row-actions">
      <button
        className="icon-button"
        aria-label="위로 이동"
        disabled={index === 0}
        onClick={() => move(-1)}
      >
        <ArrowUp size={15} />
      </button>
      <button
        className="icon-button"
        aria-label="아래로 이동"
        disabled={index === length - 1}
        onClick={() => move(1)}
      >
        <ArrowDown size={15} />
      </button>
      <button className="icon-button" aria-label="항목 제거" onClick={remove}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}
export function HomeForm({
  data,
  onChange,
}: {
  data: HomeData;
  onChange: (data: HomeData) => void;
}) {
  const [projects, setProjects] = useState<AdminDocument[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<AdminDocument[]>("/api/admin/content?kind=PROJECT")
      .then(setProjects)
      .catch((e) => setError(e.message));
  }, []);
  const set = <K extends keyof HomeData>(key: K, value: HomeData[K]) =>
    onChange({ ...data, [key]: value });
  return (
    <>
      <div className="form-panel">
        <h2>프로필</h2>
        <div className="form-grid">
          <Field label="이름">
            <input
              value={data.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="직무">
            <input
              value={data.job}
              onChange={(e) => set("job", e.target.value)}
            />
          </Field>
        </div>
        <Field label="짧은 소개">
          <textarea
            value={data.intro}
            rows={3}
            onChange={(e) => set("intro", e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <MediaField
            label="프로필 사진"
            value={data.photoId}
            onChange={(id) => set("photoId", id)}
          />
          <MediaField
            label="공개용 이력서"
            value={data.resumeId}
            onChange={(id) => set("resumeId", id)}
            pdf
          />
        </div>
        <div className="form-grid">
          <Field label="이메일">
            <input
              type="email"
              value={data.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field
            label="공개 활동을 표시할 GitHub 사용자명"
            hint="관리자 로그인 허용 ID와는 별도 설정입니다."
          >
            <input
              value={data.github}
              onChange={(e) => set("github", e.target.value)}
            />
          </Field>
        </div>
        <h3>추가 링크</h3>
        {data.links.map((link, index) => (
          <div className="inline-form" key={index}>
            <input
              aria-label={`링크 ${index + 1} 이름`}
              value={link.label}
              placeholder="이름"
              onChange={(e) =>
                set(
                  "links",
                  data.links.map((l, i) =>
                    i === index ? { ...l, label: e.target.value } : l,
                  ),
                )
              }
            />
            <input
              aria-label={`링크 ${index + 1} 주소`}
              value={link.url}
              placeholder="https://…"
              onChange={(e) =>
                set(
                  "links",
                  data.links.map((l, i) =>
                    i === index ? { ...l, url: e.target.value } : l,
                  ),
                )
              }
            />
            <button
              className="icon-button"
              aria-label="링크 제거"
              onClick={() =>
                set(
                  "links",
                  data.links.filter((_, i) => i !== index),
                )
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          className="button secondary"
          onClick={() => set("links", [...data.links, { label: "", url: "" }])}
        >
          <Plus size={14} />
          링크 추가
        </button>
      </div>
      <div className="form-panel wide-panel">
        <h2>About me</h2>
        <MarkdownEditor
          value={data.about}
          onChange={(about) => set("about", about)}
        />
      </div>
      {(
        [
          ["education", "Education"],
          ["experience", "Experience"],
        ] as const
      ).map(([key, label]) => (
        <div className="form-panel" key={key}>
          <h2>{label}</h2>
          {data[key].map((entry, index) => (
            <div className="repeat-row" key={entry.id}>
              <RowActions
                index={index}
                length={data[key].length}
                move={(dir) => set(key, reorder(data[key], index, dir))}
                remove={() =>
                  set(
                    key,
                    data[key].filter((e) => e.id !== entry.id),
                  )
                }
              />
              {(
                [
                  ["title", "제목"],
                  ["subtitle", "기관·역할"],
                  ["period", "기간"],
                ] as const
              ).map(([field, title]) => (
                <Field key={field} label={title}>
                  <input
                    value={entry[field]}
                    onChange={(e) =>
                      set(
                        key,
                        data[key].map((item) =>
                          item.id === entry.id
                            ? { ...item, [field]: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
              <Field label="설명 (Markdown)">
                <textarea
                  rows={3}
                  value={entry.description}
                  onChange={(e) =>
                    set(
                      key,
                      data[key].map((item) =>
                        item.id === entry.id
                          ? { ...item, description: e.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </Field>
            </div>
          ))}
          <button
            className="button secondary"
            onClick={() =>
              set(key, [
                ...data[key],
                {
                  id: crypto.randomUUID(),
                  title: "",
                  subtitle: "",
                  period: "",
                  description: "",
                },
              ])
            }
          >
            <Plus size={14} />
            항목 추가
          </button>
        </div>
      ))}
      <div className="form-panel">
        <h2>Stack</h2>
        <p className="muted small">
          같은 그룹의 기술을 함께 표시합니다. 그룹 이름과 항목 순서로 그룹을
          관리합니다.
        </p>
        {data.stack.map((tech, index) => (
          <div className="repeat-row" key={tech.id}>
            <RowActions
              index={index}
              length={data.stack.length}
              move={(dir) => set("stack", reorder(data.stack, index, dir))}
              remove={() =>
                set(
                  "stack",
                  data.stack.filter((t) => t.id !== tech.id),
                )
              }
            />
            <div className="form-grid">
              <Field label="기술명">
                <input
                  value={tech.name}
                  onChange={(e) =>
                    set(
                      "stack",
                      data.stack.map((t) =>
                        t.id === tech.id ? { ...t, name: e.target.value } : t,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="그룹">
                <input
                  value={tech.group}
                  onChange={(e) =>
                    set(
                      "stack",
                      data.stack.map((t) =>
                        t.id === tech.id ? { ...t, group: e.target.value } : t,
                      ),
                    )
                  }
                />
              </Field>
            </div>
            <Field label="기술 링크">
              <input
                type="url"
                value={tech.url}
                onChange={(e) =>
                  set(
                    "stack",
                    data.stack.map((t) =>
                      t.id === tech.id ? { ...t, url: e.target.value } : t,
                    ),
                  )
                }
              />
            </Field>
          </div>
        ))}
        <button
          className="button secondary"
          onClick={() =>
            set("stack", [
              ...data.stack,
              { id: crypto.randomUUID(), name: "", group: "", url: "" },
            ])
          }
        >
          <Plus size={14} />
          기술 추가
        </button>
      </div>
      <div className="form-panel">
        <h2>홈 노출 설정</h2>
        <div className="form-grid">
          <Field label="대표 프로젝트 노출 수">
            <input
              type="number"
              min={0}
              max={50}
              value={data.projectCount}
              onChange={(e) => set("projectCount", Number(e.target.value))}
            />
          </Field>
          <Field label="최신 블로그 노출 수">
            <input
              type="number"
              min={0}
              max={50}
              value={data.blogCount}
              onChange={(e) => set("blogCount", Number(e.target.value))}
            />
          </Field>
        </div>
        <h3>대표 프로젝트와 순서</h3>
        {data.featuredIds.map((id, index) => {
          const project = projects.find((p) => p.id === id);
          return (
            <div className="featured-row" key={id}>
              <span>
                {(project?.draft?.data as PostData)?.title ||
                  (project?.published?.data as PostData)?.title ||
                  "삭제된 프로젝트"}
                <small className="muted"> · {project?.state || "없음"}</small>
              </span>
              <RowActions
                index={index}
                length={data.featuredIds.length}
                move={(dir) =>
                  set("featuredIds", reorder(data.featuredIds, index, dir))
                }
                remove={() =>
                  set(
                    "featuredIds",
                    data.featuredIds.filter((p) => p !== id),
                  )
                }
              />
            </div>
          );
        })}
        <select
          aria-label="대표 프로젝트 추가"
          value=""
          onChange={(e) => {
            if (e.target.value)
              set("featuredIds", [...data.featuredIds, e.target.value]);
          }}
        >
          <option value="">프로젝트를 선택하여 추가</option>
          {projects
            .filter(
              (p) => !data.featuredIds.includes(p.id) && p.state !== "TRASH",
            )
            .map((p) => (
              <option key={p.id} value={p.id}>
                {(p.draft?.data as PostData)?.title || "제목 없는 프로젝트"}
              </option>
            ))}
        </select>
        <p className="muted small">
          공개된 프로젝트만 지정한 순서로 홈에 표시됩니다.
        </p>
        {error && (
          <p className="notice error-notice" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
