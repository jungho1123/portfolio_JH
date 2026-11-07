/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
import { connection } from "next/server";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import {
  publicList,
  publicTaxons,
  publicPost,
  relatedPosts,
  filtersFromRecord,
} from "@/lib/public-data";
import { type PostKind, formatDate, readingMinutes } from "@/lib/schemas";
import { Listing } from "@/components/public/listing";
import { Markdown, TableOfContents } from "@/components/public/markdown";
import { PostCard } from "@/components/public/card";
import { Share, BackToList } from "@/components/public/actions";
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
export async function postMetadata(
  kind: PostKind,
  slug: string,
): Promise<Metadata> {
  await connection();
  const post = await publicPost(kind, slug);
  if (!post)
    return { title: "페이지를 찾을 수 없습니다", robots: { index: false } };
  const base = kind === "PROJECT" ? "/projects" : "/blog";
  return {
    title: post.data.title,
    description: post.data.summary,
    alternates: { canonical: `${base}/${post.data.slug}` },
    openGraph: {
      type: "article",
      title: post.data.title,
      description: post.data.summary,
      publishedTime: post.firstPublishedAt,
      modifiedTime: post.lastPublishedAt,
      images: [`/og/${post.id}`],
    },
    twitter: {
      card: "summary_large_image",
      title: post.data.title,
      description: post.data.summary,
      images: [`/og/${post.id}`],
    },
  };
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
export function DetailView({
  post,
  base,
  adjacent,
}: {
  post: NonNullable<Awaited<ReturnType<typeof publicPost>>>;
  base: string;
  adjacent?: Awaited<ReturnType<typeof relatedPosts>>;
}) {
  const d = post.data;
  return (
    <article>
      <header className="detail-header">
        <p className="eyebrow">
          {post.kind === "PROJECT" ? "PROJECT" : "BLOG"}
          {post.category && ` / ${post.category.name}`}
        </p>
        <h1>{d.title}</h1>
        {d.summary && <p className="detail-summary">{d.summary}</p>}
        <div className="detail-meta">
          <time dateTime={post.firstPublishedAt}>
            게시 {formatDate(post.firstPublishedAt)}
          </time>
          <time dateTime={post.lastPublishedAt}>
            수정 {formatDate(post.lastPublishedAt)}
          </time>
          {post.kind === "BLOG" && (
            <span>{readingMinutes(d.markdown)}분 읽기</span>
          )}
        </div>
        <div className="chips">
          {post.tags.map((t) => (
            <Link className="chip" href={`${base}?tag=${t.id}`} key={t.id}>
              {t.name}
            </Link>
          ))}
        </div>
        {d.imageId && (
          <img
            className="detail-cover"
            src={`/media/${d.imageId}?w=1400`}
            alt={d.imageAlt}
            style={{ objectPosition: `50% ${d.imagePosition}%` }}
          />
        )}
      </header>
      {post.kind === "PROJECT" && (
        <>
          <dl className="project-facts">
            <div>
              <dt>프로젝트 기간</dt>
              <dd>
                {d.startDate || "미정"} — {d.endDate || "진행 중"}
              </dd>
            </div>
            <div>
              <dt>진행 상태</dt>
              <dd>{d.progress}</dd>
            </div>
            <div>
              <dt>역할 · 팀</dt>
              <dd>
                {d.role || "미등록"} · {d.teamType} / {d.teamSize}명
              </dd>
            </div>
            <div>
              <dt>사용 기술</dt>
              <dd>
                {d.technologies.map((t) => t.name).join(" · ") || "미등록"}
              </dd>
            </div>
          </dl>
          <div className="detail-links">
            {[
              { url: d.githubUrl, label: "GitHub" },
              { url: d.serviceUrl, label: "서비스" },
              { url: d.demoUrl, label: "데모" },
            ]
              .filter((l) => l.url)
              .map((l) => (
                <a
                  key={l.label}
                  href={l.url}
                  className="text-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {l.label}
                  <ArrowUpRight size={14} />
                </a>
              ))}
          </div>
        </>
      )}
      <div className="detail-body">
        <Markdown source={d.markdown} />
        <TableOfContents source={d.markdown} />
      </div>
      <div className="detail-footer">
        <BackToList href={base} />
        <Share />
      </div>
      {adjacent && (
        <>
          <nav className="adjacent" aria-label="이전 글과 다음 글">
            {adjacent.previous && (
              <Link href={`${base}/${adjacent.previous.data.slug}`}>
                <span className="eyebrow">← 이전 글</span>
                {adjacent.previous.data.title}
              </Link>
            )}
            {adjacent.next && (
              <Link href={`${base}/${adjacent.next.data.slug}`}>
                <span className="eyebrow">다음 글 →</span>
                {adjacent.next.data.title}
              </Link>
            )}
          </nav>
          {adjacent.related.length > 0 && (
            <section>
              <h2 className="related-title">함께 읽기</h2>
              <div className="card-grid">
                {adjacent.related.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </article>
  );
}
