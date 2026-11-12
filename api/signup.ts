import type { VercelRequest, VercelResponse } from '@vercel/node'
import { admin, emailOf, hashKey, newRecoveryKey, validPassword, validUsername } from './_lib.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능합니다' })
  const { username, password } = req.body ?? {}
  if (!validUsername(username)) return res.status(400).json({ error: '아이디는 영문 소문자·숫자·_ 4~20자입니다' })
  if (!validPassword(password)) return res.status(400).json({ error: '비밀번호는 8자 이상입니다' })

  const db = admin()
  // email_confirm: 실제 메일이 아니므로 확인 절차 없이 바로 활성화한다
  const { data, error } = await db.auth.admin.createUser({ email: emailOf(username), password, email_confirm: true })
  if (error || !data.user) {
    const taken = error?.status === 422 || /already/i.test(error?.message ?? '')
    return res.status(taken ? 409 : 500).json({ error: taken ? '이미 사용 중인 아이디입니다' : '가입에 실패했습니다' })
  }

  const recoveryKey = newRecoveryKey()
  const { error: insertError } = await db.from('accounts')
    .insert({ user_id: data.user.id, username, key_hash: hashKey(recoveryKey) })
  if (insertError) {
    // 복구키 없는 계정이 남지 않게 되돌린다
    await db.auth.admin.deleteUser(data.user.id)
    return res.status(500).json({ error: '가입에 실패했습니다' })
  }
  return res.status(200).json({ recoveryKey })
}
