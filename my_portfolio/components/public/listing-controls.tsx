import type { Ref } from "react";
import { RotateCcw } from "lucide-react";
import type { PostKind } from "@/lib/schemas";
import type { ListFilters } from "@/lib/public-data";
export type ListingTaxon = { id: string; name: string; type: string };
export function ListingFilters(props: {
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
        value={props.filters.sort}
        onChange={(e) =>
          props.onChange({ sort: e.target.value as ListFilters["sort"] })
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
        value={props.filters.category}
        onChange={(e) => props.onChange({ category: e.target.value })}
      >
        <option value="">전체 카테고리</option>
        {props.taxons
          .filter((t) => t.type === "CATEGORY")
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </select>
      <span className="list-count">
        {props.total}개의 {props.kind === "PROJECT" ? "프로젝트" : "글"}
      </span>
      {props.taxons.some((t) => t.type === "TAG") && (
        <div
          className="filter-tags"
          role="group"
          aria-label="태그 필터: 선택한 태그 모두 포함"
        >
          {props.taxons
            .filter((t) => t.type === "TAG")
            .map((t) => (
              <button
                className="filter-chip"
                key={t.id}
                aria-pressed={props.filters.tags.includes(t.id)}
                onClick={() =>
                  props.onChange({
                    tags: props.filters.tags.includes(t.id)
                      ? props.filters.tags.filter((id) => id !== t.id)
                      : [...props.filters.tags, t.id],
                  })
                }
              >
                {t.name}
              </button>
            ))}
          {(props.filters.tags.length > 0 || props.filters.category) && (
            <button
              className="text-link small"
              onClick={() => props.onChange({ tags: [], category: "" })}
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
function attachElementRef(
  ref: Ref<HTMLDivElement>,
  node: HTMLDivElement | null,
) {
  if (typeof ref === "function") return ref(node);
  if (ref) ref.current = node;
}
export function ListingLoadState(props: {
  sentinel: Ref<HTMLDivElement>;
  loading: boolean;
  error: string;
  hasMore: boolean;
  hasItems: boolean;
  onLoadMore: () => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  function attachSentinel(node: HTMLDivElement | null) {
    return attachElementRef(props.sentinel, node);
  }
  return (
    <div ref={attachSentinel} className="load-more" aria-live="polite">
      {props.loading && (
        <span className="muted small" role="status">
          불러오는 중…
        </span>
      )}
      {props.error && (
        <p className="error-notice notice" role="alert">
          {props.error}
        </p>
      )}
      {(props.hasMore || props.error) && (
        <button
          className="button secondary"
          onClick={props.error ? props.onRetry : props.onLoadMore}
          disabled={props.loading}
        >
          {props.error ? "다시 시도" : "더 보기"}
        </button>
      )}
      {!props.hasMore && props.hasItems && !props.loading && !props.error && (
        <p className="muted small">모든 글을 확인했습니다.</p>
      )}
    </div>
  );
}
