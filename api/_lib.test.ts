import { expect, it } from 'vitest'
import { hashKey, newRecoveryKey, validPassword, validUsername } from './_lib'

it('아이디 형식을 검사한다', () => {
  expect(validUsername('kong_2')).toBe(true)
  for (const bad of ['abc', 'Kong', 'a b c d', 'kong@x', 'a'.repeat(21), 123, null]) expect(validUsername(bad)).toBe(false)
})

it('비밀번호 길이를 검사한다', () => {
  expect(validPassword('12345678')).toBe(true)
  expect(validPassword('1234567')).toBe(false)
  expect(validPassword(undefined)).toBe(false)
})

it('복구키는 매번 다르고 형식이 일정하다', () => {
  const a = newRecoveryKey()
  expect(a).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/)
  expect(newRecoveryKey()).not.toBe(a)
})

it('복구키는 대소문자·하이픈·공백과 무관하게 같은 해시가 된다', () => {
  const k = newRecoveryKey()
  expect(hashKey(` ${k.toLowerCase().replaceAll('-', ' ')} `)).toBe(hashKey(k))
  expect(hashKey(k)).not.toBe(hashKey(newRecoveryKey()))
})
