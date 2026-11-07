import { APIError } from "better-auth/api";

type IdentityFailure =
  | "ADMIN_GITHUB_ID_MISSING"
  | "ADMIN_GITHUB_ID_INVALID"
  | "GITHUB_ACCOUNT_NOT_ALLOWED";

function configuredGithubId(allowed: string | undefined) {
  const value = allowed?.trim();
  return value && /^\d+$/.test(value) ? value : null;
}

function rejectIdentity(
  code: IdentityFailure,
  message: string,
  id: unknown,
  allowed: string | undefined,
): never {
  // Deliberately omit names, emails, tokens, OAuth codes/state and full account IDs.
  const received =
    typeof id === "string" || typeof id === "number" ? String(id) : "";
  const configured = allowed?.trim() || "";
  console.warn("[portfolio-auth] github_identity_rejected", {
    code,
    configuredIdPresent: !!configured,
    configuredIdValid: /^\d+$/.test(configured),
    configuredIdSuffix: /^\d+$/.test(configured)
      ? configured.slice(-4).padStart(4, "*")
      : null,
    authenticatedIdSuffix: /^\d+$/.test(received)
      ? received.slice(-4).padStart(4, "*")
      : null,
    deploymentEnvironment: process.env.VERCEL_ENV || "local",
    deploymentHost: process.env.VERCEL_URL || null,
  });
  throw new APIError("FORBIDDEN", { code, message });
}

export function assertGithubIdentity(
  id: unknown,
  allowed = process.env.ADMIN_GITHUB_ID,
) {
  if (!allowed?.trim()) {
    rejectIdentity(
      "ADMIN_GITHUB_ID_MISSING",
      "이 배포 환경에 ADMIN_GITHUB_ID가 설정되지 않았습니다. 로그인 중인 배포의 Production/Preview 환경 설정을 확인하세요.",
      id,
      allowed,
    );
  }
  const expected = configuredGithubId(allowed);
  if (!expected) {
    rejectIdentity(
      "ADMIN_GITHUB_ID_INVALID",
      "ADMIN_GITHUB_ID 형식이 올바르지 않습니다. GitHub 사용자 고유 ID의 숫자만 입력하세요.",
      id,
      allowed,
    );
  }
  if (String(id) !== expected) {
    rejectIdentity(
      "GITHUB_ACCOUNT_NOT_ALLOWED",
      "GitHub 인증 계정의 고유 ID가 등록된 관리자 ID와 일치하지 않습니다. 브라우저의 GitHub 로그인 계정과 해당 배포의 ADMIN_GITHUB_ID를 확인하세요.",
      id,
      allowed,
    );
  }
}

export function isAdminAccount(
  accounts: { providerId: string; accountId: string }[],
  allowed = process.env.ADMIN_GITHUB_ID,
) {
  const expected = configuredGithubId(allowed);
  return (
    !!expected &&
    accounts.some((a) => a.providerId === "github" && a.accountId === expected)
  );
}
