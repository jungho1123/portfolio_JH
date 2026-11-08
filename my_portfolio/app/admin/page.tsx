import { Suspense } from "react";
import { currentAdmin } from "@/lib/admin";
import { Login } from "@/components/admin/auth-controls";
import { Dashboard } from "@/components/admin/dashboard";
import { AdminNav } from "@/components/admin/nav";
async function AdminHome(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await currentAdmin();
  const params = await props.searchParams;
  if (!admin)
    return (
      <>
        {params.login === "failed" && (
          <p className="notice error-notice" role="alert">
            GitHub 로그인이 거절되었거나 실패했습니다. 등록된 계정과 OAuth
            설정을 확인하세요.
          </p>
        )}
        {params.expired && (
          <p className="notice" role="status">
            세션이 만료되었습니다. 다시 로그인한 뒤 편집 창에서 저장을
            재시도하세요.
          </p>
        )}
        {params.logout === "done" && (
          <p className="notice" role="status">
            로그아웃했습니다.
          </p>
        )}
        <Login />
      </>
    );
  return (
    <>
      <AdminNav />
      <Dashboard />
    </>
  );
}
export default function AdminPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <Suspense fallback={<p role="status">관리자 상태를 확인하는 중…</p>}>
      <AdminHome searchParams={props.searchParams} />
    </Suspense>
  );
}

export const instant = false;
