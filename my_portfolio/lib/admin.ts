import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { isAdminAccount } from "@/lib/auth-policy";
import { fail } from "@/lib/errors";
export async function currentAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const accounts = await db.account.findMany({
    where: { userId: session.user.id },
  });
  return isAdminAccount(accounts) ? session.user : null;
}
export async function requireAdmin(request?: Request) {
  if (request && !["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const expected = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
    if (origin !== expected) fail(403, "허용되지 않은 요청 출처입니다.");
  }
  const admin = await currentAdmin();
  if (!admin)
    fail(
      401,
      "로그인이 만료되었습니다. 편집 내용은 기기에 보존됩니다. 새 창에서 다시 로그인하세요.",
      "SESSION_EXPIRED",
    );
  return admin;
}
