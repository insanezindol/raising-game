// 손으로 그린 느낌의 선 아이콘. 이모지를 쓰지 않는다.
const P: Record<string, string> = {
  bowl: '<path d="M5 15h22c0 6-4.5 10-11 10S5 21 5 15z"/><circle cx="12" cy="10.5" r="1.6"/><circle cx="17" cy="8.5" r="1.6"/><circle cx="21" cy="11" r="1.6"/>',
  ball: '<circle cx="16" cy="16" r="10.5"/><path d="M7.5 10.5c5 2.2 12 2.2 17 0M7.5 21.5c5-2.2 12-2.2 17 0"/>',
  paw: '<circle cx="9.5" cy="12" r="2.5"/><circle cx="16" cy="8.5" r="2.5"/><circle cx="22.5" cy="12" r="2.5"/><path d="M16 15.5c-4 0-7.2 4-6.2 7.2 1 3 4 1.8 6.2 1.8s5.2 1.2 6.2-1.800c1-3.2-2.2-7.2-6.2-7.200z"/>',
  bubbles: '<circle cx="12.5" cy="19" r="7.5"/><circle cx="23" cy="10.5" r="4"/><circle cx="24" cy="23.5" r="2.5"/><path d="M9.5 16.500c.8-1.3 2-2 3.2-2"/>',
  moon: '<path d="M23 20.500a10.5 10.5 0 1 1-9.5-15 8.5 8.5 0 0 0 9.5 15z"/>',
  sun: '<circle cx="16" cy="16" r="5.5"/><path d="M16 4v3M16 25v3M4 16h3M25 16h3M7.5 7.500l2.2 2.200M22.3 22.300l2.2 2.200M7.5 24.500l2.2-2.200M22.3 9.700l2.2-2.2"/>',
  cross: '<path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z"/>',
  book: '<path d="M5.5 7.500c4-1.6 7.5-1 10.5 1 3-2 6.5-2.6 10.5-1v17c-4-1.6-7.5-1-10.5 1-3-2-6.5-2.6-10.5-1zM16 8.500v17"/>',
  sound: '<path d="M5.5 13h4.500l6-5v16l-6-5H5.500zM21 12c2 2.2 2 5.8 0 8M24.5 9c3.6 4 3.6 10 0 14"/>',
  mute: '<path d="M5.5 13h4.500l6-5v16l-6-5H5.500zM21.5 13l6 6M27.5 13l-6 6"/>',
  heart: '<path d="M16 26.500S5 19.5 5 12.300a6 6 0 0 1 11-3.3 6 6 0 0 1 11 3.300c0 7.2-11 14.2-11 14.200z"/>',
  zzz: '<path d="M7 9h9l-9 10h9M19 16h6.500L19 23.500h6.5"/>',
  note: '<path d="M12 23V8.500l12.5-3V20"/><circle cx="9" cy="23" r="3"/><circle cx="21.5" cy="20" r="3"/>',
  drop: '<path d="M16 5c5 7 8 10.5 8 15a8 8 0 0 1-16 0c0-4.5 3-8 8-15z"/>',
  sick: '<circle cx="16" cy="16" r="11"/><path d="M10 12l3.5 3M13.5 12L10 15M18.5 12l3.5 3M22 12l-3.5 3M10.5 21.500c1.4-1.6 2.6 1.4 4 0s2.6 1.4 4 0 2.2.6 3 0"/>',
  bolt: '<path d="M18 4L8 18h7l-2 10 11-15h-7z"/>',
  door: '<path d="M14 6H7v20h7M12 16h14M21 11l5 5-5 5"/>',
  close: '<path d="M8 8l16 16M24 8L8 24"/>',
  left: '<path d="M19 7l-9 9 9 9"/>',
  right: '<path d="M13 7l9 9-9 9"/>',
  home: '<path d="M5 15L16 6l11 9M8 13.500V26h16V13.500M13.5 26v-7h5v7"/>',
  meat: '<path d="M21 6c4 1 6 5 4.5 9S19 21 15 20l-4.5 4.500a2.3 2.3 0 1 1-3-3L12 17c-1-4 1.5-9 5-10.5 1.3-.6 2.7-.8 4-.5z"/><circle cx="19.5" cy="12" r="2.3"/>',
  cookie: '<circle cx="16" cy="16" r="10.5"/><circle cx="12" cy="12.5" r="1.3"/><circle cx="19.5" cy="11.5" r="1.3"/><circle cx="20.5" cy="18.5" r="1.3"/><circle cx="13" cy="19.5" r="1.3"/>',
}

export function icon(name: string): SVGElement {
  const t = document.createElement('template')
  t.innerHTML = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? P.heart}</svg>`
  return t.content.firstChild as SVGElement
}
