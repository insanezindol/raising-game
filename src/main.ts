// 게임 본체: 규칙(sim), 무대(world), 펫(actor), UI, 저장(data)을 잇는다.
import './style.css'
import { Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3, type Object3D } from 'three'
import { Actor } from './actor'
import { prop } from './assets'
import { sfx, startMusic } from './audio'
import * as data from './data'
import { act, advance, isAsleep, moodOf, newPet, stageOf, type Action, type Pet } from './sim'
import { createHud, curtain, josa, showAdopt, showAuth, showDiary, showFarewell, SPECIES, type Food, type Hud } from './ui'
import { World } from './world'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
const world = new World(canvas)
const tz = new Date().getTimezoneOffset()
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const hourNow = () => { const d = new Date(data.now()); return d.getHours() + d.getMinutes() / 60 }

let row: data.PetRow | null = null
let actor: Actor | null = null
let hud: Hud | null = null
let mode: 'idle' | 'feed' | 'play' | 'bath' | 'walk' = 'idle'
let saveTimer = 0
let tickTimer = 0
/** 진행 중인 놀이·목욕·산책을 끝내는 함수 */
let endMode: (() => void) | null = null

const DIARY: Record<string, string> = {
  'grow-child': '몸이 쑥 자라 어린이가 되었다.',
  'grow-adult': '어엿한 어른이 되었다.',
  'grow-senior': '어느새 어르신이 되었다. 걸음이 조금 느려졌다.',
  sick: '몸이 안 좋아 보인다. 병원에 데려가야겠다.',
  'first-walk': '처음으로 같이 공원을 산책했다.',
  'first-hospital': '처음 병원에 다녀왔다. 씩씩하게 잘 참았다.',
  'pet-100': '백 번째로 쓰다듬어 주었다. 이제 내 손길을 제일 좋아한다.',
  died: '무지개다리를 건넜다.',
}
const REFUSE: Record<string, string> = {
  full: '배가 불러서 고개를 저어요',
  tired: '너무 지쳤어요. 먼저 재워 주세요',
  sick: '아파서 움직이기 힘들어해요. 병원에 가 볼까요?',
  asleep: '자고 있어요. 톡 건드리면 깨울 수 있어요',
  notsleepy: '아직 졸리지 않대요',
}
const FINDS = ['네잎클로버', '반짝이는 조약돌', '도토리', '예쁜 낙엽', '나비', '민들레 씨앗', '달팽이']

/** dur초 동안 매 프레임 fn(0→1)을 부른다 */
function tween(dur: number, fn: (k: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let t = 0
    const tick = (dt: number) => {
      t = Math.min(1, t + dt / dur)
      fn(t)
      if (t >= 1) { world.onFrame.splice(world.onFrame.indexOf(tick), 1); resolve() }
    }
    world.onFrame.push(tick)
  })
}

// ── 상태 반영 ─────────────────────────────────────────

const poops: Object3D[] = []

async function syncMess(pet: Pet) {
  while (poops.length > pet.poop) poops.pop()!.removeFromParent()
  while (poops.length < pet.poop) {
    const o = await prop('park/rock_smallA', 1.5)
    o.traverse((m) => { if (m instanceof Mesh) m.material = new MeshStandardMaterial({ color: '#7a5230' }) })
    const p = world.randomSpot()
    o.position.set(p.x - (world.place === 'park' ? world.area().cx : 0), 0, p.z)
    world.scene.add(o)
    poops.push(o)
  }
  // 말썽: 쓰레기통을 엎어 놓는다
  world.trash.rotation.z = pet.mess ? Math.PI / 2 : 0
  world.trash.position.y = pet.mess ? 0.75 : 0
}

function apply(pet: Pet) {
  if (!row || !actor) return
  row.pet = pet
  const t = data.now()
  const asleep = isAsleep(pet, t, tz)
  actor.asleep = asleep
  actor.sick = !!pet.sick
  actor.mood = moodOf(pet)
  actor.setStage(stageOf(pet, t))
  hud?.update(pet, t, asleep)
  world.setLight(hourNow(), asleep && world.place === 'room')
  void syncMess(pet)
  flushLog()
  scheduleSave()
  if (pet.diedAt) farewell()
}

