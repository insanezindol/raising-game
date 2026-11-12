// 3D 무대: 방과 공원, 조명, 카메라. 펫과 게임 규칙은 모른다.
import {
  CircleGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight, MathUtils, Mesh, MeshStandardMaterial,
  NeutralToneMapping, PerspectiveCamera, Plane, PointLight, Raycaster, Scene, Vector2, Vector3,
  WebGLRenderer, type Object3D,
} from 'three'
import { prop } from './assets'

export type Place = 'room' | 'park'
const PARK_X = 200
const CAM_OFFSET = new Vector3(0, 7.5, 15)

const AREAS = {
  room: { cx: 0, x0: -3.5, x1: 3.5, z0: -2.6, z1: 3 },
  park: { cx: PARK_X, x0: PARK_X - 10, x1: PARK_X + 10, z0: -6, z1: 6 },
}

// 시간대별 빛. [하늘색, 반구광 세기, 햇빛색, 햇빛 세기]
const LIGHT = {
  day: ['#bfe3f7', 1.5, '#fff4e0', 2.2],
  dusk: ['#f7b98b', 1.1, '#ffb070', 1.6],
  night: ['#232a52', 0.55, '#8fa3ff', 0.5],
  dark: ['#141a36', 0.3, '#7f93f0', 0.3],
} as const

export class World {
  renderer: WebGLRenderer
  scene = new Scene()
  camera = new PerspectiveCamera(30, 1, 0.5, 200)
  place: Place = 'room'
  /** 카메라가 따라갈 대상. 없으면 장소 중앙을 본다 */
  follow: Object3D | null = null
  onFrame: ((dt: number) => void)[] = []

  bowl!: Group; bowlFood = new Group(); tub!: Group; trash!: Group
  readonly bowlPos = new Vector3(-2.3, 0, 2.3)
  readonly bedPos = new Vector3(2.1, 0, 2.3)
  readonly tubPos = new Vector3(0, 0, 0.8)

  private focus = new Vector3()
  private hemi = new HemisphereLight('#ffffff', '#c9b8a8', 1.5)
  private sun = new DirectionalLight('#fff4e0', 2.2)
  private lamp = new PointLight('#ffc47a', 0, 22, 1.4)
  private ray = new Raycaster()
  private ground = new Plane(new Vector3(0, 1, 0), 0)
  private sky = new Color()
  private last = performance.now()

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.toneMapping = NeutralToneMapping

    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const sc = this.sun.shadow.camera
    sc.left = sc.bottom = -16; sc.right = sc.top = 16; sc.far = 60
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.04
    this.lamp.position.set(-4.3, 3.6, -4.4)
    this.scene.add(this.hemi, this.sun, this.sun.target, this.lamp)

