import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { PostKind } from "@/lib/schemas";
import type { ListFilters, PostSummary } from "@/lib/public-data";

export type ListingPage = {
  items: PostSummary[];
  total: number;
  nextCursor: string | null;
};
type PublicListing = {
  page: ListingPage;
  loading: boolean;
  error: string;
  sentinel: RefObject<HTMLDivElement | null>;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
};
type LoadState =
  | { status: "idle" }
  | { status: "loading"; operation: "restore" | "more" }
  | { status: "failed"; operation: "restore" | "more"; message: string };
type ListSession = {
  active: boolean;
  key: string;
  ready: boolean;
  request: AbortController | null;
  pages: number;
  restorePending: boolean;
  frame: number | null;
  restore: () => Promise<void>;
};

export function listParams(
  kind: PostKind,
  filters: ListFilters,
  cursor?: string,
): URLSearchParams {
  const params = new URLSearchParams({ kind, sort: filters.sort });
  if (filters.category) params.set("category", filters.category);
  filters.tags.forEach((tag) => params.append("tag", tag));
  if (cursor) params.set("cursor", cursor);
  else if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}
function appendUnique(
  previous: PostSummary[],
  next: PostSummary[],
): PostSummary[] {
  const ids = new Set(previous.map((item) => item.id));
  return [
    ...previous,
    ...next.filter((item) => {
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    }),
  ];
}

export function usePublicListing(
  kind: PostKind,
  initial: ListingPage,
  filters: ListFilters,
): PublicListing {
  const [page, setPage] = useState(initial);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const loading = loadState.status === "loading";
  const error = loadState.status === "failed" ? loadState.message : "";
  const sentinel = useRef<HTMLDivElement>(null);
  const session = useRef<ListSession | null>(null);
  const { sort, category, page: pageNumber } = filters;
  // Semantic dependencies keep equivalent filter props from restarting subscriptions.
  const tagsKey = JSON.stringify(filters.tags);
  const storageKey = `portfolio:list:${JSON.stringify([kind, sort, category, filters.tags, pageNumber])}`;
  const fetchPage = useCallback(
    async (cursor?: string, signal?: AbortSignal): Promise<ListingPage> => {
      const params = listParams(
        kind,
        { sort, category, tags: JSON.parse(tagsKey), page: pageNumber },
        cursor,
      );
      const response = await fetch(`/api/public/posts?${params}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "목록을 불러오지 못했습니다.");
      return result;
    },
    [kind, sort, category, tagsKey, pageNumber],
  );

  // Activity tears down layout effects before hiding the list or resetting the
  // document scroll. A passive cleanup can save the destination's position.
  useLayoutEffect(() => {
    const scope: ListSession = {
      active: true,
      key: storageKey,
      ready: false,
      request: null,
      pages: 1,
      restorePending: false,
      frame: null,
      restore: async () => {},
    };
    session.current = scope;
    // DOM mutations during navigation can also shift scroll anchoring before
    // cleanup, so persist the last position observed while the list was active.
    let position = scrollY;
    const save = () => {
      // Strict Mode's initial cleanup must not replace a saved multi-page list with page one.
      if (!scope.ready) return;
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ pages: scope.pages, scroll: position }),
        );
      } catch {}
    };
    const onScroll = () => {
      if (!scope.active || !scope.ready) return;
      position = scrollY;
      save();
    };
    scope.restore = async () => {
      if (!scope.active) return;
      if (scope.request) {
        scope.restorePending = true;
        return;
      }
      scope.restorePending = false;
      const controller = new AbortController();
      scope.request = controller;
      const complete = () => {
        if (!scope.active || scope.request !== controller) return;
        scope.request = null;
        if (scope.restorePending) void scope.restore();
        else
          setLoadState((previous) =>
            previous.status === "loading" ? { status: "idle" } : previous,
          );
      };
      setLoadState({ status: "loading", operation: "restore" });
      try {
        let saved: { pages?: number; scroll?: number } = {};
        try {
          saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
        } catch {}
        // In-session revalidation must include pages loaded since the last scroll event.
        const count = Math.min(Math.max(saved.pages || 1, scope.pages), 10000);
        let result = await fetchPage(undefined, controller.signal);
        let n = 1;
        while (scope.active && n < count && result.nextCursor) {
          const next = await fetchPage(result.nextCursor, controller.signal);
          result = { ...next, items: appendUnique(result.items, next.items) };
          n++;
        }
        if (scope.active && scope.request === controller) {
          scope.pages = n;
          setPage(result);
          // Keep the request locked until the restored DOM and scroll agree.
          // An observer notification must not append a page or cancel this frame.
          scope.frame = requestAnimationFrame(() => {
            scope.frame = null;
            if (!scope.active || scope.request !== controller) return;
            if (typeof saved.scroll === "number")
              window.scrollTo({ top: saved.scroll, behavior: "instant" });
            position = scrollY;
            scope.ready = true;
            complete();
          });
        }
      } catch (e) {
        if (scope.active && scope.request === controller)
          setLoadState({
            status: "failed",
            operation: "restore",
            message:
              e instanceof Error ? e.message : "목록 복원에 실패했습니다.",
          });
      } finally {
        if (scope.frame === null) complete();
      }
    };
    void scope.restore();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void scope.restore();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void scope.restore();
      else save();
    };
    addEventListener("pagehide", save);
    addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scope.active = false;
      scope.request?.abort();
      if (scope.frame !== null) cancelAnimationFrame(scope.frame);
      save();
      removeEventListener("pagehide", save);
      removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("scroll", onScroll);
    };
  }, [storageKey, fetchPage]);

  const loadMore = useCallback(async () => {
    const scope = session.current;
    if (
      !scope?.active ||
      scope.key !== storageKey ||
      !scope.ready ||
      scope.request ||
      !page.nextCursor
    )
      return;
    const controller = new AbortController();
    scope.request = controller;
    setLoadState({ status: "loading", operation: "more" });
    try {
      const result = await fetchPage(page.nextCursor, controller.signal);
      if (scope.active && scope.request === controller) {
        scope.pages++;
        setPage((previous) => ({
          ...result,
          items: appendUnique(previous.items, result.items),
        }));
      }
    } catch (e) {
      if (scope.active && scope.request === controller)
        setLoadState({
          status: "failed",
          operation: "more",
          message: e instanceof Error ? e.message : "추가 로딩에 실패했습니다.",
        });
    } finally {
      if (scope.active && scope.request === controller) {
        scope.request = null;
        if (scope.restorePending) void scope.restore();
        else
          setLoadState((previous) =>
            previous.status === "loading" ? { status: "idle" } : previous,
          );
      }
    }
  }, [page.nextCursor, fetchPage, storageKey]);
  const retry = useCallback(async () => {
    const scope = session.current;
    if (
      !scope?.active ||
      scope.key !== storageKey ||
      loadState.status !== "failed"
    )
      return;
    if (loadState.operation === "restore") await scope.restore();
    else await loadMore();
  }, [loadState, loadMore, storageKey]);
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
  return { page, loading, error, sentinel, loadMore, retry };
}
