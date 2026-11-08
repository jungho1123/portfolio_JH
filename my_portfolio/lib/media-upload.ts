import { upload } from "@vercel/blob/client";
import { api } from "@/lib/admin-api";
import type { MediaItem } from "@/lib/admin-types";

export async function uploadFile(file: File) {
  const pending = await api<MediaItem>("/api/admin/media", "POST", {
    name: file.name,
    mime: file.type,
    size: file.size,
  });
  await upload(pending.pathname, file, {
    access: "private",
    contentType: file.type,
    handleUploadUrl: "/api/admin/upload",
    clientPayload: JSON.stringify({ id: pending.id }),
    multipart: file.size > 5_000_000,
  });
  return api<MediaItem>("/api/admin/media", "POST", {
    action: "verify",
    id: pending.id,
  });
}
