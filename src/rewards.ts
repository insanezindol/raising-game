import type { Pet } from './sim'

export const FINDS = ['네잎클로버', '반짝이는 조약돌', '도토리', '예쁜 낙엽', '나비', '민들레 씨앗', '달팽이'] as const

export const catchWindow = (progress: number) => progress >= 0.68 && progress < 0.96

export const greetingTier = (love: number) => love >= 70 ? 2 : love >= 40 ? 1 : 0

export function discover(pet: Pet, item: (typeof FINDS)[number], now: number): Pet {
  const discoveries = pet.discoveries ?? []
  if (discoveries.includes(item)) return pet
  return {
    ...pet,
    discoveries: [...discoveries, item],
    log: [...pet.log, { t: now, kind: 'discovery', body: `첫 발견 · ${item}` }],
  }
}
