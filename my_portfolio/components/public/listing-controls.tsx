import type { Ref } from "react";
import { RotateCcw } from "lucide-react";
import type { PostKind } from "@/lib/schemas";
import type { ListFilters } from "@/lib/public-data";
export type ListingTaxon = { id: string; name: string; type: string };
export function ListingFilters({
  kind,
  filters,
  taxons,
  total,
  onChange,
}: {
  kind: PostKind;
  filters: ListFilters;
  taxons: ListingTaxon[];
  total: number;
  onChange: (next: Partial<ListFilters>) => void;
}) {
  return (
    <div className="filters">
      <label className="sr-only" htmlFor="sort">
        정렬
      </label>
      <select
        id="sort"
        value={filters.sort}
        onChange={(e) =>
          onChange({ sort: e.target.value as ListFilters["sort"] })
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
        onChange={(e) => onChange({ category: e.target.value })}
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
        {total}개의 {kind === "PROJECT" ? "프로젝트" : "글"}
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
                  onChange({
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
              onClick={() => onChange({ tags: [], category: "" })}
            >
              <RotateCcw size={13} />
              초기화
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export function ListingLoadState({
  sentinel,
  loading,
  error,
  hasMore,
  hasItems,
  onLoadMore,
  onRetry,
}: {
  sentinel: Ref<HTMLDivElement>;
  loading: boolean;
  error: string;
  hasMore: boolean;
  hasItems: boolean;
  onLoadMore: () => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  return (
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
      {(hasMore || error) && (
        <button
          className="button secondary"
          onClick={error ? onRetry : onLoadMore}
          disabled={loading}
        >
          {error ? "다시 시도" : "더 보기"}
        </button>
      )}
      {!hasMore && hasItems && !loading && !error && (
        <p className="muted small">모든 글을 확인했습니다.</p>
      )}
    </div>
  );
}
