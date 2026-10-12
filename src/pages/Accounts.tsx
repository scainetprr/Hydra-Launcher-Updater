import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/launcherStore'
import { v3 as uuidv3 } from 'uuid'
import * as skinview3d from 'skinview3d'

declare global{ interface Window{ api:any } }

function SkinViewer({ url, model }:{ url:string; model:'classic'|'slim' }){
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<any>(null)
  useEffect(()=>{
    if(!canvasRef.current || !url) return
    let viewer: any
    try {
      viewer = new skinview3d.SkinViewer({ canvas: canvasRef.current, width: 260, height: 340 })
      viewer.autoRotate = true
      viewer.autoRotateSpeed = 0.8
      viewer.zoom = 0.9
      const anim = new skinview3d.WalkingAnimation()
      anim.speed = 0.7
      viewer.animation = anim
      viewerRef.current = viewer
      viewer.loadSkin(url).catch(()=>{})
      if (viewer.playerObject?.skin) viewer.playerObject.skin.modelType = model
    } catch {}
    return ()=>{ try { viewer?.dispose?.() } catch {} ; viewerRef.current=null }
  },[url])
  useEffect(()=>{
    try { if(viewerRef.current?.playerObject?.skin) viewerRef.current.playerObject.skin.modelType = model } catch {}
  },[model])
  return <canvas ref={canvasRef} className="rounded-xl bg-black/40 border border-white/10 mx-auto"/>
}

export default function Accounts(){
  const { accounts, activeAccount, set } = useStore()
  const [name,setName]=useState('')
  const acct: any = activeAccount || accounts[0]
  const [skin,setSkin]=useState<{url:string;model:'classic'|'slim'}|null>(null)
  const [skinErr,setSkinErr]=useState('')
  const [busy,setBusy]=useState(false)
  const [variant,setVariant]=useState<'classic'|'slim'>('classic')
  const [msg,setMsg]=useState('')

  const loadSkin = ()=>{
    setSkin(null); setSkinErr('')
    if(!acct) return
    if(acct.type==='microsoft' && acct.uuid && acct.uuid!=='offline-player'){
      window.api?.getSkin?.(acct.uuid).then((r:any)=>{
        if(r?.ok && r.dataUrl){ setSkin({url:r.dataUrl, model:r.model||'classic'}); setVariant(r.model||'classic') }
        else setSkinErr(r?.error||'Sin skin de Mojang')
      }).catch(()=>setSkinErr('No se pudo consultar Mojang'))
    } else {
      setSkin({ url:`https://mc-heads.net/skin/${encodeURIComponent(acct.name||'Steve')}`, model:'classic' })
    }
  }
  useEffect(loadSkin,[acct?.uuid, acct?.name])

  const uploadFile = (file: File)=>{
    if(!acct?.msRefresh) return alert('Solo cuentas Microsoft pueden cambiar la skin.')
    if(file.size > 2_000_000) return alert('PNG demasiado grande (máx 2MB)')
    setBusy(true); setMsg('')
    const reader = new FileReader()
    reader.onload = async ()=>{
      try {
        const r = await window.api?.uploadSkin?.({ b64: String(reader.result), variant, msRefresh: acct.msRefresh })
        if(r?.ok){ setMsg('✓ Skin actualizada en Mojang'); setTimeout(loadSkin, 1200) }
        else setMsg('✕ '+(r?.error||'Error desconocido'))
      } finally { setBusy(false) }
    }
    reader.readAsDataURL(file)
  }

  const addOffline = ()=>{
    if(!name.trim()) return
    const clean = name.trim()
    const uuid = uuidv3(clean, uuidv3.DNS).replace(/-/g,'')
    const acc = { name: clean, uuid, type:'offline' as const }
    set({accounts:[...accounts, acc], activeAccount: acc})
    setName('')
  }
  const loginMs = async ()=>{
    const r = await window.api.loginMicrosoft()
    if(!r.ok) return alert('Error Microsoft: '+r.error)
    const d = r.data as any
    if(!d?.access_token) return alert('Microsoft no devolvió token. Intenta de nuevo.')
    const acc = { name: d.name, uuid: d.uuid, type:'microsoft' as const, access_token: d.access_token, client_token: d.client_token, xuid: d.xuid, msRefresh: d.msRefresh, mcRefresh: d.mcRefresh, exp: d.exp }
    set({accounts:[...accounts.filter(x=>x.uuid!==acc.uuid), acc], activeAccount: acc})
  }

  return (
    <div className="max-w-[700px] mx-auto space-y-4">
      <h2 className="font-display text-2xl font-bold">Cuentas</h2>

      {acct && (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="font-bold">Skin de <span className="text-gradient">{acct.name}</span></div>
            <select value={variant} onChange={e=>setVariant(e.target.value as any)} className="ml-auto bg-[#14141c] border border-white/10 rounded-lg px-2 py-1.5 text-xs">
              <option value="classic">Clásica (4px brazos)</option>
              <option value="slim">Slim (3px brazos)</option>
            </select>
            <label className={`text-xs px-3 py-1.5 rounded-lg font-bold cursor-pointer bg-white text-black ${busy?'opacity-50 pointer-events-none':''}`}>
              {busy?'Subiendo...':'Cambiar skin'}
              <input type="file" accept="image/png" className="hidden" disabled={busy} onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadFile(f); e.target.value='' }}/>
            </label>
          </div>
          <SkinViewer key={skin?.url||'none'} url={skin?.url||''} model={skin?.model||'classic'}/>
          <div className="text-center mt-2">
            {skinErr && <div className="text-xs text-white/45">{skinErr} — mostrando skin pública.</div>}
            {msg && <div className={`text-xs font-bold ${msg.startsWith('✓')?'text-emerald-300':'text-red-300'}`}>{msg}</div>}
            {!acct.msRefresh && acct.type!=='microsoft' && <div className="text-[11px] text-white/35">Cuenta offline: la skin se previsualiza desde mc-heads. Para cambiarla entra con Microsoft.</div>}
            {acct.type==='microsoft' && <div className="text-[11px] text-white/35">PNG de 64×64 (o 64×32). Se sube directo a Mojang con tu sesión.</div>}
          </div>
        </div>
      )}

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
      </div>
    </div>
  )
}
