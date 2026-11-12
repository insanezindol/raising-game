// 게임 규칙 전체. 순수 함수만 있고 화면·네트워크를 모른다.

export type Stats = { full: number; clean: number; fun: number; energy: number; health: number; love: number }
export type Stage = 'baby' | 'child' | 'adult' | 'senior'
export type Action = 'feed' | 'snack' | 'play' | 'walk' | 'bath' | 'sleep' | 'wake' | 'hospital' | 'tidy' | 'pet'
export type Mood = 'sick' | 'hungry' | 'dirty' | 'tired' | 'bored' | 'happy' | 'ok'

export type Pet = {
  species: string
  name: string
  bornAt: number
  lifespanDays: number
  diedAt: number | null
  deathCause: 'neglect' | 'sick' | 'old' | null
  stats: Stats
  sick: null | 'tummy' | 'cold'
  poop: number
  mess: boolean
  napping: boolean
  awakeUntil: number
  counts: Record<string, number>
  discoveries?: string[]
  log: { t: number; kind: string; body?: string }[]
  tickAt: number
}

const H = 3600_000
const DAY = 24 * H
const STEP = 10 * 60_000
const STAGES: [number, Stage][] = [[24, 'senior'], [8, 'adult'], [3, 'child'], [0, 'baby']]

type Rand = () => number
const clamp = (v: number) => Math.max(0, Math.min(100, v))

export function newPet(species: string, name: string, now: number, rand: Rand = Math.random): Pet {
  return {
    species, name, bornAt: now, lifespanDays: 27 + rand() * 6,
    diedAt: null, deathCause: null,
    stats: { full: 100, clean: 100, fun: 100, energy: 100, health: 100, love: 20 },
    sick: null, poop: 0, mess: false, napping: false, awakeUntil: 0,
    counts: {}, log: [], tickAt: now,
  }
}

export const ageDays = (p: Pet, now: number) => ((p.diedAt ?? now) - p.bornAt) / DAY

export function stageOf(p: Pet, now: number): Stage {
  const age = ageDays(p, now)
  return STAGES.find(([from]) => age >= from)![1]
}

/** tzOffsetMin은 Date#getTimezoneOffset() 값 (KST = -540) */
export function isNight(t: number, tzOffsetMin: number) {
  const h = (((t - tzOffsetMin * 60_000) / H) % 24 + 24) % 24
  return h >= 23 || h < 7
}

export function isAsleep(p: Pet, now: number, tzOffsetMin: number) {
  return p.napping || (isNight(now, tzOffsetMin) && now >= p.awakeUntil)
}

function step(p: Pet, t: number, tz: number, rand: Rand) {
  const s = p.stats
  const dt = STEP / H
  if ((t - p.bornAt) / DAY >= p.lifespanDays) return die(p, t, 'old')

  const before = stageOf(p, t - STEP)
  const stage = stageOf(p, t)
  if (stage !== before) p.log.push({ t, kind: `grow-${stage}` })

  const night = isNight(t, tz)
  const asleep = isAsleep(p, t, tz)
  const slow = night ? 0.3 : asleep ? 0.6 : 1

  s.full = clamp(s.full - 10 * slow * dt)
  s.clean = clamp(s.clean - (6.25 * (1 + 0.5 * p.poop) + (p.mess ? 2 : 0)) * slow * dt)
  s.fun = clamp(s.fun - 8.33 * slow * dt)
  s.energy = clamp(s.energy + (asleep ? 12.5 : -6.25) * dt)
  if (s.energy >= 100) p.napping = false
  if (s.energy <= 0) p.napping = true
  if (s.fun < 20 || s.full < 20) s.love = clamp(s.love - 0.5 * dt)

  if (!asleep) {
    if (p.poop < 3 && s.full > 20 && rand() < 0.25 * dt) p.poop++
    if (!p.mess && s.fun < 40 && rand() < 0.03 * dt) p.mess = true
  }
  if (!p.sick && (s.full < 30 || s.clean < 30 || p.poop >= 2)) {
    if (rand() < 0.04 * (stage === 'senior' ? 2 : 1) * dt) {
      p.sick = s.clean < 30 ? 'cold' : 'tummy'
      p.log.push({ t, kind: 'sick' })
    }
  }

  const starving = s.full <= 0 || s.clean <= 0
  if (starving && p.sick) s.health -= (100 / 48) * dt
  else if (starving || p.sick) s.health -= (100 / 60) * dt
  else if (s.full >= 50 && s.clean >= 50) s.health += 2 * dt
  s.health = clamp(s.health)
  if (s.health <= 0) die(p, t, starving ? 'neglect' : 'sick')
}

