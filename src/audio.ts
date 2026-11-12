// 효과음과 배경음. 오디오 파일 없이 Web Audio로 만든다.
let ctx: AudioContext | null = null
let out: GainNode
let muted = localStorage.getItem('muted') === '1'
let music: ReturnType<typeof setInterval> | undefined

function ensure() {
  if (!ctx) {
    ctx = new AudioContext()
    out = ctx.createGain()
    out.gain.value = muted ? 0 : 1
    out.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, at = 0, dur = 0.15, type: OscillatorType = 'sine', vol = 0.16) {
  const c = ensure()
  const o = c.createOscillator(), g = c.createGain()
  const t = c.currentTime + at
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
}

const seq = (freqs: number[], gap: number, dur = 0.16, type: OscillatorType = 'triangle') =>
  freqs.forEach((f, i) => tone(f, i * gap, dur, type))

export const sfx = {
  tap: () => tone(660, 0, 0.07, 'triangle', 0.1),
  pop: () => seq([520, 780], 0.06, 0.1),
  happy: () => seq([523, 659, 784, 1047], 0.09),
  sad: () => seq([392, 330, 262], 0.14, 0.22, 'sine'),
  eat: () => seq([180, 150, 190, 160], 0.13, 0.06, 'square'),
  bubble: () => tone(700 + Math.random() * 600, 0, 0.09, 'sine', 0.08),
  chime: () => seq([784, 988, 1175, 1568], 0.07, 0.3, 'sine'),
  pet: () => tone(300 + Math.random() * 60, 0, 0.18, 'sine', 0.07),
}

// 오르골 같은 배경음: 5음계에서 느리게 한 음씩
const SCALE = [262, 294, 330, 392, 440, 523, 587, 659]
export function startMusic() {
  if (music) return
  ensure()
  let last = 4
  music = setInterval(() => {
    if (muted || document.hidden || Math.random() < 0.3) return
    last = Math.max(0, Math.min(SCALE.length - 1, last + Math.floor(Math.random() * 5) - 2))
    tone(SCALE[last], 0, 1.4, 'triangle', 0.035)
    if (Math.random() < 0.25) tone(SCALE[last] / 2, 0, 1.8, 'sine', 0.03)
  }, 640)
}

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  localStorage.setItem('muted', m ? '1' : '0')
  if (ctx) out.gain.value = m ? 0 : 1
}
