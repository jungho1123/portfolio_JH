"use client";
import { useEffect, useState } from "react";
import { Confirm, Field } from "@/components/admin/shared";
import { api } from "@/lib/admin-api";
import type { TaxonItem } from "@/lib/admin-types";
function TaxonRow({
  item,
  all,
  reload,
}: {
  item: TaxonItem;
  all: TaxonItem[];
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  async function act(action: string) {
    try {
      await api("/api/admin/taxonomy", "PATCH", {
        id: item.id,
        action,
        name,
        targetId: target || undefined,
      });
      await reload();
      setError("");
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }
  return (
    <div className="taxonomy-row">
      <div>
        <p className="eyebrow">
          {item.kind} · {item.type === "CATEGORY" ? "카테고리" : "태그"} ·{" "}
          {item.count}개 콘텐츠
        </p>
        <div className="inline-form">
          <input
            aria-label={`${item.name} 이름 수정`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="button secondary"
            onClick={() => void act("rename").catch(() => {})}
          >
            이름 변경
          </button>
        </div>
      </div>
      <div>
        <select
          aria-label={`${item.name} 병합·재배정 대상`}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">병합·재배정 대상 선택</option>
          {all
            .filter(
              (t) =>
                t.id !== item.id &&
                t.kind === item.kind &&
                t.type === item.type,
            )
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
        <div className="form-actions">
          <Confirm
            label="병합"
            title="분류를 병합할까요?"
            description={`${item.count}개 콘텐츠의 연결을 선택한 분류로 옮깁니다. 공개본과 초안 모두 변경됩니다.`}
            disabled={!target}
            onConfirm={() => act("merge")}
          />
          <Confirm
            label="삭제"
            title="분류를 삭제할까요?"
            description={
              item.type === "CATEGORY"
                ? `${item.count}개 콘텐츠에서 사용 중이면 선택한 카테고리로 재배정합니다.`
                : `${item.count}개 콘텐츠에서 태그 연결을 해제합니다.`
            }
            danger
            onConfirm={() => act("delete")}
          />
        </div>
      </div>
      {error && (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function TaxonomyManager() {
  const [items, setItems] = useState<TaxonItem[]>([]);
  const [kind, setKind] = useState("BLOG");
  const [type, setType] = useState("TAG");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function reload() {
    setItems(await api<TaxonItem[]>("/api/admin/taxonomy"));
  }
  useEffect(() => {
    api<TaxonItem[]>("/api/admin/taxonomy")
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">ORGANIZE</p>
          <h1>카테고리·태그</h1>
          <p className="muted">프로젝트와 블로그의 분류는 별도로 관리합니다.</p>
        </div>
      </div>
      <div className="form-panel">
        <div className="inline-form">
          <Field label="콘텐츠 유형">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="BLOG">블로그</option>
              <option value="PROJECT">프로젝트</option>
            </select>
          </Field>
          <Field label="분류 유형">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="TAG">태그</option>
              <option value="CATEGORY">카테고리</option>
            </select>
          </Field>
          <Field label="새 이름">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button
            className="button"
            disabled={!name.trim()}
            onClick={async () => {
              try {
                await api("/api/admin/taxonomy", "POST", { kind, type, name });
                setName("");
                await reload();
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            추가
          </button>
        </div>
      </div>
      {error && (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">분류를 불러오는 중…</p>
      ) : items.length ? (
        items.map((t) => (
          <TaxonRow
            key={`${t.id}:${t.name}`}
            item={t}
            all={items}
            reload={reload}
          />
        ))
      ) : (
        <div className="empty-state">
          <h2>등록된 분류가 없습니다.</h2>
        </div>
      )}
    </>
  );
}
