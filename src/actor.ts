// 화면 속 펫: 모델, 애니메이션, 스스로 하는 행동. 스탯 계산은 하지 않는다.
import { AnimationMixer, Group, LoopOnce, LoopRepeat, MathUtils, Vector3, type AnimationAction, type AnimationClip } from 'three'
import { petModel } from './assets'
import type { Mood, Stage } from './sim'
import type { World } from './world'

export type Clip = 'static' | 'idle' | 'walk' | 'run' | 'eat' | 'dance' | 'gesture-positive' | 'gesture-negative'
const STAGE_SCALE: Record<Stage, number> = { baby: 0.55, child: 0.78, adult: 1, senior: 1 }

export class Actor {
  /** 위치와 방향 */
  root = new Group()
  /** 지금 사람이 시킨 일을 하는 중이면 스스로 돌아다니지 않는다 */
  scripted = false
  asleep = false
  sick = false
  mood: Mood = 'ok'
  stage: Stage = 'adult'
  /** 펫이 스스로 감정을 드러낼 때 (말풍선용) */
  onEmote: (kind: string) => void = () => {}

  private squash = new Group() // 숨쉬기·깡충 같은 변형은 여기에만 건다
  private mixer: AnimationMixer
  private actions = new Map<string, AnimationAction>()
  private current = ''
  private target: Vector3 | null = null
  private arrived: (() => void) | null = null
  private speed = 2
  private thinkAt = 0
  private t = Math.random() * 10
  private hopT = 1
  private size = 1
  private wantSize = 1
  private sized = false

