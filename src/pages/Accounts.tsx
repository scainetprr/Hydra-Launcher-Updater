import { useState } from 'react'
import { useStore } from '../store/launcherStore'
import { v3 as uuidv3 } from 'uuid'

export default function Accounts(){
  const { accounts, activeAccount, set } = useStore()
  const [name,setName]=useState('')

  const addOffline = ()=>{
    if(!name.trim()) return
    const clean = name.trim()
    // UUID offline determinístico v3 igual que vanilla (no random) para que no-premium no dé Sesión no válida
    const uuid = uuidv3(clean, uuidv3.DNS).replace(/-/g,'')
    const acc = { name: clean, uuid, type:'offline' as const }
    set({accounts:[...accounts, acc], activeAccount: acc})
    setName('')
  }
  const loginMs = async ()=>{
    const r = await window.api.loginMicrosoft()
    if(!r.ok) return alert('Error Microsoft: '+r.error)
    const d = r.data as any
    // main ya devuelve objeto MCLC listo: {name, uuid, access_token, client_token, xuid, msRefresh, exp}
    if(!d?.access_token) return alert('Microsoft no devolvió token. Intenta de nuevo.')
    const acc = { name: d.name, uuid: d.uuid, type:'microsoft' as const, access_token: d.access_token, client_token: d.client_token, xuid: d.xuid, msRefresh: d.msRefresh, mcRefresh: d.mcRefresh, exp: d.exp }
    set({accounts:[...accounts.filter(x=>x.uuid!==acc.uuid), acc], activeAccount: acc})
  }

  return (
    <div className="max-w-[700px] mx-auto space-y-4">
      <h2 className="font-display text-2xl font-bold">Cuentas</h2>
      <div className="glass rounded-2xl p-5 flex gap-3">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre offline (sin premium)" className="flex-1 bg-[#14141c] border border-white/10 rounded-xl px-4 py-3 outline-none"/>
        <button onClick={addOffline} className="bg-white text-black font-bold px-5 rounded-xl">Añadir offline</button>
        <button onClick={loginMs} className="neon-gradient text-white font-bold px-5 rounded-xl">Microsoft →</button>
      </div>

      <div className="grid gap-3">
        {accounts.map(a=>(
          <div key={a.uuid} onClick={()=>set({activeAccount:a})} className={`glass rounded-2xl p-4 flex items-center gap-3 cursor-pointer border-2 ${activeAccount?.uuid===a.uuid?'border-violet-500 bg-violet-500/10':'border-transparent'}`}>
            <img src={`https://mc-heads.net/avatar/${a.name}/64`} className="w-12 h-12 rounded-xl bg-white/10"/>
            <div>
              <div className="font-bold">{a.name} {activeAccount?.uuid===a.uuid && <span className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded-full ml-2">ACTIVA</span>}</div>
              <div className="text-xs text-white/50">{a.type} • {a.uuid.slice(0,12)}{a.type==='microsoft' && !a.access_token && <span className="text-red-400 font-bold"> • SESIÓN ROTA — bórrala y entra de nuevo</span>}{a.type==='microsoft' && a.access_token && <span className="text-emerald-400"> • token ok</span>}</div>
            </div>
            <button onClick={(e)=>{e.stopPropagation(); set({accounts: accounts.filter(x=>x.uuid!==a.uuid)})}} className="ml-auto text-xs px-3 py-1.5 rounded-full bg-white/10 border border-white/10">Borrar</button>
          </div>
        ))}
      </div>
      <div className="glass rounded-xl p-4 border border-amber-500/20 bg-amber-500/10">
        <div className="font-bold text-sm text-amber-300">¿Sesión no válida con cuenta no-premium?</div>
        <div className="text-xs text-white/70 mt-1">Hydra ya genera UUID offline correcto. Tu <b>servidor</b> debe estar en <code className="bg-black/30 px-1 rounded">online-mode=false</code> en <code className="bg-black/30 px-1 rounded">server.properties</code> y usa <b>AuthMe / Floodgate</b> si mezclas premium y no-premium. Servidores premium (online-mode=true) solo dejan entrar cuentas Microsoft.</div>
        <div className="text-[11px] text-white/50 mt-1">Tip: Para tus Eventos/Survival/OneBlock pon <code>online-mode=false</code> y reinicia. Hydra detecta offline y no valida con Mojang.</div>
      </div>
    </div>
  )
}
