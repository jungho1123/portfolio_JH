import { currentAdmin } from "@/lib/admin";
import { accessibleMedia, mediaBytes } from "@/lib/media";
import { get } from "@vercel/blob";
import sharp from "sharp";
import { errorResponse, fail } from "@/lib/errors";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    // A public request needs no auth initialization; only fall back to session for nonpublic files.
    let media = await accessibleMedia(id, false);
    if (!media && (await currentAdmin()))
      media = await accessibleMedia(id, true);
    if (!media) fail(404, "파일을 찾을 수 없습니다.");
    const params = new URL(request.url).searchParams;
    const width = Number(params.get("w"));
    const headers = {
      "Content-Type": media.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${params.has("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(media.name)}`,
    };
    if (width && media.mime.startsWith("image/")) {
      const bytes = await mediaBytes(media.pathname);
      const output = await sharp(bytes)
        .rotate()
        .resize({
          width: Math.max(32, Math.min(1600, width)),
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
      return new Response(new Uint8Array(output), {
        headers: { ...headers, "Content-Type": "image/webp" },
      });
    }
    const result = await get(media.pathname, { access: "private" });
    if (!result?.stream) fail(404, "파일을 찾을 수 없습니다.");
    return new Response(result.stream, { headers });
  } catch (e) {
    return errorResponse(e);
  }
}
