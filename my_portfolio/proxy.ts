import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/prisma";

// Status/address gate before streaming begins. Data loaders still check publication state.
export async function proxy(request: NextRequest) {
  const [, section, slug] = request.nextUrl.pathname.split("/");
  if (!slug) return NextResponse.next();
  const kind = section === "projects" ? "PROJECT" : "BLOG";
  try {
    const address = await db.slug.findUnique({
      where: { kind_value: { kind, value: decodeURIComponent(slug) } },
      select: {
        published: true,
        content: {
          select: { state: true, published: { select: { data: true } } },
        },
      },
    });
    if (
      !address?.published ||
      address.content.state !== "PUBLISHED" ||
      !address.content.published
    ) {
      return NextResponse.rewrite(
        new URL("/__portfolio_not_found", request.url),
        {
          status: 404,
          headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
        },
      );
    }
    const current = (address.content.published.data as { slug: string }).slug;
    if (current !== slug)
      return NextResponse.redirect(
        new URL(`/${section}/${current}`, request.url),
        308,
      );
    return NextResponse.next();
  } catch {
    return new NextResponse(
      "페이지를 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
      {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
export const config = { matcher: ["/projects/:slug", "/blog/:slug"] };
