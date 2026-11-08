/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatDate } from "@/lib/schemas";
import type { PostSummary } from "@/lib/public-data";
export function PostCard(props: { post: PostSummary; index?: number }) {
  const base = props.post.kind === "PROJECT" ? "/projects" : "/blog";
  return (
    <article
      className={`post-card ${!props.post.data.imageId ? "title-card" : ""}`}
    >
      {props.post.data.imageId && (
        <Link
          href={`${base}/${props.post.data.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className="card-image"
        >
          <img
            src={`/media/${props.post.data.imageId}?w=800`}
            alt={props.post.data.imageAlt}
            loading="lazy"
            style={{ objectPosition: `50% ${props.post.data.imagePosition}%` }}
          />
        </Link>
      )}
      <div className="card-body">
        <div className="card-topline">
          <span>
            {props.post.category?.name ||
              (props.post.kind === "PROJECT" ? "PROJECT" : "BLOG")}
          </span>
          <span className="mono">
            {props.index !== undefined
              ? String(props.index + 1).padStart(2, "0")
              : formatDate(props.post.firstPublishedAt)}
          </span>
        </div>
        <Link href={`${base}/${props.post.data.slug}`} className="card-title">
          <h3>{props.post.data.title}</h3>
          <ArrowUpRight size={20} />
        </Link>
        {props.post.data.summary && (
          <p className="card-summary">{props.post.data.summary}</p>
        )}
        <div className="chips">
          {props.post.tags.map((tag) => (
            <Link key={tag.id} className="chip" href={`${base}?tag=${tag.id}`}>
              {tag.name}
            </Link>
          ))}
        </div>
        {props.post.kind === "PROJECT" && (
          <div className="card-footer">
            <span className="project-status">
              <span className="status-dot" />
              {props.post.data.progress}
            </span>
            <span>
              {props.post.data.technologies
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
