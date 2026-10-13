import { Suspense, lazy, useEffect, useState } from 'react'
import { useStore } from './store/launcherStore'

const Home = lazy(() => import('./pages/Home'))
const Versions = lazy(() => import('./pages/Versions'))
const Servers = lazy(() => import('./pages/Servers'))
const Settings = lazy(() => import('./pages/Settings'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Mods = lazy(() => import('./pages/Mods'))
const Stats = lazy(() => import('./pages/Stats'))

declare global { interface Window { api:any } }

const nav = [
  { id:'home', label:'Inicio', icon:'◈', desc:'Novedades' },
  { id:'versions', label:'Versiones', icon:'⬢', desc:'Vanilla / Fabric / Forge' },
  { id:'servers', label:'Servidores', icon:'⬣', desc:'HyperHard • Comunidad' },
  { id:'modpacks', label:'Mods', icon:'🧩', desc:'Modrinth • CurseForge' },
  { id:'stats', label:'Estadísticas', icon:'📊', desc:'Tiempo • Logros' },
  { id:'accounts', label:'Cuentas', icon:'◎', desc:'Microsoft • Skins' },
  { id:'settings', label:'Ajustes', icon:'⚙', desc:'Tema • RAM • Java' },
]

export default function App(){
  const [tab,setTab]=useState('home')
  const [ready,setReady]=useState(false)
  const set = useStore(s=>s.set)
  const addLog = useStore(s=>s.addLog)
  const config = useStore(s=>s.config)
  const accounts = useStore(s=>s.accounts)
  const activeAccount = useStore(s=>s.activeAccount)

  useEffect(()=>{
    let pending = 3
    const done = ()=>{ if(--pending<=0) setReady(true) }

    window.api?.getVersions?.().then((vData:any)=>{
      if (vData?.versions) {
        const { config: cfg } = useStore.getState()
        const savedVer = cfg?.lastVersion
        const savedLoader = cfg?.lastLoader
        const ver = savedVer && vData.versions.some((x:any)=>x.id===savedVer) ? savedVer : vData.latest.release
        set({versions:vData.versions, latest:vData.latest, selectedVersion: ver, loader: savedLoader || 'vanilla'})
      }
    }).catch(()=>{}).finally(done)

    window.api?.getInstalledVersionsFull?.().then((l:any)=> set({installedVersions: l||[]})).catch(()=>{}).finally(done)

    window.api?.getConfig?.().catch(()=>null).then((cData:any)=>{
      if (cData) set({config:cData})
      return window.api?.getAccounts?.().catch(()=>null).then((aData:any)=>{
        if (aData?.length) {
          const savedUuid = cData?.lastAccountUuid || aData[0]?.uuid
          const active = aData.find((x:any)=>x.uuid===savedUuid) || aData[0]
          set({accounts:aData, activeAccount:active})
        }
      })
    }).finally(done)

    window.api?.onLaunchLog?.((m:string)=> addLog(m))
    window.api?.onProgress?.((p:any)=> set({progress:p}))
    const onTab = (e:Event)=> setTab((e as CustomEvent).detail)
    document.addEventListener('hydra:tab', onTab)
    return ()=> document.removeEventListener('hydra:tab', onTab)
  },[])

  useEffect(()=>{
    document.documentElement.dataset.theme = config?.theme && config.theme!=='hydra' ? config.theme : ''
  },[config?.theme])

  useEffect(()=>{ if(ready && config?.ram) window.api?.saveConfig?.(config) }, [config, ready])
  useEffect(()=>{ if(ready && accounts?.length) window.api?.saveAccounts?.(accounts) }, [accounts, ready])
  const selectedVersion = useStore(s=>s.selectedVersion)
  const loader = useStore(s=>s.loader)
  useEffect(()=>{
    if (!ready || !config || !selectedVersion) return
    const next = { ...config, lastVersion: selectedVersion, lastLoader: loader, lastAccountUuid: activeAccount?.uuid || accounts[0]?.uuid }
    if (next.lastVersion===config.lastVersion && next.lastLoader===config.lastLoader && next.lastAccountUuid===config.lastAccountUuid) return
    set({config: next})
    window.api?.saveConfig?.(next)
  },[selectedVersion, loader, activeAccount?.uuid, accounts[0]?.uuid, ready])

  const active = activeAccount || accounts[0]

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07070a] overflow-hidden select-none">
      <div className="h-8 flex items-center justify-between px-3 bg-[#0c0c11] border-b border-white/[0.06] shrink-0" style={{WebkitAppRegion:'drag'} as any}>
        <div className="flex items-center gap-2.5">
          <img src="hydra-logo.png" className="w-6 h-6 rounded-md object-contain shadow-[0_0_14px_rgba(124,58,237,0.5)]" alt=""/>
          <span className="font-display font-bold tracking-tight text-[13px]">Hydra Launcher</span>
          <AppVersionPill/>
        </div>
        <div className="flex items-center gap-0.5" style={{WebkitAppRegion:'no-drag'} as any}>
          <button onClick={()=>window.api.winMin()} className="w-9 h-7 grid place-items-center hover:bg-white/10 rounded text-white/60 text-xs">─</button>
          <button onClick={()=>window.api.winMax()} className="w-9 h-7 grid place-items-center hover:bg-white/10 rounded text-white/60 text-xs">□</button>
          <button onClick={()=>window.api.winClose()} className="w-9 h-7 grid place-items-center hover:bg-red-500/90 rounded text-white/60 text-xs">✕</button>
        </div>
      </div>

      <UpdateBanner/>
      <CrashBanner/>

      <div className="flex flex-1 min-h-0">
        <aside className="w-[250px] bg-[#0c0c11]/95 border-r border-white/[0.06] p-2.5 flex flex-col gap-2.5 shrink-0">
          <div className="glass rounded-xl p-2.5 flex items-center gap-2.5 card-hover">
            <img src={`https://mc-heads.net/avatar/${active?.name || 'Steve'}/48`} className="w-9 h-9 rounded-lg bg-white/10" alt=""/>
            <div className="min-w-0">
              <div className="font-semibold leading-none truncate text-[13px]">{active?.name}</div>
              <div className="text-[11px] text-white/45 truncate">{active?.type==='microsoft'?'Premium':'Offline'} • {(active?.uuid||'').slice(0,8)}</div>
            </div>
            <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]"/>
          </div>

          <nav className="space-y-1">
            {nav.map(n=>(
              <button key={n.id} data-tab={n.id} onClick={()=>setTab(n.id)}
                className={`nav-btn w-full text-left flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl border ${tab===n.id?'bg-white text-black border-white font-semibold shadow-lg':'glass hover:bg-white/[0.09] border-transparent text-white/80'}`}>
                <span className="w-8 h-8 grid place-items-center rounded-lg bg-black/5 border border-black/5 text-base">{n.icon}</span>
                <span className="min-w-0"><div className="text-[13px] leading-none">{n.label}</div><div className={`text-[11px] mt-0.5 truncate ${tab===n.id?'text-black/55':'text-white/40'}`}>{n.desc}</div></span>
                {tab===n.id && <span className="ml-auto">›</span>}
              </button>
            ))}
          </nav>

          <RamWidget/>
        </aside>

        <main className="flex-1 min-w-0 bg-gradient-to-br from-[#07070a] via-[#0b0b14] to-[#07070a] relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full blur-[90px] opacity-20 bg-blob-1"/>
            <div className="absolute -bottom-40 -left-40 w-[620px] h-[620px] rounded-full blur-[90px] opacity-15 bg-blob-2"/>
          </div>
          <div className="relative h-full overflow-auto p-5">
            <Suspense key={tab} fallback={<PageLoading/>}>
              <div key={tab} className="page-enter">
                {tab==='home' && <Home/>}
                {tab==='versions' && <Versions/>}
                {tab==='servers' && <Servers/>}
                {tab==='modpacks' && <Mods/>}
                {tab==='stats' && <Stats/>}
                {tab==='accounts' && <Accounts/>}
                {tab==='settings' && <Settings/>}
              </div>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}

