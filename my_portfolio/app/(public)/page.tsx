import { Suspense } from "react";
import { connection, after } from "next/server";
import { publicHome, homePosts } from "@/lib/public-data";
import { HomeView } from "@/components/public/home";
import { githubActivity, refreshGithub } from "@/lib/github";
import type { Metadata } from "next";
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const h = await publicHome();
  return {
    title: h.name ? `${h.name} · ${h.job}` : "포트폴리오",
    description: h.intro || "프로젝트와 배움의 기록",
    alternates: { canonical: "/" },
    openGraph: {
      title: h.name ? `${h.name} · ${h.job}` : "포트폴리오",
      description: h.intro || "프로젝트와 배움의 기록",
      images: ["/og/home"],
    },
  };
}
async function HomeContent() {
  await connection();
  const home = await publicHome();
  const posts = await homePosts(home);
  const activity = home.github ? await githubActivity(home.github) : undefined;
  if (home.github) after(() => refreshGithub(home.github));
  return <HomeView home={home} {...posts} activity={activity} />;
}
export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="muted" role="status">
          포트폴리오를 불러오는 중입니다…
        </p>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
