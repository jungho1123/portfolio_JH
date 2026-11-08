import { connection } from "next/server";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import {
  publicList,
  publicTaxons,
  publicPost,
  relatedPosts,
  filtersFromRecord,
} from "@/lib/public-data";
import type { PostKind } from "@/lib/schemas";
import { Listing } from "@/components/public/listing";
import { DetailView } from "@/components/public/detail-view";
export type Search = Promise<Record<string, string | string[] | undefined>>;
export async function ListPage({
  kind,
  searchParams,
}: {
  kind: PostKind;
  searchParams: Search;
}) {
  await connection();
  let filters;
  try {
    filters = filtersFromRecord(await searchParams);
  } catch {
    return (
      <div className="empty-state">
        <h1>목록 조건을 확인해 주세요.</h1>
        <p>유효하지 않은 정렬 또는 필터입니다.</p>
        <Link
          className="button"
          href={kind === "PROJECT" ? "/projects" : "/blog"}
        >
          필터 초기화
        </Link>
      </div>
    );
  }
  const [initial, taxons] = await Promise.all([
    publicList(kind, filters),
    publicTaxons(kind),
  ]);
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">
          {kind === "PROJECT"
            ? "SELECTED WORK & EXPERIMENTS"
            : "NOTES & THOUGHTS"}
        </p>
        <h1>
          {kind === "PROJECT" ? "Projects" : "Blog"}
          <span className="accent">.</span>
        </h1>
        <p>
          {kind === "PROJECT"
            ? "문제를 발견하고, 해결해 나간 과정입니다."
            : "개발하며 배우고 생각한 것을 기록합니다."}
        </p>
      </div>
      <Listing
        key={JSON.stringify(filters)}
        kind={kind}
        initial={initial}
        filters={filters}
        taxons={taxons}
      />
    </>
  );
}
export async function DetailPage({
  kind,
  slug,
}: {
  kind: PostKind;
  slug: string;
}) {
  await connection();
  const post = await publicPost(kind, slug);
  if (!post) notFound();
  const base = kind === "PROJECT" ? "/projects" : "/blog";
  if (post.data.slug !== slug) permanentRedirect(`${base}/${post.data.slug}`);
  const adjacent = await relatedPosts(post);
  return <DetailView post={post} base={base} adjacent={adjacent} />;
}
