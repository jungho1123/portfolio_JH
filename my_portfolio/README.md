# 개인 포트폴리오

한국어 포트폴리오·프로젝트·블로그와 GitHub 단일 관리자용 콘텐츠 관리 시스템입니다. [요구사항](Requirements.md)을 기준으로 공개본과 수정 초안을 분리합니다. 실제 이름·경력·프로젝트·이력서는 기본으로 등록하지 않습니다.

## 실행

Node.js 22.19 이상과 `package.json`에 고정된 pnpm을 사용합니다.

```bash
pnpm install
cp .env.example .env.local  # 기존 .env.local이 있다면 덮어쓰지 마세요.
pnpm db:generate
pnpm db:deploy
pnpm dev
```

DB·GitHub·비공개 Blob 설정은 [배포 안내](docs/deployment.md)를 참고하세요. 공개 화면은 `/`, 관리자는 `/admin`입니다. 인증·DB를 우회하는 운영용 데모 모드는 없습니다. 처음에는 빈 공개 화면을 표시하며, 관리자에서 콘텐츠를 작성하고 게시해야 표시됩니다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Linux에서 브라우저 공유 라이브러리가 없다면 `pnpm exec playwright install-deps chromium`으로 준비해야 합니다.

DB 통합 테스트와 E2E는 Docker의 `postgres:17`로 **별도 임시 DB**를 만들고 종료 시 제거합니다. 로컬/운영 DB에 테스트 콘텐츠를 쓰지 않습니다. E2E는 포트 3100·55440, 통합 테스트는 55439를 사용합니다. 테스트 세션은 임시 DB에만 생성하며 애플리케이션에는 테스트용 인증 우회 경로가 없습니다.

## 구성

- Next.js App Router, React, TypeScript, Tailwind CSS.
- Prisma 7 + PostgreSQL(`@prisma/adapter-pg`), Vercel Marketplace의 Neon 연동.
- Better Auth의 GitHub OAuth와 서버 측 GitHub 고유 ID 검증.
- 비공개 Vercel Blob, 관리자 인증 직접 업로드와 파일 바이트 검증.
- CodeMirror 6, 공통 GFM Markdown 렌더러, Shiki 코드 강조.
- Radix UI 대화상자·메뉴, next-themes, lucide-react 및 브랜드용 react-icons.

[데이터 구조](docs/data-model.md) · [운영 안내](docs/operations.md) · [설계 선택](docs/architecture.md) · [검증 결과](docs/verification.md)

디자인은 `app/globals.css`의 CSS 변수로 콘텐츠 폭·색상·글꼴·간격·테두리·모서리·전환 속도를 관리합니다. 공개 화면은 `components/public`, 관리자는 `components/admin`, 공통 검증은 `lib/schemas.ts`에 있습니다.
