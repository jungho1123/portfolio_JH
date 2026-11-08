"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PostCard } from "@/components/public/card";
import type { PostKind } from "@/lib/schemas";
import type { ListFilters } from "@/lib/public-data";
import {
  ListingFilters,
  ListingLoadState,
  type ListingTaxon,
} from "@/components/public/listing-controls";
import {
  usePublicListing,
  listParams,
  type ListingPage,
} from "@/components/public/use-public-listing";
export function Listing({
  kind,
  initial,
  filters,
  taxons,
}: {
  kind: PostKind;
  initial: ListingPage;
  filters: ListFilters;
  taxons: ListingTaxon[];
}) {
  const router = useRouter();
  const base = kind === "PROJECT" ? "/projects" : "/blog";
  const { page, loading, error, sentinel, loadMore, retry } = usePublicListing(
    kind,
    initial,
    filters,
  );
  const paramsFor = () => listParams(kind, filters);
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
      <ListingFilters
        kind={kind}
        filters={filters}
        taxons={taxons}
        total={page.total}
        onChange={update}
      />
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
      <ListingLoadState
        sentinel={sentinel}
        loading={loading}
        error={error}
        hasMore={!!page.nextCursor}
        hasItems={page.items.length > 0}
        onLoadMore={loadMore}
        onRetry={retry}
      />
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
