import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store/launcherStore'

export default function Settings(){
  const { config, set, logs } = useStore()
  const [javas,setJavas]=useState<string[]>([])
  const [sysRam,setSysRam]=useState<{totalGB:number,freeGB?:number}|null>(null)
  const logRef = useRef<HTMLPreElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(()=>{ window.api.detectJava().then(setJavas) },[])
  useEffect(()=>{ window.api.getSystemRam?.().then((r:any)=>{
    const gb = r.totalGB || Math.floor(r.totalBytes/(1024**3))
    setSysRam({totalGB:gb, freeGB: Math.floor(r.freeBytes/(1024**3))})
    // auto-ajustar si max excede total
    if (parseInt(config.ram.max) > gb) set({config:{...config, ram:{...config.ram, max: Math.max(2, gb-2)+'G' as any}}})
  }).catch(()=>setSysRam({totalGB:8})) },[])
  useEffect(()=>{
    if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  },[logs, autoScroll])

  return (
    <div className="max-w-[900px] mx-auto space-y-4">
      <h2 className="font-display text-2xl font-bold">Ajustes</h2>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="font-bold flex items-center gap-2">Memoria RAM {sysRam && <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">{sysRam.totalGB}GB detectados</span>}</div>
          {sysRam && <div className="text-xs text-white/50">Tu PC: <b>{sysRam.totalGB}GB</b> total • libre ~{sysRam.freeGB}GB • Recomendado ≤ {Math.max(4, sysRam.totalGB-2)}GB para Hydra</div>}
          <label className="text-xs text-white/50">Máxima</label>
          <select value={config.ram.max} onChange={e=>set({config:{...config, ram:{...config.ram, max:e.target.value}}})} className="w-full bg-[#14141c] border border-white/10 rounded-xl px-3 py-2">
            {(()=>{
              const total = sysRam?.totalGB || 8
              const opts: string[] = []
              for(let g=2; g<=total; g+= g<8?2:4) opts.push(g+'G')
              if (!opts.includes(total+'G')) opts.push(total+'G')
              // siempre incluir 12/16 si total grande
              return opts.map(v=><option key={v} value={v}>{v} {parseInt(v)===total?'— máximo PC':''}</option>)
            })()}
          </select>
          <label className="text-xs text-white/50">Mínima</label>
          <select value={config.ram.min} onChange={e=>set({config:{...config, ram:{...config.ram, min:e.target.value}}})} className="w-full bg-[#14141c] border border-white/10 rounded-xl px-3 py-2">
            {['1G','2G','4G'].map(v=><option key={v} value={v}>{v}</option>)}
          </select>
          <div className="text-xs text-white/40">Hydra auto-limita al máximo de tu PC. Para modpacks pesados usa {sysRam? Math.min(8, sysRam.totalGB-2)+'G' : '4-6G'}.</div>
        </div>

        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="font-bold">Java</div>
          <div className="text-xs text-white/50">Detectadas:</div>
          <div className="space-y-1 max-h-20 overflow-auto">
            {javas.length? javas.map(j=><div key={j} className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 truncate">{j}</div>): <div className="text-xs text-white/40">No detectadas - usa Adoptium 17/21</div>}
          </div>
          <input value={config.javaPath} onChange={e=>set({config:{...config, javaPath:e.target.value}})} placeholder="Ruta java.exe custom (opcional)" className="w-full bg-[#14141c] border border-white/10 rounded-xl px-3 py-2 text-sm"/>
          <div className="text-xs text-white/40">Vacío = auto (usa Java de Minecraft). Para 1.17+ usa Java 17, para 1.21+ Java 21.</div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="font-bold text-sm">Logs / Consola (como Prism/HMCL)</div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={autoScroll} onChange={e=>setAutoScroll(e.target.checked)} className="accent-violet-600"/>
            Auto-scroll
          </label>
        </div>
        <pre ref={logRef} onScroll={()=>{
          if (!logRef.current) return
          const el=logRef.current
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
          if (!atBottom && autoScroll) setAutoScroll(false)
          if (atBottom && !autoScroll) setAutoScroll(true)
        }} className="mt-2 bg-black/40 border border-white/10 rounded-xl p-3 h-[220px] overflow-auto text-xs font-mono whitespace-pre-wrap scroll-smooth">{logs.slice(-400).join('\n') || 'Sin logs aún - lanza el juego para ver progreso'}</pre>
        <div className="flex gap-2 mt-2">
          <button onClick={()=>set({logs:[]})} className="glass px-3 py-1.5 rounded-lg text-xs">Limpiar</button>
          <button onClick={()=> navigator.clipboard.writeText(logs.join('\n'))} className="glass px-3 py-1.5 rounded-lg text-xs">Copiar</button>
          <button onClick={()=>{ setAutoScroll(true); if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight }} className="ml-auto bg-white text-black px-3 py-1.5 rounded-lg text-xs font-bold">↓ Abajo</button>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 flex items-center gap-3">
        <div className="text-sm"><b>Almacenamiento</b><div className="text-xs text-white/50">Ubicación: %APPDATA%/.minecraft • Versiones, assets y mods compartidos con vanilla</div></div>
        <button onClick={()=>{ if(confirm('¿Limpiar logs?')) set({logs:[]})}} className="ml-auto bg-white text-black font-bold px-4 py-2 rounded-xl text-sm">Limpiar cache</button>
      </div>
    </div>
  )
}
