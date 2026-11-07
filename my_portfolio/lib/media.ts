import { db } from "@/lib/prisma";
import { get, put, del } from "@vercel/blob";
import { fail } from "@/lib/errors";
import {
  validateFile,
  allowedImages,
  IMAGE_LIMIT,
  PDF_LIMIT,
  isPublicAddress,
} from "@/lib/media-validation";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request, Agent } from "undici";
import { serial } from "@/lib/content";
export async function pendingMedia(name: string, mime: string, size: number) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  const extensions: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "application/pdf": ["pdf"],
  };
  if (!extensions[mime]?.includes(extension || ""))
    fail(400, "파일 확장자와 형식이 일치해야 합니다.");
  if (
    ![...allowedImages, "application/pdf"].includes(mime) ||
    size <= 0 ||
    size > (mime === "application/pdf" ? PDF_LIMIT : IMAGE_LIMIT)
  )
    fail(
      400,
      "JPEG·PNG·WebP(4.5MB 이하) 또는 제한 내 PDF만 업로드할 수 있습니다.",
    );
  return db.media.create({
    data: {
      pathname: `portfolio/${randomUUID()}`,
      name: name.slice(0, 200),
      mime,
      size,
    },
  });
}
export async function mediaBytes(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || !result.stream) fail(404, "파일을 찾을 수 없습니다.");
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > Math.max(PDF_LIMIT, IMAGE_LIMIT))
        fail(400, "파일 크기 제한을 초과했습니다.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export async function finalizeMedia(id: string) {
  const media = await db.media.findUniqueOrThrow({ where: { id } });
  if (media.status === "READY") return media;
  try {
    const bytes = await mediaBytes(media.pathname);
    await validateFile(bytes, media.mime);
    if (bytes.length !== media.size)
      fail(400, "업로드된 파일 크기가 일치하지 않습니다.");
    return await db.media.update({ where: { id }, data: { status: "READY" } });
  } catch (error) {
    await db.media.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED" },
    });
    await del(media.pathname).catch(() => {});
    throw error;
  }
}
export async function deleteMedia(id: string) {
  const media = await serial(async (tx) => {
    const media = await tx.media.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { uses: true } } },
    });
    if (media._count.uses)
      fail(409, "공개본 또는 초안에서 사용 중인 파일은 삭제할 수 없습니다.");
    return tx.media.update({ where: { id }, data: { status: "DELETING" } });
  });
  await del(media.pathname);
  await db.media.delete({ where: { id } });
}
export async function accessibleMedia(id: string, admin: boolean) {
  return db.media.findFirst({
    where: {
      id,
      status: "READY",
      ...(admin
        ? {}
        : {
            uses: { some: { revision: { publicOf: { state: "PUBLISHED" } } } },
          }),
    },
  });
}
export async function importImage(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail(400, "올바른 HTTPS 이미지 주소를 입력하세요.");
  }
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      fail(400, "일반 HTTPS 이미지 주소만 허용합니다.");
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some((r) => !isPublicAddress(r.address)))
      fail(400, "내부 네트워크 주소는 가져올 수 없습니다.");
    const record = records[0];
    const agent = new Agent({
      connect: {
        autoSelectFamily: false,
        lookup: (_hostname, _options, callback) =>
          callback(null, record.address, record.family),
      },
    });
    try {
      const response = await request(url, {
        dispatcher: agent,
        headersTimeout: 10000,
        bodyTimeout: 10000,
        signal: AbortSignal.timeout(15000),
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.body.destroy();
        if (!response.headers.location || redirects === 3)
          fail(400, "리다이렉트가 너무 많거나 잘못되었습니다.");
        url = new URL(String(response.headers.location), url);
        continue;
      }
      if (response.statusCode !== 200) {
        response.body.destroy();
        fail(400, "이미지를 가져오지 못했습니다. 직접 업로드하세요.");
      }
      if (Number(response.headers["content-length"]) > IMAGE_LIMIT) {
        response.body.destroy();
        fail(400, "이미지 크기는 최대 4.5MB입니다.");
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > IMAGE_LIMIT) {
          response.body.destroy();
          fail(400, "이미지 크기는 최대 4.5MB입니다.");
        }
        chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);
      const { fileTypeFromBuffer } = await import("file-type");
      const type = await fileTypeFromBuffer(bytes);
      if (!type || !allowedImages.includes(type.mime))
        fail(400, "지원하지 않는 이미지입니다.");
      await validateFile(bytes, type.mime);
      const importedName = decodeURIComponent(
        url.pathname.split("/").at(-1) || "imported-image",
      )
        .slice(0, 180)
        .replace(/\.[^.]+$/, "");
      const media = await pendingMedia(
        `${importedName}.${type.ext}`,
        type.mime,
        bytes.length,
      );
      await put(media.pathname, bytes, {
        access: "private",
        contentType: type.mime,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
      return db.media.update({
        where: { id: media.id },
        data: { status: "READY" },
      });
    } finally {
      await agent.close();
    }
  }
  fail(400, "이미지 가져오기에 실패했습니다.");
}
