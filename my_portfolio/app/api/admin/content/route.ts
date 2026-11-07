import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/prisma";
import { createPost } from "@/lib/content";
import { kindSchema } from "@/lib/schemas";
import { errorResponse } from "@/lib/errors";
import { flushPublicCache } from "@/lib/cache";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    await flushPublicCache();
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind");
    const state = params.get("state");
    const q = params.get("q")?.slice(0, 100);
    const items = await db.content.findMany({
      where: {
        kind: kind ? kindSchema.parse(kind) : { in: ["BLOG", "PROJECT"] },
        ...(state
          ? {
              state: z
                .enum(["DRAFT", "PUBLISHED", "PRIVATE", "TRASH"])
                .parse(state),
            }
          : {}),
        ...(q
          ? {
              OR: [
                {
                  draft: {
                    data: {
                      path: ["title"],
                      string_contains: q,
                      mode: "insensitive",
                    },
                  },
                },
                {
                  published: {
                    data: {
                      path: ["title"],
                      string_contains: q,
                      mode: "insensitive",
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: { draft: true, published: true },
      orderBy: { updatedAt: "desc" },
    });
    return Response.json(items, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const { kind } = await request.json();
    return Response.json(await createPost(kindSchema.parse(kind)), {
      status: 201,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
