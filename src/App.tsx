import { useEffect, useState } from 'react'
import { useStore } from './store/launcherStore'
import Home from './pages/Home'
import Versions from './pages/Versions'
import Servers from './pages/Servers'
import Settings from './pages/Settings'
import Accounts from './pages/Accounts'
import Modpacks from './pages/Modpacks'

declare global { interface Window { api:any } }

const nav = [
  { id:'home', label:'Inicio', icon:'◈', desc:'Novedades' },
  { id:'versions', label:'Versiones', icon:'⬢', desc:'Vanilla / Fabric / Forge' },
  { id:'servers', label:'Servidores', icon:'⬣', desc:'Eventos • Survival • OneBlock' },
  { id:'modpacks', label:'Modpacks', icon:'📦', desc:'Crear/gestionar modpacks' },
  { id:'accounts', label:'Cuentas', icon:'◎', desc:'Microsoft / Offline' },
  { id:'settings', label:'Ajustes', icon:'⚙', desc:'RAM • Java • Logs' },
]

export default function App(){
  const [tab,setTab]=useState('home')
  const { set, addLog, config, accounts, activeAccount } = useStore()

  useEffect(()=>{
    // carga inicial - respeta selección guardada
    Promise.all([
      window.api?.getVersions?.().catch(()=>null),
      window.api?.getConfig?.().catch(()=>null),
      window.api?.getAccounts?.().catch(()=>null),
      window.api?.getInstalledVersionsFull?.().then((l:any)=> set({installedVersions: l||[]})).catch(()=>{})
    ]).then(([vData,cData,aData,vData2])=>{
      if (vData?.versions) {
        // solo pisar versión si no hay guardada
        const savedVer = cData?.lastVersion
        const savedLoader = cData?.lastLoader
        // Buscar si la versión guardada existe en disco (aunque no esté en el manifest de Mojang)
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
  },[])

  useEffect(()=>{ if(config?.ram) window.api?.saveConfig?.(config) }, [config])
  useEffect(()=>{ if(accounts?.length) window.api?.saveAccounts?.(accounts) }, [accounts])
  // persistir selección versión/loader/cuenta en hydra-config.json
  const { selectedVersion, loader } = useStore()
  useEffect(()=>{
    if (!config || !selectedVersion) return
    const next = { ...config, lastVersion: selectedVersion, lastLoader: loader, lastAccountUuid: activeAccount?.uuid || accounts[0]?.uuid }
    // evitar bucle si no cambió
    if (next.lastVersion===config.lastVersion && next.lastLoader===config.lastLoader && next.lastAccountUuid===config.lastAccountUuid) return
    set({config: next})
    window.api?.saveConfig?.(next)
  },[selectedVersion, loader, activeAccount?.uuid, accounts[0]?.uuid])

  const active = activeAccount || accounts[0]

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07070a] overflow-hidden select-none">
      {/* Titlebar custom */}
      <div className="h-9 flex items-center justify-between px-3 bg-[#0f0f14] border-b border-white/[0.06] shrink-0" style={{WebkitAppRegion:'drag'} as any}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg neon-gradient grid place-items-center font-black text-xs">H</div>
          <span className="font-display font-bold tracking-tight">Hydra Launcher</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/10">ORIGINAL</span>
          <span className="text-xs text-white/40">Hydra • Original</span>
        </div>
        <div className="flex items-center gap-1" style={{WebkitAppRegion:'no-drag'} as any}>
          <button onClick={()=>window.api.winMin()} className="w-8 h-8 grid place-items-center hover:bg-white/10 rounded">─</button>
          <button onClick={()=>window.api.winMax()} className="w-8 h-8 grid place-items-center hover:bg-white/10 rounded">□</button>
          <button onClick={()=>window.api.winClose()} className="w-8 h-8 grid place-items-center hover:bg-red-500/90 rounded">✕</button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar Hydra style */}
        <aside className="w-[280px] bg-[#0f0f14] border-r border-white/[0.06] p-3 flex flex-col gap-3 shrink-0">
          <div className="glass rounded-2xl p-3 flex items-center gap-3">
            <img src={`https://mc-heads.net/avatar/${active?.name || 'Steve'}/64`} className="w-10 h-10 rounded-xl bg-white/10" alt=""/>
            <div className="min-w-0">
              <div className="font-semibold leading-none truncate">{active?.name}</div>
              <div className="text-xs text-white/50 truncate">{active?.type==='microsoft'?'Premium':'Offline'} • {active?.uuid.slice(0,8)}</div>
            </div>
            <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]"/>
          </div>

          <nav className="space-y-1">
            {nav.map(n=>(
              <button key={n.id} onClick={()=>setTab(n.id)}
                className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border transition ${tab===n.id?'bg-white text-black border-white font-semibold shadow-lg':'glass hover:bg-white/[0.08] border-transparent text-white/80'}`}>
                <span className="w-9 h-9 grid place-items-center rounded-lg bg-black/5 border border-black/5 text-lg">{n.icon}</span>
                <span><div className="text-sm leading-none">{n.label}</div><div className={`text-xs ${tab===n.id?'text-black/60':'text-white/40'}`}>{n.desc}</div></span>
                {tab===n.id && <span className="ml-auto">›</span>}
              </button>
            ))}
          </nav>

          <div className="mt-auto glass rounded-2xl p-3">
            <div className="text-xs text-white/50">RAM asignada</div>
            <div className="text-sm font-semibold">{config.ram.max} / {config.ram.min}</div>
            <div className="h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden"><div className="h-full w-[68%] neon-gradient"/></div>
            <div className="text-[11px] text-white/40 mt-1">Optimizado para eventos • Boost FPS</div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 bg-gradient-to-br from-[#07070a] via-[#0b0b14] to-[#07070a] relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full blur-[90px] opacity-20" style={{background:'radial-gradient(circle,#7c3aed,transparent 70%)'}}/>
            <div className="absolute -bottom-40 -left-40 w-[620px] h-[620px] rounded-full blur-[90px] opacity-15" style={{background:'radial-gradient(circle,#06b6d4,transparent 70%)'}}/>
          </div>
<div className="relative h-full overflow-auto p-6">
              {tab==='home' && <Home/>}
              {tab==='versions' && <Versions/>}
              {tab==='servers' && <Servers/>}
              {tab==='modpacks' && <Modpacks/>}
              {tab==='accounts' && <Accounts/>}
              {tab==='settings' && <Settings/>}
            </div>
        </main>
      </div>

      {/* Bottom launch bar - Hydra green launch button */}
      <LaunchBar/>
    </div>
  )
}

function LaunchBar(){
  const { selectedVersion, loader, activeAccount, accounts, config, set, addLog, launching } = useStore()
  const [serverPick, setServerPick] = useState<string>('')
  const acct = activeAccount || accounts[0]

  const launch = async()=>{
    if (!acct) { addLog('✗ No hay cuenta seleccionada'); return }
    set({launching:true}); addLog(`▶ Lanzando ${selectedVersion} (${loader}) como ${acct.name}...`)
    try {
      const res = await window.api.launch({
        version: selectedVersion, loader,
        account: acct, ram: config.ram, javaPath: config.javaPath,
        server: serverPick ? { ip: serverPick.split(':')[0], port: Number(serverPick.split(':')[1]||25565)} : null
      })
      if(!res.ok) {
        addLog(`✗ Error: ${res.error}`)
        // mostrar popup nativo ya lo hace main, aquí también alert para visibilidad
        alert(`Fallo al lanzar:\n${res.error}\n\nRevisa Ajustes → Logs\nPrueba Versión estable 1.21.1 y Java auto.`)
      } else {
        addLog(`✔ Minecraft iniciado PID ${res.pid || ''} - revisa logs si no abre ventana`)
      }
    } catch(e:any){ addLog(`✗ Excepción: ${String(e)}`); alert(String(e)) }
    set({launching:false})
  }

  return (
    <div className="h-[86px] shrink-0 bg-[#0f0f14] border-t border-white/[0.06] flex items-center gap-4 px-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#1c1c26] border border-white/10 grid place-items-center text-xl">⛏</div>
        <div>
          <div className="font-bold leading-none">{selectedVersion} <span className="text-xs px-1.5 py-0.5 rounded bg-violet-600 text-white ml-1">{loader}</span></div>
          <div className="text-xs text-white/50">{acct.name} • {config.ram.max} RAM • {config.javaPath ? 'Java custom' : 'Java auto'}</div>
        </div>
      </div>

      <div className="hidden lg:flex items-center gap-2 ml-6">
        <span className="text-xs text-white/40">Servidor rápido:</span>
        <select value={serverPick} onChange={e=>setServerPick(e.target.value)} className="bg-[#1c1c26] border border-white/10 rounded-lg px-3 py-2 text-sm">
          <option value="">— Sin conectar —</option>
          {useStore.getState().config.servers.map((s:any)=><option key={s.id} value={`${s.ip}:${s.port}`}>{s.name} ({s.ip})</option>)}
        </select>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden md:block text-right">
          <div className="text-xs text-white/40">Listo para jugar</div>
          <div className="text-xs text-emerald-400">● Optimizado</div>
        </div>
        <button onClick={launch} disabled={launching}
          className="h-12 px-8 rounded-xl font-black tracking-wide text-white shadow-[0_8px_30px_rgba(124,58,237,0.4)] hover:scale-[1.02] active:scale-[0.98] transition flex items-center gap-2 disabled:opacity-60"
          style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>
          {launching ? 'LANZANDO...' : '▶ JUGAR'}
        </button>
      </div>
    </div>
  )
}
