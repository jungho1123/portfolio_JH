/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatDate } from "@/lib/schemas";
import type { PostSummary } from "@/lib/public-data";
export function PostCard({
  post,
  index,
}: {
  post: PostSummary;
  index?: number;
}) {
  const base = post.kind === "PROJECT" ? "/projects" : "/blog";
  return (
    <article className={`post-card ${!post.data.imageId ? "title-card" : ""}`}>
      {post.data.imageId && (
        <Link
          href={`${base}/${post.data.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className="card-image"
        >
          <img
            src={`/media/${post.data.imageId}?w=800`}
            alt={post.data.imageAlt}
            loading="lazy"
            style={{ objectPosition: `50% ${post.data.imagePosition}%` }}
          />
        </Link>
      )}
      <div className="card-body">
        <div className="card-topline">
          <span>
            {post.category?.name ||
              (post.kind === "PROJECT" ? "PROJECT" : "BLOG")}
          </span>
          <span className="mono">
            {index !== undefined
              ? String(index + 1).padStart(2, "0")
              : formatDate(post.firstPublishedAt)}
          </span>
        </div>
        <Link href={`${base}/${post.data.slug}`} className="card-title">
          <h3>{post.data.title}</h3>
          <ArrowUpRight size={20} />
        </Link>
        {post.data.summary && (
          <p className="card-summary">{post.data.summary}</p>
        )}
        <div className="chips">
          {post.tags.map((tag) => (
            <Link key={tag.id} className="chip" href={`${base}?tag=${tag.id}`}>
              {tag.name}
            </Link>
          ))}
        </div>
        {post.kind === "PROJECT" && (
          <div className="card-footer">
            <span className="project-status">
              <span className="status-dot" />
              {post.data.progress}
            </span>
            <span>
              {post.data.technologies
                .slice(0, 3)
                .map((t) => t.name)
                .join(" · ")}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
