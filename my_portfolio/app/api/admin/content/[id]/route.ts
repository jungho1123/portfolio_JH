import { requireAdmin } from "@/lib/admin";
import {
  adminContent,
  saveDraft,
  publishContent,
  transitionContent,
} from "@/lib/content";
import { flushPublicCache } from "@/lib/cache";
import { errorResponse } from "@/lib/errors";
import { z } from "zod";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    return Response.json(await adminContent((await context.params).id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request);
    const { revision, data } = await request.json();
    return Response.json(
      await saveDraft(
        (await context.params).id,
        z.number().int().min(0).parse(revision),
        data,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request);
    const { revision, action } = await request.json();
    const id = (await context.params).id;
    const expected = z.number().int().min(0).parse(revision);
    const result =
      action === "publish"
        ? await publishContent(id, expected)
        : await transitionContent(
            id,
            expected,
            z
              .enum(["private", "trash", "restore", "discard", "delete"])
              .parse(action),
          );
    try {
      await flushPublicCache();
    } catch {
      return Response.json(
        {
          error:
            "데이터는 반영되었으나 캐시 갱신이 완료되지 않았습니다. 서버 상태를 새로 조회하고 캐시 갱신을 재시도하세요.",
          code: "CACHE_PENDING",
          content: result,
        },
        { status: 503 },
      );
    }
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
