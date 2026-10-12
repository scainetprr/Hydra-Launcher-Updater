import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/launcherStore'

export default function Versions(){
  const { versions, selectedVersion, loader, set, addLog } = useStore()
  const [q,setQ]=useState('')
  const [type,setType]=useState<'all'|'release'|'snapshot'|'old'>('all')
  const [installed,setInstalled]=useState<string[]>([])
  const [busyDel,setBusyDel]=useState<string|''>('')
  const refreshInstalled = ()=>{ window.api?.getInstalled?.().then((l:string[])=> setInstalled(l||[])).catch(()=>{}) }
  useEffect(refreshInstalled,[])

  const delVersion = async (id:string, e:React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar la versión "${id}" y todos sus archivos del disco?\n(Es seguro: se puede volver a descargar)`)) return
    setBusyDel(id)
    const res = await window.api?.deleteVersion?.(id)
    setBusyDel('')
    if (res?.ok) { addLog(`Version eliminada: ${id}`); refreshInstalled() }
    else addLog(`No se pudo eliminar ${id}: ${res?.error}`)
  }

  const badge = (id:string)=>{
    const isFab = installed.some(x=>x.includes(`fabric`) && x.includes(id))
    const isForge = installed.some(x=>x.includes(`forge`) && x.includes(id))
    const isVan = installed.includes(id)
    if (isFab) return {label:'FABRIC',cls:'bg-violet-600 text-white',icon:'⚡'}
    if (isForge) return {label:'FORGE',cls:'bg-amber-600 text-white',icon:'🔨'}
    if (isVan) return {label:'VANILLA',cls:'bg-white/15 text-white',icon:'⬢'}
    // no instalada: muestra lo que SE INSTALARÁ según selector global
    if (loader==='fabric') return {label:'FABRIC',cls:'bg-violet-600/20 text-violet-300 border border-violet-500/30',icon:'⚡'}
    if (loader==='forge') return {label:'FORGE',cls:'bg-amber-600/20 text-amber-300 border border-amber-500/30',icon:'🔨'}
    return {label:'VANILLA',cls:'bg-white/10 text-white/70 border border-white/10',icon:'⬢'}
  }

  const filtered = useMemo(()=>{
    if(!versions) return []
    return versions.filter((v:any)=>{
      if(type!=='all'){
        if(type==='old' && !['old_beta','old_alpha'].includes(v.type)) return false
        if(type!=='old' && v.type!==type) return false
      }
      if(q && !v.id.toLowerCase().includes(q.toLowerCase())) return false
      return true
    }).slice(0,180)
  },[versions,type,q])

  if(!versions) return <div className="glass rounded-2xl p-10 text-center text-white/60">Cargando versiones desde Mojang...</div>

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <h2 className="font-display text-2xl font-bold">Versiones</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10">{versions.length} disponibles</span>
        <div className="ml-auto flex gap-2">
          {(['all','release','snapshot','old'] as const).map(t=>(
            <button key={t} onClick={()=>setType(t)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${type===t?'bg-white text-black border-white':'glass border-white/10'}`}>{t==='all'?'Todas':t}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar: 1.20.1, 1.16.5, 26.2..." className="flex-1 bg-[#14141c] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500"/>
        <select value={loader} onChange={e=>set({loader:e.target.value as any})} className="bg-[#14141c] border border-white/10 rounded-xl px-3">
          <option value="vanilla">Vanilla</option>
          <option value="fabric">Fabric (1-click)</option>
          <option value="forge">Forge (1-click)</option>
        </select>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[52vh] overflow-auto pr-1">
        {filtered.map((v:any)=>{
          const b=badge(v.id)
          const isInstalled = installed.includes(v.id) || installed.some(x=>x.includes(v.id))
          return (
          <button key={v.id} onClick={()=>set({selectedVersion:v.id})}
            className={`text-left glass rounded-2xl p-4 border-2 transition relative overflow-hidden ${selectedVersion===v.id?'border-violet-500 bg-violet-500/10':'border-transparent hover:bg-white/[0.08]'}`}>
            {isInstalled && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]"/>}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-[#1c1c26] border border-white/10">{v.type==='release'?'⬢':v.type==='snapshot'?'⬣':'◈'}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold leading-none flex items-center gap-1.5 flex-wrap">{v.id}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black flex items-center gap-1 ${b.cls}`}>{b.icon} {b.label}</span>
                  {selectedVersion===v.id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-black font-black">SELECCIONADA</span>}
                </div>
                <div className="text-xs text-white/50">{v.type} • {new Date(v.releaseTime).toLocaleDateString()} {isInstalled && <span className="text-emerald-400">• instalada</span>}</div>
              </div>
              {isInstalled && (
                <span onClick={(e)=>delVersion(v.id, e)} title="Eliminar versión del disco"
                  className="shrink-0 text-[11px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-rose-300 hover:border-rose-500/30 cursor-pointer">
                  {busyDel===v.id?'...':'🗑'}
                </span>
              )}
            </div>
            <div className="text-xs text-white/40 mt-2 truncate">{v.url}</div>
          </button>
        )})}
      </div>

      <div className="glass rounded-xl p-3 text-xs text-white/50">Tip Hydra: todas las versiones se descargan directo de Mojang sin modificar. Fabric/Forge se inyecta automáticamente al lanzar.</div>
    </div>
  )
}