function PageLoading(){
  return (
    <div className="glass rounded-2xl p-10 text-center text-white/50 text-sm">
      <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin align-middle mr-2"/>
      Cargando…
    </div>
  )
}

function AppVersionPill(){
  const [v,setV]=useState('')
  useEffect(()=>{ window.api?.getAppVersion?.().then(setV).catch(()=>{}) },[])
  if(!v) return null
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-white/60">v{v}</span>
}

function RamWidget(){
  const config = useStore(s=>s.config)
  const [total,setTotal]=useState(8)
  useEffect(()=>{ window.api?.getSystemRam?.().then((r:any)=> setTotal(r.totalGB || 8)).catch(()=>{}) },[])
  const maxGB = parseInt(String(config.ram.max)) || 4
  const pct = Math.min(100, Math.round((maxGB/total)*100))
  return (
    <div className="mt-auto glass rounded-xl p-3">
      <div className="text-[11px] text-white/45">RAM asignada</div>
      <div className="text-sm font-semibold">{config.ram.max} / {config.ram.min}</div>
      <div className="h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden"><div className="h-full neon-gradient transition-all" style={{width:`${pct}%`}}/></div>
      <div className="text-[10px] text-white/35 mt-1">{maxGB}GB de {total}GB del sistema</div>
    </div>
  )
}

