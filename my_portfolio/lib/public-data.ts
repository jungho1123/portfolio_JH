import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  emptyHome,
  homeSchema,
  postSchema,
  type PostKind,
  type PostData,
} from "@/lib/schemas";
import { fail } from "@/lib/errors";
import { z } from "zod";

export async function publicSnapshot(revisionId: string) {
  "use cache";
  cacheTag("portfolio");
  cacheLife("hours");
  const revision = await db.revision.findUnique({
    where: { id: revisionId },
    select: { data: true },
  });
  return revision?.data ?? null;
}
// Every request checks the current pointer/visibility before reading cached immutable snapshot data.
export async function publicHome() {
  const home = await db.content.findFirst({
    where: { id: "home", state: "PUBLISHED" },
    select: { publishedId: true },
  });
  const data = home?.publishedId
    ? await publicSnapshot(home.publishedId)
    : null;
  return data ? homeSchema.parse(data) : emptyHome();
}
export type PublicPost = {
  id: string;
  kind: PostKind;
  firstPublishedAt: string;
  lastPublishedAt: string;
  createdAt: string;
  data: PostData;
  category: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
};
export type PostSummary = Omit<PublicPost, "data"> & {
  data: Pick<
    PostData,
    | "title"
    | "slug"
    | "summary"
    | "imageId"
    | "imageAlt"
    | "imagePosition"
    | "progress"
    | "technologies"
  >;
};
const projection = {
  id: true,
  kind: true,
  firstPublishedAt: true,
  lastPublishedAt: true,
  createdAt: true,
  published: {
    select: {
      data: true,
      taxonomies: {
        select: { taxon: { select: { id: true, name: true, type: true } } },
      },
    },
  },
} as const;
type Row = Prisma.ContentGetPayload<{ select: typeof projection }>;
function dto(row: Row): PublicPost {
  const data = postSchema.parse(row.published!.data);
  const taxons = row.published!.taxonomies.map((t) => t.taxon);
  return {
    id: row.id,
    kind: row.kind as PostKind,
    firstPublishedAt: row.firstPublishedAt!.toISOString(),
    lastPublishedAt: row.lastPublishedAt!.toISOString(),
    createdAt: row.createdAt.toISOString(),
    data,
    category: taxons.find((t) => t.type === "CATEGORY") ?? null,
    tags: taxons.filter((t) => t.type === "TAG"),
  };
}
export function summarize(post: PublicPost): PostSummary {
  const {
    title,
    slug,
    summary,
    imageId,
    imageAlt,
    imagePosition,
    progress,
    technologies,
  } = post.data;
  return {
    ...post,
    data: {
      title,
      slug,
      summary,
      imageId,
      imageAlt,
      imagePosition,
      progress,
      technologies,
    },
  };
}
export const filterSchema = z.object({
  sort: z.enum(["newest", "oldest"]).default("newest"),
  category: z.string().max(100).default(""),
  tags: z.array(z.string().max(100)).max(50).default([]),
  cursor: z.string().max(1000).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export type ListFilters = z.infer<typeof filterSchema>;
export function parseFilters(params: URLSearchParams) {
  return filterSchema.parse({
    sort: params.get("sort") ?? "newest",
    category: params.get("category") ?? "",
    tags: params.getAll("tag"),
    cursor: params.get("cursor") ?? undefined,
    page: params.get("page") ?? 1,
  });
}
export function filtersFromRecord(
  record: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(record))
    for (const v of Array.isArray(val) ? val : val ? [val] : [])
      params.append(key, v);
  return parseFilters(params);
}
export async function publicList(kind: PostKind, input: ListFilters) {
  const filters = filterSchema.parse(input);
  const conditions: Prisma.ContentWhereInput[] = [
    { kind, state: "PUBLISHED", publishedId: { not: null } },
  ];
  if (filters.category)
    conditions.push({
      published: {
        taxonomies: {
          some: { taxon: { id: filters.category, type: "CATEGORY", kind } },
        },
      },
    });
  for (const id of [...new Set(filters.tags)])
    conditions.push({
      published: { taxonomies: { some: { taxon: { id, type: "TAG", kind } } } },
    });
  const base: Prisma.ContentWhereInput = { AND: conditions };
  const total = await db.content.count({ where: base });
  if (filters.cursor) {
    let cursor: { date: string; id: string; signature: string };
    try {
      cursor = JSON.parse(Buffer.from(filters.cursor, "base64url").toString());
    } catch {
      fail(400, "잘못된 추가 조회 기준입니다.");
    }
    if (
      cursor.signature !== filterSignature(kind, filters) ||
      !cursor.id ||
      isNaN(Date.parse(cursor.date))
    )
      fail(400, "목록 조건이 변경되었습니다. 처음부터 다시 조회하세요.");
    const cmp = filters.sort === "newest" ? "lt" : "gt";
    conditions.push({
      OR: [
        { firstPublishedAt: { [cmp]: new Date(cursor.date) } },
        { firstPublishedAt: new Date(cursor.date), id: { [cmp]: cursor.id } },
      ],
    });
  }
  const dir = filters.sort === "newest" ? "desc" : "asc";
  const rows = await db.content.findMany({
    where: { AND: conditions },
    select: projection,
    orderBy: [{ firstPublishedAt: dir }, { id: dir }],
    take: 13,
    skip: filters.cursor ? 0 : (filters.page - 1) * 12,
  });
  const items = rows.slice(0, 12).map(dto).map(summarize);
  const last = items.at(-1);
  const nextCursor =
    rows.length > 12 && last
      ? Buffer.from(
          JSON.stringify({
            date: last.firstPublishedAt,
            id: last.id,
            signature: filterSignature(kind, filters),
          }),
        ).toString("base64url")
      : null;
  return { items, total, nextCursor };
}
function filterSignature(kind: PostKind, f: ListFilters) {
  return JSON.stringify([kind, f.sort, f.category, [...f.tags].sort()]);
}
export async function publicTaxons(kind: PostKind) {
  return db.taxon.findMany({
    where: {
      kind,
      uses: { some: { revision: { publicOf: { state: "PUBLISHED", kind } } } },
    },
    select: {
      id: true,
      name: true,
      type: true,
      _count: {
        select: {
          uses: {
            where: { revision: { publicOf: { state: "PUBLISHED", kind } } },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
}
export async function publicPost(kind: PostKind, slug: string) {
  const address = await db.slug.findUnique({
    where: { kind_value: { kind, value: slug } },
    select: { published: true, content: { select: projection } },
  });
  if (!address?.published) return null;
  // projection intentionally excludes state; check visibility in a separate constrained query.
  const row = await db.content.findFirst({
    where: {
      id: address.content.id,
      state: "PUBLISHED",
      publishedId: { not: null },
    },
    select: projection,
  });
  return row ? dto(row) : null;
}
export async function relatedPosts(post: PublicPost) {
  const ids = [post.category?.id, ...post.tags.map((t) => t.id)].filter(
    (x): x is string => !!x,
  );
  const related = ids.length
    ? await db.content.findMany({
        where: {
          kind: post.kind,
          state: "PUBLISHED",
          id: { not: post.id },
          published: { taxonomies: { some: { taxonId: { in: ids } } } },
        },
        select: projection,
        orderBy: [{ firstPublishedAt: "desc" }, { id: "desc" }],
        take: 3,
      })
    : [];
  const date = new Date(post.firstPublishedAt);
  const adjacent = async (cmp: "lt" | "gt", dir: "asc" | "desc") => {
    const row = await db.content.findFirst({
      where: {
        kind: post.kind,
        state: "PUBLISHED",
        OR: [
          { firstPublishedAt: { [cmp]: date } },
          { firstPublishedAt: date, id: { [cmp]: post.id } },
        ],
      },
      select: projection,
      orderBy: [{ firstPublishedAt: dir }, { id: dir }],
    });
    return row ? summarize(dto(row)) : null;
  };
  return {
    related: related.map(dto).map(summarize),
    previous: await adjacent("lt", "desc"),
    next: await adjacent("gt", "asc"),
  };
}
export async function homePosts(home: ReturnType<typeof homeSchema.parse>) {
  const projects =
    home.projectCount && home.featuredIds.length
      ? await db.content.findMany({
          where: {
            id: { in: home.featuredIds },
            kind: "PROJECT",
            state: "PUBLISHED",
            publishedId: { not: null },
          },
          select: projection,
        })
      : [];
  const sorted = home.featuredIds
    .flatMap((id) => {
      const row = projects.find((p) => p.id === id);
      return row ? [summarize(dto(row))] : [];
    })
    .slice(0, home.projectCount);
  const blogs = home.blogCount
    ? await db.content.findMany({
        where: { kind: "BLOG", state: "PUBLISHED", publishedId: { not: null } },
        select: projection,
        orderBy: [{ firstPublishedAt: "desc" }, { id: "desc" }],
        take: home.blogCount,
      })
    : [];
  return { projects: sorted, blogs: blogs.map(dto).map(summarize) };
}
