import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  validateFile,
  IMAGE_LIMIT,
  isPublicAddress,
} from "../lib/media-validation";
import { mediaIds, homeSchema, safeHref, postSchema } from "../lib/schemas";
test("actual file format, decode and inclusive 4.5MB boundary", async () => {
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  assert.equal(await validateFile(png, "image/png"), "image/png");
  await assert.rejects(validateFile(png, "image/jpeg"));
  await assert.rejects(validateFile(Buffer.from("not an image"), "image/png"));
  const boundary = Buffer.alloc(IMAGE_LIMIT);
  png.copy(boundary);
  assert.equal(await validateFile(boundary, "image/png"), "image/png");
  await assert.rejects(
    validateFile(Buffer.concat([boundary, Buffer.from([0])]), "image/png"),
  );
});
test("SSRF private, loopback, link local and mapped IPv6 are rejected", () => {
  for (const ip of [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
});
test("nested home media references, URL safety and calendar dates", () => {
  const home = homeSchema.parse({
    about: "![a](/media/about-id)",
    education: [
      { id: "one", title: "Test", description: "![b](/media/nested-id)" },
    ],
  });
  assert.deepEqual(mediaIds(home), ["about-id", "nested-id"]);
  assert.equal(safeHref("javascript:alert(1)"), undefined);
  assert.equal(safeHref("//evil.test"), undefined);
  assert.equal(
    postSchema.safeParse({ startDate: "2026-02-31" }).success,
    false,
  );
});
