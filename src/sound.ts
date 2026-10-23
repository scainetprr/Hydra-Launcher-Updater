// Clics de UI: suena el click vanilla REAL leído de los assets locales del juego
// (vía IPC `sound:get`); si no hay assets, sintetiza un clic suave con WebAudio.
// Sin archivos de sonido empaquetados (solo se leen los del propio usuario).
let cache: string | null | undefined // null = falló, undefined = sin pedir
let enabled = true
let volume = 0.35
let started = false

export function setUiSoundPrefs(e: boolean, v: number) {
  enabled = e
  volume = Math.min(1, Math.max(0, v))
}

async function getData(): Promise<string | null> {
  if (cache !== undefined) return cache
  let res: string | null = null
  try {
    const r = await (window as any).api?.getSound?.('ui.button.click')
    res = r?.ok && typeof r.data === 'string' ? r.data : null
  } catch { res = null }
  cache = res
  return res
}

function synthClick() { // clic corto y suave vía WebAudio, ganancia master = volume * 0.5
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    const ctx = new AC()
    if (ctx.state === 'suspended') ctx.resume()
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = 820
    const g = ctx.createGain()
    g.gain.setValueAtTime(volume * 0.5, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05)
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.06)
    setTimeout(() => ctx.close(), 300)
  } catch {}
}

async function playClick() {
  if (!enabled) return
  const data = await getData()
  if (data) {
    try {
      const a = new Audio(data)
      a.volume = volume
      void a.play().catch(() => {})
    } catch { synthClick() }
  } else synthClick()
}

export function initUiSounds() {
  if (started) return
  started = true
  // un solo listener a nivel de documento: cubre TODOS los botones (actuales y futuros)
  document.addEventListener('click', (e) => {
    if (!enabled) return
    const t = (e.target as HTMLElement | null)?.closest?.('button, [role="button"]') as HTMLElement | null
    if (!t || t.hasAttribute('disabled')) return
    void playClick()
  }, true)
}
