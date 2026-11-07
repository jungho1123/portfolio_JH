import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/prisma";
import {
  pendingMedia,
  finalizeMedia,
  deleteMedia,
  importImage,
} from "@/lib/media";
import { errorResponse } from "@/lib/errors";
import { z } from "zod";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(
      await db.media.findMany({
        include: {
          uses: {
            select: {
              revision: {
                select: {
                  contentId: true,
                  draftOf: { select: { id: true } },
                  publicOf: { select: { id: true, state: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const input = await request.json();
    if (input.action === "import")
      return Response.json(
        await importImage(z.string().max(2048).parse(input.url)),
      );
    if (input.action === "verify")
      return Response.json(await finalizeMedia(z.string().parse(input.id)));
    const body = z
      .object({
        name: z.string().min(1).max(200),
        mime: z.string(),
        size: z.number().int().positive(),
      })
      .parse(input);
    return Response.json(await pendingMedia(body.name, body.mime, body.size));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const { id, name, alt } = z
      .object({
        id: z.string(),
        name: z.string().min(1).max(200),
        alt: z.string().max(500),
      })
      .parse(await request.json());
    return Response.json(
      await db.media.update({ where: { id }, data: { name, alt } }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const { id } = z.object({ id: z.string() }).parse(await request.json());
    await deleteMedia(id);
    return Response.json({ deleted: true });
  } catch (e) {
    return errorResponse(e);
  }
}
