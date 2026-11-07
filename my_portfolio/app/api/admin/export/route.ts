import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/prisma";
import { get } from "@vercel/blob";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { errorResponse } from "@/lib/errors";
export const maxDuration = 300;
export async function GET() {
  try {
    await requireAdmin();
    const manifest = await db.$transaction(
      async (tx) => ({
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        contents: await tx.content.findMany({
          include: {
            versions: { include: { media: true, taxonomies: true } },
            slugs: true,
          },
        }),
        taxonomies: await tx.taxon.findMany(),
        media: await tx.media.findMany({ where: { status: "READY" } }),
      }),
      { isolationLevel: "RepeatableRead" },
    );
    const archive = new ZipArchive({ zlib: { level: 5 } });
    archive.on("error", () => archive.destroy());
    archive.append(JSON.stringify(manifest, null, 2), {
      name: "manifest.json",
    });
    for (const content of manifest.contents)
      for (const revision of content.versions) {
        const data = revision.data as Record<string, unknown>;
        const slot =
          revision.id === content.publishedId ? "published" : "draft";
        archive.append(String(data.markdown ?? data.about ?? ""), {
          name: `content/${content.kind}/${content.id}/${slot}.md`,
        });
      }
    const stream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;
    for (const media of manifest.media) {
      const safeName = media.name.replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
      archive.append(
        Readable.from(
          (async function* () {
            const result = await get(media.pathname, { access: "private" });
            if (!result?.stream) throw new Error("Missing export file");
            for await (const chunk of Readable.fromWeb(
              result.stream as import("node:stream/web").ReadableStream,
            ))
              yield chunk;
          })(),
        ),
        { name: `files/${media.id}/${safeName}` },
      );
    }
    void archive.finalize().catch((error) => archive.destroy(error));
    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="portfolio-${new Date().toISOString().slice(0, 10)}.zip"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