/** sim이 남긴 사건을 일기로 옮긴다 */
function flushLog() {
  if (!row || !row.pet.log.length) return
  for (const e of row.pet.log) {
    void data.addDiary(row.id, e.kind, DIARY[e.kind] ?? e.kind, e.t)
    if (e.kind.startsWith('grow') || e.kind === 'sick') hud?.toast(DIARY[e.kind])
  }
  row.pet = { ...row.pet, log: [] }
}

function scheduleSave(delay = 1500) {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    if (row) hud?.setOffline(!(await data.savePet(row)))
  }, delay)
}

function can(action: Action) {
  if (!row || !actor) return false
  const r = act(row.pet, action, data.now(), Math.random, tz)
  if (r.ok) return true
  hud?.toast(REFUSE[r.reason!] ?? '지금은 할 수 없어요')
  if (r.reason !== 'asleep') void actor.play('gesture-negative', 0.2, true).then(() => { if (actor && !actor.scripted) void actor.play('idle') })
  return false
}

function doAct(action: Action) {
  if (!row) return false
  const r = act(row.pet, action, data.now(), Math.random, tz)
  if (r.ok) apply(r.pet)
  return r.ok
}

/** 펫에게 일을 시킨다. 하는 동안 스스로 돌아다니지 않는다 */
async function script(fn: (a: Actor) => Promise<void>) {
  const a = actor
  if (!a || a.scripted) return
  a.scripted = true
  a.stop()
  try { await fn(a) } finally {
    a.scripted = false
    if (a === actor) void a.play('idle')
  }
}

// ── 돌보기 ───────────────────────────────────────────

async function feed(food: Food) {
  const action = food.snack ? 'snack' : 'feed'
  hud?.setMode(null)
  mode = 'idle'
  if (!can(action)) return
  await script(async (a) => {
    const dish = await prop(`food/${food.model}`, food.id === 'kibble' ? 1.25 : 1.6)
    dish.position.y = food.id === 'kibble' ? 0.02 : 0.28
    world.bowlFood.add(dish)
    await a.goTo(world.bowlPos.x + 1.15, world.bowlPos.z - 0.1, true)
    a.faceTo(world.bowlPos.x, world.bowlPos.z)
    void a.play('eat')
    for (let i = 0; i < 3; i++) { sfx.eat(); await wait(900) }
    dish.removeFromParent()
    doAct(action)
    a.faceCamera()
    hud?.emote('heart')
    sfx.happy()
    await a.play('gesture-positive', 0.2, true)
  })
}

const ball = new Mesh(new SphereGeometry(0.3, 20, 14), new MeshStandardMaterial({ color: '#ff8f7a', roughness: 0.6 }))
ball.castShadow = true
ball.visible = false
world.scene.add(ball)

function startPlay() {
  if (!can('play')) return
  mode = 'play'
  let fetched = 0
  hud?.setMode('바닥을 눌러 공을 던져 주세요')
  endMode = () => { mode = 'idle'; ball.visible = false; hud?.setMode(null); endMode = null }

  throwBall = async (to: Vector3) => {
    if (!actor || actor.scripted || !can('play')) return
    await script(async (a) => {
      const from = new Vector3(to.x * 0.3, 2.5, 9)
      ball.removeFromParent()
      world.scene.add(ball)
      ball.visible = true
      sfx.pop()
      a.faceTo(to.x, to.z)
      await tween(0.7, (k) => ball.position.lerpVectors(from, to, k).setY(0.3 + Math.sin(k * Math.PI) * 3 + (1 - k) * 2.2))
      await a.goTo(to.x, to.z, true)
      a.hop()
      a.root.add(ball) // 물고 온다
      ball.position.set(0, 1.55, 0.5)
      await a.goTo(0, 2.4, true)
      a.faceCamera()
      ball.visible = false
      doAct('play')
      hud?.emote('heart')
      sfx.happy()
      await a.play('gesture-positive', 0.2, true)
    })
    if (++fetched >= 3 && mode === 'play') endMode?.()
  }
}
let throwBall: (to: Vector3) => void = () => {}

