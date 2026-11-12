import type { VercelRequest, VercelResponse } from '@vercel/node'
import { admin, hashKey, newRecoveryKey, validPassword, validUsername } from './_lib.js'

const MAX_ATTEMPTS = 5
const LOCK_MS = 15 * 60_000
// 아이디 존재 여부와 잠금 여부를 드러내지 않도록 실패 문구는 하나만 쓴다
const FAIL = '아이디 또는 복구키가 올바르지 않거나, 시도가 많아 잠시 잠겼습니다'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능합니다' })
  const { username, recoveryKey, newPassword } = req.body ?? {}
  if (!validPassword(newPassword)) return res.status(400).json({ error: '비밀번호는 8자 이상입니다' })
  if (!validUsername(username) || typeof recoveryKey !== 'string') return res.status(400).json({ error: FAIL })

  const db = admin()
  const { data: acc } = await db.from('accounts').select('*').eq('username', username).maybeSingle()
  if (!acc) return res.status(400).json({ error: FAIL })
  if (acc.locked_until && new Date(acc.locked_until).getTime() > Date.now()) return res.status(400).json({ error: FAIL })

  if (hashKey(recoveryKey) !== acc.key_hash) {
    const attempts = acc.failed_attempts + 1
    const locked = attempts >= MAX_ATTEMPTS
    await db.from('accounts').update({
      failed_attempts: locked ? 0 : attempts,
      locked_until: locked ? new Date(Date.now() + LOCK_MS).toISOString() : null,
    }).eq('user_id', acc.user_id)
    return res.status(400).json({ error: FAIL })
  }

  const { error } = await db.auth.admin.updateUserById(acc.user_id, { password: newPassword })
  if (error) return res.status(500).json({ error: '비밀번호를 바꾸지 못했습니다' })

  // 쓴 키는 폐기하고 새 키를 준다
  const next = newRecoveryKey()
  const { error: rotateError } = await db.from('accounts')
    .update({ key_hash: hashKey(next), failed_attempts: 0, locked_until: null }).eq('user_id', acc.user_id)
  return res.status(200).json({ recoveryKey: rotateError ? null : next })
}
