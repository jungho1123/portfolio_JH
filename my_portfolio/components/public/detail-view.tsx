/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PublicPost, relatedPosts } from "@/lib/public-data";
import { formatDate, readingMinutes } from "@/lib/schemas";
import { Markdown, TableOfContents } from "@/components/public/markdown";
import { PostCard } from "@/components/public/card";
import { Share, BackToList } from "@/components/public/actions";

export function DetailView(props: {
  post: PublicPost;
  base: string;
  adjacent?: Awaited<ReturnType<typeof relatedPosts>>;
}) {
  const d = props.post.data;
  return (
    <article>
      <header className="detail-header">
        <p className="eyebrow">
          {props.post.kind === "PROJECT" ? "PROJECT" : "BLOG"}
          {props.post.category && ` / ${props.post.category.name}`}
        </p>
        <h1>{d.title}</h1>
        {d.summary && <p className="detail-summary">{d.summary}</p>}
        <div className="detail-meta">
          <time dateTime={props.post.firstPublishedAt}>
            게시 {formatDate(props.post.firstPublishedAt)}
          </time>
          <time dateTime={props.post.lastPublishedAt}>
            수정 {formatDate(props.post.lastPublishedAt)}
          </time>
          {props.post.kind === "BLOG" && (
            <span>{readingMinutes(d.markdown)}분 읽기</span>
          )}
        </div>
        <div className="chips">
          {props.post.tags.map((t) => (
            <Link
              className="chip"
              href={`${props.base}?tag=${t.id}`}
              key={t.id}
            >
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
      {props.post.kind === "PROJECT" && (
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
        <BackToList href={props.base} />
        <Share />
      </div>
      {props.adjacent && (
        <>
          <nav className="adjacent" aria-label="이전 글과 다음 글">
            {props.adjacent.previous && (
              <Link href={`${props.base}/${props.adjacent.previous.data.slug}`}>
                <span className="eyebrow">← 이전 글</span>
                {props.adjacent.previous.data.title}
              </Link>
            )}
            {props.adjacent.next && (
              <Link href={`${props.base}/${props.adjacent.next.data.slug}`}>
                <span className="eyebrow">다음 글 →</span>
                {props.adjacent.next.data.title}
              </Link>
            )}
          </nav>
          {props.adjacent.related.length > 0 && (
            <section>
              <h2 className="related-title">함께 읽기</h2>
              <div className="card-grid">
                {props.adjacent.related.map((p) => (
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
