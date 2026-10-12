import { useEffect, useState } from 'react'
import { useStore } from '../store/launcherStore'

type Item = {
  source: string; id: string; title: string; author: string; description: string;
  downloads: number; icon: string; updated: string; categories: string[]
}

function fmtDL(n: number) {
  if (n >= 1e9) return (n/1e9).toFixed(1)+'B'
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M'
  if (n >= 1e3) return (n/1e3).toFixed(1)+'k'
  return String(n)
}

export default function Mods(){
  const selectedVersion = useStore(s=>s.selectedVersion)
  const loader = useStore(s=>s.loader)
  const set = useStore(s=>s.set)
  const addLog = useStore(s=>s.addLog)
  const config = useStore(s=>s.config)
  const [tab,setTab]=useState<'mods'|'packs'|'mine'>('mods')
  const [source,setSource]=useState<'modrinth'|'curseforge'>('modrinth')
  const [query,setQuery]=useState('')
  const [sort,setSort]=useState<'downloads'|'recent'>('downloads')
  const [items,setItems]=useState<Item[]>([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [offset,setOffset]=useState(0)
  const [installing,setInstalling]=useState<Record<string,boolean>>({})
  const [results,setResults]=useState<Record<string,string>>({})
  const [needsKey,setNeedsKey]=useState(false)
  const [cfKeyInput,setCfKeyInput]=useState(config.curseforgeKey||'')
  const [packs,setPacks]=useState<any[]>([])
  const [mods,setMods]=useState<string[]>([])
  const [newPackName,setNewPackName]=useState('')

  const type = tab==='packs' ? 'modpack' : 'mod'

  const search = async (reset=true) => {
    const off = reset ? 0 : offset
    setLoading(true); setError(''); if(reset) setItems([])
    try {
      const res = await window.api?.browseContent?.({ source, query, gameVersion: selectedVersion, loader, type, limit: 20, offset: off, index: sort })
      if (!res?.ok) {
        setError(res?.error || 'Error de busqueda')
        setNeedsKey(!!res?.needsKey)
      } else {
        setNeedsKey(false)
        setItems(prev => reset ? (res.items||[]) : [...prev, ...(res.items||[])])
        setOffset(off + (res.items?.length || 0))
      }
    } catch(e:any){ setError(String(e)) }
    setLoading(false)
  }

  useEffect(()=>{ setOffset(0); search(true) },[source, selectedVersion, loader, type, sort])
  useEffect(()=>{
    window.api?.getModpacks?.().then((p:any[])=>setPacks(p||[])).catch(()=>setPacks([]))
    window.api?.getModsInfo?.().then((m:any)=>setMods(m?.files||[])).catch(()=>setMods([]))
  },[])
  useEffect(()=>{ setCfKeyInput(config.curseforgeKey||'') },[config.curseforgeKey])

  const install = async (it: Item) => {
    setInstalling(p=>({...p,[it.id]:true}))
    setResults(r=>({...r,[it.id]:''}))
    addLog(`Descargando ${it.title} (${it.source})...`)
    const res = await window.api?.installContent?.({ source: it.source, id: it.id, type, gameVersion: selectedVersion, loader })
    setInstalling(p=>({...p,[it.id]:false}))
    if (res?.ok) {
      const msg = type==='modpack' ? `Pack instalado como versión: ${res.packName} (${res.installed} mods) — ya aparece en Versiones → Instaladas` : `Instalado: ${res.filename}`
      setResults(r=>({...r,[it.id]:`✓ ${msg}`}))
      addLog(`✓ ${msg}`)
      if (type==='modpack') { const p = await window.api?.getModpacks?.(); setPacks(p||[]) }
    } else {
      setResults(r=>({...r,[it.id]:`✗ ${res?.error||'fallo'}`}))
      addLog(`✗ ${it.title}: ${res?.error}`)
      if (res?.needsKey) setNeedsKey(true)
    }
  }

  const saveKey = () => {
    const next = { ...config, curseforgeKey: cfKeyInput.trim() }
    set({ config: next })
    window.api?.saveConfig?.(next)
    addLog('API key de CurseForge guardada')
    search(true)
  }

  const createPack = async () => {
    if (!newPackName.trim()) return
    const pack = { id:'pack_'+Date.now(), name:newPackName.trim(), mods, created:Date.now(), version:'1.0' }
    const res = await window.api.saveModpack?.(pack)
    if (res?.ok) { setPacks([...packs, pack]); setNewPackName(''); addLog(`Modpack creado: ${pack.name} (${mods.length} mods)`) }
  }
  const deletePack = async (id:string) => {
    if (!confirm('¿Eliminar este modpack?')) return
    const res = await window.api.deleteModpack?.(id)
    if (res?.ok) { setPacks(packs.filter(p=>p.id!==id)); addLog('Modpack eliminado') }
  }
  const applyPack = async (id:string) => {
    const res = await window.api.applyModpack?.(id)
    if (res?.ok) addLog(`Modpack ${packs.find(p=>p.id===id)?.name}: ${res.mods?.length||0} mods en la lista`)
  }

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <h2 className="font-display text-2xl font-bold">Mods</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10">{selectedVersion} • {loader}</span>
        <div className="ml-auto flex gap-1 glass rounded-xl p-1">
          {([['mods','Explorar mods'],['packs','Explorar modpacks'],['mine','Mis modpacks']] as const).map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab===id?'bg-white text-black':'text-white/60 hover:text-white'}`}>{label}</button>
          ))}
        </div>
      </div>

      {tab!=='mine' && (
        <div className="glass rounded-2xl p-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1 bg-black/30 rounded-xl p-1 border border-white/10">
              {(['modrinth','curseforge'] as const).map(s=>(
                <button key={s} onClick={()=>setSource(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${source===s?'bg-white text-black':'text-white/55 hover:text-white'}`}>
                  {s==='modrinth' ? '⬢ Modrinth' : '🔥 CurseForge'}
                </button>
              ))}
            </div>
            <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search(true)}
              placeholder={`Buscar ${tab==='packs'?'modpacks':'mods'} en ${source==='modrinth'?'Modrinth':'CurseForge'}...`}
              className="flex-1 min-w-[200px] bg-[#14141c] border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-violet-500"/>
            <select value={sort} onChange={e=>setSort(e.target.value as any)} className="bg-[#14141c] border border-white/10 rounded-xl px-3 py-2.5 text-sm">
              <option value="downloads">Descargas</option>
              <option value="recent">Recientes</option>
            </select>
            <button onClick={()=>search(true)} disabled={loading} className="bg-white text-black font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-50">{loading?'...':'Buscar'}</button>
          </div>
          {needsKey && source==='curseforge' && (
            <div className="flex flex-wrap items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
              <div className="text-xs text-amber-200 flex-1 min-w-[220px]">CurseForge necesita una API key gratis: consiguela en <b>console.curseforge.com</b> (My Account → API Keys) y peguela aqui.</div>
              <input value={cfKeyInput} onChange={e=>setCfKeyInput(e.target.value)} placeholder="$2a$10$..." className="bg-[#14141c] border border-white/10 rounded-lg px-3 py-2 text-xs w-[260px]"/>
              <button onClick={saveKey} className="bg-white text-black font-bold px-3 py-2 rounded-lg text-xs">Guardar</button>
            </div>
          )}
          {error && <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</div>}
        </div>
      )}

      {tab!=='mine' && (
        items.length===0 && !loading ? (
          <div className="glass rounded-2xl p-10 text-center text-white/45">
            {error ? 'Sin resultados — ajusta filtros o la API key.' : 'Escribe algo y pulsa Buscar para explorar el catalogo.'}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(it=>(
              <div key={it.source+it.id} className="glass rounded-2xl p-4 flex items-center gap-4 hover:bg-white/[0.06] card-hover">
                {it.icon ? <img src={it.icon} alt="" className="w-12 h-12 rounded-xl bg-white/10 border border-white/10" onError={(e:any)=>{e.target.style.visibility='hidden'}}/> : <div className="w-12 h-12 rounded-xl bg-white/10 grid place-items-center">🧩</div>}
                <div className="flex-1 min-w-0">
                  <div className="font-bold leading-none truncate flex items-center gap-2">
                    {it.title}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${it.source==='modrinth'?'bg-emerald-500/15 text-emerald-300':'bg-orange-500/15 text-orange-300'}`}>{it.source==='modrinth'?'MODRINTH':'CURSEFORGE'}</span>
                  </div>
                  <div className="text-[11px] text-white/45 mt-1 truncate">{it.author}{it.author?' • ':''}⬇ {fmtDL(it.downloads)}{it.updated?` • ${new Date(it.updated).toLocaleDateString()}`:''}</div>
                  <div className="text-xs text-white/60 mt-1 line-clamp-1 truncate">{it.description}</div>
                  {results[it.id] && <div className={`text-[11px] mt-1 font-bold ${results[it.id].startsWith('✓')?'text-emerald-300':'text-rose-300'}`}>{results[it.id]}</div>}
                </div>
                <button onClick={()=>install(it)} disabled={installing[it.id]}
                  className="shrink-0 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
                  {installing[it.id] ? 'Instalando...' : 'Instalar'}
                </button>
              </div>
            ))}
            {loading && <div className="glass rounded-2xl p-6 text-center text-white/50 text-sm">Cargando catalogo...</div>}
            {!loading && items.length>0 && items.length%20===0 && (
              <button onClick={()=>search(false)} className="w-full glass rounded-xl py-3 text-sm font-bold text-white/70 hover:bg-white/[0.08]">Cargar mas</button>
            )}
          </div>
        )
      )}

      {tab==='mine' && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-4 border border-white/10 card-hover">
            <h3 className="font-bold mb-3">Crear modpack desde mis mods actuales</h3>
            <p className="text-xs text-white/50 mb-3">Se incluiran <b>{mods.length} mods</b> de <code className="bg-black/30 px-1 rounded">%APPDATA%\.minecraft\mods\</code></p>
            <div className="flex gap-3">
              <input value={newPackName} onChange={e=>setNewPackName(e.target.value)} placeholder="Nombre del modpack (ej: 'PvP Pack')"
                className="flex-1 bg-[#14141c] border border-white/10 rounded-xl px-4 py-3 outline-none"/>
              <button onClick={createPack} disabled={!newPackName.trim()||mods.length===0} className="neon-gradient text-white font-bold px-6 rounded-xl disabled:opacity-50">Crear</button>
            </div>
          </div>
          {packs.length===0 ? (
            <div className="glass rounded-2xl p-10 text-center text-white/45">No hay modpacks propios. Crea uno o instala packs desde el catalogo.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {packs.map(pack=>(
                <div key={pack.id} className="glass rounded-2xl p-4 border border-white/10 hover:bg-white/[0.06] card-hover">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-lg truncate">{pack.name}</h3>
                    <button onClick={()=>deletePack(pack.id)} className="text-red-400 hover:text-red-300 p-1" title="Eliminar">🗑</button>
                  </div>
                  <div className="text-xs text-white/50 mb-3">{new Date(pack.created).toLocaleDateString()} • {pack.mods?.length||0} mods</div>
                  <button onClick={()=>applyPack(pack.id)} className="w-full neon-gradient text-white font-bold py-2 rounded-xl">⚡ Aplicar</button>
                </div>
              ))}
            </div>
          )}
          <div className="glass rounded-xl p-3 text-xs text-white/50 border border-white/10">
            Los packs descargados de Modrinth/CurseForge se instalan directo en <code className="bg-black/30 px-1 rounded">mods/</code> con sus overrides. Los packs propios guardan la lista de tus mods actuales.
          </div>
        </div>
      )}
    </div>
  )
}
