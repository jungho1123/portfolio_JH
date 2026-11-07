/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
import { SiGithub as Github } from "react-icons/si";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileText,
  Mail,
} from "lucide-react";
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
      <section id="profile" className="profile">
        <div className="profile-top">
          <span className="eyebrow">PERSONAL PORTFOLIO</span>
          <span className="profile-label mono">{home.job}</span>
        </div>
        <div className="profile-main">
          <div className="profile-copy">
            <p className="intro-label">안녕하세요,</p>
            <h1>
              {home.name}
              <span className="accent">.</span>
            </h1>
            <p className="profile-job">{home.job}</p>
            {home.intro && <p className="profile-intro">{home.intro}</p>}
          </div>
          <div className="avatar-frame">
            {home.photoId ? (
              <img
                src={`/media/${home.photoId}?w=320`}
                alt={`${home.name} 프로필`}
                width={144}
                height={144}
              />
            ) : (
              <span aria-hidden="true">{home.name.slice(0, 1)}</span>
            )}
            <span className="avatar-corner" />
          </div>
        </div>
        <div className="profile-bottom">
          <div className="profile-ctas">
            {projects.length > 0 && (
              <a href="#projects" className="button">
                프로젝트 보기
                <ArrowDownRight size={16} />
              </a>
            )}
            {home.resumeId && (
              <>
                <a
                  href="/resume"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button secondary"
                >
                  <FileText size={16} />
                  이력서 미리보기
                </a>
                <a
                  href="/resume?download"
                  className="icon-button"
                  aria-label="이력서 다운로드"
                >
                  <Download size={18} />
                </a>
              </>
            )}
          </div>
          <div className="social-links">
            {home.github && (
              <a
                href={`https://github.com/${home.github}`}
                target="_blank"
                rel="noopener noreferrer"
                className="icon-button"
                aria-label="GitHub 프로필"
              >
                <Github aria-hidden="true" size={19} />
              </a>
            )}
            {home.email && (
              <a
                href={`mailto:${home.email}`}
                className="icon-button"
                aria-label="이메일 보내기"
              >
                <Mail size={19} />
              </a>
            )}
            {home.links.map((l) => (
              <a
                key={l.label + l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link small"
              >
                {l.label}
                <ArrowUpRight size={14} />
              </a>
            ))}
          </div>
        </div>
        {home.github && (
          <div className="github-activity">
            <div className="activity-heading">
              <span className="small">
                <Github aria-hidden="true" size={15} />
                GitHub 공개 기여
              </span>
              <a
                href={`https://github.com/${home.github}`}
                className="text-link small"
                target="_blank"
                rel="noopener noreferrer"
              >
                @{home.github}
                <ArrowUpRight size={13} />
              </a>
            </div>
            {activity?.days.length ? (
              <>
                <div
                  className="contribution-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="최근 1년 GitHub 공개 기여 달력"
                >
                  <div className="contribution-grid">
                    {activity.days.map((d) => (
                      <span
                        key={d.date}
                        className={`contribution level-${d.count === 0 ? 0 : d.count < 3 ? 1 : d.count < 6 ? 2 : d.count < 10 ? 3 : 4}`}
                        title={`${d.date}: ${d.count}회`}
                        aria-label={`${d.date} 공개 기여 ${d.count}회`}
                      />
                    ))}
                  </div>
                </div>
                <p className="activity-note small muted">
                  최근 1년{" "}
                  {activity.days
                    .reduce((sum, d) => sum + d.count, 0)
                    .toLocaleString("ko-KR")}
                  회{activity.unavailable && " · 마지막 정상 조회 데이터"}
                </p>
              </>
            ) : (
              <p className="small muted">
                활동 정보를 준비 중입니다. GitHub에서 확인할 수 있습니다.
              </p>
            )}
          </div>
        )}
      </section>
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
