import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store/launcherStore'

export default function Settings(){
  const { config, set, logs } = useStore()
  const [javas,setJavas]=useState<string[]>([])
  const [sysRam,setSysRam]=useState<{totalGB:number,freeGB?:number}|null>(null)
  const logRef = useRef<HTMLPreElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [appVer,setAppVer]=useState('')
  const [updStatus,setUpdStatus]=useState<{msg:string,kind:'idle'|'busy'|'ok'|'err'}>({msg:'Sin comprobar',kind:'idle'})
  const [updInfo,setUpdInfo]=useState<any>(null)
  const [cleanupResult,setCleanupResult]=useState('')

  useEffect(()=>{ window.api.detectJava().then(setJavas) },[])
  useEffect(()=>{ window.api.getSystemRam?.().then((r:any)=>{
    const gb = r.totalGB || Math.floor(r.totalBytes/(1024**3))
    setSysRam({totalGB:gb, freeGB: Math.floor(r.freeBytes/(1024**3))})
    if (parseInt(config.ram.max) > gb) set({config:{...config, ram:{...config.ram, max: Math.max(2, gb-2)+'G' as any}}})
  }).catch(()=>setSysRam({totalGB:8})) },[])
  useEffect(()=>{
    if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  },[logs, autoScroll])
  useEffect(()=>{ window.api?.getAppVersion?.().then(setAppVer).catch(()=>{}) },[])
  useEffect(()=>{
    window.api?.onUpdateAvailable?.((i:any)=>{ setUpdInfo(i); setUpdStatus({msg:`Disponible: v${i.version}`,kind:'ok'}) })
    window.api?.onUpdateDownloaded?.((i:any)=>{ setUpdInfo(i); setUpdStatus({msg:`v${i.version} descargado - listo para instalar`,kind:'ok'}) })
  },[])

  const patchConfig = (patch:any) => {
    const next = { ...config, ...patch }
    set({ config: next })
    window.api?.saveConfig?.(next)
    return next
  }

  const checkUpdates = async () => {
    setUpdStatus({msg:'Buscando actualizaciones...',kind:'busy'})
    const res = await window.api?.checkUpdates?.()
    if (res?.ok) {
      const latest = res.updateInfo?.version
      if (latest && latest !== appVer) { setUpdInfo(res.updateInfo); setUpdStatus({msg:`Hay una versión nueva: v${latest}`,kind:'ok'}) }
      else setUpdStatus({msg:`Estas al dia (v${appVer})`,kind:'ok'})
    } else setUpdStatus({msg:`Error: ${res?.error||'sin conexión'}`,kind:'err'})
  }
  const installUpdate = () => window.api?.installUpdate?.({ cleanupOld: config.cleanupOldOnUpdate !== false })
  const cleanNow = async () => {
    const res = await window.api?.cleanupOldInstallers?.()
    setCleanupResult(res?.removed ? `${res.removed} instalador(es) antiguo(s) eliminados` : 'Nada que limpiar')
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-4">
      <h2 className="font-display text-2xl font-bold">Ajustes</h2>

      {/* ACTUALIZACIONES */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="font-bold flex items-center gap-2">Actualizaciones <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/25">v{appVer || '...'}</span></div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={checkUpdates} disabled={updStatus.kind==='busy'} className="bg-white text-black font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50">Buscar actualizaciones</button>
          <span className={`text-xs ${updStatus.kind==='err'?'text-rose-300':updStatus.kind==='ok'?'text-emerald-300':'text-white/50'}`}>{updStatus.msg}</span>
          {updInfo && updInfo.version !== appVer && (
            <button onClick={installUpdate} className="neon-gradient text-white font-bold px-4 py-2 rounded-xl text-sm">Reiniciar e instalar v{updInfo.version}</button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-white/75 cursor-pointer">
          <input type="checkbox" checked={config.cleanupOldOnUpdate !== false} onChange={e=>patchConfig({cleanupOldOnUpdate:e.target.checked})} className="accent-violet-600"/>
          Eliminar instaladores antiguos al actualizar o instalar una nueva versión
        </label>
        <div className="flex items-center gap-3">
          <button onClick={cleanNow} className="glass border border-white/10 px-3 py-1.5 rounded-lg text-xs font-semibold">Limpiar instaladores antiguos ahora</button>
          {cleanupResult && <span className="text-xs text-emerald-300">{cleanupResult}</span>}
        </div>
        <div className="text-[11px] text-white/35">Busca Hydra-Launcher-Setup/Portable v* en Descargas y Escritorio (excepto la versión actual).</div>
      </div>

      {/* INTERFAZ */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="font-bold">Interfaz</div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-white/50 w-28">Zoom de la UI</label>
          <select value={String(config.uiZoom || 0.8)} onChange={e=>{
            const z = Number(e.target.value)
            patchConfig({ uiZoom: z })
            window.api?.setZoom?.(z)
          }} className="bg-[#14141c] border border-white/10 rounded-xl px-3 py-2 text-sm">
            <option value="0.7">70% (mini)</option>
            <option value="0.8">80% (recomendado)</option>
            <option value="0.9">90%</option>
            <option value="1">100%</option>
          </select>
        </div>
        <div className="text-[11px] text-white/35">Como Ctrl + - en el navegador. Se aplica al reiniciar o al instante.</div>
      </div>

      {/* INTEGRACIONES */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="font-bold">Integraciones</div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-white/50 w-28">CurseForge API key</label>
          <input value={config.curseforgeKey || ''} onChange={e=>patchConfig({curseforgeKey:e.target.value})} placeholder="$2a$10$... (opcional)"
            className="flex-1 min-w-[220px] bg-[#14141c] border border-white/10 rounded-xl px-3 py-2 text-sm"/>
        </div>
        <div className="text-[11px] text-white/35">Modrinth funciona sin clave. Para CurseForge crea una gratis en <b>console.curseforge.com</b> → API Keys.</div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="font-bold flex items-center gap-2">Memoria RAM {sysRam && <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">{sysRam.totalGB}GB detectados</span>}</div>
          {sysRam && <div className="text-xs text-white/50">Tu PC: <b>{sysRam.totalGB}GB</b> total • libre ~{sysRam.freeGB}GB • Recomendado ≤ {Math.max(4, sysRam.totalGB-2)}GB para Hydra</div>}
          <label className="text-xs text-white/50">Maxima</label>
          <select value={config.ram.max} onChange={e=>set({config:{...config, ram:{...config.ram, max:e.target.value}}})} className="w-full bg-[#14141c] border border-white/10 rounded-xl px-3 py-2">
            {(()=>{
              const total = sysRam?.totalGB || 8
              const opts: string[] = []
              for(let g=2; g<=total; g+= g<8?2:4) opts.push(g+'G')
              if (!opts.includes(total+'G')) opts.push(total+'G')
              return opts.map(v=><option key={v} value={v}>{v} {parseInt(v)===total?'— maximo PC':''}</option>)
            })()}
          </select>
          <label className="text-xs text-white/50">Minima</label>
          <select value={config.ram.min} onChange={e=>set({config:{...config, ram:{...config.ram, min:e.target.value}}})} className="w-full bg-[#14141c] border border-white/10 rounded-xl px-3 py-2">
            {['1G','2G','4G'].map(v=><option key={v} value={v}>{v}</option>)}
          </select>
          <div className="text-xs text-white/40">Hydra auto-limita al maximo de tu PC. Para modpacks pesados usa {sysRam? Math.min(8, sysRam.totalGB-2)+'G' : '4-6G'}.</div>
        </div>

        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="font-bold">Java</div>
          <div className="text-xs text-white/50">Detectadas:</div>
          <div className="space-y-1 max-h-20 overflow-auto">
            {javas.length? javas.map(j=><div key={j} className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 truncate">{j}</div>): <div className="text-xs text-white/40">No detectadas - usa Adoptium 17/21</div>}
          </div>
          <input value={config.javaPath} onChange={e=>set({config:{...config, javaPath:e.target.value}})} placeholder="Ruta java.exe custom (opcional)" className="w-full bg-[#14141c] border border-white/10 rounded-xl px-3 py-2 text-sm"/>
          <div className="text-xs text-white/40">Vacio = auto (usa Java de Minecraft). Para 1.17+ usa Java 17, para 1.21+ Java 21.</div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="font-bold text-sm">Logs / Consola</div>
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
        }} className="mt-2 bg-black/40 border border-white/10 rounded-xl p-3 h-[200px] overflow-auto text-xs font-mono whitespace-pre-wrap scroll-smooth">{logs.slice(-400).join('\n') || 'Sin logs aun - lanza el juego o instala un mod para ver actividad'}</pre>
        <div className="flex gap-2 mt-2">
          <button onClick={()=>set({logs:[]})} className="glass px-3 py-1.5 rounded-lg text-xs">Limpiar</button>
          <button onClick={()=> navigator.clipboard.writeText(logs.join('\n'))} className="glass px-3 py-1.5 rounded-lg text-xs">Copiar</button>
          <button onClick={()=>{ setAutoScroll(true); if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight }} className="ml-auto bg-white text-black px-3 py-1.5 rounded-lg text-xs font-bold">↓ Abajo</button>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 flex items-center gap-3">
        <div className="text-sm"><b>Almacenamiento</b><div className="text-xs text-white/50">Ubicacion: %APPDATA%/.minecraft • Versiones, assets y mods compartidos con vanilla</div></div>
        <button onClick={()=>{ if(confirm('¿Limpiar logs?')) set({logs:[]})}} className="ml-auto bg-white text-black font-bold px-4 py-2 rounded-xl text-sm">Limpiar cache</button>
      </div>
    </div>
  )
}
