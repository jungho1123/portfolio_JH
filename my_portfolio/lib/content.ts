import { db } from "@/lib/prisma";
import { Prisma, type ContentKind } from "@/generated/prisma/client";
import {
  emptyHome,
  emptyPost,
  homeSchema,
  postSchema,
  mediaIds,
  type HomeData,
  type PostData,
  type PostKind,
} from "@/lib/schemas";
import { fail } from "@/lib/errors";

type Tx = Prisma.TransactionClient;
const include = { draft: true, published: true } as const;
const json = (d: HomeData | PostData) => d as unknown as Prisma.InputJsonValue;
export async function serial<T>(fn: (tx: Tx) => Promise<T>) {
  return db.$transaction(fn, {
    isolationLevel: "Serializable",
    timeout: 20000,
  });
}
export async function lockContent(tx: Tx, id: string, expected: number) {
  const locked = await tx.content.updateMany({
    where: { id, revision: expected },
    data: { revision: { increment: 1 } },
  });
  if (!locked.count)
    fail(
      409,
      "다른 탭 또는 관리 작업에서 변경했습니다. 서버 초안을 다시 불러오거나 기기 복구본을 복사하세요.",
      "CONFLICT",
    );
  return tx.content.findUniqueOrThrow({ where: { id }, include });
}
async function linkRevision(
  tx: Tx,
  revisionId: string,
  kind: ContentKind,
  data: HomeData | PostData,
) {
  const ids = mediaIds(data);
  if (ids.length) {
    const found = await tx.media.findMany({
      where: { id: { in: ids }, status: "READY" },
    });
    if (found.length !== ids.length)
      fail(400, "검증이 완료되지 않았거나 삭제된 파일이 포함되어 있습니다.");
    if ("resumeId" in data) {
      if (
        data.resumeId &&
        !found.some(
          (m) => m.id === data.resumeId && m.mime === "application/pdf",
        )
      )
        fail(400, "이력서는 PDF여야 합니다.");
      if (
        data.photoId &&
        !found.some((m) => m.id === data.photoId && m.mime.startsWith("image/"))
      )
        fail(400, "프로필 사진은 이미지여야 합니다.");
    }
    if (
      "imageId" in data &&
      [data.imageId, data.shareImageId]
        .filter(Boolean)
        .some(
          (id) =>
            !found.some((m) => m.id === id && m.mime.startsWith("image/")),
        )
    )
      fail(400, "대표·공유 이미지는 이미지 파일이어야 합니다.");
  }
  await tx.mediaUse.deleteMany({ where: { revisionId } });
  if (ids.length)
    await tx.mediaUse.createMany({
      data: ids.map((mediaId) => ({ revisionId, mediaId })),
    });
  await tx.revisionTaxon.deleteMany({ where: { revisionId } });
  if (kind !== "HOME") {
    const d = data as PostData;
    const taxonIds = [
      ...new Set([d.categoryId, ...d.tagIds].filter((x): x is string => !!x)),
    ];
    const found = await tx.taxon.findMany({
      where: { id: { in: taxonIds }, kind },
    });
    if (
      found.length !== taxonIds.length ||
      (d.categoryId &&
        !found.some((t) => t.id === d.categoryId && t.type === "CATEGORY")) ||
      d.tagIds.some((id) => !found.some((t) => t.id === id && t.type === "TAG"))
    )
      fail(400, "분류가 변경되었습니다. 분류 목록을 새로 조회하세요.");
    if (taxonIds.length)
      await tx.revisionTaxon.createMany({
        data: taxonIds.map((taxonId) => ({ revisionId, taxonId })),
      });
  }
}
async function createRevision(
  tx: Tx,
  contentId: string,
  kind: ContentKind,
  data: HomeData | PostData,
) {
  const version = await tx.revision.create({
    data: { contentId, data: json(data) },
  });
  await linkRevision(tx, version.id, kind, data);
  return version;
}
export async function ensureHome() {
  const found = await db.content.findUnique({ where: { id: "home" }, include });
  if (found) return found;
  return serial(async (tx) => {
    const home = await tx.content.upsert({
      where: { id: "home" },
      create: { id: "home", kind: "HOME" },
      update: {},
      include,
    });
    if (home.draftId) return home;
    const draft = await createRevision(tx, home.id, "HOME", emptyHome());
    return tx.content.update({
      where: { id: "home" },
      data: { draftId: draft.id },
      include,
    });
  });
}
export async function createPost(kind: PostKind) {
  return serial(async (tx) => {
    const post = await tx.content.create({ data: { kind } });
    const data = emptyPost(kind);
    data.slug = `${kind.toLowerCase()}-${post.id}`;
    await tx.slug.create({
      data: { kind, value: data.slug, contentId: post.id },
    });
    const draft = await createRevision(tx, post.id, kind, data);
    return tx.content.update({
      where: { id: post.id },
      data: { draftId: draft.id },
      include,
    });
  });
}
export async function saveDraft(id: string, expected: number, input: unknown) {
  return serial(async (tx) => {
    const post = await lockContent(tx, id, expected);
    if (post.state === "TRASH") fail(400, "휴지통에서 복원한 뒤 편집하세요.");
    const data =
      post.kind === "HOME" ? homeSchema.parse(input) : postSchema.parse(input);
    if (post.kind === "PROJECT" && "technologyIds" in data) {
      const home = await tx.content.findUnique({
        where: { id: "home" },
        include: { published: true },
      });
      const stack = home?.published
        ? homeSchema.parse(home.published.data).stack
        : [];
      const selectedIds = data.technologyIds;
      data.technologies = stack.filter((t) => selectedIds.includes(t.id));
    }
    if (post.kind !== "HOME" && "slug" in data && data.slug) {
      const reserved = await tx.slug.findUnique({
        where: { kind_value: { kind: post.kind, value: data.slug } },
      });
      if (reserved && reserved.contentId !== id)
        fail(409, "이미 사용 중인 slug입니다.");
      await tx.slug.upsert({
        where: { kind_value: { kind: post.kind, value: data.slug } },
        create: { kind: post.kind, value: data.slug, contentId: id },
        update: {},
      });
      await tx.slug.deleteMany({
        where: { contentId: id, published: false, value: { not: data.slug } },
      });
    }
    if (post.draftId) {
      await tx.revision.update({
        where: { id: post.draftId },
        data: { data: json(data) },
      });
      await linkRevision(tx, post.draftId, post.kind, data);
    } else {
      const draft = await createRevision(tx, id, post.kind, data);
      await tx.content.update({ where: { id }, data: { draftId: draft.id } });
    }
    return tx.content.findUniqueOrThrow({ where: { id }, include });
  });
}
export async function publishContent(id: string, expected: number) {
  return serial(async (tx) => {
    const post = await lockContent(tx, id, expected);
    if (!post.draft || post.state === "TRASH")
      fail(400, "게시할 수 있는 초안이 없습니다.");
    let data: HomeData | PostData;
    if (post.kind === "HOME") {
      data = homeSchema.parse(post.draft.data);
      if (!data.name.trim() || !data.job.trim())
        fail(400, "홈 게시 전 이름과 직무를 입력하세요.");
      if (new Set(data.stack.map((t) => t.id)).size !== data.stack.length)
        fail(400, "기술 ID가 중복되었습니다.");
    } else {
      data = postSchema.parse(post.draft.data);
      if (!data.title.trim() || !data.slug || !data.categoryId)
        fail(400, "제목·slug·카테고리를 입력하세요.");
      const reserved = await tx.slug.findUnique({
        where: { kind_value: { kind: post.kind, value: data.slug } },
      });
      if (reserved && reserved.contentId !== id)
        fail(409, "다른 글 또는 이전 주소에서 사용 중인 slug입니다.");
      await tx.slug.upsert({
        where: { kind_value: { kind: post.kind, value: data.slug } },
        create: {
          kind: post.kind,
          value: data.slug,
          contentId: id,
          published: true,
        },
        update: { published: true },
      });
      if (post.kind === "PROJECT") {
        const home = await tx.content.findUnique({
          where: { id: "home" },
          include: { published: true },
        });
        const stack = home?.published
          ? homeSchema.parse(home.published.data).stack
          : [];
        if (data.technologyIds.some((id) => !stack.some((t) => t.id === id)))
          fail(400, "선택한 기술을 홈 Stack에서 먼저 게시하세요.");
        const selectedIds = data.technologyIds;
        data.technologies = stack.filter((t) => selectedIds.includes(t.id));
      }
    }
    const published = await createRevision(tx, id, post.kind, data);
    const oldPublic = post.publishedId;
    const result = await tx.content.update({
      where: { id },
      data: {
        publishedId: published.id,
        state: "PUBLISHED",
        firstPublishedAt: post.firstPublishedAt ?? new Date(),
        lastPublishedAt: new Date(),
      },
      include,
    });
    // Keep only the editable draft and current public snapshot; old revisions are not a history feature.
    if (oldPublic) await tx.revision.delete({ where: { id: oldPublic } });
    await tx.cacheJob.create({ data: {} });
    return result;
  });
}
export async function transitionContent(
  id: string,
  expected: number,
  action: string,
) {
  return serial(async (tx) => {
    const post = await lockContent(tx, id, expected);
    if (post.kind === "HOME" && action !== "discard")
      fail(400, "홈에는 이 작업을 적용할 수 없습니다.");
    if (action === "delete") {
      if (post.state !== "TRASH")
        fail(400, "휴지통에서만 영구 삭제할 수 있습니다.");
      await tx.content.update({
        where: { id },
        data: { draftId: null, publishedId: null },
      });
      await tx.content.delete({ where: { id } });
      await tx.cacheJob.create({ data: {} });
      return null;
    }
    if (action === "discard") {
      const data =
        post.kind === "HOME"
          ? post.published
            ? homeSchema.parse(post.published.data)
            : emptyHome()
          : post.published
            ? postSchema.parse(post.published.data)
            : emptyPost(post.kind);
      await tx.slug.deleteMany({ where: { contentId: id, published: false } });
      if ("slug" in data && data.slug)
        await tx.slug.upsert({
          where: { kind_value: { kind: post.kind, value: data.slug } },
          create: { kind: post.kind, value: data.slug, contentId: id },
          update: {},
        });
      const draft = await createRevision(tx, id, post.kind, data);
      await tx.content.update({ where: { id }, data: { draftId: draft.id } });
      if (post.draftId)
        await tx.revision.delete({ where: { id: post.draftId } });
    } else {
      const state =
        action === "private"
          ? "PRIVATE"
          : action === "trash"
            ? "TRASH"
            : action === "restore" && post.state === "TRASH"
              ? post.publishedId
                ? "PRIVATE"
                : "DRAFT"
              : null;
      if (!state) fail(400, "지원하지 않는 상태 변경입니다.");
      await tx.content.update({ where: { id }, data: { state } });
    }
    await tx.cacheJob.create({ data: {} });
    return tx.content.findUniqueOrThrow({ where: { id }, include });
  });
}
export async function adminContent(id: string) {
  if (id === "home") return ensureHome();
  const content = await db.content.findUnique({ where: { id }, include });
  if (!content) fail(404, "콘텐츠가 없습니다.");
  return content;
}
