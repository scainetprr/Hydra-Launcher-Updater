import { useEffect, useState } from 'react'
import { useStore } from '../store/launcherStore'
declare global{ interface Window{ api:any } }

export default function Servers(){
  const { config, set } = useStore()
  const [edit,setEdit]=useState(false)
  const [pings,setPings]=useState<Record<string,boolean>>({})

  useEffect(()=>{
    config.servers.forEach(async s=>{
      const r = await window.api?.pingServer(s.ip, s.port).catch(()=>({online:false}))
      setPings(p=>({...p,[s.id]: r.online}))
    })
  },[config.servers])

  const update = (id:string, patch:any)=> set({config:{...config, servers: config.servers.map(s=> s.id===id?{...s,...patch}:s)}})
  const add = ()=> set({config:{...config, servers:[...config.servers,{id:'srv'+Date.now(), name:'Nuevo Servidor', ip:'play.ejemplo.com', port:25565, type:'custom', desc:'', banner:'🎮'}]}})

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-2xl font-bold">Servidores</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">{config.servers.length} configurados</span>
        <button onClick={()=>setEdit(!edit)} className="ml-auto glass px-3 py-1.5 rounded-xl text-sm font-semibold">{edit?'Listo':'Editar IPs'}</button>
        <button onClick={add} className="bg-white text-black px-3 py-1.5 rounded-xl text-sm font-bold">+ Añadir</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {config.servers.map(s=>(
          <div key={s.id} className="glass rounded-[20px] p-5 relative overflow-hidden hover:bg-white/[0.08] transition">
            <div className="absolute inset-0 opacity-[0.06]" style={{background:`radial-gradient(circle at 30% 20%, #7c3aed, transparent 60%)`}}/>
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl neon-gradient grid place-items-center text-xl">{s.banner}</div>
                <div className="flex-1 min-w-0">
                  {!edit ? <div className="font-bold leading-none truncate">{s.name}</div> : <input value={s.name} onChange={e=>update(s.id,{name:e.target.value})} className="bg-[#14141c] border border-white/10 rounded px-2 py-1 w-full"/>}
                  <div className="text-xs text-white/60 truncate">{s.ip}:{s.port} • {s.type}</div>
                </div>
                <span className={`text-[11px] px-2 py-1 rounded-full border font-bold ${pings[s.id] ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30':'bg-white/10 text-white/50 border-white/10'}`}>{pings[s.id] ? '● Online':'○ Offline'}</span>
              </div>
              {!edit ? <div className="text-sm text-white/70 mt-3">{s.desc}</div> : (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <input value={s.ip} onChange={e=>update(s.id,{ip:e.target.value})} placeholder="IP" className="bg-[#14141c] border border-white/10 rounded-lg px-2 py-1.5 text-sm"/>
                  <input value={String(s.port)} onChange={e=>update(s.id,{port:Number(e.target.value)||25565})} className="bg-[#14141c] border border-white/10 rounded-lg px-2 py-1.5 text-sm"/>
                  <input value={s.desc} onChange={e=>update(s.id,{desc:e.target.value})} placeholder="Descripción" className="col-span-2 bg-[#14141c] border border-white/10 rounded-lg px-2 py-1.5 text-sm"/>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={()=>{
                  // quick join: set server pick and go home launch via store? guarda en clipboard
                  navigator.clipboard?.writeText(s.ip)
                }} className="flex-1 bg-white text-black font-bold py-2 rounded-xl text-sm">Copiar IP</button>
                <button onClick={()=> window.api?.launch && window.api.launch({version: useStore.getState().selectedVersion, loader: useStore.getState().loader, account: useStore.getState().activeAccount || useStore.getState().accounts[0], ram: config.ram, server:{ip:s.ip,port:s.port}})} className="flex-1 neon-gradient text-white font-bold py-2 rounded-xl text-sm">Entrar →</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-xl p-4">
        <div className="font-bold text-sm">💡 Tus modos</div>
        <div className="text-sm text-white/60 mt-1">Edita las IPs arriba para que apunten a tu host real (ej: 192.168.x.x o dominio). El botón <b>Entrar →</b> lanza el juego con <code>--server IP --port 25565</code> para conexión instantánea.</div>
      </div>
    </div>
  )
}
