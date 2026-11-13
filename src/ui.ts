// 화면 위에 얹는 2D UI. 게임 규칙을 바꾸지 않고, 일어난 일을 콜백으로 알린다.
import { isMuted, setMuted, sfx } from './audio'
import type { DiaryEntry, Memorial } from './data'
import { icon } from './icons'
import { FINDS } from './rewards'
import { ageDays, personalityOf, stageOf, type Pet, type Stats } from './sim'

type Child = Node | string | null | undefined | false
type Attrs = Record<string, string | boolean | ((e: any) => void)>

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k, v)
    else if (v === true) el.setAttribute(k, '')
    else if (v !== false) el.setAttribute(k, v)
  }
  for (const c of children) if (c) el.append(c)
  return el
}

const root = () => document.querySelector<HTMLElement>('#ui')!

export const SPECIES: { id: string; name: string; trait: string }[] = [
  { id: 'dog', name: '강아지', trait: '사람을 제일 좋아해요' },
  { id: 'cat', name: '고양이', trait: '도도하지만 늘 곁에 있어요' },
  { id: 'bunny', name: '토끼', trait: '겁이 많고 깡충거려요' },
  { id: 'chick', name: '병아리', trait: '어디든 졸졸 따라와요' },
  { id: 'parrot', name: '앵무새', trait: '흥이 많아요' },
  { id: 'pig', name: '아기 돼지', trait: '먹는 게 제일 좋아요' },
  { id: 'fox', name: '여우', trait: '호기심이 많아요' },
  { id: 'panda', name: '판다', trait: '느긋하게 뒹굴어요' },
  { id: 'koala', name: '코알라', trait: '잠이 많아요' },
  { id: 'penguin', name: '펭귄', trait: '뒤뚱뒤뚱 걸어요' },
  { id: 'monkey', name: '원숭이', trait: '장난을 좋아해요' },
  { id: 'deer', name: '아기 사슴', trait: '조용하고 순해요' },
]
export const speciesName = (id: string) => SPECIES.find((s) => s.id === id)?.name ?? id

/** 받침 유무에 따라 조사를 고른다: josa('콩이', '을', '를') → '콩이를' */
export function josa(word: string, withFinal: string, without: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  const hasFinal = code >= 0 && code <= 11171 ? code % 28 !== 0 : false
  return word + (hasFinal ? withFinal : without)
}

const STAGE_LABEL = { baby: '아기', child: '어린이', adult: '어른', senior: '어르신' }
const CAUSE_TEXT = {
  neglect: '오랫동안 배고프고 지쳐 있었어요.',
  sick: '아픈 것을 끝내 이겨내지 못했어요.',
  old: '곁에서 오래 지내다 편안히 잠들었어요.',
}

function button(label: string, onClick: () => void, cls = '') {
  return h('button', { class: `btn ${cls}`, type: 'button', click: () => { sfx.tap(); onClick() } }, label)
}

function iconButton(name: string, label: string, onClick: () => void, cls = '') {
  return h('button', { class: `round ${cls}`, type: 'button', 'aria-label': label, title: label, click: () => { sfx.tap(); onClick() } }, icon(name))
}

// ── 로그인 / 가입 / 복구 ───────────────────────────────

export type AuthHandlers = {
  signIn(id: string, pw: string): Promise<void>
  signUp(id: string, pw: string): Promise<string>
  recover(id: string, key: string, pw: string): Promise<string | null>
}

