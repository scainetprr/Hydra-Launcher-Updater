import { useEffect, useState } from 'react'
import { useStore } from '../store/launcherStore'

type Scan = {
  ram: { totalGB: number; freeGB: number }
  java: { found: boolean; system: string[]; managed: string; path: string; version: string; major: number }
  gpu: string
}

type Step = 'welcome' | 'scan' | 'java' | 'ram' | 'done'

export default function Setup({ onDone }: { onDone: () => void }) {
  const set = useStore(s=>s.set)
  const addLog = useStore(s=>s.addLog)
  const config = useStore(s=>s.config)
  const [step,setStep] = useState<Step>('welcome')
  const [scan,setScan] = useState<Scan|null>(null)
  const [scanLine,setScanLine] = useState(0)
  const [installing,setInstalling] = useState(false)
  const [installMsg,setInstallMsg] = useState('')
  const [installErr,setInstallErr] = useState('')
  const [javaOk,setJavaOk] = useState(false)
  const [ramPick,setRamPick] = useState(4)
  const [ramRec,setRamRec] = useState(4)

  const scanLines = [
    'Detectando memoria RAM...',
    'Buscando instalaciones de Java...',
    'Identificando tarjeta grafica...',
    'Comprobando espacio en disco...',
    'Preparando optimizaciones...'
  ]

  useEffect(()=>{
    if (step!=='scan') return
    let i = 0
    const tick = setInterval(()=>{
      i++
      setScanLine(Math.min(i, scanLines.length))
      if (i>=scanLines.length) clearInterval(tick)
    }, 700)
    window.api?.getPcScan?.().then((s:Scan)=>{
      setScan(s)
      setJavaOk(!!s?.java?.found)
      // recomendar RAM: ~la mitad del total, redondeada a la opcion mas cercana [2,4,6,8]
      const total = s?.ram?.totalGB || 8
      const raw = Math.min(8, Math.max(2, Math.floor(total/2)))
      const opts = [2,4,6,8].filter(g=>g<=total)
      const rec = opts.reduce((best,g)=> Math.abs(g-raw)<Math.abs(best-raw)?g:best, opts[0]||4)
      setRamRec(rec); setRamPick(rec)
    }).catch(()=>{})
    return ()=> clearInterval(tick)
  },[step])

  const installJava = async () => {
    if (!scan) return
    const need = scan.java.major >= 17 ? scan.java.major : 21
    setInstalling(true); setInstallErr(''); setInstallMsg(`Descargando Adoptium Temurin ${need} (~45 MB)...`)
    addLog(`Setup: instalando Adoptium Temurin ${need} (JRE)...`)
    const res = await window.api?.installJava?.({ major: need })
    setInstalling(false)
    if (res?.ok) {
      setJavaOk(true); setInstallMsg('✓ Java listo')
      addLog(`✓ Adoptium instalado: ${res.javaPath}`)
      setTimeout(()=>setStep('ram'), 900)
    } else {
      setInstallErr(res?.error || 'No se pudo descargar. Comprueba tu conexion.')
      addLog(`✗ Fallo instalando Java: ${res?.error}`)
    }
  }

  const finish = (skipJava = false) => {
    if (skipJava && !javaOk) addLog('⚠ Setup completado sin Java — Hydra intentara instalarlo al lanzar por 1ª vez')
    const next = { ...config, setupDone: true, ram: { min: '1G', max: `${ramPick}G` } }
    set({ config: next })
    window.api?.saveConfig?.(next)
    addLog(`✓ Setup completado — RAM recomendada ${ramPick}G${javaOk?' • Java listo':''}`)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#07070a] flex flex-col items-center justify-center overflow-hidden select-none">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[120px] opacity-25 bg-blob-1"/>
        <div className="absolute -bottom-40 right-0 w-[500px] h-[500px] rounded-full blur-[100px] opacity-15 bg-blob-2"/>
      </div>

      <div className="relative w-full max-w-[640px] px-6">
        {/* progreso */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['welcome','scan','java','ram'] as const).map(s=>{
            const order: Step[] = ['welcome','scan','java','ram','done']
            const active = order.indexOf(step) >= order.indexOf(s)
            return <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${active?'w-10 neon-gradient':'w-6 bg-white/10'}`}/>
          })}
        </div>

        {step==='welcome' && (
          <div className="glass rounded-3xl p-10 text-center space-y-6 page-enter">
            <img src="hydra-logo.png" alt="" className="w-20 h-20 mx-auto rounded-2xl shadow-[0_0_60px_rgba(124,58,237,0.6)]"/>
            <div>
              <h1 className="font-display text-3xl font-bold">Bienvenido a <span className="gradient">Hydra</span></h1>
              <p className="text-white/55 mt-2 text-sm">El launcher optimizado para Minecraft. Vamos a preparar tu PC en 30 segundos — sin instalaciones manuales.</p>
            </div>
            <button onClick={()=>setStep('scan')} className="neon-gradient text-white font-bold px-10 py-3.5 rounded-xl text-base">Comenzar</button>
          </div>
        )}

        {step==='scan' && (
          <div className="glass rounded-3xl p-10 space-y-6 page-enter">
            <h2 className="font-display text-2xl font-bold text-center">Analizando tu PC</h2>
            <div className="space-y-3">
              {scanLines.slice(0, scanLine).map((l,i)=>(
                <div key={i} className="flex items-center gap-3 text-sm text-white/80 page-enter">
                  <span className="w-5 h-5 grid place-items-center rounded-full bg-emerald-500/20 text-emerald-300 text-xs">✓</span>
                  {l}
                </div>
              ))}
              {scanLine < scanLines.length && (
                <div className="flex items-center gap-3 text-sm text-white/50">
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"/>
                  {scanLines[scanLine]}
                </div>
              )}
            </div>
            {scan && scanLine>=scanLines.length && (
              <div className="page-enter pt-2 space-y-2">
                <div className="flex justify-between text-sm glass rounded-xl px-4 py-3">
                  <span className="text-white/50">RAM</span><span className="font-semibold">{scan.ram.totalGB} GB ({scan.ram.freeGB} libres)</span>
                </div>
                <div className="flex justify-between text-sm glass rounded-xl px-4 py-3">
                  <span className="text-white/50">GPU</span><span className="font-semibold truncate ml-3">{scan.gpu || 'No detectada'}</span>
                </div>
                <div className="flex justify-between text-sm glass rounded-xl px-4 py-3">
                  <span className="text-white/50">Java</span>
                  <span className={`font-semibold ${scan.java.found?'text-emerald-300':'text-amber-300'}`}>
                    {scan.java.found ? `Java ${scan.java.major || '?'} — listo` : 'No encontrado'}
                  </span>
                </div>
                <button onClick={()=>setStep(scan.java.found?'ram':'java')} className="w-full neon-gradient text-white font-bold py-3 rounded-xl mt-4">Siguiente</button>
              </div>
            )}
          </div>
        )}

        {step==='java' && (
          <div className="glass rounded-3xl p-10 text-center space-y-6 page-enter">
            {javaOk ? (
              <>
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/15 grid place-items-center text-3xl">✓</div>
                <h2 className="font-display text-2xl font-bold">Java instalado</h2>
                <p className="text-white/55 text-sm">Hydra instalo Adoptium Temurin automaticamente. Ya no tienes que preocuparte por Java.</p>
                <button onClick={()=>setStep('ram')} className="neon-gradient text-white font-bold px-10 py-3.5 rounded-xl">Siguiente</button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/15 grid place-items-center text-3xl">☕</div>
                <h2 className="font-display text-2xl font-bold">Falta Java</h2>
                <p className="text-white/55 text-sm">Minecraft necesita Java para funcionar. Hydra puede instalar <b className="text-white">Adoptium Temurin</b> (el mas rapido y seguro) automaticamente — sin ventanas raras, sin configurar nada.</p>
                {!installing && !installErr && (
                  <div className="space-y-3">
                    <button onClick={installJava} className="neon-gradient text-white font-bold px-10 py-3.5 rounded-xl text-base">Instalar Java automaticamente</button>
                    <button onClick={()=>window.api?.openExternal?.('https://adoptium.net/temurin/releases/')} className="block mx-auto text-xs text-white/45 hover:text-white underline">Prefiero instalarlo yo (abrir pagina oficial)</button>
                  </div>
                )}
                {installing && (
                  <div className="space-y-3">
                    <div className="w-10 h-10 mx-auto border-2 border-white/20 border-t-violet-400 rounded-full animate-spin"/>
                    <p className="text-sm text-white/60">{installMsg}</p>
                  </div>
                )}
                {installErr && !installing && (
                  <div className="space-y-3">
                    <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{installErr}</p>
                    <button onClick={installJava} className="bg-white text-black font-bold px-8 py-3 rounded-xl text-sm">Reintentar</button>
                    <button onClick={()=>finish(true)} className="block mx-auto text-xs text-white/45 hover:text-white">Omitir por ahora</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step==='ram' && (
          <div className="glass rounded-3xl p-10 text-center space-y-6 page-enter">
            <h2 className="font-display text-2xl font-bold">Memoria para Minecraft</h2>
            <p className="text-white/55 text-sm">{scan ? `Tu PC tiene ${scan.ram.totalGB} GB de RAM. Hydra recomienda asignar:` : 'Elige cuanta RAM quieres darle a Minecraft.'}</p>
            <div className="grid grid-cols-3 gap-3">
              {[2,4,6,8].filter(g=>!scan || g<=scan.ram.totalGB).map(g=>(
                <button key={g} onClick={()=>setRamPick(g)}
                  className={`glass rounded-xl py-4 border transition-all ${ramPick===g?'border-violet-500 bg-violet-500/10':'border-white/10 hover:border-white/25'}`}>
                  <div className="text-2xl font-bold">{g}G</div>
                  {scan && g===ramRec && <div className="text-[10px] text-violet-300 mt-1">Recomendado</div>}
                </button>
              ))}
            </div>
            <button onClick={()=>finish()} className="neon-gradient text-white font-bold px-10 py-3.5 rounded-xl text-base">Finalizar</button>
          </div>
        )}
      </div>

      {step!=='welcome' && step!=='scan' && (
        <button onClick={()=>finish(true)} className="relative mt-6 text-xs text-white/30 hover:text-white/60">Saltar configuracion</button>
      )}
    </div>
  )
}