function UpdateBanner(){
  const [info,setInfo]=useState<any>(null)
  const [cleanup,setCleanup]=useState(true)
  useEffect(()=>{
    window.api?.onUpdateDownloaded?.((i:any)=> setInfo(i))
    window.api?.getUpdateState?.().then((s:any)=>{ if(s?.downloaded) setInfo(s.downloaded) }).catch(()=>{})
  },[])
  if(!info) return null
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 bg-gradient-to-r from-violet-600/25 via-fuchsia-600/15 to-transparent border-b border-violet-500/20">
      <span className="text-sm font-bold">🚀 Hydra v{info.version} listo para instalar</span>
      <span className="text-xs text-white/55">Se reiniciará y actualizará automáticamente.</span>
      <label className="flex items-center gap-1.5 text-xs text-white/70 cursor-pointer ml-auto">
        <input type="checkbox" checked={cleanup} onChange={e=>setCleanup(e.target.checked)} className="accent-violet-600"/>
        Eliminar instaladores antiguos
      </label>
      <button onClick={()=>window.api?.installUpdate?.({cleanupOld:cleanup})} className="bg-white text-black font-bold px-4 py-1.5 rounded-lg text-xs">Reiniciar y actualizar</button>
      <button onClick={()=>setInfo(null)} className="text-xs text-white/50 hover:text-white">Despues</button>
    </div>
  )
}

function CrashBanner(){
  const [crashes,setCrashes]=useState<any[]>([])
  const [copied,setCopied]=useState(false)
  useEffect(()=>{
    window.api?.getPendingCrashes?.().then((r:any)=> setCrashes(r?.crashes||[])).catch(()=>{})
  },[])
  if(!crashes.length) return null
  const copyReport = async ()=>{
    const r = await window.api?.readCrash?.(crashes[0].file)
    if(r?.ok){ navigator.clipboard?.writeText(r.content); setCopied(true); setTimeout(()=>setCopied(false),2000) }
  }
  const dismiss = ()=>{ window.api?.dismissCrashes?.(); setCrashes([]) }
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 bg-red-600/15 border-b border-red-500/25">
      <span className="text-sm font-bold text-red-300">⚠ Se detectó un fallo la última vez</span>
      <span className="text-xs text-white/55">{crashes.length} informe{crashes.length>1?'s':''} guardado{crashes.length>1?'s':''} en tu PC (sin datos privados).</span>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={copyReport} className="text-xs px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 font-semibold">{copied?'✓ Copiado':'Copiar informe'}</button>
        <button onClick={()=>window.api?.shellOpenPath?.(crashes[0].file)} className="text-xs px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 font-semibold">Abrir</button>
        <button onClick={dismiss} className="text-xs text-white/50 hover:text-white">Entendido</button>
      </div>
    </div>
  )
}
