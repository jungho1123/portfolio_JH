"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowUpRight, Search } from "lucide-react";
import { errorMessage } from "@/lib/error-message";
import { api } from "@/lib/admin-api";
import type { AdminDocument } from "@/lib/admin-types";
import { formatDate } from "@/lib/schemas";
export function Dashboard() {
  const router = useRouter();
  const [items, setItems] = useState<AdminDocument[]>([]);
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (state) params.set("state", state);
    if (search) params.set("q", search);
    api<AdminDocument[]>(`/api/admin/content?${params}`)
      .then((data) => {
        if (active) {
          setItems(data);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, state, search]);
  async function create(kind: "BLOG" | "PROJECT") {
    setBusy(true);
    try {
      const doc = await api<AdminDocument>("/api/admin/content", "POST", {
        kind,
      });
      router.push(`/admin/edit/${doc.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">CONTENT STUDIO</p>
          <h1>콘텐츠</h1>
          <p className="muted">초안부터 게시까지, 기록을 관리합니다.</p>
        </div>
        <div className="form-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => create("PROJECT")}
          >
            <Plus size={15} />
            프로젝트
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() => create("BLOG")}
          >
            <Plus size={15} />
            블로그
          </button>
        </div>
      </div>
      <div className="admin-filters">
        <label className="sr-only" htmlFor="kind">
          유형
        </label>
        <select
          id="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">모든 유형</option>
          <option value="PROJECT">프로젝트</option>
          <option value="BLOG">블로그</option>
        </select>
        <label className="sr-only" htmlFor="state">
          공개 상태
        </label>
        <select
          id="state"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">모든 상태</option>
          <option value="DRAFT">초안</option>
          <option value="PUBLISHED">게시</option>
          <option value="PRIVATE">비공개</option>
          <option value="TRASH">휴지통</option>
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
          className="admin-search"
        >
          <label className="sr-only" htmlFor="internal-search">
            제목 검색
          </label>
          <input
            id="internal-search"
            placeholder="제목으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="icon-button" aria-label="검색">
            <Search size={16} />
          </button>
        </form>
      </div>
      {error && (
        <div className="notice error-notice" role="alert">
          {error}{" "}
          <button className="text-link" onClick={() => location.reload()}>
            다시 시도
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">콘텐츠를 불러오는 중…</p>
      ) : items.length ? (
        <div className="admin-content-list">
          {items.map((item) => {
            const d =
              item.kind !== "HOME"
                ? item.draft?.data || item.published?.data
                : undefined;
            return (
              <Link
                className="admin-content-row"
                href={`/admin/edit/${item.id}`}
                key={item.id}
              >
                <div>
                  <span className="eyebrow">
                    {item.kind} ·{" "}
                    {
                      {
                        DRAFT: "초안",
                        PUBLISHED: "게시",
                        PRIVATE: "비공개",
                        TRASH: "휴지통",
                      }[item.state]
                    }
                  </span>
                  <h2>{d?.title || "제목 없는 글"}</h2>
                  <span className="muted small">
                    {item.firstPublishedAt
                      ? `최초 게시 ${formatDate(item.firstPublishedAt)}`
                      : `작성 ${formatDate(item.createdAt)}`}
                  </span>
                </div>
                <ArrowUpRight size={20} />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <h2>콘텐츠가 없습니다.</h2>
          <p>새 프로젝트나 블로그 초안을 만들어 보세요.</p>
        </div>
      )}
    </>
  );
}
