import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { HomeProfile } from "@/components/public/home-profile";
import { Markdown } from "@/components/public/markdown";
import { PostCard } from "@/components/public/card";
import type { HomeData } from "@/lib/schemas";
import type { PostSummary } from "@/lib/public-data";
import type { GithubActivity } from "@/lib/github";
import type { SectionLink } from "@/components/public/header";
export function sectionLinks(
  home: HomeData,
  projects: PostSummary[],
  blogs: PostSummary[],
): SectionLink[] {
  return [
    { id: "about", label: "About me", show: !!home.about },
    { id: "education", label: "Education", show: !!home.education.length },
    { id: "stack", label: "Stack", show: !!home.stack.length },
    { id: "experience", label: "Experience", show: !!home.experience.length },
    { id: "projects", label: "Projects", show: !!projects.length },
    { id: "blog", label: "Blog", show: !!blogs.length },
  ]
    .filter((s) => s.show)
    .map(({ id, label }) => ({ id, label }));
}
function Section({
  id,
  title,
  number,
  href,
  children,
}: {
  id: string;
  title: string;
  number: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="home-section">
      <div className="section-heading">
        <h2>
          <span className="section-number">{number}</span>
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-link small">
            전체 보기
            <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
export function HomeView({
  home,
  projects,
  blogs,
  activity,
}: {
  home: HomeData;
  projects: PostSummary[];
  blogs: PostSummary[];
  activity?: GithubActivity;
}) {
  if (!home.name)
    return (
      <div className="empty-home">
        <span className="eyebrow">PERSONAL PORTFOLIO</span>
        <h1>
          포트폴리오를
          <br />
          준비하고 있습니다<span className="accent">.</span>
        </h1>
        <p className="muted">
          프로젝트와 배움의 기록이 이곳에 담길 예정입니다.
        </p>
        <div className="empty-line" />
      </div>
    );
  return (
    <>
      <HomeProfile
        home={home}
        hasProjects={projects.length > 0}
        activity={activity}
      />
      {home.about && (
        <Section id="about" title="About me" number="01">
          <Markdown source={home.about} />
        </Section>
      )}
      {home.education.length > 0 && (
        <Section id="education" title="Education" number="02">
          <Timeline entries={home.education} />
        </Section>
      )}
      {home.stack.length > 0 && (
        <Section id="stack" title="Stack" number="03">
          <div className="stack-groups">
            {[...new Set(home.stack.map((t) => t.group))].map((group) => (
              <div className="stack-group" key={group}>
                <h3 className="eyebrow">{group || "TECHNOLOGIES"}</h3>
                <div className="stack-items">
                  {home.stack
                    .filter((t) => t.group === group)
                    .map((t) =>
                      t.url ? (
                        <a
                          className="stack-item"
                          href={t.url}
                          key={t.id}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="tech-monogram">
                            {t.name.slice(0, 2)}
                          </span>
                          {t.name}
                          <ArrowUpRight size={13} />
                        </a>
                      ) : (
                        <span className="stack-item" key={t.id}>
                          <span className="tech-monogram">
                            {t.name.slice(0, 2)}
                          </span>
                          {t.name}
                        </span>
                      ),
                    )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
      {home.experience.length > 0 && (
        <Section id="experience" title="Experience" number="04">
          <Timeline entries={home.experience} />
        </Section>
      )}
      {projects.length > 0 && (
        <Section id="projects" title="Projects" number="05" href="/projects">
          <div className="card-grid">
            {projects.map((p, i) => (
              <PostCard key={p.id} post={p} index={i} />
            ))}
          </div>
        </Section>
      )}
      {blogs.length > 0 && (
        <Section id="blog" title="Blog" number="06" href="/blog">
          <div className="blog-grid">
            {blogs.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
function Timeline({ entries }: { entries: HomeData["education"] }) {
  return (
    <div className="timeline">
      {entries.map((e) => (
        <article key={e.id} className="timeline-entry">
          <div className="timeline-period mono">{e.period}</div>
          <div className="timeline-content">
            <h3>{e.title}</h3>
            {e.subtitle && <p className="muted small">{e.subtitle}</p>}
            {e.description && <Markdown source={e.description} />}
          </div>
        </article>
      ))}
    </div>
  );
}
