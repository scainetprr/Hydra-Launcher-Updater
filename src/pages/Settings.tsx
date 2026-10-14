import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store/launcherStore'

export default function Settings(){
  const config = useStore(s=>s.config)
  const set = useStore(s=>s.set)
  const logs = useStore(s=>s.logs)
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
    window.api?.getUpdateState?.().then((s:any)=>{
      const i = s?.downloaded || s?.available
      if (i) { setUpdInfo(i); setUpdStatus({msg: s?.downloaded ? `v${i.version} descargado - listo para instalar` : `Disponible: v${i.version}`, kind:'ok'}) }
    }).catch(()=>{})
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
      else setUpdStatus({msg:`Estás al día (v${appVer})`,kind:'ok'})
    } else setUpdStatus({msg:`Error: ${res?.error||'sin conexión'}`,kind:'err'})
  }
  const installUpdate = async () => {
    setUpdStatus({msg:'Descargando e instalando…',kind:'busy'})
    const res:any = await window.api?.installUpdate?.({ cleanupOld: config.cleanupOldOnUpdate !== false })
    if (res && res.ok === false) setUpdStatus({msg:`Error: ${res.error||'no se pudo instalar'}`,kind:'err'})
  }
  const cleanNow = async () => {
    const res = await window.api?.cleanupOldInstallers?.()
    setCleanupResult(res?.removed ? `${res.removed} instalador(es) antiguo(s) eliminados` : 'Nada que limpiar')
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-4">
      <h2 className="font-display text-2xl font-bold">Ajustes</h2>

      {/* ACTUALIZACIONES */}
      <div className="glass rounded-2xl p-5 space-y-3 card-hover">
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
      <div className="glass rounded-2xl p-5 space-y-3 card-hover">
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
        <div className="flex items-center gap-3">
          <label className="text-xs text-white/50 w-28">Tema / temporada</label>
          <div className="flex gap-2 flex-wrap">
            {[
              { id:'hydra', name:'Hydra', colors:['#7c3aed','#06b6d4','#ec4899'] },
              { id:'temporada2', name:'Temporada 2', colors:['#059669','#10b981','#f59e0b'] },
              { id:'midnight', name:'Midnight', colors:['#2563eb','#6366f1','#38bdf8'] },
              { id:'inferno', name:'Inferno', colors:['#dc2626','#ea580c','#f59e0b'] },
              { id:'mono', name:'Mono', colors:['#52525b','#a1a1aa','#e4e4e7'] },
            ].map(t=>(
              <button key={t.id} onClick={()=>patchConfig({theme:t.id})}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${(config.theme||'hydra')===t.id?'bg-white text-black border-white':'bg-white/[0.05] border-white/10 text-white/75 hover:bg-white/10'}`}>
                <span className="flex">{t.colors.map(c=><span key={c} className="w-3 h-3 rounded-full border border-black/20" style={{background:c}}/>)}</span>
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-white/35">Se aplica al instante. Los temas de temporada cambian los acentos del launcher.</div>
      </div>

      {/* PERFILES DE LANZAMIENTO */}
      <ProfilesCard config={config} patchConfig={patchConfig}/>

      {/* INTEGRACIONES */}
      <div className="glass rounded-2xl p-5 space-y-3 card-hover">
        <div className="font-bold">Integraciones</div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-white/50 w-28">CurseForge API key</label>
          <input value={config.curseforgeKey || ''} onChange={e=>patchConfig({curseforgeKey:e.target.value})} placeholder="$2a$10$... (opcional)"
            className="flex-1 min-w-[220px] bg-[#14141c] border border-white/10 rounded-xl px-3 py-2 text-sm"/>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-white/50 w-28">Discord App ID</label>
          <input value={config.discordClientId || ''} onChange={e=>patchConfig({discordClientId:e.target.value.replace(/\D/g,'')})} placeholder="ID de tu aplicación de Discord (opcional)"
            className="flex-1 min-w-[220px] bg-[#14141c] border border-white/10 rounded-xl px-3 py-2 text-sm"/>
          <span className={`text-[11px] ${config.discordClientId?'text-emerald-300':'text-white/35'}`}>{config.discordClientId?'● Presencia activa: "Jugando a Hydra Launcher"':'Inactivo'}</span>
        </div>
        <div className="text-[11px] text-white/35">Modrinth <b>no necesita clave</b> (solo la sube el límite de peticiones). CurseForge: gratis en <b>console.curseforge.com</b> → API Keys. Discord: crea una app gratis en <b>discord.com/developers</b> y pega su <b>Application ID</b> (no es la API key de Modrinth) — al abrir Hydra aparecerá "Jugando a Hydra Launcher" con la IP del servidor; al entrar en una partida cambia a "Jugando en HyperHard".</div>
      </div>

      {/* DIAGNÓSTICO / CRASH REPORTER */}
      <DiagnosticsCard/>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5 space-y-3 card-hover">
          <div className="font-bold flex items-center gap-2">Memoria RAM {sysRam && <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">{sysRam.totalGB}GB detectados</span>}</div>
          {sysRam && <div className="text-xs text-white/50">Tu PC: <b>{sysRam.totalGB}GB</b> total • libre ~{sysRam.freeGB}GB • Recomendado ≤ {Math.max(4, sysRam.totalGB-2)}GB para Hydra</div>}
          <label className="text-xs text-white/50">Maxima</label>
          <select value={config.ram.max} onChange={e=>set({config:{...config, ram:{...config.ram, max:e.target.value}}})} className="w-full bg-[#14141c] border border-white/10 rounded-xl px-3 py-2">
            {(()=>{
              const total = sysRam?.totalGB || 8
              const opts: string[] = []
              for(let g=2; g<=total; g+= g<8?2:4) opts.push(g+'G')
              if (!opts.includes(total+'G')) opts.push(total+'G')
              return opts.map(v=><option key={v} value={v}>{v} {parseInt(v)===total?'— máximo PC':''}</option>)
            })()}
          </select>
          <label className="text-xs text-white/50">Mínima</label>
          <select value={config.ram.min} onChange={e=>set({config:{...config, ram:{...config.ram, min:e.target.value}}})} className="w-full bg-[#14141c] border border-white/10 rounded-xl px-3 py-2">
            {['1G','2G','4G'].map(v=><option key={v} value={v}>{v}</option>)}
          </select>
          <div className="text-xs text-white/40">Hydra auto-limita al maximo de tu PC. Para modpacks pesados usa {sysRam? Math.min(8, sysRam.totalGB-2)+'G' : '4-6G'}.</div>
        </div>

        <div className="glass rounded-2xl p-5 space-y-3 card-hover">
          <div className="font-bold">Java</div>
          <div className="text-xs text-white/50">Detectadas:</div>
          <div className="space-y-1 max-h-20 overflow-auto">
            {javas.length? javas.map(j=><div key={j} className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 truncate">{j}</div>): <div className="text-xs text-white/40">No detectadas - usa Adoptium 17/21</div>}
          </div>
          <input value={config.javaPath} onChange={e=>set({config:{...config, javaPath:e.target.value}})} placeholder="Ruta java.exe custom (opcional)" className="w-full bg-[#14141c] border border-white/10 rounded-xl px-3 py-2 text-sm"/>
          <div className="text-xs text-white/40">Vacío = auto (usa Java de Minecraft). Para 1.17+ usa Java 17, para 1.21+ Java 21.</div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 card-hover">
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

      <div className="glass rounded-2xl p-4 flex items-center gap-3 card-hover">
        <div className="text-sm"><b>Almacenamiento</b><div className="text-xs text-white/50">Ubicación: %APPDATA%/.minecraft • Versiones, assets y mods compartidos con vanilla</div></div>
        <button onClick={()=>{ if(confirm('¿Limpiar logs?')) set({logs:[]})}} className="ml-auto bg-white text-black font-bold px-4 py-2 rounded-xl text-sm">Limpiar cache</button>
      </div>
    </div>
  )
}

function ProfilesCard({ config, patchConfig }:{ config:any; patchConfig:(p:any)=>any }){
  const selectedVersion = useStore(s=>s.selectedVersion)
  const loader = useStore(s=>s.loader)
  const set = useStore(s=>s.set)
  const profiles = config.profiles || []
  const [name,setName]=useState('')
  const [icon,setIcon]=useState('🎯')
  const [serverIp,setServerIp]=useState('')

  const saveCurrent = ()=>{
    if(!name.trim()) return
    const p = {
      id:'p'+Date.now(), name:name.trim(), icon,
      version: selectedVersion, loader,
      ram: { ...config.ram },
      serverIp: serverIp || ''
    }
    const next = patchConfig({ profiles:[...profiles, p] })
    setName(''); setServerIp('')
    return next
  }
  const remove = (id:string)=> patchConfig({ profiles: profiles.filter((x:any)=>x.id!==id) })
  const apply = (p:any)=>{
    set({ selectedVersion:p.version, loader:p.loader, config:{...config, ram:p.ram} })
    window.api?.saveConfig?.({...config, ram:p.ram})
  }

  return (
    <div className="glass rounded-2xl p-5 space-y-3 card-hover">
      <div className="font-bold flex items-center gap-2">Perfiles de lanzamiento <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-white/55">{profiles.length}</span></div>
      {profiles.length ? (
        <div className="grid sm:grid-cols-2 gap-2">
          {profiles.map((p:any)=>(
            <div key={p.id} className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5">
              <span className="text-lg">{p.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate">{p.name}</div>
                <div className="text-[11px] text-white/45 truncate">{p.version} • {p.loader} • {p.ram?.max}{p.serverIp?` • ${p.serverIp}`:''}</div>
              </div>
              <button onClick={()=>apply(p)} className="text-xs bg-white text-black font-bold px-3 py-1.5 rounded-lg">Aplicar</button>
              <button onClick={()=>remove(p.id)} className="text-xs px-2 py-1.5 rounded-lg bg-white/10 border border-white/10">✕</button>
            </div>
          ))}
        </div>
      ) : <div className="text-sm text-white/45">Guarda tu configuración actual (versión, loader, RAM) como perfil para cambiar de setup en 1 clic desde la barra inferior.</div>}
      <div className="flex flex-wrap items-center gap-2">
        <select value={icon} onChange={e=>setIcon(e.target.value)} className="bg-[#14141c] border border-white/10 rounded-xl px-2 py-2 text-sm">
          {['🎯','⚔️','🏗️','🌾','🌍','🔥','🧊','🎮'].map(i=><option key={i} value={i}>{i}</option>)}
        </select>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre (ej: PvP, Survival, Creative)" className="flex-1 min-w-[180px] bg-[#14141c] border border-white/10 rounded-xl px-3 py-2 text-sm"/>
        <select value={serverIp} onChange={e=>setServerIp(e.target.value)} className="bg-[#14141c] border border-white/10 rounded-xl px-2 py-2 text-sm">
          <option value="">— Sin servidor —</option>
          {config.servers.map((s:any)=><option key={s.id} value={s.ip}>{s.name}</option>)}
        </select>
        <button onClick={saveCurrent} className="bg-white text-black font-bold px-4 py-2 rounded-xl text-sm">Guardar perfil actual</button>
      </div>
      <div className="text-[11px] text-white/35">Un perfil guarda versión + loader + RAM + servidor. Selecciona desde el desplegable "Perfil" de la barra inferior al instante.</div>
    </div>
  )
}

function DiagnosticsCard(){
  const [stats,setStats]=useState<any>(null)
  const [ver,setVer]=useState('')
  const [copied,setCopied]=useState(false)
  useEffect(()=>{ window.api?.getStats?.().then(setStats).catch(()=>{}); window.api?.getAppVersion?.().then(setVer).catch(()=>{}) },[])
  const c = stats?.counters || {}
  const copy = ()=>{
    const payload = {
      launcher: 'hydra-launcher', version: ver,
      launches: c.launches||0, crashes: c.crashes||0, playMs: c.playMs||0,
      byServer: c.byServer||{}, os: navigator.userAgent
    }
    navigator.clipboard?.writeText(JSON.stringify(payload,null,2))
    setCopied(true); setTimeout(()=>setCopied(false),2000)
  }
  return (
    <div className="glass rounded-2xl p-5 space-y-3 card-hover">
      <div className="font-bold">Diagnóstico y avisos de fallos</div>
      <div className="text-sm text-white/65">Si Minecraft falla, Hydra guarda un informe local (sin cuentas ni tokens) y te avisa la próxima vez. Puedes copiarlo y pegarlo en Discord para ayudar a arreglarlo.</div>
      {stats && (
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10">Lanzamientos: <b>{c.launches||0}</b></span>
          <span className="px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10">Fallos: <b className={c.crashes?'text-red-300':''}>{c.crashes||0}</b></span>
          <span className="px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10">Sesiones: <b>{(stats.sessions||[]).length}</b></span>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={copy} className="bg-white text-black font-bold px-4 py-2 rounded-xl text-sm">{copied?'✓ Copiado':'Copiar diagnóstico'}</button>
      </div>
      <div className="text-[11px] text-white/35">Los informes viven en %APPDATA%/.minecraft/hydra-crashes. Nada sale de tu PC salvo que lo copies.</div>
    </div>
  )
}
