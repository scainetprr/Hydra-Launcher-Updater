import { useEffect, useState } from 'react'
import { useStore } from '../store/launcherStore'

function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(()=>{ const i=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(i)},[])
  const diff = new Date(target).getTime() - now
  if (diff <= 0) return <span className="text-emerald-400 font-bold">¡EN VIVO!</span>
  const d = Math.floor(diff/86400000), h=Math.floor(diff%86400000/3600000), m=Math.floor(diff%3600000/60000), s=Math.floor(diff%60000/1000)
  return <span className="font-mono font-bold text-xs bg-black/40 px-2 py-1 rounded-lg border border-white/10">{d>0?`${d}d `:''}{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>
}

export default function Home(){
  const { latest, versions, config } = useStore()
  const [pings,setPings]=useState<Record<string,boolean>>({})
  useEffect(()=>{
    config.servers.forEach(async s=>{
      try{ const r=await window.api.pingServer(s.ip,s.port); setPings(p=>({...p,[s.id]:r.online})) }catch{}
    })
  },[config.servers])

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* HYDRA HERO - original */}
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0f0f14]">
        {/* hydra scales pattern */}
        <div className="absolute inset-0 opacity-[0.08]" style={{backgroundImage:`repeating-linear-gradient(45deg, transparent 0 22px, #7c3aed 22px 23px), repeating-linear-gradient(-45deg, transparent 0 22px, #06b6d4 22px 23px)`}}/>
        <div className="absolute inset-0" style={{background:`radial-gradient(600px 400px at 70% 20%, rgba(124,58,237,0.35), transparent 60%), radial-gradient(500px 500px at 10% 90%, rgba(6,182,214,0.25), transparent 60%), radial-gradient(400px 300px at 90% 80%, rgba(16,185,129,0.2), transparent 60%)`}}/>
        <div className="relative p-7 md:p-9 flex flex-col lg:flex-row gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-black border border-white/10 grid place-items-center text-xl shadow-[0_0_30px_rgba(124,58,237,0.4)]">🐉</div>
              <div>
                <div className="font-display font-black tracking-tight text-lg leading-none">HYDRA LAUNCHER</div>
                <div className="text-[11px] tracking-[0.22em] text-white/50">CORTA UNA CABEZA • NACEN DOS</div>
              </div>
              <span className="ml-2 hidden md:inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-black">● LIVE • {pings.lobby?'Lobby ON':'Conectando...'}</span>
            </div>

            <h1 className="font-display font-black text-4xl md:text-[46px] leading-[0.9] mt-4">
              Tres cabezas.<br/>
              <span className="text-gradient">Un solo poder.</span>
            </h1>
            <p className="text-white/70 mt-3 max-w-[560px] text-sm leading-relaxed">
              <b>Hydra</b> nació para tu red: cada cabeza es un mundo — <span className="text-violet-300 font-semibold">Eventos</span> (tu creación), <span className="text-cyan-300 font-semibold">Survival</span> y <span className="text-emerald-300 font-semibold">OneBlock</span>. Cambia sin cerrar, con boost Hydra y descargas directas Mojang.
            </p>

            <div className="flex flex-wrap gap-2 mt-5">
              <span className="bg-white text-black px-3.5 py-2 rounded-xl font-black text-xs">⚡ {latest?.release || '26.2'} HYDRA READY</span>
              <span className="bg-white/10 backdrop-blur border border-white/15 px-3.5 py-2 rounded-xl text-xs font-bold">🧬 Snapshot {latest?.snapshot || '26.3-rc'} </span>
              <span className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 px-3.5 py-2 rounded-xl text-xs font-bold">✔ Anti-lag Hydra Core</span>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-6">
              {[
                {h:'Eventos', c:'🎉', d:'Tu arena', v:'TUYO', col:'from-violet-600 to-fuchsia-600'},
                {h:'Survival', c:'🌲', d:'Economía viva', v:config.servers.find(s=>s.type==='survival')?.ip.split('.')[0]||'survival', col:'from-cyan-600 to-teal-600'},
                {h:'OneBlock', c:'🧱', d:'Infinito', v:'TOP 3h', col:'from-emerald-600 to-lime-600'},
              ].map(x=>(
                <div key={x.h} className="glass rounded-2xl p-3 border border-white/10 relative overflow-hidden">
                  <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${x.col}`}/>
                  <div className="relative">
                    <div className="text-lg">{x.c}</div>
                    <div className="font-black text-sm leading-none mt-1">{x.h}</div>
                    <div className="text-[11px] text-white/60">{x.d}</div>
                    <div className="text-[11px] font-bold mt-1 text-white/90">{x.v}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* hydra nest - calendario + stats */}
          <div className="w-full lg:w-[380px] shrink-0 space-y-3">
            <div className="glass-strong rounded-[20px] p-4">
              <div className="flex items-center justify-between">
                <div className="font-black text-sm">Nido de Hydra</div>
                <span className="text-[11px] px-2 py-1 rounded-full bg-white text-black font-bold">TEMPORADA 3</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-white/[0.06] rounded-xl p-2.5 text-center border border-white/5">
                  <div className="text-lg font-black">1.2k</div><div className="text-[11px] text-white/50">Jugadores</div>
                </div>
                <div className="bg-white/[0.06] rounded-xl p-2.5 text-center border border-white/5">
                  <div className="text-lg font-black">47</div><div className="text-[11px] text-white/50">Eventos</div>
                </div>
                <div className="bg-white/[0.06] rounded-xl p-2.5 text-center border border-white/5">
                  <div className="text-lg font-black">99.8%</div><div className="text-[11px] text-white/50">Uptime</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {[
                  {n:'Parkour Extremo', t:'2026-09-20T20:00:00', r:'Rank Hydra + 50k'},
                  {n:'OneBlock Reset', t:'2026-09-18T18:00:00', r:'Islas x2'},
                  {n:'PvP Legends', t:'2026-09-22T19:30:00', r:'Kit exclusivo'},
                ].map(e=>(
                  <div key={e.n} className="flex items-center gap-3 bg-black/30 rounded-xl px-3 py-2.5 border border-white/5 hover:bg-white/[0.04] transition">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold leading-none truncate">{e.n}</div>
                      <div className="text-[11px] text-white/50 truncate">{e.r}</div>
                    </div>
                    <Countdown target={e.t}/>
                  </div>
                ))}
              </div>
              <button onClick={()=>document.dispatchEvent(new CustomEvent('hydra:tab',{detail:'servers'}))} className="mt-3 w-full bg-white text-black font-black py-2.5 rounded-xl text-sm hover:scale-[1.01] transition">Entrar al Nido →</button>
            </div>

            <div className="glass rounded-2xl p-3 flex items-center gap-3">
              <img src="https://mc-heads.net/avatar/Notch/48" className="w-9 h-9 rounded-xl border border-white/10"/>
              <div className="flex-1">
                <div className="text-xs font-bold">Hydra Core • Boost</div>
                <div className="text-[11px] text-white/50">Sodium + Iris + Hydra Entities • 2× FPS</div>
              </div>
              <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-violet-600 text-white">ON</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hydra triad - por qué es distinto */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          {icon:'🧬', title:'Hydra Engine', desc:'No es Forge suelto. Hydra inyecta Fabric/Fabric Wrapper + cache compartida. Una descarga, tres cabezas.', grad:'from-violet-600 to-fuchsia-500'},
          {icon:'⚡', title:'Mojang Direct', desc:'Lista real piston-meta.mojang.com. 915 versiones. Alpha 0.0 → 26.3 snapshot sin repack.', grad:'from-cyan-500 to-blue-500'},
          {icon:'🛡️', title:'Event Shield', desc:'Tu modo eventos con protección anti-cheat Hydra + rollback instantáneo. Tus reglas.', grad:'from-emerald-500 to-teal-500'},
        ].map(c=>(
          <div key={c.title} className="relative overflow-hidden rounded-[20px] border border-white/10 p-[1px]">
            <div className={`absolute inset-0 bg-gradient-to-br ${c.grad} opacity-60`}/>
            <div className="relative bg-[#14141c] rounded-[19px] p-5 h-full">
              <div className="w-10 h-10 rounded-xl bg-white text-black grid place-items-center text-lg font-bold">{c.icon}</div>
              <div className="font-black mt-3 text-sm">{c.title}</div>
              <div className="text-xs text-white/60 mt-1.5 leading-relaxed">{c.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Server lore + quick connect */}
      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="glass rounded-[20px] p-5">
          <div className="font-black">Lore del servidor</div>
          <p className="text-sm text-white/60 mt-2 leading-relaxed">
            Hace 3 temporadas, Hydra despertó en el vacío de OneBlock. De su sangre nació Survival, de su fuego los Eventos. Hoy las tres cabezas compiten: ¿dominarás una o las tres? Cada evento que creas queda inmortalizado en el Libro de Hydra del lobby.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {config.servers.slice(0,4).map(s=>(
              <span key={s.id} className={`text-xs px-3 py-1.5 rounded-full border font-bold flex items-center gap-1.5 ${pings[s.id]?'bg-emerald-500/15 border-emerald-500/20 text-emerald-300':'bg-white/5 border-white/10 text-white/50'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pings[s.id]?'bg-emerald-400':'bg-white/30'}`}/>{s.name} • {pings[s.id]?'ON':'OFF'}
              </span>
            ))}
          </div>
        </div>
        <div className="glass rounded-[20px] p-5">
          <div className="font-black text-sm">Cómo empezar (30s)</div>
          <ol className="text-sm text-white/70 mt-3 space-y-2 list-decimal ml-5">
            <li><b>Versiones</b> → elige <span className="text-white">26.2 + Fabric</span> (recomendado Hydra).</li>
            <li><b>Cuentas</b> → Offline (instant) o Microsoft (premium).</li>
            <li><b>JUGAR</b> → Hydra descarga y entra directo al Lobby.</li>
          </ol>
          <div className="text-[11px] text-white/30 mt-3">%APPDATA%/.minecraft • enlazado con vanilla • worlds y resourcepacks compartidos</div>
        </div>
      </div>

      <div className="text-[11px] text-white/25 text-center">Hydra Launcher v1.0 • Hecho a tu manera • 915 versiones • {versions?.slice(0,3).map((v:any)=>v.id).join(' • ') || 'cargando manifest...'}</div>
    </div>
  )
}
