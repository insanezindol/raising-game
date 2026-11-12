# 콩닥콩닥 펫 키우기

Three.js로 만든 전체화면 3D 펫 키우기 게임. 아이디와 비밀번호만으로 가입하고, 개인정보는 받지 않는다.

## 실행

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 게임 규칙과 인증 도우미 테스트
npm run build
```

`VITE_SUPABASE_ANON_KEY`가 없으면 체험 모드로 동작한다(이 브라우저의 localStorage에만 저장, 가입·복구 API 미사용).
개발 중 `?auto=dog`를 붙이면 로그인과 입양을 건너뛴다.

## 배포 설정

1. **Supabase**: 대시보드 SQL Editor에서 `supabase/schema.sql`을 실행한다.
2. **Vercel**: 이 저장소를 Import하고 환경변수를 등록한다.

| 이름 | 값 | 비고 |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://slcmpnknanrnfbzglrav.supabase.co` | 브라우저 노출 |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon(public) 키 | 브라우저 노출 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role 키 | 서버 함수 전용. `VITE_` 접두사를 붙이지 말 것 |

가입(`api/signup`)과 비밀번호 복구(`api/recover`)는 Vercel 함수가 처리하므로 로컬에서 확인하려면 `vercel dev`가 필요하다.

## 구조

| 경로 | 역할 |
|---|---|
| `src/sim.ts` | 게임 규칙 전체(스탯, 질병, 성장, 사망). 순수 함수 |
| `src/world.ts` | 방·공원, 조명, 카메라 |
| `src/actor.ts` | 펫 모델, 애니메이션, 자율 행동 |
| `src/ui.ts`, `src/style.css` | 로그인, 입양, 상태 표시, 일기 |
| `src/main.ts` | 위 모듈을 잇는 돌봄 흐름 |
| `src/data.ts` | Supabase 저장과 인증 |
| `api/` | 가입, 복구키 검증(service-role 키 사용) |

## 에셋

3D 모델은 모두 [Kenney](https://kenney.nl)의 CC0 팩이다: Cube Pets, Furniture Kit, Nature Kit, Food Kit.
폰트는 Google Fonts의 Jua, Gaegu(OFL). 효과음과 배경음은 Web Audio로 합성한다.
