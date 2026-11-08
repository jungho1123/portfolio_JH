import { Suspense } from "react";
import { connection } from "next/server";
import { publicHome, homePosts } from "@/lib/public-data";
import { sectionLinks } from "@/components/public/home";
import { Header } from "@/components/public/header";
import { BackToTop } from "@/components/public/actions";
async function Navigation() {
  await connection();
  const home = await publicHome();
  const { projects, blogs } = await homePosts(home);
  return (
    <Header name={home.name} sections={sectionLinks(home, projects, blogs)} />
  );
}
export default function PublicLayout(props: { children: React.ReactNode }) {
  return (
    <>
      <Suspense
        fallback={
          <header className="site-header" aria-busy="true">
            <div className="header-inner">
              <span className="wordmark">PORTFOLIO</span>
            </div>
          </header>
        }
      >
        <Navigation />
      </Suspense>
      <main id="main" className="site-main">
        {props.children}
      </main>
      <footer className="site-footer">
        <span>프로젝트와 배움의 기록.</span>
        <a href="#main" className="mono">
          BACK TO TOP ↑
        </a>
      </footer>
      <BackToTop />
    </>
  );
}
