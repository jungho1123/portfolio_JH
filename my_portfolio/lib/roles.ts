import type { UserRole } from "@/generated/prisma/enums";

export type Role = "GUEST" | UserRole;

export function getRole(
  session: { user: { role: UserRole } } | null | undefined,
): Role {
  return session?.user.role ?? "GUEST";
}
