import { ImageResponse } from "next/og";
import { db } from "@/lib/prisma";
import { publicHome } from "@/lib/public-data";
import { postSchema } from "@/lib/schemas";
import { accessibleMedia, mediaBytes } from "@/lib/media";
import { errorResponse, fail } from "@/lib/errors";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    let title = "포트폴리오",
      summary = "프로젝트와 배움의 기록",
      imageId: string | null = null;
    if (id === "home") {
      const home = await publicHome();
      title = home.name ? `${home.name} · ${home.job}` : title;
      summary = home.intro || summary;
      imageId = home.photoId;
    } else {
      const post = await db.content.findFirst({
        where: { id, state: "PUBLISHED", kind: { in: ["BLOG", "PROJECT"] } },
        select: { published: { select: { data: true } } },
      });
      if (!post?.published) fail(404, "이미지가 없습니다.");
      const data = postSchema.parse(post.published.data);
      title = data.title;
      summary = data.summary;
      imageId = data.shareImageId || data.imageId;
    }
    if (imageId) {
      const media = await accessibleMedia(imageId, false);
      if (media) {
        const sharp = (await import("sharp")).default;
        const bytes = await sharp(await mediaBytes(media.pathname))
          .rotate()
          .resize(1200, 630, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toBuffer();
        return new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
          },
        });
      }
    }
    return new ImageResponse(
      <div
        style={{
          background: "#191b1a",
          color: "#edf0e9",
          width: "100%",
          height: "100%",
          padding: 72,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          border: "16px solid #343b35",
        }}
      >
        <div style={{ color: "#9fc9a8", fontSize: 22, letterSpacing: 5 }}>
          PORTFOLIO
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 60, fontWeight: 700 }}>
            {title.slice(0, 70)}
          </div>
          <div style={{ fontSize: 26, color: "#a3ada5" }}>
            {summary.slice(0, 150)}
          </div>
        </div>
        <div style={{ color: "#9fc9a8", fontSize: 30 }}>↗</div>
      </div>,
      { width: 1200, height: 630, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
