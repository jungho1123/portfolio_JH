import "server-only";
import { connection } from "next/server";
import type { Metadata } from "next";
import { publicPost } from "@/lib/public-data";
import type { PostKind } from "@/lib/schemas";

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