function startBath() {
  if (!actor || actor.scripted || !can('bath')) return
  const a = actor
  mode = 'bath'
  a.scripted = true
  a.stop()
  world.tub.visible = true
  hud?.setMode('문질러서 거품을 내 주세요')
  let progress = 0
  const bubbles: Mesh[] = []
  const foam = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, transparent: true, opacity: 0.9 })
  const float = (dt: number) => bubbles.forEach((b) => { b.position.y = b.position.y > 2.3 ? 0.5 : b.position.y + dt * 0.35 })
  world.onFrame.push(float)

  void a.goTo(world.tubPos.x, world.tubPos.z, true).then(() => {
    if (mode !== 'bath') return
    a.root.position.y = 0.35
    a.faceCamera()
    void a.play('idle')
  })

  const finish = (washed: boolean) => {
    world.onFrame.splice(world.onFrame.indexOf(float), 1)
    bubbles.forEach((b) => b.removeFromParent())
    world.tub.visible = false
    a.root.position.y = 0
    a.scripted = false
    mode = 'idle'
    endMode = null
    rub = () => {}
    hud?.setMode(null)
    if (!washed) return
    doAct('bath')
    sfx.chime()
    hud?.toast('뽀송뽀송해졌어요')
    a.hop()
    void a.play('dance', 0.2, true).then(() => { if (!a.scripted) void a.play('idle') })
  }
  endMode = () => finish(false)

  rub = (dist: number) => {
    progress += dist / 22
    if (bubbles.length < 26 && Math.random() < 0.5) {
      const b = new Mesh(new SphereGeometry(0.1 + Math.random() * 0.16, 10, 8), foam)
      b.position.copy(a.root.position).add(new Vector3((Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 1.2, (Math.random() - 0.3) * 1.2))
      world.scene.add(b)
      bubbles.push(b)
      sfx.bubble()
    }
    hud?.setMode(`문질러서 거품을 내 주세요 ${Math.min(100, Math.round(progress))}%`)
    if (progress >= 100) finish(true)
  }
}
let rub: (dist: number) => void = () => {}

async function startWalk() {
  if (!actor || actor.scripted || !can('walk')) return
  const a = actor
  a.scripted = true
  a.stop()
  mode = 'walk'
  const spots: Mesh[] = []
  let found = 0
  const glow = new MeshStandardMaterial({ color: '#ffd95a', emissive: '#ffb300', emissiveIntensity: 0.8 })

  await curtain('공원으로 가는 중', 'paw', () => {
    world.setPlace('park')
    world.setLight(hourNow(), false)
    a.root.position.set(world.area().cx, 0, 0)
    a.faceCamera()
    world.follow = a.root
    for (let i = 0; i < 5; i++) {
      const s = new Mesh(new TorusGeometry(0.45, 0.09, 8, 24), glow)
      s.rotation.x = Math.PI / 2
      s.position.copy(world.randomSpot()).setY(0.25)
      world.scene.add(s)
      spots.push(s)
    }
  })
  const label = () => hud?.setMode(`가고 싶은 곳을 눌러 주세요  ${found}/5`)
  label()

  const watch = (dt: number) => {
    for (const s of [...spots]) {
      s.rotation.z += dt * 2
      if (s.position.distanceTo(a.root.position) > 1) continue
      spots.splice(spots.indexOf(s), 1)
      s.removeFromParent()
      found++
      sfx.chime()
      a.hop()
      hud?.toast(`${josa(FINDS[Math.floor(Math.random() * FINDS.length)], '을', '를')} 발견했어요`)
      label()
      if (found === 5) setTimeout(() => mode === 'walk' && endMode?.(), 1400)
    }
  }
  world.onFrame.push(watch)
  walkTo = (p) => void a.goTo(p.x, p.z, false).then(() => a.play('idle'))

  endMode = () => {
    endMode = null
    walkTo = () => {}
    world.onFrame.splice(world.onFrame.indexOf(watch), 1)
    void curtain('집으로 돌아가는 중', 'home', () => {
      spots.forEach((s) => s.removeFromParent())
      a.stop()
      world.setPlace('room')
      a.root.position.set(0, 0, 1)
      a.faceCamera()
      a.scripted = false
      mode = 'idle'
      hud?.setMode(null)
      if (found > 0) doAct('walk')
      else if (row) apply(row.pet)
    })
  }
}
let walkTo: (p: Vector3) => void = () => {}

