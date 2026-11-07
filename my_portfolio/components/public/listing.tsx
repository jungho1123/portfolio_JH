"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { PostCard } from "@/components/public/card";
import type { PostKind } from "@/lib/schemas";
import type { ListFilters, PostSummary } from "@/lib/public-data";
type Page = { items: PostSummary[]; total: number; nextCursor: string | null };
type Taxon = { id: string; name: string; type: string };
export function Listing({
  kind,
  initial,
  filters,
  taxons,
}: {
  kind: PostKind;
  initial: Page;
  filters: ListFilters;
  taxons: Taxon[];
}) {
  const router = useRouter();
  const base = kind === "PROJECT" ? "/projects" : "/blog";
  const [page, setPage] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const loadedPages = useRef(1);
  const sentinel = useRef<HTMLDivElement>(null);
  const filtersKey = JSON.stringify([
    kind,
    filters.sort,
    filters.category,
    filters.tags,
    filters.page,
  ]);
  const storageKey = `portfolio:list:${filtersKey}`;
  const paramsFor = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams({ kind, sort: filters.sort });
      if (filters.category) params.set("category", filters.category);
      filters.tags.forEach((t) => params.append("tag", t));
      if (cursor) params.set("cursor", cursor);
      else if (filters.page > 1) params.set("page", String(filters.page));
      return params;
    },
    [kind, filters.sort, filters.category, filters.tags, filters.page],
  );
  const fetchPage = useCallback(
    async (cursor?: string, signal?: AbortSignal): Promise<Page> => {
      const response = await fetch(`/api/public/posts?${paramsFor(cursor)}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "목록을 불러오지 못했습니다.");
      return result;
    },
    [paramsFor],
  );
  useEffect(() => {
    const controller = new AbortController();
    const restore = async () => {
      if (busy.current) return;
      busy.current = true;
      setLoading(true);
      try {
        let saved: { pages?: number; scroll?: number } = {};
        try {
          saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
        } catch {}
        let result = await fetchPage(undefined, controller.signal);
        let n = 1;
        while (n < Math.min(saved.pages || 1, 10000) && result.nextCursor) {
          const next = await fetchPage(result.nextCursor, controller.signal);
          result = { ...next, items: [...result.items, ...next.items] };
          n++;
        }
        if (!controller.signal.aborted) {
          loadedPages.current = n;
          setPage(result);
          setError("");
          if (saved.scroll)
            requestAnimationFrame(() => window.scrollTo(0, saved.scroll || 0));
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "목록 복원에 실패했습니다.",
          );
      } finally {
        busy.current = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void restore();
    const save = () => {
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ pages: loadedPages.current, scroll: scrollY }),
        );
      } catch {}
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void restore();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void restore();
      else save();
    };
    addEventListener("pagehide", save);
    addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    const onScroll = () => save();
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      controller.abort();
      save();
      removeEventListener("pagehide", save);
      removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("scroll", onScroll);
    };
  }, [storageKey, fetchPage]);
  const loadMore = useCallback(async () => {
    if (busy.current || !page.nextCursor) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await fetchPage(page.nextCursor);
      loadedPages.current++;
      setPage((previous) => ({
        ...result,
        items: [
          ...previous.items,
          ...result.items.filter(
            (item) => !previous.items.some((p) => p.id === item.id),
          ),
        ],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가 로딩에 실패했습니다.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [page.nextCursor, fetchPage]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !error && !loading) void loadMore();
      },
      { rootMargin: "160px" },
    );
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [loadMore, error, loading]);
  function update(next: Partial<ListFilters>) {
    const f = { ...filters, ...next };
    const params = new URLSearchParams();
    if (f.sort !== "newest") params.set("sort", f.sort);
    if (f.category) params.set("category", f.category);
    f.tags.forEach((t) => params.append("tag", t));
    router.push(`${base}${params.size ? `?${params}` : ""}`, { scroll: true });
  }
  return (
    <>
      <div className="filters">
        <label className="sr-only" htmlFor="sort">
          정렬
        </label>
        <select
          id="sort"
          value={filters.sort}
          onChange={(e) =>
            update({ sort: e.target.value as ListFilters["sort"] })
          }
        >
          <option value="newest">최신순</option>
          <option value="oldest">오래된순</option>
        </select>
        <label className="sr-only" htmlFor="category">
          카테고리
        </label>
        <select
          id="category"
          value={filters.category}
          onChange={(e) => update({ category: e.target.value })}
        >
          <option value="">전체 카테고리</option>
          {taxons
            .filter((t) => t.type === "CATEGORY")
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
        <span className="list-count">
          {page.total}개의 {kind === "PROJECT" ? "프로젝트" : "글"}
        </span>
        {taxons.some((t) => t.type === "TAG") && (
          <div
            className="filter-tags"
            role="group"
            aria-label="태그 필터: 선택한 태그 모두 포함"
          >
            {taxons
              .filter((t) => t.type === "TAG")
              .map((t) => (
                <button
                  className="filter-chip"
                  key={t.id}
                  aria-pressed={filters.tags.includes(t.id)}
                  onClick={() =>
                    update({
                      tags: filters.tags.includes(t.id)
                        ? filters.tags.filter((id) => id !== t.id)
                        : [...filters.tags, t.id],
                    })
                  }
                >
                  {t.name}
                </button>
              ))}
            {(filters.tags.length > 0 || filters.category) && (
              <button
                className="text-link small"
                onClick={() => update({ tags: [], category: "" })}
              >
                <RotateCcw size={13} />
                초기화
              </button>
            )}
          </div>
        )}
      </div>
      {page.items.length ? (
        <div
          className="card-grid"
          onClickCapture={(e) => {
            const target = (e.target as HTMLElement).closest("a");
            if (
              target &&
              new URL(target.href).pathname.startsWith(`${base}/`)
            ) {
              try {
                sessionStorage.setItem(
                  `portfolio:return:${base}`,
                  JSON.stringify({
                    from: location.pathname + location.search,
                    to: new URL(target.href).pathname,
                  }),
                );
              } catch {}
            }
          }}
        >
          {page.items.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>
            {filters.category || filters.tags.length
              ? "조건에 맞는 글이 없습니다."
              : "아직 공개된 콘텐츠가 없습니다."}
          </h2>
          <p>
            {filters.category || filters.tags.length
              ? "필터를 바꿔 다른 기록을 확인해 보세요."
              : "새로운 기록이 준비되면 이곳에서 확인할 수 있습니다."}
          </p>
          {(filters.category || filters.tags.length > 0) && (
            <button
              className="button secondary"
              onClick={() => update({ tags: [], category: "" })}
            >
              필터 초기화
            </button>
          )}{" "}
          <Link href="/" className="button secondary">
            홈으로 돌아가기
          </Link>
        </div>
      )}
      <div ref={sentinel} className="load-more" aria-live="polite">
        {loading && (
          <span className="muted small" role="status">
            불러오는 중…
          </span>
        )}
        {error && (
          <p className="error-notice notice" role="alert">
            {error}
          </p>
        )}
        {page.nextCursor && (
          <button
            className="button secondary"
            onClick={loadMore}
            disabled={loading}
          >
            {error ? "다시 시도" : "더 보기"}
          </button>
        )}
        {!page.nextCursor && page.items.length > 0 && !loading && (
          <p className="muted small">모든 글을 확인했습니다.</p>
        )}
      </div>
      <nav className="crawl-pagination" aria-label="목록 페이지">
        {filters.page > 1 && (
          <a
            href={`${base}?${new URLSearchParams([...paramsFor().entries()].filter(([k]) => k !== "kind" && k !== "page").concat([["page", String(filters.page - 1)]]))}`}
          >
            이전 페이지
          </a>
        )}
        {initial.total > filters.page * 12 && (
          <a
            href={`${base}?${new URLSearchParams([...paramsFor().entries()].filter(([k]) => k !== "kind" && k !== "page").concat([["page", String(filters.page + 1)]]))}`}
          >
            다음 페이지
          </a>
        )}
      </nav>
    </>
  );
}
