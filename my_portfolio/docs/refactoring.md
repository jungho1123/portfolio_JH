# 컴포넌트 리팩터링 결과

작업일: 2026-11-08. 범위는 컴포넌트 책임, 클라이언트 비동기 작업의 생명주기, 요청 함수의 위치다. 패키지·CSS·DB 스키마·HTTP API·인증 정책은 변경하지 않았다.

## 사전 분석

- Next.js 16.4.5 App Router, React 19.3, TypeScript strict, Prisma/PostgreSQL, Better Auth, Tailwind CSS 4와 전역 CSS를 사용한다.
- `@/*` 별칭, kebab-case 파일명, 기존 Next.js core-web-vitals/TypeScript ESLint 설정을 유지했다. 설치된 Next.js의 `node_modules/next/dist/docs/` 가이드도 확인했다.
- 공개 라우트와 레이아웃은 서버에서 데이터를 조회하고 Suspense 아래에 화면을 조립한다. 관리자 편집 페이지도 서버에서 권한을 확인한 후 JSON으로 직렬화한 초안을 전달한다.
- `lib/content.ts`, `lib/public-data.ts`, `lib/admin.ts`와 API 라우트에 있는 트랜잭션·조회·권한·캐시 정책은 유지했다.
- 가장 혼재된 책임은 Editor의 저장/복구/게시/UI, Listing의 복원/추가 조회/필터/UI, 공개 pages 모듈의 조회/메타데이터/상세 UI였다.

## 컴포넌트 구조와 데이터 흐름

변경 전:

```text
홈 Page → HomeContent(조회) → HomeView(프로필·GitHub·모든 섹션)
목록 Page → ListPage(조회) → Listing(조회·복원·필터·목록·로딩)
상세 Page → pages 모듈(메타데이터·조회·DetailView)
관리자 Preview → 같은 pages 모듈의 DetailView
관리자 편집 Page → Editor(입력·자동저장·복구·게시·전체 UI) → HomeForm/PostForm
관리자 UI → shared.tsx의 api / media-field.tsx의 uploadFile
```

변경 후 (`S`: Server Component, `C`: 클라이언트 경계 안에서 실행):

```text
공개 Layout(S)
├─ Navigation(S): 기존 홈/콘텐츠 조회 → Header(C)
├─ Page(S)
│  ├─ 홈: HomeContent(S) → HomeView(S)
│  │  ├─ HomeProfile(S) → GithubActivityView(S)
│  │  └─ 지역 Section·Timeline, 기존 Markdown(C), PostCard
│  ├─ 블로그/프로젝트 목록: ListPage(S) → Listing(C)
│  │  ├─ usePublicListing: 항목·커서·조회·복원·observer
│  │  ├─ ListingFilters: 제어된 필터 UI
│  │  ├─ PostCard 반복 또는 기존 빈 상태
│  │  ├─ ListingLoadState: 로딩·오류·재시도·sentinel
│  │  └─ 기존 서버 탐색용 페이지 링크
│  └─ 블로그/프로젝트 상세: DetailPage(S) → DetailView(S)
│     └─ 기존 Markdown·목차·공유·목록 복귀
└─ 기존 Footer, BackToTop(C)

관리자 Layout(S): 기존 서버 권한 확인
├─ 목록 → Dashboard(C)
├─ 분류 → TaxonomyManager(C), 지역 TaxonRow
├─ 미디어 → MediaManager(C), 지역 MediaRow
├─ Preview(S) → HomeView(S) 또는 DetailView(S)
└─ 편집 Page(S): currentAdmin + adminContent
   └─ Editor(C), key=[accountId, contentId]
      ├─ useContentEditor: 편집 데이터·revision·저장/게시 상태의 소유자
      │  └─ useEditorRecovery: 복구 후보·IndexedDB 작업 순서만 관리
      ├─ EditorToolbar
      ├─ EditorNotices
      ├─ 기존 HomeForm 또는 PostForm
      └─ EditorLifecycleActions
```

`PostCard`는 서버 홈/상세와 클라이언트 목록에서 공유되는 환경 중립 모듈이다. 서버 전용 조회 코드를 값으로 import하지 않는다.

