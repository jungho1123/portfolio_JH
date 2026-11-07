# 개발·배포 설정

## 환경 분리

Vercel의 Root Directory를 `my_portfolio`로 설정합니다. 프레임워크는 Next.js, 패키지 관리자는 고정된 pnpm을 사용합니다. 개발·Preview·Production마다 다른 Neon DB/브랜치와 비공개 Blob 저장소를 연결합니다. Preview에 Production 자격증명을 복사하지 않습니다. 실제 운영 환경 변수를 로컬 테스트 서버에 상속하지 않도록 E2E 실행기는 모든 외부 자격증명을 테스트 값으로 교체합니다.

Neon은 [Vercel Marketplace Native Integration](https://vercel.com/marketplace/neon)으로 연결하면 Vercel에서 결제를 관리할 수 있습니다. 런타임 `DATABASE_URL`은 풀링 연결, `DATABASE_URL_UNPOOLED`는 Prisma 마이그레이션용 직접 연결을 사용합니다. 기존 `.env.local`은 보존하세요.

## 데이터베이스

```bash
pnpm db:generate
pnpm db:deploy
```

기존 마이그레이션은 수정하지 않았습니다. 신규 DB는 인증 모델부터 전체를 생성하고 기존 DB에는 신규 테이블과 인덱스를 추가합니다. `db push`나 `migrate reset`을 운영에 사용하지 않습니다. 운영 배포 전 올바른 환경인지 확인하고 마이그레이션을 배포 작업에서 1회 실행합니다. 연결 풀 기본 크기는 인스턴스당 5이며 `DB_POOL_MAX`로 조절합니다.

## GitHub 관리자

1. [GitHub OAuth App](https://github.com/settings/developers)을 생성합니다. 개발과 운영 앱을 분리합니다.
2. 홈페이지 URL에 해당 환경의 원점을, 콜백에 `<원점>/api/auth/callback/github`를 지정합니다. 예: `http://localhost:3000/api/auth/callback/github`.
3. `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_URL`, `SITE_URL`을 설정합니다. 운영 원점은 HTTPS입니다.
4. `https://api.github.com/users/<사용자명>`의 숫자 `id`를 `ADMIN_GITHUB_ID`에 넣습니다. 이름·이메일·로그인명은 권한 판정에 사용하지 않습니다.
5. `openssl rand -base64 32`로 `BETTER_AUTH_SECRET`을 생성합니다. 변경하면 기존 서명 세션은 유효하지 않게 됩니다.
6. `/admin`에서 로그인합니다. 기존 이메일 회원과 ADMIN 역할만 가진 계정은 GitHub ID 검증을 통과하지 못합니다. 계정 자동 연결과 이메일 가입/로그인은 꺼져 있습니다.

관리자 세션은 24시간 유효합니다. 모든 관리자 API·파일 조회·내보내기는 서버에서 권한을 검사합니다. GitHub의 비공개 이메일은 기본 provider의 `user:email` 권한으로 처리하며 이메일을 권한으로 사용하지 않습니다.

## 비공개 파일 저장소

Vercel Storage에서 **Private Blob store**를 만들고 프로젝트의 해당 환경에 연결합니다. 생성된 `BLOB_READ_WRITE_TOKEN`을 서버 환경 변수에만 둡니다. Public 저장소로 대체하면 안 됩니다.

관리자 화면은 `/api/admin/media`에서 업로드 등록 후 `/api/admin/upload`를 통해 짧은 유효기간의 제한된 토큰을 발급받아 Blob으로 직접 업로드합니다. 파일이 Vercel Function 요청 본문을 통과하지 않아 4.5MB 이미지와 더 큰 PDF를 지원합니다. 업로드 완료 시 저장된 바이트의 실제 형식·크기·이미지 디코딩을 확인한 후 READY로 전환합니다. 로컬에서는 Blob 완료 콜백이 도달하지 않아도 클라이언트의 검증 요청이 마무리합니다.

이미지는 4,500,000바이트 이하의 JPEG/PNG/WebP만 허용합니다. PDF는 `RESUME_MAX_BYTES`로 제한하며 기본 10,000,000바이트입니다. 업로드된 파일은 초안에 연결해도 공개되지 않습니다. 현재 공개본이 사용하는 파일만 사이트의 `/media/<id>`로 익명 조회할 수 있습니다. 원본·축소 이미지·공유 이미지 모두 권한 확인을 거칩니다.

## GitHub 공개 활동과 주기적 갱신

`GITHUB_TOKEN`은 로그인 OAuth 토큰과 다른 별도 토큰을 사용합니다. 비공개 저장소 권한을 부여하지 마세요. 구현은 기여별 저장소의 `isPrivate`를 확인하며, 비공개 기여 수가 포함될 수 있는 `contributionCalendar`는 사용하지 않습니다.

홈 방문 후 갱신 작업은 6시간 이내 재요청을 생략합니다. `vercel.json`은 무료 플랜의 스케줄 제약을 고려해 하루 한 번 Cron을 호출합니다. `CRON_SECRET`을 설정하면 Vercel이 인증 헤더를 전달합니다. 더 잦은 정기 갱신이 필요하면 사용하는 Vercel 플랜의 Cron 지원 범위에서 스케줄을 변경합니다. 정기 백업 작업은 포함하지 않습니다.

## 도메인

Vercel 프로젝트 Settings → Domains에 구매한 도메인을 추가합니다. Vercel이 그 시점에 제시하는 A/AAAA/CNAME 레코드를 도메인 업체 DNS에 등록합니다. 고정된 예전 IP를 복사하지 말고 대시보드의 값을 사용하세요. apex/www 중 대표 도메인을 정하고 나머지는 리다이렉트합니다. 인증서 발급과 HTTPS를 확인한 뒤 `SITE_URL`, `BETTER_AUTH_URL`, GitHub OAuth 콜백을 같은 대표 원점으로 맞추고 재배포합니다.

## 비용과 운영 확인

무료 구성을 보장하지 않습니다. Vercel 플랜, Function 실행·전송량, Blob 저장·읽기/쓰기·다운로드 전송량, Neon 컴퓨트·저장·브랜치 등이 비용 항목입니다. 비공개 Blob을 Function에서 제공하므로 파일 원본 조회와 방문자 전달의 트래픽 비용이 생길 수 있습니다. 파일 응답은 접근 회수를 위해 공유 CDN에 캐시하지 않습니다. [Blob 요금](https://vercel.com/docs/vercel-blob/usage-and-pricing), [Vercel 사용량](https://vercel.com/docs/pricing), [Neon Marketplace](https://vercel.com/marketplace/neon)의 현재 조건을 확인하고 결제 알림·사용량 알림을 설정하세요. 월 한도와 유료 플랜은 아직 지정되지 않았습니다.

배포 후 허용/미허용 계정 로그인, 4.5MB 직접 업로드, 초안 파일 비노출, 홈·게시물 게시, 비공개 접근 회수, PDF 미리보기/다운로드, ZIP 내보내기, 재배포 후 영속성을 실제 환경에서 확인합니다.
