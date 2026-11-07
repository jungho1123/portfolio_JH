import { APIError } from "better-auth/api";
export function assertGithubIdentity(
  id: unknown,
  allowed = process.env.ADMIN_GITHUB_ID,
) {
  if (!allowed || !/^\d+$/.test(allowed) || String(id) !== allowed)
    throw new APIError("FORBIDDEN", {
      message: "허용되지 않은 GitHub 계정입니다.",
    });
}
export function isAdminAccount(
  accounts: { providerId: string; accountId: string }[],
  allowed = process.env.ADMIN_GITHUB_ID,
) {
  return (
    !!allowed &&
    accounts.some((a) => a.providerId === "github" && a.accountId === allowed)
  );
}
