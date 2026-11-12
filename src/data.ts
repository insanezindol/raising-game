// 저장과 인증. 게임 규칙은 모른다.
// VITE_SUPABASE_ANON_KEY가 없으면 이 브라우저(localStorage)에만 저장하는 체험 모드로 동작한다.
import { createClient } from '@supabase/supabase-js'
import type { Pet } from './sim'

const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const LOCAL = !KEY
const sb = LOCAL ? null : createClient(import.meta.env.VITE_SUPABASE_URL, KEY!)

export type PetRow = { id: string; pet: Pet }
export type DiaryEntry = { kind: string; body: string; created_at: string }
export type Memorial = { id: string; species: string; name: string; born_at: string; died_at: string; death_cause: string }

const emailOf = (username: string) => `${username}@pet.local`
const iso = (t: number) => new Date(t).toISOString()

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* 저장 공간 없음: 서버 저장에 맡긴다 */ }
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? '서버에 연결하지 못했습니다')
  return json
}

// ── 인증 ─────────────────────────────────────────────

export async function signIn(username: string, password: string) {
  if (LOCAL) return write('demo:user', username)
  const { error } = await sb!.auth.signInWithPassword({ email: emailOf(username), password })
  if (error) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다')
}

/** 가입 후 로그인까지 하고, 한 번만 보여줄 복구키를 돌려준다 */
export async function signUp(username: string, password: string): Promise<string> {
  if (LOCAL) { write('demo:user', username); return 'DEMO-DEMO-DEMO-DEMO-DEMO-DEMO' }
  const { recoveryKey } = await post('/api/signup', { username, password })
  await signIn(username, password)
  return recoveryKey
}

/** 새 비밀번호로 바꾸고 로그인한다. 새 복구키를 돌려준다(재발급 실패 시 null) */
export async function recover(username: string, recoveryKey: string, newPassword: string): Promise<string | null> {
  if (LOCAL) throw new Error('체험 모드에서는 복구할 계정이 없습니다')
  const json = await post('/api/recover', { username, recoveryKey, newPassword })
  await signIn(username, newPassword)
  return json.recoveryKey
}

export async function signOut() {
  if (LOCAL) return localStorage.removeItem('demo:user')
  await sb!.auth.signOut()
}

export async function currentUser(): Promise<string | null> {
  if (LOCAL) return read<string | null>('demo:user', null)
  const { data } = await sb!.auth.getSession()
  return data.session?.user.email?.split('@')[0] ?? null
}

// ── 시계 ─────────────────────────────────────────────

let clockOffset = 0
export const now = () => Date.now() + clockOffset

export async function syncClock() {
  if (LOCAL) return
  const sent = Date.now()
  const { data, error } = await sb!.rpc('server_now')
  if (!error && data) clockOffset = new Date(data).getTime() - (sent + Date.now()) / 2
}

// ── 펫 ───────────────────────────────────────────────

// 서버 저장이 실패해도 진행이 사라지지 않도록, 저장 전 상태를 여기에 먼저 남긴다
const pendingKey = (id: string) => `pending:${id}`

export async function loadPet(): Promise<PetRow | null> {
  if (LOCAL) return read<PetRow | null>('demo:pet', null)
  const { data, error } = await sb!.from('pets').select('id,state').is('died_at', null).maybeSingle()
  if (error) throw new Error('펫을 불러오지 못했습니다')
  if (!data) return null
  const pending = read<Pet | null>(pendingKey(data.id), null)
  return { id: data.id, pet: pending ?? (data.state as Pet) }
}

export async function createPet(pet: Pet): Promise<PetRow> {
  if (LOCAL) {
    const row = { id: crypto.randomUUID(), pet }
    write('demo:pet', row)
    return row
  }
  const { data, error } = await sb!.from('pets')
    .insert({ species: pet.species, name: pet.name, born_at: iso(pet.bornAt), state: pet }).select('id').single()
  if (error) throw new Error('입양에 실패했습니다')
  return { id: data.id, pet }
}

export async function savePet({ id, pet }: PetRow): Promise<boolean> {
  if (LOCAL) {
    if (pet.diedAt) {
      write('demo:memorial', [toMemorial(id, pet), ...read<Memorial[]>('demo:memorial', [])])
      localStorage.removeItem('demo:pet')
    } else write('demo:pet', { id, pet })
    return true
  }
  write(pendingKey(id), pet)
  const { error } = await sb!.from('pets').update({
    state: pet, died_at: pet.diedAt ? iso(pet.diedAt) : null, death_cause: pet.deathCause, updated_at: iso(now()),
  }).eq('id', id)
  if (error) return false
  localStorage.removeItem(pendingKey(id))
  return true
}

const toMemorial = (id: string, p: Pet): Memorial => ({
  id, species: p.species, name: p.name, born_at: iso(p.bornAt), died_at: iso(p.diedAt!), death_cause: p.deathCause!,
})

export async function loadMemorial(): Promise<Memorial[]> {
  if (LOCAL) return read<Memorial[]>('demo:memorial', [])
  const { data } = await sb!.from('pets').select('id,species,name,born_at,died_at,death_cause')
    .not('died_at', 'is', null).order('died_at', { ascending: false })
  return (data ?? []) as Memorial[]
}

// ── 일기 ─────────────────────────────────────────────

export async function addDiary(petId: string, kind: string, body: string, t: number) {
  const entry = { kind, body, created_at: iso(t) }
  if (LOCAL) return write(`demo:diary:${petId}`, [...read<DiaryEntry[]>(`demo:diary:${petId}`, []), entry])
  await sb!.from('diary').insert({ pet_id: petId, ...entry })
}

export async function loadDiary(petId: string): Promise<DiaryEntry[]> {
  if (LOCAL) return read<DiaryEntry[]>(`demo:diary:${petId}`, [])
  const { data } = await sb!.from('diary').select('kind,body,created_at').eq('pet_id', petId).order('created_at')
  return (data ?? []) as DiaryEntry[]
}
