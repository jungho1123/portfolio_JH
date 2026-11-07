"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, House, Tags, Images, Download } from "lucide-react";
export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="관리 메뉴">
      {[
        { href: "/admin", label: "콘텐츠", Icon: LayoutDashboard },
        { href: "/admin/edit/home", label: "홈 편집", Icon: House },
        { href: "/admin/taxonomy", label: "카테고리·태그", Icon: Tags },
        { href: "/admin/media", label: "미디어", Icon: Images },
      ].map(({ href, label, Icon }) => (
        <Link className={path === href ? "active" : ""} key={href} href={href}>
          <Icon size={15} />
          {label}
        </Link>
      ))}
      <a href="/api/admin/export">
        <Download size={15} />
        전체 내보내기
      </a>
    </nav>
  );
}
