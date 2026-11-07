import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/prisma";
import { createTaxon, changeTaxon } from "@/lib/taxonomy";
import { kindSchema } from "@/lib/schemas";
import { errorResponse } from "@/lib/errors";
import { flushPublicCache } from "@/lib/cache";
import { z } from "zod";
export async function GET() {
  try {
    await requireAdmin();
    const taxons = await db.taxon.findMany({
      include: {
        uses: { select: { revision: { select: { contentId: true } } } },
      },
      orderBy: { name: "asc" },
    });
    return Response.json(
      taxons.map((t) => ({
        id: t.id,
        kind: t.kind,
        type: t.type,
        name: t.name,
        count: new Set(t.uses.map((u) => u.revision.contentId)).size,
      })),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const { kind, type, name } = await request.json();
    return Response.json(
      await createTaxon(
        kindSchema.parse(kind),
        z.enum(["CATEGORY", "TAG"]).parse(type),
        z.string().parse(name),
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const { id, action, name, targetId } = await request.json();
    const result = await changeTaxon(
      z.string().parse(id),
      z.string().parse(action),
      name,
      targetId,
    );
    await flushPublicCache();
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