/** 로그인이 끝나면 끝나는 Promise */
export function showAuth(handlers: AuthHandlers, demo: boolean): Promise<void> {
  return new Promise((done) => {
    let mode: 'in' | 'up' | 'find' = 'in'
    const title = h('h1', { class: 'logo' }, '콩닥콩닥')
    const panel = h('section', { class: 'sheet auth' })
    const wrap = h('div', { class: 'auth-wrap' }, title, panel)
    root().append(wrap)

    const render = () => {
      const id = h('input', { name: 'username', autocomplete: 'username', placeholder: '아이디', maxlength: '20', autocapitalize: 'none', spellcheck: 'false', required: true })
      const pw = h('input', { name: 'password', type: 'password', autocomplete: mode === 'in' ? 'current-password' : 'new-password', placeholder: mode === 'find' ? '새 비밀번호' : '비밀번호', required: true })
      const key = h('input', { name: 'key', placeholder: '복구키', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', required: true })
      const msg = h('p', { class: 'msg', role: 'alert' })
      const submit = h('button', { class: 'btn primary', type: 'submit' }, { in: '들어가기', up: '가입하기', find: '비밀번호 바꾸기' }[mode])
      const hint = { in: '', up: '아이디는 영문 소문자·숫자 4~20자, 비밀번호는 8자 이상이에요. 이름이나 이메일은 받지 않아요.', find: '가입할 때 받은 복구키를 넣어 주세요.' }[mode]

      const form = h('form', {
        submit: async (e: SubmitEvent) => {
          e.preventDefault()
          msg.textContent = ''
          submit.disabled = true
          const u = id.value.trim().toLowerCase()
          try {
            if (mode !== 'in' && !/^[a-z0-9_]{4,20}$/.test(u)) throw new Error('아이디는 영문 소문자·숫자·_ 4~20자로 정해 주세요')
            if (mode !== 'in' && pw.value.length < 8) throw new Error('비밀번호는 8자 이상으로 정해 주세요')
            if (mode === 'in') await handlers.signIn(u, pw.value)
            else {
              const newKey = mode === 'up' ? await handlers.signUp(u, pw.value) : await handlers.recover(u, key.value, pw.value)
              wrap.remove()
              if (newKey) await showRecoveryKey(newKey, mode === 'find')
              return done()
            }
            wrap.remove()
            done()
          } catch (err) {
            msg.textContent = (err as Error).message
            submit.disabled = false
          }
        },
      }, id, mode === 'find' && key, pw, hint && h('p', { class: 'hint' }, hint), msg, submit)

      const link = (label: string, to: typeof mode) => h('button', { class: 'link', type: 'button', click: () => { mode = to; render() } }, label)
      panel.replaceChildren(
        form,
        h('div', { class: 'links' },
          mode !== 'in' && link('로그인', 'in'),
          mode !== 'up' && link('처음이에요', 'up'),
          mode !== 'find' && !demo && link('비밀번호를 잊었어요', 'find')),
        demo ? h('p', { class: 'hint' }, '체험 모드: 서버에 연결되지 않아 이 브라우저에만 저장돼요.') : '',
      )
    }
    render()
  })
}

function showRecoveryKey(key: string, renewed: boolean): Promise<void> {
  return new Promise((done) => {
    const ok = h('input', { type: 'checkbox', id: 'kept' })
    const go = button('시작하기', () => { el.remove(); done() }, 'primary')
    go.disabled = true
    ok.addEventListener('change', () => (go.disabled = !ok.checked))
    const copied = h('span', { class: 'hint', role: 'status' })
    const el = h('div', { class: 'veil' },
      h('section', { class: 'sheet keybox', role: 'dialog', 'aria-label': '복구키' },
        h('h2', {}, renewed ? '새 복구키예요' : '복구키를 꼭 적어 두세요'),
        h('p', {}, renewed ? '예전 복구키는 이제 쓸 수 없어요.' : '비밀번호를 잊었을 때 계정을 되찾는 유일한 방법이에요. 지금 한 번만 보여 드려요.'),
        h('output', { class: 'key' }, key),
        h('div', { class: 'row' },
          button('복사하기', () => { void navigator.clipboard?.writeText(key).then(() => (copied.textContent = '복사했어요')) }),
          copied),
        h('label', { class: 'check', for: 'kept' }, ok, '안전한 곳에 적어 두었어요'),
        go))
    root().append(el)
  })
}

// ── 입양 ─────────────────────────────────────────────

/** 종을 넘길 때마다 onPick을 부르고, 입양을 확정하면 결과를 돌려준다 */
export function showAdopt(onPick: (species: string) => void): Promise<{ species: string; name: string }> {
  return new Promise((done) => {
    let i = Math.floor(Math.random() * SPECIES.length)
    const kind = h('strong', { class: 'kind' })
    const trait = h('p', { class: 'trait' })
    const count = h('span', { class: 'count' })
    const name = h('input', { placeholder: '이름을 지어 주세요', maxlength: '12', required: true, 'aria-label': '이름' })
    const show = () => {
      const s = SPECIES[i]
      kind.textContent = s.name
      trait.textContent = s.trait
      count.textContent = `${i + 1} / ${SPECIES.length}`
      onPick(s.id)
    }
    const step = (d: number) => { i = (i + d + SPECIES.length) % SPECIES.length; show() }
    const el = h('div', { class: 'adopt' },
      h('p', { class: 'banner' }, '함께 지낼 친구를 골라 주세요'),
      h('section', { class: 'sheet' },
        h('div', { class: 'picker' },
          iconButton('left', '이전 친구', () => step(-1)),
          h('div', { class: 'who' }, kind, trait, count),
          iconButton('right', '다음 친구', () => step(1))),
        h('form', {
          submit: (e: SubmitEvent) => {
            e.preventDefault()
            const n = name.value.trim()
            if (!n) return name.focus()
            el.remove()
            done({ species: SPECIES[i].id, name: n })
          },
        }, name, h('button', { class: 'btn primary', type: 'submit' }, '입양하기'))))
    root().append(el)
    show()
  })
}

// ── 게임 화면 ─────────────────────────────────────────

const METERS: { key: keyof Stats; icon: string; label: string }[] = [
  { key: 'full', icon: 'bowl', label: '포만감' },
  { key: 'clean', icon: 'drop', label: '청결' },
  { key: 'fun', icon: 'ball', label: '즐거움' },
  { key: 'energy', icon: 'bolt', label: '체력' },
  { key: 'health', icon: 'cross', label: '건강' },
  { key: 'love', icon: 'heart', label: '애정' },
]

export const FOODS = [
  { id: 'kibble', label: '사료', icon: 'bowl', model: 'bowl-cereal', snack: false },
  { id: 'meat', label: '고기', icon: 'meat', model: 'meat-cooked', snack: false },
  { id: 'cookie', label: '간식', icon: 'cookie', model: 'cookie', snack: true },
] as const
export type Food = (typeof FOODS)[number]

export type HudHandlers = {
  action(name: 'feed' | 'play' | 'walk' | 'bath' | 'sleep' | 'hospital'): void
  food(food: Food): void
  stop(): void
  catchBall(): void
  diary(): void
  logout(): void
}

export function createHud(on: HudHandlers) {
  const name = h('strong', {})
  const age = h('span', {})
  const meters = METERS.map((m) => {
    const value = h('b', {})
    const el = h('li', { class: 'meter', title: m.label }, h('i', {}, icon(m.icon)), h('span', {}, m.label), value)
    return { ...m, el, value }
  })
  const detail = h('p', { class: 'detail' })
  const status = h('button', { class: 'status', type: 'button', 'aria-expanded': 'false', 'aria-label': '상태 자세히 보기',
    click: () => status.setAttribute('aria-expanded', String(status.getAttribute('aria-expanded') !== 'true')) },
    h('div', { class: 'who' }, name, age), h('ul', {}, ...meters.map((m) => m.el)), detail)

  const soundBtn = iconButton(isMuted() ? 'mute' : 'sound', '소리', () => {
    setMuted(!isMuted())
    soundBtn.replaceChildren(icon(isMuted() ? 'mute' : 'sound'))
  })
  const offline = h('span', { class: 'offline', role: 'status', hidden: true }, '저장 안 됨')
  const menu = h('nav', { class: 'menu' }, offline, iconButton('book', '일기', on.diary), soundBtn, iconButton('door', '나가기', on.logout))

  const act = (id: Parameters<HudHandlers['action']>[0], ic: string, label: string) =>
    h('button', { class: `act ${id}`, type: 'button', click: () => { sfx.tap(); on.action(id) } }, icon(ic), h('span', {}, label))
  const sleepBtn = act('sleep', 'moon', '재우기')
  const actions = h('nav', { class: 'actions', 'aria-label': '돌보기' },
    act('feed', 'bowl', '밥'), act('play', 'ball', '놀이'), act('walk', 'paw', '산책'),
    act('bath', 'bubbles', '목욕'), sleepBtn, act('hospital', 'cross', '병원'))

  // 먹이 고르기: 끌어다 놓거나 눌러서 준다
  const tray = h('div', { class: 'tray', hidden: true },
    h('p', {}, '그릇에 끌어다 주세요'),
    ...FOODS.map((f) => {
      const el = h('button', { class: 'food', type: 'button' }, icon(f.icon), h('span', {}, f.label))
      let start: { x: number; y: number } | null = null
      el.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId) })
      el.addEventListener('pointermove', (e) => {
        if (start) el.style.transform = `translate(${e.clientX - start.x}px, ${e.clientY - start.y}px) rotate(-6deg) scale(1.1)`
      })
      el.addEventListener('pointerup', () => { start = null; el.style.transform = '' })
      el.addEventListener('pointercancel', () => { start = null; el.style.transform = '' })
      el.addEventListener('click', () => on.food(f))
      return el
    }))

  const hintText = h('span', {})
  const catchBtn = button('캐치', on.catchBall, 'catch-ball')
  catchBtn.hidden = true
  const hint = h('div', { class: 'hintbar', hidden: true }, hintText, catchBtn, button('그만하기', on.stop))
  const toastEl = h('p', { class: 'toast', role: 'status', hidden: true })
  const bubble = h('div', { class: 'bubble', hidden: true })
  const el = h('div', { class: 'hud' }, status, menu, toastEl, bubble, tray, actions, hint)
  root().append(el)

  let toastTimer = 0, bubbleTimer = 0
  return {
    el,
    update(pet: Pet, now: number, asleep: boolean) {
      name.textContent = pet.name
      age.textContent = `${Math.floor(ageDays(pet, now))}살 ${STAGE_LABEL[stageOf(pet, now)]}`
      for (const m of meters) {
        const v = Math.round(pet.stats[m.key])
        m.el.style.setProperty('--v', `${v}%`)
        m.el.classList.toggle('low', v < 30)
        m.value.textContent = String(v)
      }
      detail.textContent = `성격: ${personalityOf(pet)}${pet.sick ? ' / 아파요' : ''}`
      sleepBtn.replaceChildren(icon(asleep ? 'sun' : 'moon'), h('span', {}, asleep ? '깨우기' : '재우기'))
      // 급한 돌봄 버튼을 반짝여 알려준다 (배변·말썽은 버튼이 아니라 바닥을 눌러 치운다)
      const st = pet.stats
      const need = { feed: st.full < 30, bath: st.clean < 30, sleep: st.energy < 20 && !asleep, play: st.fun < 30 && st.energy >= 15 && !pet.sick, hospital: !!pet.sick }
      for (const b of actions.children) b.classList.toggle('need', need[b.classList[1] as keyof typeof need] ?? false)
    },
    toast(text: string) {
      toastEl.textContent = text
      toastEl.hidden = false
      clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => (toastEl.hidden = true), 3200)
    },
    /** 펫 머리 위 말풍선 */
    emote(kind: string) {
      const map: Record<string, string> = { hungry: 'bowl', dirty: 'drop', tired: 'zzz', bored: 'ball', sick: 'sick', happy: 'heart', heart: 'heart', zzz: 'zzz', note: 'note' }
      bubble.replaceChildren(icon(map[kind] ?? 'heart'))
      bubble.hidden = false
      clearTimeout(bubbleTimer)
      bubbleTimer = window.setTimeout(() => (bubble.hidden = true), 2200)
    },
    placeBubble(x: number, y: number) { bubble.style.transform = `translate(${x}px, ${y}px)` },
    /** 놀이·목욕·산책처럼 한 가지에 집중하는 동안에는 안내만 보인다. null이면 평소 화면 */
    setMode(text: string | null, withTray = false) {
      tray.hidden = !withTray
      hint.hidden = !text || withTray
      actions.hidden = !!text && !withTray
      hintText.textContent = text ?? ''
    },
    setOffline(v: boolean) { offline.hidden = !v },
    setCatch(label: string | null) {
      catchBtn.hidden = !label
      if (label) catchBtn.textContent = label
      catchBtn.classList.toggle('ready', label === '지금 캐치!')
    },
    remove() { el.remove() },
  }
}
export type Hud = ReturnType<typeof createHud>

