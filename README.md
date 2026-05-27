# ipoBoard

모바일에서 공모주 일정을 Threads 스타일 카드 UI로 확인하고, 관심 공모주에 대해 다음 알림을 받을 수 있는 웹앱입니다.

- 청약일 오전 10시
- 상장일 전날 오후 9시
- 상장일 당일 오전 9시

AI 분석 기능은 제외하고, 38커뮤니케이션 공모주 목록/상세 페이지에서 가져온 정량 데이터와 규칙 기반 점수화 로직으로 공모주를 평가합니다.

## 주요 기능

- 38커뮤니케이션 공모주 목록 크롤링
- 상세 페이지 기반 공모 정보 추출
- 수요예측, 확약, 유통가능물량, 공모가, 주간사, 일정 기반 점수화
- 모바일 우선 Threads 스타일 카드 UI
- PWA 설치 지원
- Web Push 알림 지원
- 관심 공모주 등록
- 알림 스케줄 자동 생성

## 프로젝트 구조

```txt
ipoBoard/
├── client/                 # Vite React PWA
│   ├── public/
│   │   ├── manifest.webmanifest
│   │   └── sw.js
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── main.jsx
│       ├── push.js
│       └── styles.css
├── server/                 # Express API / scraper / scheduler
│   └── src/
│       ├── index.js
│       ├── scraper38.js
│       ├── scoring.js
│       ├── scheduler.js
│       └── store.js
├── .env.example
├── package.json
└── README.md
```

## 실행 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. VAPID 키 생성

```bash
cd server
npx web-push generate-vapid-keys
```

루트의 `.env.example`을 복사해서 `.env`를 만들고 값을 넣습니다.

```bash
cp .env.example .env
```

### 3. 개발 서버 실행

```bash
npm run dev
```

- 클라이언트: http://localhost:5173
- 서버 API: http://localhost:4000

## 배포 주의사항

Web Push는 HTTPS 환경에서만 정상 동작합니다. 로컬 개발에서는 `localhost` 예외가 적용되지만, 실제 모바일에서 쓰려면 Vercel, Render, Railway, Coolify 등 HTTPS 도메인으로 배포해야 합니다.

특히 iPhone Safari는 웹앱을 홈 화면에 추가한 뒤 알림 권한을 허용해야 Web Push가 동작합니다.

## 38커뮤니케이션 크롤링 기준

목록 페이지:

```txt
https://www.38.co.kr/html/fund/?o=k
```

상세 페이지:

```txt
https://www.38.co.kr/html/fund/?o=v&no={공모주ID}
```

크롤링은 EUC-KR 인코딩을 `iconv-lite`로 디코딩한 뒤 `cheerio`로 파싱합니다.

## 점수화 기준

총점 100점입니다.

- 수요예측/기관 반응: 30점
- 상장일 수급 부담: 25점
- 기업/섹터 매력: 20점
- 밸류에이션/실적: 15점
- 청약 실무 조건: 10점

점수는 투자 추천이 아니라, 공모주 체크리스트를 빠르게 보기 위한 정량화 지표입니다.
