/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
import { SiGithub as Github } from "react-icons/si";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileText,
  Mail,
} from "lucide-react";
import type { HomeData } from "@/lib/schemas";
import type { GithubActivity } from "@/lib/github";

type Profile = Pick<
  HomeData,
  | "name"
  | "job"
  | "intro"
  | "photoId"
  | "resumeId"
  | "github"
  | "email"
  | "links"
>;
export function HomeProfile({
  home,
  hasProjects,
  activity,
}: {
  home: Profile;
  hasProjects: boolean;
  activity?: GithubActivity;
}) {
  return (
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
          {hasProjects && (
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
        <GithubActivityView username={home.github} activity={activity} />
      )}
    </section>
  );
}
function GithubActivityView({
  username,
  activity,
}: {
  username: string;
  activity?: GithubActivity;
}) {
  return (
    <div className="github-activity">
      <div className="activity-heading">
        <span className="small">
          <Github aria-hidden="true" size={15} />
          GitHub 공개 기여
        </span>
        <a
          href={`https://github.com/${username}`}
          className="text-link small"
          target="_blank"
          rel="noopener noreferrer"
        >
          @{username}
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
  );
}
