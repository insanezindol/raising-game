import { describe, expect, it } from 'vitest'
import { catchWindow, discover, FINDS, greetingTier } from './rewards'
import { newPet } from './sim'

describe('펫과 함께 얻는 보상', () => {
  it('공이 떨어지는 구간에서만 캐치를 판정한다', () => {
    expect([0.65, 0.68, 0.9, 0.96, 1].map(catchWindow)).toEqual([false, true, true, false, false])
  })

  it('도감 필드가 없는 저장에서도 발견을 기록하고 중복 발견을 구분한다', () => {
    const old = newPet('dog', '콩이', 0)
    delete old.discoveries
    const first = discover(old, FINDS[0], 100)
    expect(first.discoveries).toEqual([FINDS[0]])
    expect(first.log).toEqual([{ t: 100, kind: 'discovery', body: '첫 발견 · 네잎클로버' }])
    expect(old.discoveries).toBeUndefined()
    expect(discover(first, FINDS[0], 200)).toBe(first)
  })

  it('애정도 기준에서 새 재회 행동을 해금한다', () => {
    expect([20, 39, 40, 69, 70, 100].map(greetingTier)).toEqual([0, 0, 1, 1, 2, 2])
  })
})