    addEventListener('resize', () => this.resize())
    this.resize()
    this.renderer.setAnimationLoop(() => this.frame())
  }

  async build() {
    await Promise.all([this.buildRoom(), this.buildPark()])
    this.setPlace('room')
  }

  private async buildRoom() {
    const room = new Group()
    const add = async (name: string, x: number, z: number, ry = 0, s = 4, y = 0) => {
      const o = await prop(`room/${name}`, s)
      o.position.set(x, y, z)
      o.rotation.y = ry
      room.add(o)
      return o
    }
    const jobs: Promise<unknown>[] = []
    // 바닥 6×4칸, 뒷벽과 옆벽은 세로 화면에서도 천장이 비지 않게 2단
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) jobs.push(add('floorFull', -10 + i * 4, -4 + j * 4, 0, 4, -0.2))
    for (let row = 0; row < 2; row++) {
      const y = row * 5.16
      for (let i = 0; i < 6; i++) jobs.push(add(row === 0 && i === 3 ? 'wallWindow' : 'wall', -10 + i * 4, -6, 0, 4, y))
      for (let j = 0; j < 4; j++) {
        jobs.push(add('wall', -12, -4 + j * 4, Math.PI / 2, 4, y), add('wall', 12, -4 + j * 4, -Math.PI / 2, 4, y))
      }
    }
    jobs.push(
      add('loungeSofa', -1.5, -4.6), add('lampRoundFloor', -4.3, -4.9), add('pottedPlant', 4.8, -4.9),
      add('rugRound', 0, 0.6, 0, 6.5),
      // 펫 잠자리: 작은 매트와 베개
      add('rugRectangle', this.bedPos.x, this.bedPos.z, 0, 1.8, 0.04), add('pillowBlue', this.bedPos.x + 0.9, this.bedPos.z - 0.9, 0.4, 4),
      add('bookcaseOpenLow', -9.2, -5.1, 0, 5), add('books', -9.2, -5.1, 0, 5, 2.02),
      add('bear', -8, -1.5, 0.5, 3.5), add('sideTable', 8, -4.9), add('plantSmall1', 8, -4.9, 0, 4, 1.5),
      add('bench', 9.6, 1.5, -Math.PI / 2, 5),
    )
    await Promise.all(jobs)
    this.trash = await add('trashcan', 1.5, -4.7, 0, 3)
    this.tub = await add('bathtub', this.tubPos.x, this.tubPos.z, 0, 3.2)
    this.tub.visible = false

    this.bowl = await prop('food/bowl', 1.5)
    this.bowl.position.copy(this.bowlPos)
    this.bowl.add(this.bowlFood)
    room.add(this.bowl)
    this.scene.add(room)
  }

  private async buildPark() {
    const park = new Group()
    park.position.x = PARK_X
    const grass = new Mesh(new CircleGeometry(70, 48), new MeshStandardMaterial({ color: '#9bd17a' }))
    grass.rotation.x = -Math.PI / 2
    grass.receiveShadow = true
    park.add(grass)

    // 고정된 난수: 매번 같은 공원이 되게 한다
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const scatter = async (names: string[], count: number, inner: number, outer: number, scale: number, front = false) => {
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2
        const r = inner + rnd() * (outer - inner)
        const x = Math.cos(a) * r * 1.3, z = Math.sin(a) * r
        // 카메라와 펫 사이를 큰 물체가 가리지 않게 앞쪽은 비운다
        if (!front && z > 5) continue
        const o = await prop(`park/${names[Math.floor(rnd() * names.length)]}`, scale * (0.8 + rnd() * 0.5))
        o.position.set(x, 0, z)
        o.rotation.y = rnd() * Math.PI * 2
        park.add(o)
      }
    }
    await Promise.all([
      scatter(['tree_default', 'tree_oak', 'tree_fat', 'tree_pineRoundA'], 46, 13, 30, 4.5),
      scatter(['plant_bush', 'plant_bushLarge', 'rock_largeA', 'stump_round', 'log'], 22, 10, 18, 3.5),
      scatter(['flower_redA', 'flower_yellowA', 'flower_purpleA', 'grass', 'grass_large', 'mushroom_red'], 90, 0, 14, 3, true),
      scatter(['rock_smallA'], 8, 3, 12, 2.5, true),
    ])
    for (let i = -5; i <= 5; i++) {
      const f = await prop('park/fence_simple', 4)
      f.position.set(i * 4, 0, -9.5)
      park.add(f)
    }
    this.scene.add(park)
  }

  setPlace(place: Place) {
    this.place = place
    this.follow = null
    this.focus.set(AREAS[place].cx, 0, 0)
    this.scene.fog = place === 'park' ? new Fog(this.sky, 38, 75) : null
    this.resize()
  }

  area() { return AREAS[this.place] }

  /** 걸어 다닐 수 있는 범위 안의 임의 지점 */
  randomSpot() {
    const a = this.area()
    return new Vector3(MathUtils.randFloat(a.x0, a.x1), 0, MathUtils.randFloat(a.z0, a.z1))
  }

  /** 현실 시각(0~24)에 맞춰 조명을 바꾼다. lightsOut은 재울 때 */
  setLight(hour: number, lightsOut: boolean) {
    const phase = lightsOut ? 'dark' : hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'dusk' : 'night'
    const [sky, hemi, sunColor, sun] = LIGHT[phase]
    this.sky.set(sky)
    this.scene.background = this.sky
    this.hemi.intensity = hemi
    this.sun.color.set(sunColor)
    this.sun.intensity = sun
    // 밤에는 방 스탠드를 켠다
    this.lamp.intensity = phase === 'night' && this.place === 'room' ? 60 : phase === 'dusk' && this.place === 'room' ? 25 : 0
  }

  private resize() {
    const w = innerWidth, h = innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // 세로 화면에서도 가로로 일정 폭이 보이도록 세로 화각을 넓힌다
    const half = Math.tan(MathUtils.degToRad(this.place === 'park' ? 16 : 13))
    this.camera.fov = MathUtils.clamp(MathUtils.radToDeg(2 * Math.atan(half / this.camera.aspect)), 30, 62)
    this.camera.updateProjectionMatrix()
  }

  private frame() {
    const t = performance.now()
    const dt = Math.min((t - this.last) / 1000, 0.1)
    this.last = t
    for (const f of this.onFrame) f(dt)

    const a = AREAS[this.place]
    const target = this.follow ? new Vector3(this.follow.position.x, 0, this.follow.position.z * 0.5) : new Vector3(a.cx, 0, 0)
    this.focus.lerp(target, 1 - Math.exp(-3 * dt))
    this.camera.position.copy(this.focus).add(CAM_OFFSET)
    this.camera.lookAt(this.focus.x, 1.3, this.focus.z)
    this.sun.position.set(this.focus.x + 4, 18, 12)
    this.sun.target.position.copy(this.focus)
    this.renderer.render(this.scene, this.camera)
  }

  private aim(clientX: number, clientY: number) {
    this.ray.setFromCamera(new Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1), this.camera)
  }

  /** 화면 좌표 아래의 바닥 지점. 걸을 수 있는 범위로 잘라 준다 */
  groundPoint(clientX: number, clientY: number): Vector3 | null {
    this.aim(clientX, clientY)
    const p = this.ray.ray.intersectPlane(this.ground, new Vector3())
    if (!p) return null
    const a = this.area()
    p.x = MathUtils.clamp(p.x, a.x0, a.x1)
    p.z = MathUtils.clamp(p.z, a.z0, a.z1)
    return p
  }

  hits(clientX: number, clientY: number, target: Object3D) {
    this.aim(clientX, clientY)
    return this.ray.intersectObject(target, true).length > 0
  }

  /** 3D 위치의 화면 좌표 (말풍선 위치용) */
  screen(pos: Vector3) {
    const v = pos.clone().project(this.camera)
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }
  }
}