/** 화면을 잠깐 덮는다 (장소 이동, 병원). 가려진 동안 during을 실행한다 */
export async function curtain(text: string, iconName: string, during: () => void | Promise<void>, hold = 900) {
  const el = h('div', { class: 'curtain' }, h('div', {}, icon(iconName), h('p', {}, text)))
  root().append(el)
  await new Promise((r) => setTimeout(r, 380))
  await during()
  await new Promise((r) => setTimeout(r, hold))
  el.classList.add('out')
  setTimeout(() => el.remove(), 400)
}

const dateText = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}
const livedDays = (m: { born_at: string; died_at: string }) =>
  Math.max(1, Math.round((new Date(m.died_at).getTime() - new Date(m.born_at).getTime()) / 86_400_000))

export function showDiary(petName: string | null, entries: DiaryEntry[], memorial: Memorial[], discoveries: string[]) {
  const close = () => el.remove()
  const el = h('div', { class: 'veil', click: (e: Event) => e.target === el && close() },
    h('article', { class: 'notebook', role: 'dialog', 'aria-label': '일기' },
      iconButton('close', '닫기', close, 'close'),
      petName && h('h2', {}, `${petName}의 일기`),
      petName && (entries.length
        ? h('ol', {}, ...[...entries].reverse().map((e) => h('li', {}, h('time', {}, dateText(e.created_at)), e.body)))
        : h('p', {}, '아직 적힌 일기가 없어요. 함께 지내다 보면 채워져요.')),
      petName && h('h2', {}, `산책 도감 ${discoveries.length}/${FINDS.length}`),
      petName && h('ul', {}, ...FINDS.map((item, i) =>
        h('li', {}, discoveries.includes(item) ? item : `아직 발견하지 못했어요 (${i + 1}번)`))),
      memorial.length > 0 && h('h2', {}, '먼저 떠난 친구들'),
      memorial.length > 0 && h('ul', {}, ...memorial.map((m) =>
        h('li', {}, h('time', {}, dateText(m.died_at)), `${speciesName(m.species)} ${m.name}, ${livedDays(m)}일을 함께했다.`)))))
  root().append(el)
}

export function showFarewell(pet: Pet, onDiary: () => void, onAdopt: () => void) {
  const days = Math.max(1, Math.round(ageDays(pet, pet.diedAt!)))
  const el = h('div', { class: 'veil farewell' },
    h('section', { class: 'sheet', role: 'dialog', 'aria-label': '작별' },
      h('h2', {}, `${josa(pet.name, '이', '가')} 무지개다리를 건넜어요`),
      h('p', {}, CAUSE_TEXT[pet.deathCause!]),
      h('p', {}, `${days}일을 함께했어요. 일기는 그대로 남아 있어요.`),
      h('div', { class: 'row' }, button('일기 보기', onDiary), button('새 친구 맞이하기', () => { el.remove(); onAdopt() }, 'primary'))))
  root().append(el)
}
