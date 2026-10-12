import { useEffect, useState } from 'react'
import { useStore } from '../store/launcherStore'
import { launchGame } from '../launch'
declare global{ interface Window{ api:any } }

export default function Servers(){
  const { config, set, launching } = useStore()
  const [edit,setEdit]=useState(false)
  const [pings,setPings]=useState<Record<string,any>>({})
  const [copied,setCopied]=useState<string|''>('')

  useEffect(()=>{
    let alive = true
    const pingAll = async () => {
      const next: Record<string,any> = {}
      await Promise.all(config.servers.map(async s=>{
        const r = await window.api?.pingFull?.(s.ip, s.port).catch(()=>({online:false})) || {online:false}
        next[s.id] = r
      }))
      if (alive) setPings(next)
    }
    pingAll()
    const i = setInterval(pingAll, 30000)
    return ()=>{ alive=false; clearInterval(i) }
  },[config.servers])

  const update = (id:string, patch:any)=> set({config:{...config, servers: config.servers.map(s=> s.id===id?{...s,...patch}:s)}})
  const add = ()=> set({config:{...config, servers:[...config.servers,{id:'srv'+Date.now(), name:'Nuevo Servidor', ip:'play.ejemplo.com', port:25565, type:'custom', desc:'', banner:'🎮'}]}})
  const remove = (id:string)=> set({config:{...config, servers: config.servers.filter(s=>s.id!==id)}})

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-2xl font-bold">Servidores</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">{config.servers.length} configurados</span>
        <button onClick={()=>setEdit(!edit)} className="ml-auto glass px-3 py-1.5 rounded-xl text-sm font-semibold">{edit?'Listo':'Editar'}</button>
        <button onClick={add} className="bg-white text-black px-3 py-1.5 rounded-xl text-sm font-bold">+ Añadir</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {config.servers.map(s=>{
          const p = pings[s.id]
          return (
          <div key={s.id} className="glass rounded-[20px] p-5 relative overflow-hidden hover:bg-white/[0.08] transition">
            <div className="absolute inset-0 opacity-[0.06]" style={{background:`radial-gradient(circle at 30% 20%, #7c3aed, transparent 60%)`}}/>
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl neon-gradient grid place-items-center text-xl">{s.banner}</div>
                <div className="flex-1 min-w-0">
                  {!edit ? <div className="font-bold leading-none truncate">{s.name}</div> : <input value={s.name} onChange={e=>update(s.id,{name:e.target.value})} className="bg-[#14141c] border border-white/10 rounded px-2 py-1 w-full"/>}
                  <div className="text-xs text-white/60 truncate">{s.ip}:{s.port} • {s.type}</div>
                </div>
                <span className={`text-[11px] px-2 py-1 rounded-full border font-bold ${p?.online ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30':'bg-white/10 text-white/50 border-white/10'}`}>{p?.online ? '● Online':'○ Offline'}</span>
              </div>
              {p?.online && (
                <div className="flex gap-3 mt-3 text-[11px] text-white/50">
                  <span>👥 <b className="text-white/80">{p.players?.online ?? 0}</b>/{p.players?.max ?? '?'} jugadores</span>
                  <span>📶 <b className="text-white/80">{p.latency}</b>ms</span>
                  {p.version && <span className="truncate">⛏ {p.version}</span>}
                </div>
              )}
              {!edit ? <div className="text-sm text-white/70 mt-3 min-h-[20px]">{s.desc}</div> : (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <input value={s.ip} onChange={e=>update(s.id,{ip:e.target.value})} placeholder="IP" className="bg-[#14141c] border border-white/10 rounded-lg px-2 py-1.5 text-sm"/>
                  <input value={String(s.port)} onChange={e=>update(s.id,{port:Number(e.target.value)||25565})} className="bg-[#14141c] border border-white/10 rounded-lg px-2 py-1.5 text-sm"/>
                  <input value={s.desc} onChange={e=>update(s.id,{desc:e.target.value})} placeholder="Descripción" className="col-span-2 bg-[#14141c] border border-white/10 rounded-lg px-2 py-1.5 text-sm"/>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={()=>{
                  navigator.clipboard?.writeText(s.ip)
                  setCopied(s.id); setTimeout(()=>setCopied(''), 1500)
                }} className="flex-1 bg-white text-black font-bold py-2 rounded-xl text-sm">{copied===s.id?'✓ Copiada':'Copiar IP'}</button>
                <button disabled={launching} onClick={()=>launchGame({ip:s.ip, port:s.port})}
                  className="flex-1 neon-gradient text-white font-bold py-2 rounded-xl text-sm disabled:opacity-60">{launching?'Lanzando...':'Entrar →'}</button>
              </div>
              {edit && (s.id==='hyperhard' || s.id==='hydra-eventos') && <div className="text-[10px] text-white/30 mt-2">Servidor oficial — la IP se puede editar pero no se recomienda.</div>}
            </div>
          </div>
        )})}
      </div>

      <div className="glass rounded-xl p-4">
        <div className="font-bold text-sm">⚡ Conexion directa</div>
        <div className="text-sm text-white/60 mt-1">El botón <b>Entrar →</b> lanza tu versión seleccionada y conecta al servidor al instante (<code>--server IP</code>). El estado y los jugadores en línea se consultan cada 30s con el protocolo real de Minecraft.</div>
      </div>
    </div>
  )
}
