import { beforeEach, expect, it, vi } from 'vitest'
import { hashKey } from './_lib'

type Account = { user_id: string; username: string; key_hash: string; failed_attempts: number; locked_until: string | null }
let account: Account
const updateUserById = vi.fn(async () => ({ error: null }))

// accounts 테이블 한 줄만 가진 가짜 DB
const fakeDb = {
  auth: { admin: { updateUserById } },
  from: () => ({
    select: () => ({ eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: v === account.username ? { ...account } : null }) }) }),
    update: (patch: Partial<Account>) => ({ eq: async () => { Object.assign(account, patch); return { error: null } } }),
  }),
}
vi.mock('./_lib.js', async (original) => ({ ...(await original<typeof import('./_lib')>()), admin: () => fakeDb }))
const { default: handler } = await import('./recover')

async function call(body: unknown) {
  const res = { code: 0, body: {} as any, status(c: number) { this.code = c; return this }, json(b: unknown) { this.body = b; return this } }
  await handler({ method: 'POST', body } as any, res as any)
  return res
}

beforeEach(() => {
  account = { user_id: 'u1', username: 'kong_01', key_hash: hashKey('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF'), failed_attempts: 0, locked_until: null }
  updateUserById.mockClear()
})

it('올바른 복구키면 비밀번호를 바꾸고 새 키로 교체한다', async () => {
  const res = await call({ username: 'kong_01', recoveryKey: 'aaaa bbbb cccc dddd eeee ffff', newPassword: 'newpassword' })
  expect(res.code).toBe(200)
  expect(updateUserById).toHaveBeenCalledWith('u1', { password: 'newpassword' })
  expect(account.key_hash).toBe(hashKey(res.body.recoveryKey))
  expect(account.key_hash).not.toBe(hashKey('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF'))
})

it('없는 아이디와 틀린 키는 같은 응답을 준다', async () => {
  const wrong = await call({ username: 'kong_01', recoveryKey: 'WRONG', newPassword: 'newpassword' })
  const nobody = await call({ username: 'nobody_1', recoveryKey: 'WRONG', newPassword: 'newpassword' })
  expect([wrong.code, wrong.body]).toEqual([nobody.code, nobody.body])
  expect(updateUserById).not.toHaveBeenCalled()
})

it('다섯 번 틀리면 잠기고, 잠긴 동안에는 올바른 키도 거부한다', async () => {
  for (let i = 0; i < 5; i++) await call({ username: 'kong_01', recoveryKey: 'WRONG', newPassword: 'newpassword' })
  expect(new Date(account.locked_until!).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000)
  const res = await call({ username: 'kong_01', recoveryKey: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF', newPassword: 'newpassword' })
  expect(res.code).toBe(400)
  expect(updateUserById).not.toHaveBeenCalled()
})

it('짧은 비밀번호는 거부한다', async () => {
  expect((await call({ username: 'kong_01', recoveryKey: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF', newPassword: 'short' })).code).toBe(400)
})
