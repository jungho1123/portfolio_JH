import { Suspense } from "react";
import type { Metadata } from "next";
import { ListPage, type Search } from "@/components/public/pages";
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Search;
}): Promise<Metadata> {
  const p = await searchParams;
  return {
    title: "프로젝트",
    alternates: { canonical: "/projects" + (p.page ? `?page=${p.page}` : "") },
    robots: { index: !p.sort && !p.category && !p.tag },
  };
}
export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<p role="status">목록을 불러오는 중…</p>}>
      <ListPage kind="PROJECT" searchParams={searchParams} />
    </Suspense>
  );
}
