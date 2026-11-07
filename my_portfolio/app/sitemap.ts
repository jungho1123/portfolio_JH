import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { db } from "@/lib/prisma";
import { postSchema } from "@/lib/schemas";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin =
    process.env.SITE_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000";
  const posts = await db.content.findMany({
    where: {
      state: "PUBLISHED",
      kind: { in: ["BLOG", "PROJECT"] },
      publishedId: { not: null },
    },
    select: {
      kind: true,
      lastPublishedAt: true,
      published: { select: { data: true } },
    },
  });
  return [
    { url: origin },
    ...["projects", "blog"].flatMap((base) =>
      Array.from(
        {
          length: Math.max(
            1,
            Math.ceil(
              posts.filter(
                (p) => p.kind === (base === "projects" ? "PROJECT" : "BLOG"),
              ).length / 12,
            ),
          ),
        },
        (_, i) => ({ url: `${origin}/${base}${i ? `?page=${i + 1}` : ""}` }),
      ),
    ),
    ...posts.map((p) => ({
      url: `${origin}/${p.kind === "PROJECT" ? "projects" : "blog"}/${postSchema.parse(p.published!.data).slug}`,
      lastModified: p.lastPublishedAt!,
    })),
  ];
}