function toggleSleep() {
  if (!row || !actor) return
  if (isAsleep(row.pet, data.now(), tz)) wake()
  else if (can('sleep')) { doAct('sleep'); hud?.toast('불을 끄고 재웠어요') }
}

function wake() {
  if (!doAct('wake') || !actor) return
  actor.hop()
  actor.faceCamera()
  void actor.play('idle')
  hud?.toast('눈을 비비며 일어났어요')
}

async function hospital() {
  if (!row || !actor || actor.scripted || !can('hospital')) return
  const wasSick = !!row.pet.sick
  await curtain('병원에 다녀오는 중', 'cross', () => { doAct('hospital') }, 1500)
  hud?.toast(wasSick ? '주사를 맞고 나았어요. 잘 참았어요' : '건강검진 결과, 아픈 곳이 없대요')
  sfx.happy()
}

// ── 손길: 쓰다듬기, 부르기, 치우기 ────────────────────

let down: { x: number; y: number; onPet: boolean; moved: number; strokes: number } | null = null

canvas.addEventListener('pointerdown', (e) => {
  startMusic()
  if (!actor || !row || row.pet.diedAt) return
  down = { x: e.clientX, y: e.clientY, onPet: world.hits(e.clientX, e.clientY, actor.root), moved: 0, strokes: 0 }
})

canvas.addEventListener('pointermove', (e) => {
  if (!down || !actor || !row) return
  const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y)
  down.moved += dist
  down.x = e.clientX
  down.y = e.clientY
  if (!world.hits(e.clientX, e.clientY, actor.root)) return
  if (mode === 'bath') return rub(dist)
  // 쓰다듬기: 손이 60px 움직일 때마다 한 번
  if (mode !== 'idle' || !down.onPet || down.moved < 60 * (down.strokes + 1)) return
  down.strokes++
  doAct('pet')
  sfx.pet()
  if (!actor.asleep && down.strokes % 3 === 1) {
    hud?.emote('heart')
    if (!actor.scripted) { actor.stop(); actor.faceCamera() }
  }
})

canvas.addEventListener('pointerup', (e) => {
  const d = down
  down = null
  if (!d || d.moved > 12 || !actor || !row) return
  const ground = world.groundPoint(e.clientX, e.clientY)

  if (mode === 'play') return ground && !d.onPet ? throwBall(ground) : undefined
  if (mode === 'walk') return ground ? walkTo(ground) : undefined
  if (mode !== 'idle') return

  // 치우기: 배변이나 엎어진 쓰레기통을 누른다
  const dirty = [...poops, ...(row.pet.mess ? [world.trash] : [])].some((o) => world.hits(e.clientX, e.clientY, o))
  if (dirty) {
    if (doAct('tidy')) { sfx.chime(); hud?.toast('깨끗하게 치웠어요') }
    return
  }
  if (d.onPet) {
    if (actor.asleep) return wake()
    actor.hop()
    actor.faceCamera()
    sfx.pop()
    hud?.emote(actor.mood === 'ok' ? 'happy' : actor.mood)
    return
  }
  // 바닥을 누르면 그쪽으로 부른다
  if (ground && !actor.scripted && !actor.asleep) {
    const a = actor
    void a.goTo(ground.x, ground.z, true).then(() => { if (!a.scripted) { a.faceCamera(); void a.play('idle') } })
  }
})
canvas.addEventListener('pointercancel', () => (down = null))

// ── 흐름: 로그인 → 입양 → 함께 지내기 ─────────────────

async function setActor(species: string) {
  actor?.dispose()
  actor = await Actor.create(world, species)
  actor.root.position.set(0, 0, 1)
  actor.faceCamera()
  actor.hop()
  actor.onEmote = (kind) => hud?.emote(kind)
}

async function adopt() {
  const picked = await showAdopt((species) => { sfx.pop(); void setActor(species) })
  const pet = newPet(picked.species, picked.name, data.now())
  row = await data.createPet(pet)
  void data.addDiary(row.id, 'adopt', `${josa(pet.name, '을', '를')} 처음 만났다. 잘 부탁해!`, pet.bornAt)
}

