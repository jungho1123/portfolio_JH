import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ThemeSwitch } from "@/components/ui/theme";
import { Logout } from "@/components/admin/auth-controls";
import { currentAdmin } from "@/lib/admin";
import "./admin.css";
export const metadata: Metadata = {
  title: "관리자",
  robots: { index: false, follow: false },
};
async function AccountControls() {
  const admin = await currentAdmin();
  return admin ? (
    <>
      <span className="small muted">{admin.name}</span>
      <Logout />
    </>
  ) : null;
}
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="site-header">
        <div className="admin-header-inner">
          <Link href="/admin" className="wordmark">
            PORTFOLIO <span className="admin-badge">STUDIO</span>
          </Link>
          <div className="header-actions">
            <Link href="/" className="text-link small">
              사이트 보기 ↗
            </Link>
            <ThemeSwitch />
            <Suspense>
              <AccountControls />
            </Suspense>
          </div>
        </div>
      </header>
      <main id="main" className="admin-main">
        {children}
      </main>
    </>
  );
}

// Authenticated redirects need request-time UI rather than instant-navigation validation.
export const instant = false;
