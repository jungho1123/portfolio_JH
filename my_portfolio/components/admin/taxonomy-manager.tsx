"use client";
import { useEffect, useRef, useState } from "react";
import { Confirm, Field } from "@/components/admin/shared";
import { errorMessage } from "@/lib/error-message";
import { useAdminCollection } from "@/components/admin/use-admin-collection";
import { api } from "@/lib/admin-api";
import type { TaxonItem } from "@/lib/admin-types";
function TaxonRow(props: {
  item: TaxonItem;
  all: TaxonItem[];
  reload: () => Promise<void>;
}) {
  const session = useRef({ active: false, request: 0 });
  useEffect(() => {
    const scope = { active: true, request: 0 };
    session.current = scope;
    return () => {
      scope.active = false;
    };
  }, [props.item.id]);
  const [name, setName] = useState(props.item.name);
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  async function act(action: string) {
    const scope = session.current;
    const request = ++scope.request;
    const ownsRequest = () => scope.active && request === scope.request;
    try {
      await api("/api/admin/taxonomy", "PATCH", {
        id: props.item.id,
        action,
        name,
        targetId: target || undefined,
      });
      if (!ownsRequest()) return;
      await props.reload();
      if (ownsRequest()) setError("");
    } catch (e) {
      if (ownsRequest()) setError(errorMessage(e));
      throw e;
    }
  }
  return (
    <div className="taxonomy-row">
      <div>
        <p className="eyebrow">
          {props.item.kind} ·{" "}
          {props.item.type === "CATEGORY" ? "카테고리" : "태그"} ·{" "}
          {props.item.count}개 콘텐츠
        </p>
        <div className="inline-form">
          <input
            aria-label={`${props.item.name} 이름 수정`}
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
          aria-label={`${props.item.name} 병합·재배정 대상`}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">병합·재배정 대상 선택</option>
          {props.all
            .filter(
              (t) =>
                t.id !== props.item.id &&
                t.kind === props.item.kind &&
                t.type === props.item.type,
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
            description={`${props.item.count}개 콘텐츠의 연결을 선택한 분류로 옮깁니다. 공개본과 초안 모두 변경됩니다.`}
            disabled={!target}
            onConfirm={() => act("merge")}
          />
          <Confirm
            label="삭제"
            title="분류를 삭제할까요?"
            description={
              props.item.type === "CATEGORY"
                ? `${props.item.count}개 콘텐츠에서 사용 중이면 선택한 카테고리로 재배정합니다.`
                : `${props.item.count}개 콘텐츠에서 태그 연결을 해제합니다.`
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
  const { items, error, loading, setError, reload, session } =
    useAdminCollection<TaxonItem>("/api/admin/taxonomy");
  const [kind, setKind] = useState("BLOG");
  const [type, setType] = useState("TAG");
  const [name, setName] = useState("");
  async function createTaxon() {
    const scope = session.current;
    try {
      await api("/api/admin/taxonomy", "POST", { kind, type, name });
      if (!scope.active) return;
      setName("");
      await reload();
      if (scope.active) setError("");
    } catch (error) {
      if (scope.active) setError(errorMessage(error));
    }
  }
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
            onClick={createTaxon}
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