async function openDiary() {
  const [entries, memorial] = await Promise.all([row ? data.loadDiary(row.id) : [], data.loadMemorial()])
  showDiary(row?.pet.name ?? null, entries, memorial.filter((m) => m.id !== row?.id))
}

function farewell() {
  if (!row || !actor) return
  clearInterval(tickTimer)
  clearTimeout(saveTimer)
  void data.savePet(row)
  endMode?.()
  hud?.remove()
  hud = null
  actor.scripted = true
  actor.asleep = true
  actor.stop()
  void actor.play('static')
  world.setLight(18, false)
  sfx.sad()
  showFarewell(row.pet, openDiary, async () => {
    actor?.dispose()
    actor = null
    row = null
    await play()
  })
}

async function play() {
  row = await data.loadPet()
  if (!row) await adopt()
  if (!row) return
  await setActor(row.pet.species)

  hud = createHud({
    action(name) {
      if (name === 'feed') {
        if (mode === 'feed') { mode = 'idle'; return hud?.setMode(null) }
        if (mode !== 'idle' || !can('feed')) return
        mode = 'feed'
        return hud?.setMode('먹이', true)
      }
      if (mode !== 'idle') return
      if (name === 'play') startPlay()
      else if (name === 'bath') startBath()
      else if (name === 'walk') void startWalk()
      else if (name === 'sleep') toggleSleep()
      else void hospital()
    },
    food: (f) => void feed(f),
    stop: () => endMode?.(),
    diary: () => void openDiary(),
    logout: async () => {
      if (row) await data.savePet(row)
      await data.signOut()
      location.reload()
    },
  })

  // 자리를 비운 동안 흐른 시간을 따라잡는다
  const away = data.now() - row.pet.tickAt
  apply(advance(row.pet, data.now(), tz))
  if (row && !row.pet.diedAt && away > 3600_000) hud?.toast(`${josa(row.pet.name, '이', '가')} 기다리고 있었어요`)

  clearInterval(tickTimer)
  tickTimer = window.setInterval(() => row && !row.pet.diedAt && apply(advance(row.pet, data.now(), tz)), 20_000)
}

world.onFrame.push((dt) => {
  if (!actor) return
  actor.update(dt)
  const head = world.screen(actor.root.position.clone().add(new Vector3(0, 1.75 * actor.root.children[0].scale.y, 0)))
  hud?.placeBubble(head.x, head.y)
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden && row && !row.pet.diedAt) void data.savePet(row)
  else if (row && !row.pet.diedAt) apply(advance(row.pet, data.now(), tz))
})

async function boot() {
  await world.build()
  world.setLight(hourNow(), false)
  await data.syncClock()
  world.setLight(hourNow(), false)

  // 개발 확인용: ?auto=dog 로 로그인·입양을 건너뛴다
  const q = new URLSearchParams(location.search)
  if (import.meta.env.DEV && data.LOCAL && q.has('auto')) {
    await data.signIn('demo', '')
    if (!(await data.loadPet())) await data.createPet(newPet(q.get('auto') || 'dog', '콩이', data.now()))
  }

  if (!(await data.currentUser())) {
    // 로그인 화면 뒤에서 친구 한 마리가 돌아다닌다
    await setActor(SPECIES[Math.floor(Math.random() * SPECIES.length)].id)
    actor!.mood = 'happy'
    await showAuth({ signIn: data.signIn, signUp: data.signUp, recover: data.recover }, data.LOCAL)
    actor?.dispose()
    actor = null
  }
  await play()

  if (import.meta.env.DEV && q.has('dbg') && row) {
    const p = structuredClone(row.pet)
    const d = q.get('dbg')
    if (d === 'needy') { p.stats.full = 12; p.stats.clean = 20; p.poop = 2; p.mess = true; p.sick = 'cold' }
    if (d === 'dead') { p.diedAt = data.now(); p.deathCause = 'old' }
    apply(p)
  }
}

if (import.meta.env.DEV) Object.assign(window, { dbg: { world, poops, get actor() { return actor } } })

boot().catch((err) => {
  console.error(err)
  document.querySelector('#ui')!.innerHTML = '<p class="fatal">게임을 불러오지 못했어요. 새로고침해 주세요.</p>'
})