- 서버 조회 결과 → 기존 직렬화 Props → Listing/Editor로 전달한다. 분리한 표시 컴포넌트는 데이터를 다시 조회하지 않는다.
- 폼의 `onChange` → Editor의 단일 데이터 소유자 → generation 증가·기기 복구본 쓰기·1초 자동저장으로 이어진다.
- 저장 요청에는 서버 revision과 입력 스냅샷을 전달한다. 저장 응답은 revision/저장 완료 generation을 갱신하며 현재 입력을 덮어쓰지 않는다.
- 목록 필터의 기준은 서버에서 해석한 URL Props다. 필터 UI는 `Partial<ListFilters>` 변경만 전달하고, Listing이 기존 URL 규칙으로 이동한다.
- `HomeProfile`은 프로필 필드·프로젝트 존재 여부·활동 데이터를 받고, 활동 UI는 사용자명과 활동 데이터만 받는다. GitHub 조회와 `after()` 갱신은 서버 페이지에 남았다.

## 파일별 책임과 설계 근거

신규 제품 코드 10개:

| 파일 | 책임과 분리 이유 |
| --- | --- |
| `components/admin/editor-controls.tsx` | Toolbar·Notices·LifecycleActions. 저장 도구, 상태/복구 안내, 콘텐츠 공개 상태 조작이라는 독립 UI 계약을 구분한다. 서로 관련된 UI를 한 파일에 모아 파일 수를 제한한다. |
| `components/admin/use-content-editor.ts` | 편집 데이터와 revision의 단일 소유권, 자동저장/조합/게시 직렬화, 이탈 확인, 캐시 재시도. 서로 일관성을 유지해야 하는 저장·게시를 함께 둔다. |
| `components/admin/use-editor-recovery.ts` | 복구 후보 조회와 직렬화된 쓰기/삭제. 편집 데이터와 서버 revision은 복제하지 않는다. |
| `components/public/listing-controls.tsx` | ListingFilters·ListingLoadState. 제어 입력과 조회 결과 안내를 분리하며, 상태나 조회 로직을 소유하지 않는다. |
| `components/public/use-public-listing.ts` | 목록 데이터와 복원/추가 조회 생명주기, 취소, 중복 방지, 브라우저 이벤트와 observer 정리. |
| `components/public/detail-view.tsx` | 공개 상세와 관리자 미리보기가 공유하는 표시 UI. 서버 조회/메타데이터 모듈을 가져올 필요가 없다. |
| `components/public/home-profile.tsx` | HomeProfile과 지역 GithubActivityView. 프로필과 활동 표시를 홈 섹션 조립에서 분리한다. |
| `lib/public-metadata.ts` | 기존 postMetadata 생성. `server-only`로 경계를 명시하며 기존 값·조회 시점은 유지한다. |
| `lib/admin-api.ts` | 기존 api 함수를 그대로 이동. 요청 코드가 UI 구현에 의존하지 않게 한다. |
| `lib/media-upload.ts` | 기존 uploadFile을 그대로 이동. 미디어 필드와 관리 화면이 등록→비공개 업로드→검증 절차를 직접 공유한다. |

수정한 기존 파일:

