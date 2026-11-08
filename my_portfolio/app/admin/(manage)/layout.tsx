import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { AdminNav } from "@/components/admin/nav";
async function Protected(props: { children: React.ReactNode }) {
  if (!(await currentAdmin())) redirect("/admin?expired=1");
  return (
    <>
      <AdminNav />
      {props.children}
    </>
  );
}
export default function Layout(props: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p role="status">권한을 확인하는 중…</p>}>
      <Protected>{props.children}</Protected>
    </Suspense>
  );
}

export const instant = false;
