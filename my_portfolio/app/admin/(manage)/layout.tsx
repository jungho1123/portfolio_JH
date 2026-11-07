import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { AdminNav } from "@/components/admin/nav";
async function Protected({ children }: { children: React.ReactNode }) {
  if (!(await currentAdmin())) redirect("/admin?expired=1");
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p role="status">권한을 확인하는 중…</p>}>
      <Protected>{children}</Protected>
    </Suspense>
  );
}

export const instant = false;