| 파일 | 수정 내용 |
| --- | --- |
| `components/admin/editor.tsx` | 편집 훅과 세 UI 영역, 기존 폼을 조립하는 역할로 축소 |
| `components/admin/shared.tsx` | 요청 함수를 옮기고 Field/Confirm UI만 유지 |
| `components/admin/media-field.tsx` | 업로드 함수를 옮기고 선택/업로드 UI 유지 |
| `components/admin/dashboard.tsx` | api import 변경 |
| `components/admin/home-form.tsx` | api import 변경 |
| `components/admin/post-form.tsx` | api import 변경 |
| `components/admin/media-manager.tsx` | api/uploadFile import 변경 |
| `components/admin/taxonomy-manager.tsx` | api import 변경 |
| `lib/recovery.ts` | 기존 저장 형식은 유지하고, 비동기 DB 연결 완료 후 쓰기/삭제를 시작하기 전에 편집 인스턴스의 유효성을 다시 확인하는 선택적 인자 추가 |
| `components/public/listing.tsx` | 필터·로딩 UI 및 데이터 생명주기를 연결하고, URL 이동/카드 조립/탐색 링크 유지 |
| `components/public/home.tsx` | 프로필을 HomeProfile로 조립하고 기존 섹션 표시 조건 유지 |
| `components/public/pages.tsx` | ListPage/DetailPage의 서버 조회·오류·리다이렉트·화면 조립만 유지 |
| `app/(public)/blog/[slug]/page.tsx` | 메타데이터 함수 import 변경 |
| `app/(public)/projects/[slug]/page.tsx` | 메타데이터 함수 import 변경 |
| `app/admin/(manage)/preview/[id]/page.tsx` | DetailView를 표시 모듈에서 직접 import |
| `app/admin/(manage)/edit/[id]/page.tsx` | 계정+문서로 편집 인스턴스 식별 |

신규 검증/문서 파일:

| 파일 | 책임 |
| --- | --- |
| `tests/e2e/editor-integrity.spec.ts` | 지연 저장·조합 중 게시·게시 중 입력·충돌 차단·복구 버전·문서 이동·최신 복구본 보존·로그아웃/재로그인·인증된 미리보기·지연 IndexedDB 연결·Activity 복귀 회귀 검증 |
| `tests/e2e/listing-integrity.spec.ts` | 지연 응답과 필터/뒤로 가기, 재검증 이벤트 병합, 추가 조회 중 복원과 중복 방지 검증 |
| `tests/e2e/refactor-visual.spec.ts` | 명시적으로 실행하는 전후 이미지/DOM 비교. 기준 이미지는 Playwright 결과 정리에 영향받지 않는 `.cache/refactor-visual/`에 보관 |
| `docs/refactoring.md` | 분석·구조·파일 책임·검증·미확인 항목 보고 |

분리하지 않은 부분:

- HomeForm/PostForm은 하나의 제어된 도메인 입력을 구성한다. 필드별로 나누면 데이터와 변경 콜백 전달만 증가한다.
- Section/Timeline/RowActions/TaxonRow/MediaRow는 기존 파일 내부에서도 책임이 구분돼 있다. 지역 컴포넌트라는 이유로 별도 파일을 만들지 않았다.
- 카드의 단순 반복, 목록 빈 상태, 페이지 탐색 링크, 홈 Stack 표시에는 추가 Wrapper나 범용 리스트 계층이 필요하지 않다.
- Markdown은 공개 화면과 입력 미리보기가 동일 렌더러를 공유한다. 하이라이팅/복사/이미지 확대의 기존 클라이언트 동작을 유지했다.
- Atomic Design의 5개 폴더나 Templates를 도입하지 않았다. 이미 있는 public/admin/ui/lib 경계로 역할을 표현할 수 있다.

