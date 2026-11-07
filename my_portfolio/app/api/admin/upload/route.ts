import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/prisma";
import { fail, errorResponse } from "@/lib/errors";
import { finalizeMedia } from "@/lib/media";
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, payload) => {
        await requireAdmin(request);
        const { id } = JSON.parse(payload || "{}");
        const media = await db.media.findFirst({
          where: { id, pathname, status: "PENDING" },
        });
        if (!media) fail(403, "업로드 권한이 없습니다.");
        return {
          allowedContentTypes: [media.mime],
          maximumSizeInBytes: media.size,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 5 * 60_000,
          tokenPayload: JSON.stringify({ id: media.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { id } = JSON.parse(tokenPayload || "{}");
        const media = await db.media.findFirst({
          where: { id, pathname: blob.pathname },
        });
        if (!media) fail(403, "유효하지 않은 업로드입니다.");
        await finalizeMedia(media.id);
      },
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
