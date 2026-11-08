import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { adminContent } from "@/lib/content";
import { homePosts } from "@/lib/public-data";
import { homeSchema, postSchema } from "@/lib/schemas";
import { HomeView } from "@/components/public/home";
import { DetailView } from "@/components/public/detail-view";
import { db } from "@/lib/prisma";
async function Preview({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) redirect("/admin?expired=1");
  const content = await adminContent((await params).id);
  const data = content.draft!.data;
  if (content.kind === "HOME") {
    const home = homeSchema.parse(data);
    return (
      <>
        <p className="notice">
          관리자 전용 홈 초안 미리보기 · 공개 화면에 반영되지 않았습니다.
        </p>
        <div className="preview-frame">
          <HomeView home={home} {...await homePosts(home)} />
        </div>
      </>
    );
  }
  const post = postSchema.parse(data);
  const taxons = await db.taxon.findMany({
    where: {
      id: {
        in: [post.categoryId, ...post.tagIds].filter(
          (id): id is string => !!id,
        ),
      },
    },
  });
  return (
    <>
      <p className="notice">
        관리자 전용 초안 미리보기 · 게시 전 날짜는 미리보기 시점입니다.
      </p>
      <div className="preview-frame">
        <DetailView
          base={content.kind === "PROJECT" ? "/projects" : "/blog"}
          post={{
            id: content.id,
            kind: content.kind,
            data: post,
            createdAt: content.createdAt.toISOString(),
            firstPublishedAt: (
              content.firstPublishedAt || new Date()
            ).toISOString(),
            lastPublishedAt: (
              content.lastPublishedAt || new Date()
            ).toISOString(),
            category: taxons.find((t) => t.id === post.categoryId) || null,
            tags: taxons.filter((t) => post.tagIds.includes(t.id)),
          }}
        />
      </div>
    </>
  );
}
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p role="status">미리보기를 준비하는 중…</p>}>
      <Preview params={params} />
    </Suspense>
  );
}

export const instant = false;
