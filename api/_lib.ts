import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const validUsername = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9_]{4,20}$/.test(v)
export const validPassword = (v: unknown): v is string => typeof v === 'string' && v.length >= 8 && v.length <= 72
export const emailOf = (username: string) => `${username}@pet.local`

// 헷갈리는 글자(0/O, 1/I)를 뺀 32글자
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** 120비트 난수, XXXX-XXXX-XXXX-XXXX-XXXX-XXXX 형태 */
export function newRecoveryKey() {
  const chars = [...randomBytes(24)].map((b) => ALPHABET[b & 31])
  return chars.join('').replace(/(.{4})(?=.)/g, '$1-')
}

export const normalizeKey = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, '')
// 키 자체가 고엔트로피 난수라 느린 해시가 필요 없다
export const hashKey = (key: string) => createHash('sha256').update(normalizeKey(key)).digest('hex')

export function admin() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
