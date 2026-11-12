# 펫 키우기 게임 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ID/PW로 가입해 3D 펫 한 마리를 입양하고 돌보는 전체화면 웹 게임을 만든다.

**Architecture:** Vite + TypeScript + Three.js 단일 페이지. 게임 규칙은 순수 함수 모듈 `src/sim.ts`에만 있고, 씬/UI/저장은 그 상태를 그리거나 보관한다. 가입·복구는 Vercel 함수가 service-role 키로 처리하고, 로그인과 펫 저장은 브라우저가 anon 키 + RLS로 직접 한다.

**Tech Stack:** vite, typescript, three, @supabase/supabase-js, vitest. Vercel Functions(Node). Supabase Postgres/Auth.

**Spec:** `docs/superpowers/specs/2026-11-12-raising-game-design.md`

## Global Constraints

- 3D 에셋은 Kenney CC0 팩만 사용: Cube Pets 2.0(펫), Furniture Kit(방), Nature Kit(공원), Food Kit(먹이). 직접 모델링 금지(공 같은 기본 도형 제외).
- 펫 클립 이름: `static, idle, walk, run, eat, dance, gesture-positive, gesture-negative`. 잠·아픔은 코드 모션.
- 펫 12종: dog, cat, bunny, chick, parrot, pig, fox, panda, koala, penguin, monkey, deer.
- ID `^[a-z0-9_]{4,20}$`, 비밀번호 8자 이상, 내부 이메일 `<id>@pet.local`. 개인정보 수집 없음.
- service-role 키는 `api/`에서만 `process.env.SUPABASE_SERVICE_ROLE_KEY`로 읽는다.
- 캔버스 전체화면, 스크롤 없음, 모바일 세로 우선. 그라디언트·유리 효과·이모지 아이콘·카드 패널 금지.
- UI 문구는 한국어.
- 스펙 대비 변경: 테이블 `profiles`+`recovery_keys`를 `accounts` 하나로 합친다(클라이언트 접근 불가).
  가입도 서버 함수로 처리해 "Confirm email 끄기"가 필요 없다. 복구키는 서버가 생성한다.
- 효과음·BGM은 Web Audio로 합성한다(오디오 파일 없음).

## Review Focus

1. 30일 넘게 미접속 후 접속 → 따라잡기가 멈추지 않고 사망 시각·원인을 정확히 기록.
2. 이미 죽은 펫에 행동/시간 진행 적용 → 상태가 변하지 않음.
3. 스탯이 0 미만·100 초과로 가지 않음(연속 급여, 장기 방치).
4. 틀린 복구키 반복 → 5회 후 잠금, 없는 ID와 응답이 같음.
5. 저장 실패(오프라인) → 게임은 계속되고 다음 저장에서 복구.

---

### Task 1: 프로젝트 뼈대와 에셋

**Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `.env.example`, `public/models/{pets,room,park,food}/*.glb`, `public/models/**/Textures/colormap.png`, `public/models/LICENSE.txt`

- [ ] `npm create`류 없이 직접 구성. scripts: `dev`, `build`(tsc --noEmit && vite build), `test`(vitest run).
- [ ] 스크래치패드의 Kenney 팩에서 필요한 GLB만 복사. 라이선스 고지 파일 포함.
- [ ] `npm run build` 통과 후 커밋.

### Task 2: 시뮬레이션 (`src/sim.ts`, `src/sim.test.ts`)

**Produces:**
```ts
type Stats = { full:number; clean:number; fun:number; energy:number; health:number; love:number }
type Pet = { species:string; name:string; bornAt:number; lifespanDays:number;
  diedAt:number|null; deathCause:'neglect'|'sick'|'old'|null; stats:Stats;
  sick:null|'tummy'|'cold'; poop:number; mess:boolean; napping:boolean;
  counts:Record<string,number>; log:{t:number;kind:string}[]; tickAt:number }
type Action = 'feed'|'snack'|'play'|'walk'|'bath'|'sleep'|'wake'|'hospital'|'tidy'|'pet'
newPet(species, name, now, rand?): Pet
advance(pet, to, tzOffsetMin, rand?): Pet      // 10분 단위 따라잡기, 순수
act(pet, action, now, rand?): { pet: Pet; ok: boolean; reason?: string }
stageOf(pet, now): 'baby'|'child'|'adult'|'senior'
ageDays(pet, now): number
isAsleep(pet, now, tzOffsetMin): boolean
personalityOf(pet): string
moodOf(pet): 'sick'|'hungry'|'dirty'|'bored'|'tired'|'happy'|'ok'
```
값: 깨어 있을 때 시간당 full −10, clean −6.25, fun −8.33, energy −6.25. 잠들면 energy +12.5/h,
밤(23~07시)에는 full/clean/fun 감소 ×0.3. full 또는 clean이 0이면 health −100/48h.
아프면 추가로 health −100/36h. full·clean ≥ 50이고 건강하면 health +2/h.
full<30 또는 clean<30이면 발병 4%/h(노년 ×2). 수명 27~33일. 단계 경계 3/8/24일.

