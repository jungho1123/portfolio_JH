import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  generateClientTokenFromReadWriteToken,
  put,
} from "@vercel/blob/client";
import { get, del } from "@vercel/blob";
nextEnv.loadEnvConfig(process.cwd());
const pathname = `portfolio-verification/${randomUUID()}.png`;
let created = false;
try {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#317354" },
  })
    .png()
    .toBuffer();
  const bytes = Buffer.alloc(4_500_000);
  png.copy(bytes);
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    maximumSizeInBytes: bytes.length,
    allowedContentTypes: ["image/png"],
    addRandomSuffix: false,
    allowOverwrite: false,
    validUntil: Date.now() + 60_000,
  });
  const blob = await put(pathname, bytes, {
    access: "private",
    token,
    contentType: "image/png",
  });
  created = true;
  const anonymous = await fetch(blob.url, { redirect: "manual" });
  if (anonymous.ok) throw new Error("Anonymous access unexpectedly succeeded");
  const authenticated = await get(pathname, {
    access: "private",
    useCache: false,
  });
  if (!authenticated?.stream) throw new Error("Private read failed");
  const received = await new Response(authenticated.stream).arrayBuffer();
  if (received.byteLength !== bytes.length) throw new Error("Size mismatch");
  console.log(
    "Private Blob: 4.5MB client-token direct upload, authenticated read and anonymous denial passed.",
  );
} catch (error) {
  console.error(
    "Storage verification failed:",
    error instanceof Error
      ? error.message.replace(/vercel_blob_[A-Za-z0-9_]+/g, "[redacted]")
      : "unknown",
  );
  process.exitCode = 1;
} finally {
  if (created) {
    await del(pathname);
    console.log("Temporary verification object deleted.");
  }
}
