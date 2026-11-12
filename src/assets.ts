import { Box3, Group, Mesh, Vector3, type AnimationClip } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'

const loader = new GLTFLoader()
const cache = new Map<string, Promise<GLTF>>()

function load(path: string) {
  let p = cache.get(path)
  if (!p) cache.set(path, (p = loader.loadAsync(`/models/${path}.glb`)))
  return p
}

function shadows(root: Group) {
  root.traverse((o) => {
    if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true }
  })
}

/** 소품. 바닥 중앙이 원점에 오도록 맞춘 그룹을 돌려준다 (Kenney 가구는 원점이 모서리에 있다) */
export async function prop(path: string, scale = 4): Promise<Group> {
  const model = (await load(path)).scene.clone(true)
  model.scale.multiplyScalar(scale)
  const box = new Box3().setFromObject(model)
  const c = box.getCenter(new Vector3())
  model.position.sub(new Vector3(c.x, box.min.y, c.z))
  shadows(model)
  const pivot = new Group()
  pivot.add(model)
  return pivot
}

/** 펫. 발밑 중앙이 이미 원점이라 그대로 쓴다 */
export async function petModel(species: string): Promise<{ model: Group; clips: AnimationClip[] }> {
  const gltf = await load(`pets/${species}`)
  const model = gltf.scene.clone(true)
  shadows(model)
  return { model, clips: gltf.animations }
}