- [ ] 테스트 먼저: 10시간 뒤 full≈0, 밤 감속, 72시간 방치 사망(neglect, 2.5~3.5일), 수명 사망(old),
  발병 후 방치 사망(sick), 병원 치료, 40일 따라잡기, 죽은 펫 불변, 스탯 범위 0~100, 과식 거부.
- [ ] 구현 → `npm test` 통과 → 커밋.

### Task 3: DB 스키마와 인증 함수

**Files:** `supabase/schema.sql`, `api/_lib.ts`, `api/signup.ts`, `api/recover.ts`, `api/_lib.test.ts`

- `accounts(user_id PK, username UNIQUE, key_hash, failed_attempts, locked_until)` RLS on, 정책 없음.
- `pets(id, user_id, species, name, born_at, lifespan_days, died_at, death_cause, state jsonb, last_tick_at)`,
  살아있는 펫 유니크 인덱스, `last_tick_at`·`born_at` 서버 시각 트리거, 본인 행 RLS.
- `diary(id, user_id, pet_id, kind, text, created_at)` 본인 행 RLS.
- `server_now()` RPC.
- `POST /api/signup {username,password}` → `{recoveryKey}` / 409 중복 / 400 형식.
- `POST /api/recover {username,recoveryKey,newPassword}` → `{recoveryKey}` / 400 동일 문구. 15분 5회 잠금.
- `_lib.ts`: `validUsername`, `validPassword`, `newRecoveryKey()`, `hashKey()`, `normalizeKey()`.
- [ ] `_lib` 단위 테스트(형식 검증, 키 정규화 후 해시 일치) → 구현 → 커밋.

### Task 4: 데이터 계층 (`src/data.ts`)

**Produces:** `signUp, signIn, signOut, recover, currentUser, serverNow, loadPet, createPet, savePet, addDiary, loadDiary, loadMemorial`.
`VITE_SUPABASE_ANON_KEY`가 없으면 localStorage 구현으로 대체(개발 확인용). 저장 실패 시 localStorage에 보관, 다음 저장에서 재시도.

### Task 5: 씬 (`src/scene.ts`, `src/assets.ts`)

방(바닥·벽·창문·소파·화분·조명·펫 침대·밥그릇·욕조·쓰레기통)과 공원(잔디·나무·꽃·울타리·벤치)을 Kenney 모델로 배치.
현실 시각에 맞춘 낮/저녁/밤 조명. 화면 비율에 맞춘 카메라. 부드러운 그림자.

### Task 6: 펫 행동 (`src/petActor.ts`)

모델 로드, 클립 전환, 자율 배회, 포인터 바라보기, 쓰다듬기 반응, 잠(웅크림+숨쉬기), 아픔(떨림), 단계별 크기, 말풍선 이모트.

### Task 7: UI와 돌봄 흐름 (`src/ui/*`, `src/main.ts`, `src/style.css`, `src/audio.ts`)

로그인/가입/복구키 표시/복구, 입양(12종 3D 미리보기), HUD, 행동 버튼 6개, 먹이 드래그, 공 던지기, 문질러 목욕,
공원 산책, 병원, 치우기, 일기, 추모 앨범, 사망 화면, 음소거.

### Task 8: 실행 확인과 배포 준비

- [ ] 모바일(390×844)·PC(1440×900) 뷰포트에서 실제 실행해 화면 확인.
- [ ] `README.md`에 Supabase/Vercel 설정 절차. `main` 푸시.