  private constructor(private world: World, model: Group, clips: AnimationClip[]) {
    this.squash.add(model)
    this.root.add(this.squash)
    this.mixer = new AnimationMixer(model)
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c))
    this.play('idle', 0)
  }

  static async create(world: World, species: string) {
    const { model, clips } = await petModel(species)
    const a = new Actor(world, model, clips)
    world.scene.add(a.root)
    return a
  }

  dispose() {
    this.mixer.stopAllAction()
    this.root.removeFromParent()
    this.arrived?.()
  }

  /** once면 한 번 재생이 끝날 때 끝나는 Promise */
  play(name: Clip, fade = 0.25, once = false): Promise<void> {
    const next = this.actions.get(name)
    if (!next) return Promise.resolve()
    if (this.current !== name || once) {
      this.actions.get(this.current)?.fadeOut(fade)
      next.reset().fadeIn(fade).play()
      next.setLoop(once ? LoopOnce : LoopRepeat, Infinity)
      next.clampWhenFinished = once
      this.current = name
    }
    if (!once) return Promise.resolve()
    return new Promise((resolve) => {
      const done = (e: { action: AnimationAction }) => {
        if (e.action !== next) return
        this.mixer.removeEventListener('finished', done)
        resolve()
      }
      this.mixer.addEventListener('finished', done)
      // 탭이 백그라운드로 가면 finished가 늦을 수 있어 시간으로도 끝낸다
      setTimeout(() => { this.mixer.removeEventListener('finished', done); resolve() }, next.getClip().duration * 1000 + 600)
    })
  }

  goTo(x: number, z: number, run = false): Promise<void> {
    this.arrived?.()
    this.target = new Vector3(x, 0, z)
    this.speed = (run ? 5.5 : 2.2) * (this.stage === 'senior' ? 0.7 : 1) * (this.sick ? 0.6 : 1)
    this.play(run ? 'run' : 'walk')
    return new Promise((resolve) => (this.arrived = resolve))
  }

  stop() {
    this.target = null
    const done = this.arrived
    this.arrived = null
    done?.()
  }

  hop() { this.hopT = 0 }

  /** 카메라(사람) 쪽을 본다 */
  faceCamera() { this.faceTo(this.world.camera.position.x, this.world.camera.position.z) }
  faceTo(x: number, z: number) { this.wantYaw = Math.atan2(x - this.root.position.x, z - this.root.position.z) }
  private wantYaw = 0

  setStage(stage: Stage) {
    this.stage = stage
    this.wantSize = STAGE_SCALE[stage]
    // 처음 한 번은 바로 맞추고, 그 뒤 성장은 천천히 자란다
    if (!this.sized) { this.size = this.wantSize; this.sized = true }
  }

  update(dt: number) {
    this.t += dt
    this.size = MathUtils.lerp(this.size, this.wantSize, 1 - Math.exp(-1.2 * dt))
    this.mixer.timeScale = this.sick ? 0.6 : this.stage === 'baby' ? 1.25 : 1
    this.mixer.update(dt)
    const pos = this.root.position

    if (this.target) {
      const d = this.target.clone().sub(pos)
      const dist = Math.hypot(d.x, d.z)
      if (dist < 0.12) this.stop()
      else {
        this.wantYaw = Math.atan2(d.x, d.z)
        pos.addScaledVector(d.multiplyScalar(1 / dist), Math.min(this.speed * dt, dist))
      }
    }

    // 가장 가까운 방향으로 부드럽게 돈다
    const turn = MathUtils.euclideanModulo(this.wantYaw - this.root.rotation.y + Math.PI, Math.PI * 2) - Math.PI
    this.root.rotation.y += turn * (1 - Math.exp(-9 * dt))

    // 변형: 잠(납작+느린 숨), 아픔(떨림), 깡충
    const s = this.squash
    const sleeping = this.asleep && !this.target && !this.scripted
    const breathe = Math.sin(this.t * (sleeping ? 1.6 : 2.6)) * (sleeping ? 0.03 : 0.012)
    const flat = sleeping ? 0.8 : 1
    const sy = MathUtils.lerp(s.scale.y / this.size || 1, flat + breathe, 1 - Math.exp(-5 * dt))
    s.scale.set(this.size * (2 - sy) ** 0.5, this.size * sy, this.size * (2 - sy) ** 0.5)
    s.position.x = this.sick && !this.target ? Math.sin(this.t * 38) * 0.02 : 0
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt * 2.6)
      s.position.y = Math.sin(this.hopT * Math.PI) * 0.7 * this.size
    } else s.position.y = 0

    if (!this.scripted && !this.target && this.t > this.thinkAt) this.think()
  }

  /** 시킨 일이 없을 때 스스로 무엇을 할지 고른다 */
  private think() {
    const w = this.world
    this.thinkAt = this.t + MathUtils.randFloat(3, 7)
    if (this.asleep) {
      const bed = w.place === 'room' ? w.bedPos : this.root.position
      if (this.root.position.distanceTo(bed) > 0.4) void this.goTo(bed.x, bed.z).then(() => { if (this.asleep) void this.play('static') })
      else { this.play('static'); this.onEmote('zzz') }
      return
    }
    const r = Math.random()
    if (this.mood !== 'ok' && this.mood !== 'happy' && r < 0.45) {
      // 필요한 게 있으면 사람을 보며 알린다
      if (this.mood === 'hungry' && w.place === 'room') {
        void this.goTo(w.bowlPos.x + 1.3, w.bowlPos.z - 0.2).then(() => { this.faceCamera(); this.signal() })
      } else { this.faceCamera(); this.signal() }
    } else if (this.sick || r < 0.25) {
      this.faceCamera()
      this.play('idle')
    } else if (this.mood === 'happy' && r < 0.4) {
      this.faceCamera()
      void this.play('dance', 0.25, true).then(this.rest)
      this.onEmote('note')
    } else {
      const p = w.randomSpot()
      void this.goTo(p.x, p.z, this.stage !== 'senior' && Math.random() < 0.25).then(this.rest)
    }
  }

  private rest = () => { if (!this.scripted && !this.target) void this.play('idle') }

  private signal() {
    this.onEmote(this.mood)
    void this.play('gesture-negative', 0.25, true).then(this.rest)
  }
}
