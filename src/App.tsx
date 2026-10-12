import { useEffect, useState } from 'react'
import { useStore } from './store/launcherStore'
import Home from './pages/Home'
import Versions from './pages/Versions'
import Servers from './pages/Servers'
import Settings from './pages/Settings'
import Accounts from './pages/Accounts'
import Mods from './pages/Mods'
import { launchGame } from './launch'

declare global { interface Window { api:any } }

const nav = [
  { id:'home', label:'Inicio', icon:'◈', desc:'Novedades' },
  { id:'versions', label:'Versiones', icon:'⬢', desc:'Vanilla / Fabric / Forge' },
  { id:'servers', label:'Servidores', icon:'⬣', desc:'HyperHard • Hydra Eventos' },
  { id:'modpacks', label:'Mods', icon:'🧩', desc:'Modrinth • CurseForge' },
  { id:'accounts', label:'Cuentas', icon:'◎', desc:'Microsoft / Offline' },
  { id:'settings', label:'Ajustes', icon:'⚙', desc:'RAM • Java • Updates' },
]

export default function App(){
  const [tab,setTab]=useState('home')
  const { set, addLog, config, accounts, activeAccount } = useStore()

  useEffect(()=>{
    Promise.all([
      window.api?.getVersions?.().catch(()=>null),
      window.api?.getConfig?.().catch(()=>null),
      window.api?.getAccounts?.().catch(()=>null),
      window.api?.getInstalledVersionsFull?.().then((l:any)=> set({installedVersions: l||[]})).catch(()=>{})
    ]).then(([vData,cData,aData,vData2])=>{
      if (vData?.versions) {
        const savedVer = cData?.lastVersion
        const savedLoader = cData?.lastLoader
        const foundInstalled = vData2?.find((x:any)=> x.id===savedVer)
        const ver = foundInstalled ? savedVer : (savedVer && vData.versions.some((x:any)=>x.id===savedVer) ? savedVer : vData.latest.release)
        const load = savedLoader || 'vanilla'
        set({versions:vData.versions, latest:vData.latest, selectedVersion: ver, loader: load, installedVersions: vData2 || []})
      }
      if (cData) set({config:cData})
      if (aData?.length) {
        const savedUuid = cData?.lastAccountUuid
        const active = savedUuid ? aData.find((x:any)=>x.uuid===savedUuid) || aData[0] : aData[0]
        set({accounts:aData, activeAccount:active})
      }
    })
    window.api?.onLaunchLog?.((m:string)=> addLog(m))
    window.api?.onProgress?.((p:any)=> set({progress:p}))
    const onTab = (e:Event)=> setTab((e as CustomEvent).detail)
    document.addEventListener('hydra:tab', onTab)
    return ()=> document.removeEventListener('hydra:tab', onTab)
  },[])

  useEffect(()=>{ if(config?.ram) window.api?.saveConfig?.(config) }, [config])
  useEffect(()=>{ if(accounts?.length) window.api?.saveAccounts?.(accounts) }, [accounts])
  const { selectedVersion, loader } = useStore()
  useEffect(()=>{
    if (!config || !selectedVersion) return
    const next = { ...config, lastVersion: selectedVersion, lastLoader: loader, lastAccountUuid: activeAccount?.uuid || accounts[0]?.uuid }
    if (next.lastVersion===config.lastVersion && next.lastLoader===config.lastLoader && next.lastAccountUuid===config.lastAccountUuid) return
    set({config: next})
    window.api?.saveConfig?.(next)
  },[selectedVersion, loader, activeAccount?.uuid, accounts[0]?.uuid])

  const active = activeAccount || accounts[0]

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07070a] overflow-hidden select-none">
      <div className="h-8 flex items-center justify-between px-3 bg-[#0c0c11] border-b border-white/[0.06] shrink-0" style={{WebkitAppRegion:'drag'} as any}>
        <div className="flex items-center gap-2.5">
          <div className="w-5.5 h-5.5 w-6 h-6 rounded-lg neon-gradient grid place-items-center font-black text-[11px]">H</div>
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

      <div className="flex flex-1 min-h-0">
        <aside className="w-[250px] bg-[#0c0c11] border-r border-white/[0.06] p-2.5 flex flex-col gap-2.5 shrink-0">
          <div className="glass rounded-xl p-2.5 flex items-center gap-2.5">
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
                className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl border transition ${tab===n.id?'bg-white text-black border-white font-semibold shadow-lg':'glass hover:bg-white/[0.08] border-transparent text-white/80'}`}>
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
            <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full blur-[90px] opacity-20" style={{background:'radial-gradient(circle,#7c3aed,transparent 70%)'}}/>
            <div className="absolute -bottom-40 -left-40 w-[620px] h-[620px] rounded-full blur-[90px] opacity-15" style={{background:'radial-gradient(circle,#06b6d4,transparent 70%)'}}/>
          </div>
          <div className="relative h-full overflow-auto p-5">
            {tab==='home' && <Home/>}
            {tab==='versions' && <Versions/>}
            {tab==='servers' && <Servers/>}
            {tab==='modpacks' && <Mods/>}
            {tab==='accounts' && <Accounts/>}
            {tab==='settings' && <Settings/>}
          </div>
        </main>
      </div>

      <LaunchBar/>
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

function LaunchBar(){
  const { selectedVersion, loader, activeAccount, accounts, config, progress, launching } = useStore()
  const [serverPick, setServerPick] = useState<string>('')
  const acct = activeAccount || accounts[0]
  const server = serverPick ? (()=>{ const s = config.servers.find((x:any)=>`${x.ip}:${x.port}`===serverPick); return s ? { ip:s.ip, port:s.port } : null })() : null
  const pct = progress && typeof progress.percent === 'number' ? Math.round(progress.percent) : null

  return (
    <div className="shrink-0 bg-[#0c0c11] border-t border-white/[0.06] relative">
      {pct !== null && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/5">
          <div className="h-full neon-gradient transition-all" style={{width:`${pct}%`}}/>
        </div>
      )}
      <div className="h-[74px] flex items-center gap-4 px-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#1c1c26] border border-white/10 grid place-items-center text-lg">⛏</div>
          <div>
            <div className="font-bold leading-none text-[15px]">{selectedVersion} <span className="text-[11px] px-1.5 py-0.5 rounded bg-violet-600 text-white ml-1">{loader}</span></div>
            <div className="text-[11px] text-white/45 mt-1">{acct?.name} • {config.ram.max} RAM • {config.javaPath ? 'Java custom' : 'Java auto'}</div>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 ml-4">
          <span className="text-xs text-white/40"> Conexion:</span>
          <select value={serverPick} onChange={e=>setServerPick(e.target.value)} className="bg-[#1c1c26] border border-white/10 rounded-lg px-3 py-2 text-sm">
            <option value="">— Sin conectar —</option>
            {config.servers.map((s:any)=><option key={s.id} value={`${s.ip}:${s.port}`}>{s.name} ({s.ip})</option>)}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden md:block text-right">
            <div className="text-xs text-white/40">{pct!==null ? `Descargando ${pct}%` : 'Listo para jugar'}</div>
            <div className="text-xs text-emerald-400">● Optimizado</div>
          </div>
          <button onClick={()=>launchGame(server)} disabled={launching}
            className="h-12 px-8 rounded-xl font-black tracking-wide text-white shadow-[0_8px_30px_rgba(34,197,94,0.35)] hover:scale-[1.02] active:scale-[0.98] transition flex items-center gap-2 disabled:opacity-60"
            style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>
            {launching ? 'LANZANDO...' : '▶ JUGAR'}
          </button>
        </div>
      </div>
    </div>
  )
}