이 결정은 [React의 상태 소유권 원칙](https://react.dev/learn/sharing-state-between-components), [커스텀 훅으로 외부 시스템 동기화를 캡슐화하는 방법](https://react.dev/learn/reusing-logic-with-custom-hooks), [불필요한 Effect를 줄이는 지침](https://react.dev/learn/you-might-not-need-an-effect)에 따른다. 파일 길이 자체는 분리 기준으로 쓰지 않았다.

## 비동기 작업과 Server/Client 경계

- 저장과 콘텐츠 상태 변경은 직렬화한다. 저장이 실패하거나 충돌하면 게시 POST로 진행하지 않는다. 한글 조합 중의 명시적 저장/게시도 조합 종료와 최신 generation 저장을 기다린다.
- 게시 POST를 보낸 이후 입력은 다음 초안이다. 게시 응답은 새 입력을 저장/게시 완료로 오인하지 않으며, 게시 응답의 revision으로 다음 저장을 진행한다.
- 복구본 작업은 순서대로 실행한다. 오래된 generation 저장 성공으로 최신 복구본을 삭제하지 않는다.
- IndexedDB 연결 자체가 지연될 수도 있으므로, 연결 완료 후 트랜잭션 생성 직전에도 작업 인스턴스가 유효한지 확인한다. 이미 언마운트된 편집기의 늦은 연결이 동일 문서의 새 복구본을 덮어쓰는 경로를 실제 브라우저 테스트로 검증한다. 기존 복구 데이터 형식은 변경하지 않는다.
- 계정/문서별 key와 작업별 active scope로 이전 작업의 상태 갱신·후속 저장·이동·삭제를 차단한다. 이미 서버에서 처리된 저장을 클라이언트 취소로 롤백한다고 가정하지 않는다.
- Cache Components는 이동한 페이지의 상태를 Activity로 보존하므로, cleanup에서 진행 작업 잠금·조합 상태·일시적인 busy/저장 중 표시를 해제한다. 같은 문서로 복귀해도 이전 POST의 대기나 늦은 오류가 새 편집을 막지 않는 시나리오를 별도로 검증한다. 입력값·충돌 정책·서버 revision은 임의로 초기화하지 않는다. 근거: [Next.js의 Activity 상태 보존 지침](https://nextjs.org/docs/app/guides/preserving-ui-state).
- 목록은 세션별 AbortController를 공유하는 단일 진행 요청을 유지한다. 필터 전환/언마운트에서 취소하고 이전 응답·이전 finally가 새 상태나 잠금을 바꾸지 못하도록 한다.
- pageshow/visibility 재검증이 진행 요청과 겹치면 후속 재검증 한 번으로 합친다. 추가 조회로 늘어난 페이지 수를 복원에도 반영한다.
- 개발 Strict Mode의 초기 cleanup은 아직 복원이 끝나지 않은 페이지 수로 기존 저장 정보를 덮어쓰지 않는다. 테스트에서 발견한 24개→12개 복원 회귀를 이 조건으로 수정했다.
- 타이머, 이탈/클릭/페이지/스크롤/visibility 리스너, observer, animation frame을 정리한다. 오래된 비동기 복구 조회도 무시한다.
- 부모가 같은 계정/문서의 초기 Props를 갱신해도 로컬 편집값을 자동으로 덮어쓰지 않는 초기화 방식을 유지한다. 목록도 동일 의미의 필터 Props가 재생성된 이유만으로 구독을 다시 시작하지 않는다.

위 정리와 경쟁 상태 처리는 [React useEffect 공식 문서](https://react.dev/reference/react/useEffect)의 setup/cleanup 대칭과 늦은 응답 무시 원칙을 따른다.

서버/클라이언트 경계의 확대는 없다. 기존 Editor/Listing은 클라이언트 경계이고 새 UI/훅은 그 아래에 둔다. HomeProfile과 DetailView는 서버 조립에서 렌더링하며, public-metadata에는 서버 전용 표식을 추가했다. 인증·DB 접근을 클라이언트로 이동하거나 새로운 캐시/조회 정책을 도입하지 않았다. 기존 Markdown의 클라이언트 경계도 유지한다. 근거: [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components).

## 검증

편집기→목록→상세→홈→요청 함수 순서로 구현하고 각 단계의 타입/린트와 관련 E2E를 확인한 뒤 다음 단계로 진행했다. 신규 테스트에서 Next.js route announcer까지 선택하던 alert selector를 main 영역으로 제한했고, 목록 테스트는 SSR 직후가 아닌 최초 클라이언트 재검증 완료부터 요청 수를 계수하도록 수정했다.

| 최종 검사 | 결과 |
| --- | --- |
| `pnpm typecheck` | 통과: Next 라우트 타입 생성 + TypeScript strict 검사 |
| `pnpm lint` | 오류·경고 없이 통과 |
| `pnpm build` | 프로덕션 빌드 통과. 기존 SSL 모드 경고는 아래 별도 기록 |
| `pnpm test` | 단위/실제 PostgreSQL 통합 14개 통과 |
| `pnpm test:e2e` + 위의 라이브러리 경로 | 기능 27개 통과: 기존 13개 + 신규 14개(편집기 11개, 목록 3개). 시각 테스트 1개는 기본 실행에서 의도적으로 건너뜀 |
| `REFACTOR_VISUAL_PHASE=before/after` 시각 테스트 별도 실행 | 양쪽 통과. 48개 화면 모두 DOM 구조·이미지 크기 동일, RGB 차이 기준을 넘는 픽셀 0개 |
| 별도 원시 RGBA 비교 | 48개 모두 완전 일치: 정확한 차이 픽셀도 0개. 개발 도구 숨김·저장 상태 영역 마스킹 조건 적용 |
| `git diff --check` | 통과 |

화면 파일은 `.cache/refactor-visual/before/`, `after/`에 있고, 화면별 픽셀 수치는 `comparison.json`, 원본 출처는 `baseline-source.json`에 있다. 이 경로는 기존 `.cache/` 제외 규칙에 따라 Git에 포함하지 않는다. 임시 원본 소스와 의존성 복사본은 검증 후 정리했다.

### 재현 명령

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
LD_LIBRARY_PATH=/home/user/.cache/portfolio-playwright-libs/root/usr/lib/x86_64-linux-gnu pnpm test:e2e
git diff --check
```

화면 비교는 **변경 전 코드에서 before를 먼저 실행한 뒤**, 변경 후 after를 실행한다. after를 통과시키기 위해 기준 이미지를 새 코드로 덮어쓰지 않는다.

```bash
LD_LIBRARY_PATH=/home/user/.cache/portfolio-playwright-libs/root/usr/lib/x86_64-linux-gnu REFACTOR_VISUAL_PHASE=before pnpm exec playwright test refactor-visual.spec.ts
LD_LIBRARY_PATH=/home/user/.cache/portfolio-playwright-libs/root/usr/lib/x86_64-linux-gnu REFACTOR_VISUAL_PHASE=after pnpm exec playwright test refactor-visual.spec.ts
```

비교 대상은 홈, 두 목록, 두 상세, 홈/블로그/프로젝트 편집의 8종 × 360/768/1280px × light/dark = 48개다. 개발 도구 표시는 테스트 CSS로 숨기고, 동적 저장 시각/버전 영역만 마스킹한다. 나머지 main 하위 DOM의 태그·class·role·aria-label 배열과 이미지 크기를 비교한다. 이미지 검사는 RGB 채널 차이 8을 넘는 픽셀 비율이 0.1% 이하인지 확인하며 실제 수치는 별도로 기록한다.

최초 비교에서는 목록의 조회 중/완료 상태와 관리자 분류 조회·코드 강조 완료 시점이 서로 달라 비교가 실패했다. 허용 차이를 늘리거나 변경 후 코드로 기준 이미지를 갱신하지 않았다. 원본 HEAD를 별도 임시 디렉터리에서 실행하고, 양쪽 모두 동일한 pageshow 재검증·분류 조회·코드 강조·폰트·레이아웃 완료를 기다리도록 촬영 조건을 보완했다. 원본의 앱/컴포넌트/lib/Next 설정 74개 파일이 HEAD와 일치함을 확인했다.

## Hydration 경고 후속 수정 (2026-11-08)

리팩터링 당시 남겨둔 CodeMirror 테마 경고를 `components/admin/markdown-editor.tsx`에서 수정했다.

- 원인: 서버의 `useTheme().resolvedTheme`은 `undefined`라서 `cm-theme-light`를 출력하지만, 저장된 다크 테마를 읽은 브라우저는 hydration 첫 렌더링부터 `cm-theme-dark`를 요구했다. 수정 전 실제 Chromium 테스트에서 이 클래스 불일치 경고를 재현했다.
- 수정: `useSyncExternalStore`의 서버 snapshot을 `false`, 클라이언트 snapshot을 `true`로 두어 서버와 hydration 첫 렌더링에는 동일한 light 값을 전달한다. hydration 이후에는 기존 `resolvedTheme`에 따라 테마를 적용한다. 편집기의 SSR과 DOM을 유지하며 경고 억제 옵션은 추가하지 않았다.
- 근거: [React의 서버 snapshot 계약](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering)은 서버 렌더링과 클라이언트 hydration에 같은 값을 요구한다. [next-themes의 hydration 안내](https://github.com/pacocoursey/next-themes#avoid-hydration-mismatch)도 브라우저에서 확인하는 테마를 초기 SSR 결과에 바로 사용하지 않도록 설명한다.
- 회귀 테스트: `tests/e2e/theme-hydration.spec.ts`에서 홈·블로그·프로젝트 편집기에 저장된 light/dark 및 시스템 light/dark를 적용하여 직접 접속과 새로고침 시 콘솔 hydration 경고·런타임 오류가 없는지 검사한다. HTML 테마, CodeMirror wrapper 클래스와 실제 배경색도 확인한다. 별도 시나리오로 저장된 테마가 없는 상태의 클라이언트 탐색, 테마/시스템 설정 변경 시 입력과 편집기 DOM 유지, 자동저장 후 새로고침을 검증한다.

후속 검증 결과: 신규 테마 E2E 5개와 기존 편집기 무결성 E2E 11개, 총 16개 통과. `pnpm typecheck`, `pnpm lint`, `pnpm build`, 변경한 코드/테스트의 Prettier 검사와 `git diff --check`도 통과했다. 빌드의 기존 PostgreSQL SSL 모드 경고는 동일하게 남아 있다. 위의 리팩터링 전체 검증 표는 이전 작업의 기록이며, 이번 수정에서는 아래의 관련 E2E를 실행했다.

```bash
LD_LIBRARY_PATH=/home/user/.cache/portfolio-playwright-libs/root/usr/lib/x86_64-linux-gnu pnpm exec playwright test theme-hydration.spec.ts editor-integrity.spec.ts
```

## 유지보수성과 데이터 무결성 안정화 (2026-11-08)

코드 평가에서 재현한 세 문제와 인접한 비동기 경로를 수정했다.

- `CACHE_PENDING`은 서버 변경이 반영된 응답으로 처리한다. `requestContentAction`이 정상 응답과 캐시 실패 응답을 동일한 문서 스키마로 검증하고, 문서 반영 결과와 캐시 오류를 따로 반환한다. 폐기는 편집 데이터·generation·복구본을 정리한 후 완료되므로 폐기한 내용을 자동저장이 다시 쓰지 않는다.
- 게시 응답을 기다리는 동안 입력한 내용은 새 초안으로 보존한다. 캐시 안내는 저장 오류와 별도 상태여서 후속 자동저장으로 사라지지 않는다. 캐시 재시도에는 버전을 부여해 오래된 응답이 이후 작업의 캐시 오류를 지우지 못하게 한다.
- 삭제 후 캐시 갱신만 실패하면 삭제 완료 화면에서 캐시만 재시도한다. `content: null`을 완료 결과로 처리하며 삭제된 문서의 입력·삭제·자동저장 작업을 반복하지 않는다.
- HomeForm/PostForm은 최신 데이터에 적용할 변경 함수를 전달한다. 이미지 가져오기·업로드·태그 생성이 늦게 끝나도 다른 필드나 기존 태그를 과거 값으로 되돌리지 않는다. Markdown 이미지 삽입도 최신 본문 뒤에 내용을 추가한다.
- 미디어·분류 작업은 화면 활성 범위를 확인한다. 폐기·복구 시 폼 인스턴스를 갱신하여 이전 작업을 종료하고, 늦은 콜백이 새 초안을 수정하지 못하게 한다.
- 목록은 재조회와 추가 조회의 로딩·실패 상태를 구분한다. 재시도는 실패한 작업을 다시 실행한다. 다음 커서가 없는 마지막 페이지와 빈 목록에도 재시도를 제공하며, 오류 중에는 완료 문구를 표시하지 않는다.

유지보수성 개선:

| 파일 | 변경 내용 |
| --- | --- |
| `lib/admin-types.ts` | 문서 종류와 데이터의 관계를 discriminated union으로 정의하고, 실제 API 응답 검증에 같은 Zod 스키마 사용 |
| `lib/editor-state.ts` | 편집 상태·저장 상태·서버 반영·폐기·캐시 처리의 순수 전이 함수. UI 문구와 상태 코드를 분리 |
| `components/admin/use-content-editor.ts` | React 상태와 비동기 스냅샷을 갱신하는 경로를 하나로 통합. 훅은 요청 직렬화·생명주기·복구 작업을 연결 |
| `components/admin/editor.tsx` | 종류에 맞는 데이터와 변경 함수를 연결하며 HomeData/PostData 타입 단언 제거 |
| `tests/editor-state.test.ts` | 늦은 저장 응답, 부분 성공, 폐기·삭제의 최종 상태, 최신 데이터 변경, 충돌과 캐시 재시도 격리 검증 |
| `tests/e2e/editor-stability.spec.ts` | 지연 미디어/태그 입력 보존, 폐기/게시/삭제의 캐시 실패, 폐기 이후 늦은 콜백 검증 |
| `tests/e2e/listing-integrity.spec.ts` | 마지막/빈 목록의 재시도 및 여러 페이지 재조회 실패 후 복원 검증 추가 |

목록 무결성 테스트는 페이지 요청을 명시적으로 제어하도록 IntersectionObserver의 자동 조회를 테스트 범위에서 중지했다. 버튼 클릭을 위해 스크롤할 때 자동 조회가 함께 발생하면 고정된 24개 복원 검사가 실제로는 28/31개까지 추가 조회한 상태를 검사하게 된다. 요청·중복·페이지 수 기준은 유지했고, 실제 스크롤과 목록 복귀 검사는 기존 portfolio E2E에서 실행한다.

외부 이미지/캐시 장애는 브라우저 응답으로 모의한다. 입력 보존 후 저장·게시·폐기·삭제 결과는 격리된 PostgreSQL에서 확인한다. 실제 운영 Blob 저장소나 캐시 장애를 발생시킨 검증은 아니다.

최종 안정화 검증:

| 검사 | 결과 |
| --- | --- |
| `pnpm typecheck` | 통과 |
| `pnpm lint` | 통과. 목록 테스트의 observer 격리 수정 후 해당 파일도 재검사 통과 |
| `pnpm build` | 통과. 기존 PostgreSQL SSL 모드 경고 동일 |
| `pnpm test` | 단위/실제 DB 통합 21개 통과: 기존 14개 + 상태 전이 7개 |
| `LD_LIBRARY_PATH=/home/user/.cache/portfolio-playwright-libs/root/usr/lib/x86_64-linux-gnu pnpm test:e2e` | 전체 재실행 43개 통과. 기존 opt-in 시각 비교 1개는 기본 실행에서 제외 |
| 커밋 대상 TypeScript/TSX Prettier 검사 | 통과 |
| `git diff --cached --check` | 통과 |

## 미확인 범위와 추가 개선

- 시각 비교는 고정 fixture의 정상 화면 범위다. 모든 오류·복구 팝업·실제 콘텐츠·실제 기기/스크린리더 조합을 촬영한 것은 아니다. 오류/복구 동작은 회귀 E2E로 검증한다.
- 로그아웃 회귀 테스트는 공용 테스트 관리자 세션을 삭제하지 않도록 sign-out HTTP 응답만 모의한다. 실제 UI의 복구본 정리와 재로그인 이후 데이터 격리를 확인한다. 실제 GitHub OAuth 왕복을 검증했다고 보지 않는다.
- 서비스는 단일 GitHub 관리자를 허용한다. 서로 다른 두 정상 관리자 계정 사이의 실사용 전환은 브라우저 검증 범위가 아니다. 계정 key 분리와 기존 비허용 세션 차단은 유지한다.
- 실제 운영 Blob 업로드/외부 이미지 가져오기·PDF 교체·배포 후 캐시 회수는 이번에 새로 실행하지 않았다. 업로드 함수는 구현을 그대로 이동했고 서버 파일 검사와 기존 권한 테스트를 유지한다.
- 기존 DB 연결에서 나오는 PostgreSQL SSL 모드 경고는 이번 컴포넌트 리팩터링 범위에 포함하지 않았다.
- 기존 미디어 사용처의 index key 등 이번 책임 분리와 직접 관계없는 항목은 별도 개선 대상으로 남겼다. 안정적인 식별자를 추가하려면 현재 API projection도 검토해야 한다.
