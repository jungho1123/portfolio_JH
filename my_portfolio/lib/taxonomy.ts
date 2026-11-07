import { db } from "@/lib/prisma";
import { serial } from "@/lib/content";
import { normalizeName, postSchema, type PostKind } from "@/lib/schemas";
import { fail } from "@/lib/errors";
import { Prisma } from "@/generated/prisma/client";
export async function createTaxon(
  kind: PostKind,
  type: "CATEGORY" | "TAG",
  raw: string,
) {
  const name = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) fail(400, "분류 이름은 1~80자여야 합니다.");
  return db.taxon.create({
    data: { kind, type, name, normalized: normalizeName(name) },
  });
}
export async function changeTaxon(
  id: string,
  action: string,
  name?: string,
  targetId?: string,
) {
  return serial(async (tx) => {
    const taxon = await tx.taxon.findUniqueOrThrow({
      where: { id },
      include: { uses: { include: { revision: true } } },
    });
    const affectedIds = [
      ...new Set(taxon.uses.map((u) => u.revision.contentId)),
    ];
    if (action === "rename") {
      const nextName = name?.normalize("NFKC").trim().replace(/\s+/g, " ");
      if (!nextName || nextName.length > 80)
        fail(400, "분류 이름은 1~80자여야 합니다.");
      await tx.taxon.update({
        where: { id },
        data: { name: nextName, normalized: normalizeName(nextName) },
      });
    } else if (action === "merge" || action === "delete") {
      const target = targetId
        ? await tx.taxon.findUnique({ where: { id: targetId } })
        : null;
      if (
        targetId &&
        (!target ||
          target.kind !== taxon.kind ||
          target.type !== taxon.type ||
          target.id === id)
      )
        fail(400, "같은 유형의 다른 분류를 선택하세요.");
      if (
        (action === "merge" ||
          (taxon.type === "CATEGORY" && taxon.uses.length > 0)) &&
        !target
      )
        fail(
          400,
          "사용 중인 카테고리의 재배정 대상 또는 병합 대상을 선택하세요.",
        );
      for (const use of taxon.uses) {
        const data = postSchema.parse(use.revision.data);
        if (data.categoryId === id) data.categoryId = target?.id ?? null;
        data.tagIds = [
          ...new Set(
            data.tagIds.flatMap((t) =>
              t === id ? (target ? [target.id] : []) : [t],
            ),
          ),
        ];
        await tx.revision.update({
          where: { id: use.revisionId },
          data: { data: data as unknown as Prisma.InputJsonValue },
        });
        await tx.revisionTaxon.delete({
          where: {
            revisionId_taxonId: { revisionId: use.revisionId, taxonId: id },
          },
        });
        if (target)
          await tx.revisionTaxon.upsert({
            where: {
              revisionId_taxonId: {
                revisionId: use.revisionId,
                taxonId: target.id,
              },
            },
            create: { revisionId: use.revisionId, taxonId: target.id },
            update: {},
          });
      }
      await tx.taxon.delete({ where: { id } });
    } else fail(400, "지원하지 않는 분류 작업입니다.");
    await tx.content.updateMany({
      where: { id: { in: affectedIds } },
      data: { revision: { increment: 1 } },
    });
    await tx.cacheJob.create({ data: {} });
    return { affected: affectedIds.length };
  });
}
