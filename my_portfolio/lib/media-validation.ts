import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import ipaddr from "ipaddr.js";
import { fail } from "@/lib/errors";
export const IMAGE_LIMIT = 4_500_000;
const configuredPdfLimit = Number(process.env.RESUME_MAX_BYTES || 10_000_000);
export const PDF_LIMIT =
  Number.isSafeInteger(configuredPdfLimit) && configuredPdfLimit > 0
    ? configuredPdfLimit
    : 10_000_000;
export const allowedImages = ["image/jpeg", "image/png", "image/webp"];
export async function validateFile(bytes: Uint8Array, declaredMime: string) {
  const type = await fileTypeFromBuffer(bytes);
  if (
    !type ||
    type.mime !== declaredMime ||
    ![...allowedImages, "application/pdf"].includes(type.mime)
  )
    fail(400, "실제 파일 유형과 업로드 형식이 일치하지 않습니다.");
  if (
    bytes.length >
      (type.mime === "application/pdf" ? PDF_LIMIT : IMAGE_LIMIT) ||
    !bytes.length
  )
    fail(400, "파일 크기 제한을 초과했습니다.");
  if (type.mime.startsWith("image/")) {
    try {
      await sharp(bytes, {
        limitInputPixels: 40_000_000,
        animated: false,
      }).stats();
    } catch {
      fail(400, "손상되었거나 너무 큰 이미지입니다.");
    }
  }
  return type.mime;
}
export function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
