import { useEffect, useState } from 'react'
import { useStore } from '../store/launcherStore'
import { launchGame } from '../launch'
declare global{ interface Window{ api:any } }

export default function Servers(){
  const config = useStore(s=>s.config)
  const set = useStore(s=>s.set)
  const launching = useStore(s=>s.launching)
  const activeAccount = useStore(s=>s.activeAccount)
  const accounts = useStore(s=>s.accounts)
  const acct = activeAccount || accounts[0]
  // Solo el dueño de Hydra (scainetprr, cuenta Microsoft) puede editar los servidores oficiales
  const OWNER_UUID = 'e38d83800892458fa8947d281852215a'
  const isOwner = !!acct && acct.type==='microsoft' && ((acct.uuid||'')===OWNER_UUID || (acct.name||'').toLowerCase()==='scainetprr')
  const [edit,setEdit]=useState(false)
  useEffect(()=>{ if(!isOwner) setEdit(false) },[isOwner])
  const canEdit = edit && isOwner
  const [pings,setPings]=useState<Record<string,any>>({})
  const [copied,setCopied]=useState<string|''>('')
  const [tab,setTab]=useState<'oficiales'|'comunidad'>('oficiales')
  const [community,setCommunity]=useState<any[]|null>(null)

  useEffect(()=>{
    let alive = true
    const pingAll = async () => {
      const next: Record<string,any> = {}
      const targets = [...config.servers, ...(community||[]).map((s:any)=>({id:'c_'+s.id, ip:s.ip, port:s.port}))]
      await Promise.all(targets.map(async s=>{
        const r = await window.api?.pingFull?.(s.ip, s.port).catch(()=>({online:false})) || {online:false}
        next[s.id] = r
      }))
      if (alive) setPings(next)
    }
    pingAll()
    const i = setInterval(pingAll, 30000)
    return ()=>{ alive=false; clearInterval(i) }
  },[config.servers, community])

  useEffect(()=>{
    window.api?.getCommunityServers?.().then((r:any)=> setCommunity(r?.servers||[])).catch(()=>setCommunity([]))
  },[])

  const update = (id:string, patch:any)=>{ if(!isOwner) return; set({config:{...config, servers: config.servers.map(s=> s.id===id?{...s,...patch}:s)}}) }
  const add = ()=>{ if(!isOwner) return; set({config:{...config, servers:[...config.servers,{id:'srv'+Date.now(), name:'Nuevo Servidor', ip:'play.ejemplo.com', port:25565, type:'custom', desc:'', banner:'🎮'}]}}) }
  const remove = (id:string)=>{ if(!isOwner) return; set({config:{...config, servers: config.servers.filter(s=>s.id!==id)}}) }
  const boost = (id:string)=>{
    const votes = { ...(config.votes||{}) }
    votes[id] = Date.now()
    set({config:{...config, votes}})
  }
  const hasVoted = (id:string)=> (config.votes?.[id]||0) > Date.now() - 24*3600_000

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-2xl font-bold">Servidores</h2>
        <div className="flex glass rounded-xl overflow-hidden ml-2">
          <button data-tab-sub="oficiales" onClick={()=>setTab('oficiales')} className={`px-4 py-1.5 text-sm font-semibold ${tab==='oficiales'?'bg-white text-black':'text-white/70'}`}>Oficiales</button>
          <button data-tab-sub="comunidad" onClick={()=>setTab('comunidad')} className={`px-4 py-1.5 text-sm font-semibold ${tab==='comunidad'?'bg-white text-black':'text-white/70'}`}>Comunidad</button>
        </div>
        {tab==='oficiales' && <>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">{config.servers.length} configurados</span>
          {isOwner && <button onClick={()=>setEdit(!edit)} className="ml-auto glass px-3 py-1.5 rounded-xl text-sm font-semibold">{edit?'Listo':'Editar'}</button>}
          {isOwner && <button onClick={add} className="bg-white text-black px-3 py-1.5 rounded-xl text-sm font-bold">+ Añadir</button>}
        </>}
      </div>

      {tab==='oficiales' && (
      <div className="grid md:grid-cols-2 gap-4">
        {config.servers.map(s=>{
          const p = pings[s.id]
          return (
          <div key={s.id} className="glass rounded-[20px] p-5 relative overflow-hidden hover:bg-white/[0.08] card-hover">
            <div className="absolute inset-0 opacity-[0.06] bg-blob-1"/>
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl neon-gradient grid place-items-center text-xl">{s.banner}</div>
                <div className="flex-1 min-w-0">
                  {!canEdit ? <div className="font-bold leading-none truncate">{s.name}</div> : <input value={s.name} onChange={e=>update(s.id,{name:e.target.value})} className="bg-[#14141c] border border-white/10 rounded px-2 py-1 w-full"/>}
                  <div className="text-xs text-white/60 truncate">{s.ip}:{s.port} • {s.type}</div>
                </div>
                <span className={`text-[11px] px-2 py-1 rounded-full border font-bold ${p?.online ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30':'bg-white/10 text-white/50 border-white/10'}`}>{p?.online ? '● Online':'○ Offline'}</span>
                {canEdit && (
                  <button onClick={()=>{ if(window.confirm(`¿Eliminar el servidor "${s.name}"?`)) remove(s.id) }}
                    title="Eliminar servidor" className="shrink-0 text-white/40 hover:text-red-400 rounded-lg border border-white/10 px-2 py-1 text-xs">✕</button>
                )}
              </div>
              {p?.online && (
                <div className="flex gap-3 mt-3 text-[11px] text-white/50">
                  <span>👥 <b className="text-white/80">{p.players?.online ?? 0}</b>/{p.players?.max ?? '?'} jugadores</span>
                  <span>📶 <b className="text-white/80">{p.latency}</b>ms</span>
                  {p.version && <span className="truncate">⛏ {p.version}</span>}
                </div>
              )}
              {!canEdit ? <div className="text-sm text-white/70 mt-3 min-h-[20px]">{s.desc}</div> : (
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
              {canEdit && (s.id==='hyperhard' || s.id==='hydra-eventos') && <div className="text-[10px] text-white/30 mt-2">Servidor oficial — la IP se puede editar pero no se recomienda.</div>}
            </div>
          </div>
        )})}
      </div>
      )}

      {tab==='comunidad' && (
      <div className="space-y-4">
        {community===null && <div className="glass rounded-2xl p-10 text-center text-white/60">Cargando servidores de la comunidad...</div>}
        {community!==null && community.length===0 && (
          <div className="glass rounded-2xl p-10 text-center text-white/55">
            Aún no hay servidores de comunidad publicados.<br/>
            <span className="text-xs text-white/35 mt-2 block">La lista es curada por Hydra Studio — sugiere el tuyo en Discord.</span>
          </div>
        )}
        {community!==null && community.length>0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {community.map((s:any)=>{
              const p = pings['c_'+s.id]
              const baseBoosts = s.boosts||0
              const voted = hasVoted(s.id)
              return (
              <div key={s.id} className="glass rounded-[20px] p-5 relative overflow-hidden hover:bg-white/[0.08] card-hover">
                <div className="absolute inset-0 opacity-[0.06] bg-blob-2"/>
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl neon-gradient grid place-items-center text-xl">{s.banner||'🌐'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold leading-none truncate">{s.name}</div>
                      <div className="text-xs text-white/60 truncate">{s.ip}:{s.port}</div>
                    </div>
                    {s.featured && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">★ Destacado</span>}
                    <span className={`text-[11px] px-2 py-1 rounded-full border font-bold ${p?.online ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30':'bg-white/10 text-white/50 border-white/10'}`}>{p?.online ? '● Online':'○ Offline'}</span>
                  </div>
                  {p?.online && (
                    <div className="flex gap-3 mt-3 text-[11px] text-white/50">
                      <span>👥 <b className="text-white/80">{p.players?.online ?? 0}</b>/{p.players?.max ?? '?'} jugadores</span>
                      <span>📶 <b className="text-white/80">{p.latency}</b>ms</span>
                    </div>
                  )}
                  <div className="text-sm text-white/70 mt-3 min-h-[20px]">{s.desc}</div>
                  {s.tags?.length>0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {s.tags.map((t:string)=><span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.07] border border-white/10 text-white/55">{t}</span>)}
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button disabled={launching} onClick={()=>launchGame({ip:s.ip, port:s.port||25565})}
                      className="flex-1 neon-gradient text-white font-bold py-2 rounded-xl text-sm disabled:opacity-60">{launching?'Lanzando...':'Entrar →'}</button>
                    <button onClick={()=>boost(s.id)} disabled={voted}
                      title="Tu voto se guarda en tu PC y suma +1 a la lista"
                      className={`px-4 py-2 rounded-xl text-sm font-bold border ${voted?'border-emerald-500/30 bg-emerald-500/15 text-emerald-300':'bg-white/10 border-white/10 text-white/80 hover:bg-white/15'}`}>
                      {voted?'✓ Boosteado':'★ Boost'} <span className="text-white/40 font-normal">{baseBoosts+(voted?1:0)}</span>
                    </button>
                  </div>
                </div>
              </div>
            )})}
          </div>
        )}
        <div className="glass rounded-xl p-4">
          <div className="font-bold text-sm">🌐 Lista curada</div>
          <div className="text-sm text-white/60 mt-1">Los servidores de la comunidad se publican directamente desde el repo oficial de Hydra — <b>solo el equipo Hydra Studio puede añadir o quitar servidores</b>. Entra, boostea y comparte tu favorito.</div>
        </div>
      </div>
      )}

      {tab==='oficiales' && (
      <div className="glass rounded-xl p-4">
        <div className="font-bold text-sm">⚡ Conexión directa</div>
        <div className="text-sm text-white/60 mt-1">El botón <b>Entrar →</b> lanza tu versión seleccionada y conecta al servidor al instante (<code>--server IP</code>). El estado y los jugadores en línea se consultan cada 30s con el protocolo real de Minecraft.</div>
      </div>
      )}
    </div>
  )
}
