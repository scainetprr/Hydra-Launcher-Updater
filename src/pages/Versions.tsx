import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/launcherStore'

type Panel = 'recent' | 'release' | 'snapshot' | 'old' | 'installed'

const PANELS: { id: Panel; icon: string; label: string }[] = [
  { id: 'recent', icon: '🕐', label: 'Recientes' },
  { id: 'release', icon: '📦', label: 'Releases' },
  { id: 'snapshot', icon: '📸', label: 'Snapshots' },
  { id: 'old', icon: '🗄️', label: 'Antiguas' },
  { id: 'installed', icon: '⬇️', label: 'Instaladas' },
]

export default function Versions(){
  const versions = useStore(s=>s.versions)
  const selectedVersion = useStore(s=>s.selectedVersion)
  const loader = useStore(s=>s.loader)
  const set = useStore(s=>s.set)
  const addLog = useStore(s=>s.addLog)
  const installedVersions = useStore(s=>s.installedVersions)
  const [panel,setPanel]=useState<Panel>('recent')
  const [q,setQ]=useState('')
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

  const isInstalledId = (id:string)=> installed.includes(id) || installed.some(x=>x.includes(id) && id.length>3) || (installedVersions||[]).some((x:any)=>x.id===id)

  const badge = (id:string)=>{
    if (id.toLowerCase().startsWith('fabric-loader')) return {label:'FABRIC',cls:'bg-violet-600 text-white',icon:'⚡'}
    if (id.toLowerCase().startsWith('forge')) return {label:'FORGE',cls:'bg-amber-600 text-white',icon:'🔨'}
    const isFab = installed.some(x=>x.includes(`fabric`) && x.includes(id))
    const isForge = installed.some(x=>x.includes(`forge`) && x.includes(id))
    if (isFab) return {label:'FABRIC',cls:'bg-violet-600 text-white',icon:'⚡'}
    if (isForge) return {label:'FORGE',cls:'bg-amber-600 text-white',icon:'🔨'}
    if (installed.includes(id)) return {label:'VANILLA',cls:'bg-white/15 text-white',icon:'⬢'}
    if (loader==='fabric') return {label:'FABRIC',cls:'bg-violet-600/20 text-violet-300 border border-violet-500/30',icon:'⚡'}
    if (loader==='forge') return {label:'FORGE',cls:'bg-amber-600/20 text-amber-300 border border-amber-500/30',icon:'🔨'}
    return {label:'VANILLA',cls:'bg-white/10 text-white/70 border border-white/10',icon:'⬢'}
  }

  const manifestById = useMemo(()=>{
    const m: Record<string,any> = {}
    ;(versions||[]).forEach((v:any)=> m[v.id]=v)
    return m
  },[versions])

  const filtered = useMemo(()=>{
    if(!versions) return []
    const match = (v:any)=>{
      if(q && !v.id.toLowerCase().includes(q.toLowerCase())) return false
      return true
    }
    if (panel==='installed'){
      const ids = [...new Set<string>([...(installedVersions||[]).map((x:any)=>x.id), ...installed])]
      return ids.map(id=>{
        const m = manifestById[id]
        const fv = (installedVersions||[]).find((x:any)=>x.id===id)
        return { id, type: m?.type || fv?.type || 'release', releaseTime: m?.releaseTime || '', url: m?.url || (fv?.valid? 'instalada en disco' : '') }
      }).sort((a:any,b:any)=> (b.releaseTime||'').localeCompare(a.releaseTime||''))
        .filter(match)
    }
    return versions.filter((v:any)=>{
      if(panel==='recent'){
        if(!['release','snapshot'].includes(v.type)) return false
      } else if (panel==='old'){
        if(!['old_beta','old_alpha'].includes(v.type)) return false
      } else if (v.type!==panel) return false
      return match(v)
    }).slice(0, panel==='recent' ? 40 : 180)
  },[versions,panel,q,installedVersions,installed])

  const installedCount = new Set([...(installedVersions||[]).map((x:any)=>x.id), ...installed]).size

  if(!versions) return <div className="glass rounded-2xl p-10 text-center text-white/60 page-enter">Cargando versiones desde Mojang...</div>

  const panelList = PANELS.map(p=> p.id==='installed' ? {...p, label:`Instaladas`, count: installedCount} : p)

  return (
    <div className="max-w-[1240px] mx-auto flex gap-4 page-enter">
      {/* Panel lateral estilo Lunar */}
      <aside className="w-[210px] shrink-0 space-y-2">
        <div className="glass rounded-2xl p-3">
          <div className="font-black text-sm mb-2 px-1">Navegador</div>
          <nav className="space-y-1">
            {panelList.map(p=>{
              const active = panel===p.id
              return (
                <button key={p.id} data-tab-sub={p.id} onClick={()=>setPanel(p.id)}
                  className={`nav-btn w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition ${active?'bg-white text-black font-bold':'text-white/75 hover:bg-white/[0.08]'}`}>
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                  {p.id==='installed' && <span className={`ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full ${active?'bg-black/10 text-black':'bg-emerald-500/20 text-emerald-300'}`}>{installedCount}</span>}
                </button>
              )
            })}
          </nav>
        </div>
        <div className="glass rounded-2xl p-3 text-[11px] text-white/50 leading-relaxed">
          <b className="text-white/80">Instaladas</b> muestra todo lo que tienes en disco, incluso versiones instaladas por otros launchers o loaders personalizados.
        </div>
        <div className="glass rounded-2xl p-3 space-y-2">
          <div className="text-[11px] text-white/45">Loader al lanzar</div>
          <select value={loader} onChange={e=>set({loader:e.target.value as any})} className="w-full bg-[#14141c] border border-white/10 rounded-xl px-3 py-2 text-sm">
            <option value="vanilla">Vanilla</option>
            <option value="fabric">Fabric (1-click)</option>
            <option value="forge">Forge (1-click)</option>
          </select>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <h2 className="font-display text-2xl font-bold">{panelList.find(p=>p.id===panel)?.icon} {panelList.find(p=>p.id===panel)?.label}</h2>
          <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10">{panel==='installed' ? `${filtered.length} en disco` : `${versions.length} disponibles`}</span>
          <span className="ml-auto text-xs text-white/40">Seleccionada: <b className="text-white">{selectedVersion}</b></span>
        </div>

        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar: 1.20.1, 1.16.5, 26.2..." className="w-full bg-[#14141c] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition"/>

        <div className="grid md:grid-cols-2 gap-3 max-h-[54vh] overflow-auto pr-1">
          {filtered.length===0 && (
            <div className="col-span-2 glass rounded-2xl p-8 text-center text-white/50">
              {panel==='installed' ? 'No hay versiones instaladas todavía — instala una desde Recientes o Releases.' : 'Sin resultados para esa búsqueda.'}
            </div>
          )}
          {filtered.map((v:any)=>{
            const b=badge(v.id)
            const isInst = isInstalledId(v.id)
            return (
            <button key={v.id} onClick={()=>set({selectedVersion:v.id})}
              className={`card-hover text-left glass rounded-2xl p-4 border-2 transition relative overflow-hidden ${selectedVersion===v.id?'border-violet-500 bg-violet-500/10':'border-transparent hover:bg-white/[0.08]'}`}>
              {isInst && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]"/>}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center bg-[#1c1c26] border border-white/10">{v.type==='release'?'⬢':v.type==='snapshot'?'⬣':'◈'}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold leading-none flex items-center gap-1.5 flex-wrap">{v.id}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black flex items-center gap-1 ${b.cls}`}>{b.icon} {b.label}</span>
                    {selectedVersion===v.id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-black font-black">SELECCIONADA</span>}
                  </div>
                  <div className="text-xs text-white/50">{v.type}{v.releaseTime?` • ${new Date(v.releaseTime).toLocaleDateString()}`:''} {isInst && <span className="text-emerald-400">• instalada</span>}</div>
                </div>
                {isInst && (
                  <span onClick={(e)=>delVersion(v.id, e)} title="Eliminar versión del disco"
                    className="shrink-0 text-[11px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-rose-300 hover:border-rose-500/30 cursor-pointer">
                    {busyDel===v.id?'...':'🗑'}
                  </span>
                )}
              </div>
              {v.url && <div className="text-xs text-white/40 mt-2 truncate">{v.url}</div>}
            </button>
          )})}
        </div>

        <div className="glass rounded-xl p-3 text-xs text-white/50">Tip Hydra: todas las versiones se descargan directo de Mojang sin modificar. Fabric/Forge se inyecta automáticamente al lanzar.</div>
      </div>
    </div>
  )
}
