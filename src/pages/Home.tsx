import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/launcherStore'
import { launchGame } from '../launch'

const HYDRA_IP = 'mc.hyperhard.space'

function fmtNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

export default function Home() {
  const latest = useStore(s=>s.latest)
  const versions = useStore(s=>s.versions)
  const config = useStore(s=>s.config)
  const activeAccount = useStore(s=>s.activeAccount)
  const accounts = useStore(s=>s.accounts)
  const selectedVersion = useStore(s=>s.selectedVersion)
  const loader = useStore(s=>s.loader)
  const launching = useStore(s=>s.launching)
  const installedVersions = useStore(s=>s.installedVersions)
  const progress = useStore(s=>s.progress)
  const set = useStore(s=>s.set)
  const [main, setMain] = useState<any>(null)
  const [events, setEvents] = useState<any>(null)
  const [checks, setChecks] = useState({ total: 0, ok: 0 })
  const [appVer, setAppVer] = useState('')
  const [news, setNews] = useState<any[]|null>(null)
  const [vm, setVm] = useState(false)
  const [vmPos, setVmPos] = useState<{left:number; top:number}>({left:0, top:0})
  const acct = activeAccount || accounts[0]
  const pct = progress && typeof progress.percent === 'number' ? Math.round(progress.percent) : null

  const toggleVm = (e: React.MouseEvent) => {
    if (vm) { setVm(false); return }
    const r = e.currentTarget.getBoundingClientRect()
    setVmPos({ left: Math.round(r.left), top: Math.round(r.bottom + 8) })
    setVm(true)
  }

  useEffect(() => { window.api?.getAppVersion?.().then(setAppVer).catch(() => {}) }, [])
  useEffect(() => {
    window.api?.getNews?.().then((r:any)=>{
      setNews((r?.posts||[]).slice(0,3))
    }).catch(()=>setNews([]))
  }, [])

  useEffect(() => {
    let alive = true
    const pingAll = async () => {
      const principal = config.servers.find((s: any) => s.id === 'hyperhard') || { ip: HYDRA_IP, port: 25565 }
      const ev = config.servers.find((s: any) => s.id === 'hydra-eventos')
      const [r1, r2] = await Promise.all([
        window.api?.pingFull?.(principal.ip, principal.port || 25565).catch(() => ({ online: false })),
        ev ? window.api?.pingFull?.(ev.ip, ev.port || 25565).catch(() => ({ online: false })) : Promise.resolve(null)
      ])
      if (!alive) return
      setMain(r1 || null)
      setEvents(r2 || null)
      setChecks(c => ({ total: c.total + 1, ok: c.ok + ((r1 as any)?.online ? 1 : 0) }))
    }
    pingAll()
    const i = setInterval(pingAll, 30000)
    return () => { alive = false; clearInterval(i) }
  }, [config.servers])

  // Estrellas cayendo en el HERO
  useEffect(() => {
    const container = document.getElementById('heroStars')
    if (!container) return
    const colors = ['#7c3aed', '#06b6d4', '#ec4899', '#f59e0b', '#22c55e']
    const stars: HTMLDivElement[] = []
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('div')
      s.className = 'hero-star'
      s.style.left = `${Math.random() * 100}%`
      s.style.top = `${-10 - Math.random() * 30}vh`
      s.style.setProperty('--star-color', colors[Math.floor(Math.random() * colors.length)])
      s.style.setProperty('--drift', `${(Math.random() - 0.5) * 40}vw`)
      s.style.setProperty('--spin', `${(Math.random() - 0.5) * 720}deg`)
      s.style.animationDuration = `${18 + Math.random() * 12}s`
      s.style.animationDelay = `${-Math.random() * 30}s`
      container.appendChild(s)
      stars.push(s)
    }
    return () => { stars.forEach(s => s.remove()) }
  }, [])

  const principal = config.servers.find((s: any) => s.id === 'hyperhard') || { ip: HYDRA_IP, port: 25565 }
  const evServer = config.servers.find((s: any) => s.id === 'hydra-eventos')
  const onlineNow = main?.online ? main.players.online : null
  const uptime = checks.total >= 3 && main ? Math.round((checks.ok / checks.total) * 1000) / 10 : null

  return (
    <div className="max-w-[1240px] mx-auto space-y-5">
      {/* Saludo estilo Lunar */}
      <div className="flex items-center gap-3">
        <img src={`https://mc-heads.net/avatar/${acct?.name || 'Steve'}/48`} className="w-11 h-11 rounded-xl bg-white/10 border border-white/10" alt="" />
        <div>
          <div className="text-xs text-white/45">Bienvenido de nuevo</div>
          <div className="font-display font-black text-xl leading-none">{acct?.name}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${main?.online ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300' : 'bg-white/5 border-white/10 text-white/45'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${main?.online ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`}/>
            {onlineNow !== null ? `${fmtNum(onlineNow)} jugadores en línea` : 'Servidor sin conexión'}
          </span>
        </div>
      </div>

      {/* HERO */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0f0f14]">
        <div className="absolute inset-0" style={{ background: `radial-gradient(600px 400px at 75% 15%, rgba(124,58,237,0.32), transparent 60%), radial-gradient(500px 450px at 8% 90%, rgba(6,182,214,0.2), transparent 60%)` }}/>
        <div className="absolute inset-0 bg-hero-breathing opacity-60" />
        <div className="absolute inset-0" id="heroStars" style={{ pointerEvents: 'none' }} />
        <div className="relative p-6 md:p-8 grid lg:grid-cols-[1.35fr_0.9fr] gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <img src="hydra-logo.png" className="w-11 h-11 rounded-2xl bg-black/60 border border-white/10 object-contain p-1 shadow-[0_0_30px_rgba(124,58,237,0.45)]" alt=""/>
              <div>
                <div className="font-display font-black tracking-tight leading-none">HYDRA LAUNCHER</div>
                <div className="text-[10px] tracking-[0.22em] text-white/45 mt-0.5">CORTA UNA CABEZA • NACEN DOS</div>
              </div>
              <span className={`ml-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${evServer && (events as any)?.online ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white/50 border border-white/10'}`}>
                {evServer && (events as any)?.online ? '● EVENTOS EN VIVO' : '○ EVENTOS ' + ((events as any)?.online ? 'ON' : 'OFF')}
              </span>
            </div>

            <h1 className="font-display font-black text-[38px] md:text-[44px] leading-[0.95] mt-5">
              Minecraft,<br/><span className="text-gradient">sin fricción.</span>
            </h1>
            <p className="text-white/65 mt-3 max-w-[540px] text-sm leading-relaxed">
              Cualquier versión directo de Mojang, mods de <b className="text-violet-300">Modrinth</b> y <b className="text-cyan-300">CurseForge</b> en un clic y conexión directa a <b>HyperHard</b>. Sin saltos, sin configuración manual.
            </p>

            <div className="flex flex-wrap gap-2 mt-5">
              <span className="bg-white text-black px-3 py-1.5 rounded-xl font-black text-[11px]">⚡ {latest?.release || selectedVersion} HYDRA READY</span>
              <span className="bg-white/10 border border-white/15 px-3 py-1.5 rounded-xl text-[11px] font-bold">🧩 Modrinth + CurseForge</span>
              <span className="bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 px-3 py-1.5 rounded-xl text-[11px] font-bold">🛡 Anti-lag Hydra Core</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-6">
              <div className="relative flex">
                <button onClick={()=>launchGame({ ip: principal.ip, port: principal.port || 25565 })} disabled={launching}
                  className="h-[58px] pl-5 pr-4 rounded-l-2xl text-left text-white shadow-[0_10px_40px_rgba(34,197,94,0.35)] hover:scale-[1.015] active:scale-[0.985] transition disabled:opacity-60 flex items-center gap-4"
                  style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                  <span className="text-xl">{launching ? '⏳' : '▶'}</span>
                  <span>
                    <div className="font-black tracking-wide leading-none">{launching ? (pct!==null ? `DESCARGANDO ${pct}%` : 'LANZANDO...') : 'JUGAR EN HYPERHARD'}</div>
                    <div className="text-[11px] text-white/80 leading-none mt-1">{selectedVersion} • {loader} • {acct?.name}</div>
                  </span>
                </button>
                <button onClick={toggleVm} disabled={launching} data-tab-sub="vmenu"
                  aria-label="Elegir versión instalada"
                  className="h-[58px] px-4 rounded-r-2xl text-white text-lg font-black border-l border-black/20 hover:brightness-110 active:scale-[0.97] transition disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
                  {vm ? '▴' : '▾'}
                </button>
              </div>
              <span className="text-[11px] text-white/45 leading-tight">
                {pct!==null ? <>Descargando… {pct}%<br/><span className="text-emerald-400">● Conexión directa a Mojang</span></> : <>Listo para jugar<br/><span className="text-emerald-400">● Conexión directa a HyperHard</span></>}
              </span>
            </div>

            {vm && createPortal(<>
              <div className="fixed inset-0 z-[9998]" onClick={()=>setVm(false)}/>
              <div className="fixed z-[9999] w-[320px] glass-strong rounded-2xl p-2 drop-in" style={{ left: vmPos.left, top: vmPos.top }}>
                <div className="text-[11px] font-black text-white/50 px-2 py-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>VERSIONES INSTALADAS
                  <span className="ml-auto text-white/30">{(installedVersions||[]).length}</span>
                </div>
                <div className="max-h-[240px] overflow-auto space-y-1">
                  {(installedVersions||[]).length===0 && (
                    <div className="text-xs text-white/45 px-3 py-3">Ninguna versión instalada aún. Instala una desde el navegador de versiones.</div>
                  )}
                  {(installedVersions||[]).map((iv:any)=>(
                    <button key={iv.id} onClick={()=>{ set({selectedVersion:iv.id}); setVm(false) }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition flex items-center gap-2 ${selectedVersion===iv.id?'bg-white text-black font-bold':'hover:bg-white/[0.08] text-white/85'}`}>
                      <span className="text-white/40 text-xs">⬢</span>
                      <span className="truncate">{iv.id}</span>
                      {iv.type==='snapshot' && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black shrink-0">SNAP</span>}
                      {selectedVersion===iv.id && <span className="ml-auto text-xs shrink-0">✓</span>}
                    </button>
                  ))}
                </div>
                <button onClick={()=>{ setVm(false); document.dispatchEvent(new CustomEvent('hydra:tab',{detail:'versions'})) }}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl text-xs font-bold text-white/70 border border-white/10 hover:bg-white/[0.08] transition text-left">
                  ⬢ Todas las versiones → navegador
                </button>
              </div>
            </>, document.body)}
          </div>

          {/* Nido de Hydra — stats reales */}
          <div className="glass-strong rounded-[22px] p-4 w-full lg:w-auto self-start card-hover">
            <div className="flex items-center justify-between">
              <div className="font-black text-sm">Nido de Hydra</div>
              <span className="text-[11px] px-2 py-1 rounded-full bg-white text-black font-black">TEMPORADA 2</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-white/[0.06] rounded-xl p-2.5 text-center border border-white/5 card-hover">
                <div className="text-lg font-black">{onlineNow !== null ? fmtNum(onlineNow) : '—'}</div>
                <div className="text-[11px] text-white/50">Jugadores</div>
              </div>
              <div className="bg-white/[0.06] rounded-xl p-2.5 text-center border border-white/5 card-hover">
                <div className="text-lg font-black">1</div>
                <div className="text-[11px] text-white/50">Eventos</div>
              </div>
              <div className="bg-white/[0.06] rounded-xl p-2.5 text-center border border-white/5 card-hover">
                <div className="text-lg font-black">{uptime !== null ? `${uptime}%` : '—'}</div>
                <div className="text-[11px] text-white/50">Uptime</div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {[
                { name: 'Servidor Principal', ip: principal.ip, st: main, banner: '⛏' },
                evServer ? { name: 'Eventos Hydra', ip: evServer.ip, st: events, banner: '🎉' } : null
              ].filter(Boolean).map((s: any) => (
                <div key={s.name} className="flex items-center gap-3 bg-black/30 rounded-xl px-3 py-2.5 border border-white/5">
                  <span className="text-base">{s.banner}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold leading-none truncate">{s.name}</div>
                    <div className="text-[11px] text-white/45 truncate">{s.ip}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[11px] font-bold ${s.st?.online ? 'text-emerald-300' : 'text-white/40'}`}>{s.st?.online ? 'Online' : 'Offline'}</div>
                    {s.st?.online && <div className="text-[10px] text-white/40">{s.st.latency}ms • {s.st.players?.online ?? 0}/{s.st.players?.max ?? '?'}</div>}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={()=>launchGame({ ip: principal.ip, port: principal.port || 25565 })} disabled={launching}
              className="mt-3 w-full bg-white text-black font-black py-2.5 rounded-xl text-sm hover:scale-[1.01] transition disabled:opacity-60">
              {launching ? 'Lanzando...' : 'Entrar al Nido →'}
            </button>
          </div>
        </div>
      </div>

      {/* Novedades — feed curado desde el repo oficial */}
      <div className="grid md:grid-cols-3 gap-4">
        {(news && news.length ? news : [
          { icon: '🚀', tag: 'Launcher', title: `Hydra v${appVer || '1.2.0'} ya está aquí`, body: 'Buscador de mods con Modrinth y CurseForge, stats en vivo del servidor y actualizaciones automáticas.' },
          { icon: '🎉', tag: 'Eventos', title: 'Temporada 2 en curso', body: 'Parkour, PvP y Spleef en eventos.hyperhard.space. Cada evento queda en el Libro de Hydra.' },
          { icon: '🧩', tag: 'Mods', title: 'Mods y modpacks en 1 clic', body: 'Millones de proyectos de Modrinth y CurseForge, filtrados por tu versión y loader.' },
        ]).map((c: any) => (
          <div key={c.title} className="glass rounded-[20px] p-5 border border-white/10 hover:bg-white/[0.08] card-hover">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white text-black grid place-items-center text-base font-bold">{c.icon || '📰'}</div>
              <span className="text-[10px] font-black tracking-wider text-white/40 uppercase">{c.tag}</span>
              {c.date && <span className="ml-auto text-[10px] text-white/30">{c.date}</span>}
            </div>
            <div className="font-black mt-3 text-sm">{c.title}</div>
            <div className="text-xs text-white/60 mt-1.5 leading-relaxed line-clamp-4">{c.body || c.desc}</div>
          </div>
        ))}
      </div>

      {/* Lore + como empezar */}
      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="glass rounded-[20px] p-5 card-hover">
          <div className="font-black">Lore del servidor</div>
          <p className="text-sm text-white/60 mt-2 leading-relaxed">
            En la <b className="text-white/85">Temporada 1</b>, Hydra desperto en el vacio de HyperHard y de su fuego nacio el Nido de Eventos. Hoy, en la <b className="text-white/85">Temporada 2</b>, dos cabezas dominan la red: el <b>Servidor Principal</b> y la arena de <b>Eventos Hydra</b>. Entra, compite y deja tu nombre en el Libro de Hydra.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {[main, events].map((s: any, i: number) => (
              <span key={i} className={`text-xs px-3 py-1.5 rounded-full border font-bold flex items-center gap-1.5 ${s?.online ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300' : 'bg-white/5 border-white/10 text-white/45'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s?.online ? 'bg-emerald-400' : 'bg-white/30'}`}/>{s?.online ? 'Online' : 'Offline'} {s?.online ? `• ${s.latency}ms` : ''}
              </span>
            ))}
            <span className="text-xs px-3 py-1.5 rounded-full border bg-white/5 border-white/10 text-white/45 font-bold">{onlineNow !== null ? `${onlineNow} jugadores ahora` : 'Sin datos'}</span>
          </div>
        </div>
        <div className="glass rounded-[20px] p-5 card-hover">
          <div className="font-black text-sm">Como empezar (30s)</div>
          <ol className="text-sm text-white/70 mt-3 space-y-2 list-decimal ml-5">
            <li><b>Cuentas</b> → Offline (instant) o Microsoft (premium).</li>
            <li><b>Versiones</b> → elige <span className="text-white">{latest?.release || '1.21'} + Fabric</span> (recomendado Hydra).</li>
            <li><b>JUGAR EN HYPERHARD</b> → descarga y entra directo al servidor.</li>
          </ol>
          <div className="text-[11px] text-white/30 mt-3">%APPDATA%/.minecraft • worlds y resourcepacks compartidos con vanilla</div>
        </div>
      </div>

      <div className="text-[11px] text-white/25 text-center">Hydra Launcher v{appVer || '1.1.0'} • {versions?.slice(0,3).map((v:any)=>v.id).join(' • ') || 'cargando manifest...'}</div>
    </div>
  )
}