function die(p: Pet, t: number, cause: Pet['deathCause']) {
  p.diedAt = t
  p.deathCause = cause
  p.log.push({ t, kind: 'died' })
}

/** tickAt부터 to까지 10분 단위로 진행한다. 입력은 바꾸지 않는다. */
export function advance(pet: Pet, to: number, tzOffsetMin: number, rand: Rand = Math.random): Pet {
  if (pet.diedAt || to - pet.tickAt < STEP) return pet
  const p = structuredClone(pet)
  while (!p.diedAt && p.tickAt + STEP <= to) {
    p.tickAt += STEP
    step(p, p.tickAt, tzOffsetMin, rand)
  }
  return p
}

const NEEDS_AWAKE: Action[] = ['feed', 'snack', 'play', 'walk', 'bath', 'sleep', 'hospital']

export function act(
  pet: Pet, action: Action, now: number, rand: Rand = Math.random, tzOffsetMin = 0,
): { pet: Pet; ok: boolean; reason?: string } {
  const no = (reason: string) => ({ pet, ok: false, reason })
  if (pet.diedAt) return no('dead')
  if (NEEDS_AWAKE.includes(action) && isAsleep(pet, now, tzOffsetMin)) return no('asleep')

  const p = structuredClone(pet)
  const s = p.stats
  const first = !p.counts[action]

  switch (action) {
    case 'feed':
      if (s.full > 90) return no('full')
      if (s.full > 70 && rand() < 0.15) sicken(p, now)
      s.full += 35
      break
    case 'snack':
      if (s.full > 95) return no('full')
      if (rand() < 0.08) sicken(p, now)
      s.full += 10; s.fun += 10; s.love += 1
      break
    case 'play':
    case 'walk':
      if (p.sick) return no('sick')
      if (s.energy < 15) return no('tired')
      if (action === 'play') { s.fun += 20; s.energy -= 10; s.full -= 5; s.love += 1 }
      else { s.fun += 25; s.health += 3; s.clean -= 15; s.energy -= 15; s.full -= 8; s.love += 2 }
      if (first && action === 'walk') p.log.push({ t: now, kind: 'first-walk' })
      break
    case 'bath':
      s.clean = 100; s.fun -= 5
      break
    case 'sleep':
      if (s.energy > 90) return no('notsleepy')
      p.napping = true
      break
    case 'wake':
      p.napping = false
      p.awakeUntil = now + 30 * 60_000
      break
    case 'hospital':
      s.health += p.sick ? 30 : 5
      s.fun -= 10
      p.sick = null
      if (first) p.log.push({ t: now, kind: 'first-hospital' })
      break
    case 'tidy':
      s.clean += 5 * (p.poop + (p.mess ? 1 : 0))
      p.poop = 0; p.mess = false
      break
    case 'pet':
      s.love += 0.5; s.fun += 0.3
      if (p.counts.pet === 99) p.log.push({ t: now, kind: 'pet-100' })
      break
  }
  // 밤에 깨워서 돌보는 동안은 다시 잠들지 않게 한다
  if (action !== 'sleep' && p.awakeUntil > now) p.awakeUntil = Math.max(p.awakeUntil, now + 15 * 60_000)
  p.counts[action] = (p.counts[action] ?? 0) + 1
  for (const k of Object.keys(s) as (keyof Stats)[]) s[k] = clamp(s[k])
  return { pet: p, ok: true }
}

function sicken(p: Pet, now: number) {
  if (p.sick) return
  p.sick = 'tummy'
  p.log.push({ t: now, kind: 'sick' })
}

export function moodOf(p: Pet): Mood {
  const s = p.stats
  if (p.sick) return 'sick'
  if (s.full < 30) return 'hungry'
  if (s.clean < 30 || p.poop > 0 || p.mess) return 'dirty'
  if (s.energy < 20) return 'tired'
  if (s.fun < 30) return 'bored'
  if (s.full > 60 && s.clean > 60 && s.fun > 60) return 'happy'
  return 'ok'
}

export function personalityOf(p: Pet): string {
  const c = p.counts
  const traits: [number, string][] = [
    [(c.pet ?? 0) / 20, '응석쟁이'],
    [c.play ?? 0, '장난꾸러기'],
    [c.walk ?? 0, '모험가'],
    [((c.feed ?? 0) + (c.snack ?? 0)) / 2, '먹보'],
  ]
  const best = traits.sort((a, b) => b[0] - a[0])[0]
  return best[0] < 3 ? '아직 알아가는 중' : best[1]
}
