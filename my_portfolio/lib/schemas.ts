import { z } from "zod";

export const kindSchema = z.enum(["BLOG", "PROJECT"]);
export type PostKind = z.infer<typeof kindSchema>;
export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (s) =>
      !s ||
      (/^https?:\/\//i.test(s) &&
        (() => {
          try {
            const u = new URL(s);
            return !u.username && !u.password;
          } catch {
            return false;
          }
        })()),
    "http(s) 주소를 입력하세요",
  );
const text = z.string().max(500);
const imageId = z.string().max(100).nullable().default(null);
const entry = z.object({
  id: z.string().min(1),
  title: text,
  subtitle: text.default(""),
  period: text.default(""),
  description: z.string().max(10000).default(""),
});
const tech = z.object({
  id: z.string().min(1),
  name: text,
  group: text.default(""),
  url: httpUrl.default(""),
});
export const homeSchema = z.object({
  name: text.default(""),
  job: text.default(""),
  intro: z.string().max(2000).default(""),
  photoId: imageId,
  email: z.union([z.literal(""), z.email()]).default(""),
  github: z
    .string()
    .regex(/^$|^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/)
    .default(""),
  links: z
    .array(z.object({ label: text, url: httpUrl }))
    .max(20)
    .default([]),
  resumeId: imageId,
  about: z.string().max(50000).default(""),
  education: z.array(entry).max(100).default([]),
  experience: z.array(entry).max(100).default([]),
  stack: z.array(tech).max(300).default([]),
  featuredIds: z.array(z.string()).max(50).default([]),
  projectCount: z.number().int().min(0).max(50).default(3),
  blogCount: z.number().int().min(0).max(50).default(3),
});
export type HomeData = z.infer<typeof homeSchema>;
const date = z
  .string()
  .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !s ||
      (!isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s),
    "올바른 날짜를 입력하세요",
  );
export const postSchema = z
  .object({
    title: text.default(""),
    slug: z
      .string()
      .max(160)
      .regex(
        /^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "영문 소문자·숫자·하이픈만 사용하세요",
      )
      .default(""),
    summary: z.string().max(2000).default(""),
    markdown: z.string().max(500000).default(""),
    imageId,
    imageAlt: text.default(""),
    imagePosition: z.number().min(0).max(100).default(50),
    shareImageId: imageId,
    categoryId: z.string().max(100).nullable().default(null),
    tagIds: z.array(z.string()).max(50).default([]),
    startDate: date.default(""),
    endDate: date.default(""),
    progress: z.enum(["진행 중", "완료", "보관"]).default("진행 중"),
    teamType: z.enum(["개인", "팀"]).default("개인"),
    role: text.default(""),
    teamSize: z.number().int().min(1).max(1000).default(1),
    technologyIds: z.array(z.string()).max(100).default([]),
    technologies: z.array(tech).max(100).default([]),
    githubUrl: httpUrl.default(""),
    serviceUrl: httpUrl.default(""),
    demoUrl: httpUrl.default(""),
  })
  .refine(
    (d) => !d.startDate || !d.endDate || d.startDate <= d.endDate,
    "종료일은 시작일 이후여야 합니다",
  );
export type PostData = z.infer<typeof postSchema>;
export const PROJECT_TEMPLATE =
  "## 문제\n\n\n## 담당 역할\n\n\n## 구현 내용\n\n\n## 어려웠던 점과 해결\n\n\n## 결과\n\n";
export function emptyPost(kind: PostKind) {
  return postSchema.parse({
    markdown: kind === "PROJECT" ? PROJECT_TEMPLATE : "",
  });
}
export const emptyHome = () => homeSchema.parse({});
export function normalizeName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}
export function mediaIds(data: PostData | HomeData) {
  const ids = new Set<string>();
  for (const [key, value] of Object.entries(data))
    if (
      ["imageId", "photoId", "resumeId", "shareImageId"].includes(key) &&
      typeof value === "string"
    )
      ids.add(value);
  const markdown =
    "markdown" in data
      ? data.markdown
      : [
          data.about,
          ...data.education.map((e) => e.description),
          ...data.experience.map((e) => e.description),
        ].join("\n");
  for (const m of markdown.matchAll(/\/media\/([a-zA-Z0-9_-]+)/g))
    ids.add(m[1]);
  return [...ids];
}
export function parseContent(kind: string, data: unknown) {
  return kind === "HOME" ? homeSchema.parse(data) : postSchema.parse(data);
}
export function readingMinutes(markdown: string) {
  return Math.max(
    1,
    Math.ceil(
      markdown.replace(/```[\s\S]*?```/g, "").replace(/[#*_`>\[\]()]/g, "")
        .length / 500,
    ),
  );
}
export function formatDate(value: string | Date | null) {
  return value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value))
    : "";
}
export function safeHref(value?: string) {
  return value &&
    (/^https?:\/\//i.test(value) ||
      /^mailto:[^\s]+$/i.test(value) ||
      /^\/(?!\/)/.test(value) ||
      value.startsWith("#"))
    ? value
    : undefined;
}
