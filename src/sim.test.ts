import { describe, expect, it } from 'vitest'
import { act, advance, ageDays, isAsleep, moodOf, newPet, stageOf, type Pet } from './sim'

const H = 3600_000
const D = 24 * H
// 2026-01-05 12:00 UTC, tz 0 → 현지 정오
const NOON = Date.UTC(2026, 0, 5, 12)
const never = () => 0.999 // 확률 이벤트가 일어나지 않음
const always = () => 0

const fresh = (rand = never) => ({ ...newPet('dog', '콩이', NOON, rand), lifespanDays: 30 })

function inRange(p: Pet) {
  for (const v of Object.values(p.stats)) {
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(100)
  }
}

describe('advance', () => {
  it('깨어 있는 10시간 동안 포만감이 거의 바닥난다', () => {
    const p = advance(fresh(), NOON + 10 * H, 0, never)
    expect(p.stats.full).toBeLessThan(2)
    expect(p.diedAt).toBeNull()
  })

  it('밤에는 감소가 느리다', () => {
    const night = Date.UTC(2026, 0, 5, 23)
    const a = { ...fresh(), tickAt: night }
    const b = { ...fresh(), tickAt: NOON }
    const lostNight = 100 - advance(a, night + 6 * H, 0, never).stats.full
    const lostDay = 100 - advance(b, NOON + 6 * H, 0, never).stats.full
    expect(lostNight).toBeLessThan(lostDay * 0.4)
  })

  it('방치하면 약 3일 만에 죽는다', () => {
    const p = advance(fresh(), NOON + 10 * D, 0, never)
    expect(p.deathCause).toBe('neglect')
    const days = (p.diedAt! - NOON) / D
    expect(days).toBeGreaterThan(2.2)
    expect(days).toBeLessThan(3.5)
  })

  it('40일 미접속을 한 번에 따라잡고 사망 시각을 과거로 기록한다', () => {
    const p = advance(fresh(), NOON + 40 * D, 0)
    expect(p.diedAt).not.toBeNull()
    expect(p.diedAt!).toBeLessThan(NOON + 5 * D)
    inRange(p)
  })

  it('잘 돌봐도 수명이 다하면 죽는다', () => {
    let p = fresh()
    for (let t = NOON; t < NOON + 31 * D && !p.diedAt; t += 3 * H) {
      p = advance(p, t, 0, never)
      p = act(p, 'wake', t).pet
      p = act(p, 'feed', t, never).pet
      p = act(p, 'bath', t).pet
      p = act(p, 'tidy', t).pet
    }
    expect(p.deathCause).toBe('old')
    expect(ageDays(p, p.diedAt!)).toBeCloseTo(30, 0)
  })

  it('병을 치료하지 않으면 병으로 죽고, 병원에 가면 낫는다', () => {
    let sick: Pet = { ...fresh(), sick: 'cold' }
    const cured = act(sick, 'hospital', NOON).pet
    expect(cured.sick).toBeNull()

    for (let t = NOON; t < NOON + 6 * D && !sick.diedAt; t += 3 * H) {
      sick = advance(sick, t, 0, never)
      sick = act(sick, 'wake', t).pet
      sick = act(sick, 'feed', t, never).pet
      sick = act(sick, 'bath', t).pet
      sick = act(sick, 'tidy', t).pet
    }
    expect(sick.deathCause).toBe('sick')
  })

  it('배고프면 병에 걸릴 수 있다', () => {
    const p = advance(fresh(), NOON + 9 * H, 0, always)
    expect(p.sick).not.toBeNull()
    expect(p.log.some((l) => l.kind === 'sick')).toBe(true)
  })

  it('죽은 펫은 시간이 흘러도 행동을 해도 변하지 않는다', () => {
    const dead = advance(fresh(), NOON + 10 * D, 0, never)
    expect(advance(dead, NOON + 20 * D, 0)).toEqual(dead)
    const r = act(dead, 'feed', NOON + 20 * D)
    expect(r.ok).toBe(false)
    expect(r.pet).toEqual(dead)
  })

  it('성장 단계가 바뀌면 기록한다', () => {
    let p = fresh()
    for (let t = NOON; t < NOON + 9 * D; t += 3 * H) {
      p = advance(p, t, 0, never)
      p = act(p, 'wake', t).pet
      p = act(p, 'feed', t, never).pet
      p = act(p, 'bath', t).pet
      p = act(p, 'tidy', t).pet
    }
    expect(stageOf(p, NOON + 9 * D)).toBe('adult')
    expect(p.log.map((l) => l.kind)).toEqual(expect.arrayContaining(['grow-child', 'grow-adult']))
  })
})

describe('act', () => {
  it('스탯은 0~100을 벗어나지 않는다', () => {
    let p = fresh()
    for (let i = 0; i < 30; i++) {
      for (const a of ['feed', 'snack', 'play', 'walk', 'bath', 'pet', 'hospital'] as const) p = act(p, a, NOON).pet
    }
    inRange(p)
  })

  it('배부르면 밥을 거부한다', () => {
    const r = act(fresh(), 'feed', NOON)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('full')
  })

  it('지치면 놀지 않는다', () => {
    const p = fresh()
    p.stats.energy = 5
    expect(act(p, 'play', NOON).reason).toBe('tired')
  })

  it('밤에는 자고, 깨우면 잠시 깨어 있다', () => {
    const night = Date.UTC(2026, 0, 5, 23, 30)
    let p = { ...fresh(), tickAt: night }
    expect(isAsleep(p, night, 0)).toBe(true)
    expect(act(p, 'play', night).reason).toBe('asleep')
    p = act(p, 'wake', night).pet
    expect(isAsleep(p, night + 10 * 60_000, 0)).toBe(false)
    expect(isAsleep(p, night + 2 * H, 0)).toBe(true)
  })

  it('시간대 오프셋을 반영한다 (KST 밤)', () => {
    // UTC 15:00 = KST 00:00, getTimezoneOffset() = -540
    expect(isAsleep(fresh(), Date.UTC(2026, 0, 5, 15), -540)).toBe(true)
    expect(isAsleep(fresh(), Date.UTC(2026, 0, 5, 3), -540)).toBe(false)
  })

  it('치우면 배변과 말썽이 사라진다', () => {
    const p = act({ ...fresh(), poop: 2, mess: true }, 'tidy', NOON).pet
    expect(p.poop).toBe(0)
    expect(p.mess).toBe(false)
  })

  it('기분은 가장 급한 문제를 알려준다', () => {
    const p = fresh()
    expect(moodOf(p)).toBe('happy')
    p.stats.full = 10
    expect(moodOf(p)).toBe('hungry')
    p.sick = 'tummy'
    expect(moodOf(p)).toBe('sick')
  })
})
