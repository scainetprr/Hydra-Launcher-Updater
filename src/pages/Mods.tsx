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

function fmtBytes(n: number) {
  if (!n) return ''
  if (n >= 1024*1024*1024) return (n/(1024*1024*1024)).toFixed(1)+' GB'
  if (n >= 1024*1024) return (n/(1024*1024)).toFixed(1)+' MB'
  if (n >= 1024) return Math.round(n/1024)+' KB'
  return n+' B'
}

// markdown basico de Modrinth → HTML seguro (escapamos primero, luego formateamos)
function mdToHtml(md: string): string {
  let s = String(md || '')
  s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  s = s.replace(/```[a-zA-Z0-9_+-]*\n?([\s\S]*?)```/g, (_m, c) => `<pre class="bg-black/40 rounded-xl p-3 overflow-x-auto text-[11px] my-2">${c}</pre>`)
  s = s.replace(/^#### (.+)$/gm,'<h4 class="font-bold mt-3 mb-1">$1</h4>')
       .replace(/^### (.+)$/gm,'<h3 class="font-bold mt-3 mb-1">$1</h3>')
       .replace(/^## (.+)$/gm,'<h2 class="font-bold text-lg mt-4 mb-1">$1</h2>')
       .replace(/^# (.+)$/gm,'<h1 class="font-bold text-xl mt-4 mb-1">$1</h1>')
  s = s.replace(/`([^`]+)`/g,'<code class="bg-black/30 px-1 rounded">$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
  s = s.replace(/\*([^*]+)\*/g,'<em>$1</em>')
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noreferrer" class="text-violet-300 underline">$1</a>')
  s = s.replace(/(?:^|\n)(?:[-*] .+(?:\n|$))+/g, block => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /,'')}</li>`).join('')
    return `\n<ul class="list-disc pl-5 my-1 space-y-0.5">${items}</ul>`
  })
  s = s.replace(/(?:^|\n)(?:\d+\. .+(?:\n|$))+/g, block => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /,'')}</li>`).join('')
    return `\n<ol class="list-decimal pl-5 my-1 space-y-0.5">${items}</ol>`
  })
  const parts = s.split(/\n{2,}/).map(p => {
    const t = p.trim()
    if (!t) return ''
    if (/^<(h\d|ul|ol|pre|blockquote)/.test(t)) return t
    return `<p class="my-1.5">${t.replace(/\n/g,'<br/>')}</p>`
  })
  return parts.filter(Boolean).join('\n')
}

// HTML de CurseForge: deja formato basico, quita scripts/handlers
function sanitizeHtml(html: string): string {
  let s = String(html || '')
  s = s.replace(/<(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
  s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '').replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '').replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  s = s.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
  return s
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
  const [keySaved,setKeySaved]=useState(false)
  const [packs,setPacks]=useState<any[]>([])
  const [mods,setMods]=useState<string[]>([])
  const [newPackName,setNewPackName]=useState('')
  const [detailItem,setDetailItem]=useState<Item|null>(null)
  const [detail,setDetail]=useState<any>(null)
  const [detailLoading,setDetailLoading]=useState(false)
  const [detailErr,setDetailErr]=useState('')
  const [detailTab,setDetailTab]=useState<'desc'|'versions'>('desc')

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

  const install = async (it: Item, v?: any) => {
    const key = it.id + (v ? ':' + v.id : '')
    setInstalling(p=>({...p,[key]:true}))
    setResults(r=>({...r,[key]:''}))
    addLog(`Descargando ${it.title}${v?` ${v.label}`:''} (${it.source})...`)
    const res = await window.api?.installContent?.({
      source: it.source, id: it.id, type,
      gameVersion: v ? undefined : selectedVersion,
      loader: v ? undefined : loader,
      versionId: v?.id, fileId: v?.id
    })
    setInstalling(p=>({...p,[key]:false}))
    if (res?.ok) {
      const label = v ? ` ${v.label}` : ''
      const msg = type==='modpack' ? `Pack${label} instalado como versión: ${res.packName} (${res.installed} mods) — ya aparece en Versiones → Instaladas` : `Instalado${label}: ${res.filename}`
      setResults(r=>({...r,[key]:`✓ ${msg}`}))
      addLog(`✓ ${msg}`)
      if (type==='modpack') { const p = await window.api?.getModpacks?.(); setPacks(p||[]) }
    } else {
      setResults(r=>({...r,[key]:`✗ ${res?.error||'fallo'}`}))
      addLog(`✗ ${it.title}: ${res?.error}`)
      if (res?.needsKey) setNeedsKey(true)
    }
  }

  const openDetail = async (it: Item) => {
    setDetailItem(it); setDetail(null); setDetailErr(''); setDetailTab('desc'); setDetailLoading(true)
    try {
      const res = await window.api?.getContentDetail?.({ source: it.source, id: it.id, fallbackAuthor: it.author })
      if (res?.ok) setDetail(res)
      else { setDetailErr(res?.error || 'No se pudo cargar la ficha'); if (res?.needsKey) setNeedsKey(true) }
    } catch(e:any){ setDetailErr(String(e)) }
    setDetailLoading(false)
  }
  const closeDetail = () => { setDetailItem(null); setDetail(null); setDetailErr('') }

  const saveKey = () => {
    const key = cfKeyInput.trim()
    if (!key || key.length < 10) { addLog('✗ La API key de CurseForge parece demasiado corta — cópiala entera desde console.curseforge.com'); return }
    const next = { ...config, curseforgeKey: key }
    set({ config: next })
    window.api?.saveConfig?.(next)
    addLog(`API key de CurseForge guardada (${key.slice(0,8)}...)`)
    setKeySaved(true); setTimeout(()=>setKeySaved(false), 4000)
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
    const pack = packs.find(p=>p.id===id)
    const res = await window.api.deleteModpack?.(id)
    if (res?.ok) {
      // si era un pack instalado como version, borrar tambien su carpeta versions/<id>
      if (pack?.versionId) { try { await window.api.deleteVersion?.(pack.versionId) } catch {} }
      setPacks(packs.filter(p=>p.id!==id)); addLog('Modpack eliminado')
    }
  }
  const applyPack = async (id:string) => {
    const res = await window.api.applyModpack?.(id)
    if (res?.ok) addLog(`Modpack ${packs.find(p=>p.id===id)?.name}: ${res.mods?.length||0} mods en la lista`)
  }
  const playPack = (pack:any) => {
    if (!pack.versionId) return
    set({ selectedVersion: pack.versionId })
    addLog(`Modpack ${pack.name} (${pack.base||'?'}) seleccionado — pulsa JUGAR en Inicio`)
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

      {tab!=='mine' && !detailItem && (
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
              <button onClick={saveKey} className={`font-bold px-3 py-2 rounded-lg text-xs ${keySaved?'bg-emerald-500 text-white':'bg-white text-black'}`}>{keySaved?'✓ Guardada':'Guardar'}</button>
            </div>
          )}
          {error && <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</div>}
        </div>
      )}

      {tab!=='mine' && detailItem && (
        <div className="space-y-4 page-enter">
          <button onClick={closeDetail} className="text-sm font-bold text-white/60 hover:text-white">← Volver al catálogo</button>
          {needsKey && detailItem.source==='curseforge' && (
            <div className="flex flex-wrap items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
              <div className="text-xs text-amber-200 flex-1 min-w-[220px]">CurseForge necesita una API key gratis: consiguela en <b>console.curseforge.com</b> (My Account → API Keys) y peguela aqui.</div>
              <input value={cfKeyInput} onChange={e=>setCfKeyInput(e.target.value)} placeholder="$2a$10$..." className="bg-[#14141c] border border-white/10 rounded-lg px-3 py-2 text-xs w-[260px]"/>
              <button onClick={saveKey} className={`font-bold px-3 py-2 rounded-lg text-xs ${keySaved?'bg-emerald-500 text-white':'bg-white text-black'}`}>{keySaved?'✓ Guardada':'Guardar'}</button>
            </div>
          )}
          {detailLoading && <div className="glass rounded-2xl p-10 text-center text-white/50 text-sm">Cargando ficha...</div>}
          {!detailLoading && detailErr && (
            <div className="glass rounded-2xl p-6 text-center text-rose-300 text-sm">{detailErr}</div>
          )}
          {!detailLoading && detail && (
            <>
              <div className="glass rounded-2xl p-5 flex flex-wrap items-center gap-4">
                {detail.project.icon ? <img src={detail.project.icon} alt="" className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10" onError={(e:any)=>{e.target.style.visibility='hidden'}}/> : <div className="w-16 h-16 rounded-2xl bg-white/10 grid place-items-center text-2xl">🧩</div>}
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display text-xl font-bold">{detail.project.title}</h2>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${detailItem.source==='modrinth'?'bg-emerald-500/15 text-emerald-300':'bg-orange-500/15 text-orange-300'}`}>{detailItem.source==='modrinth'?'MODRINTH':'CURSEFORGE'}</span>
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    {detail.project.author ? `por ${detail.project.author} • ` : ''}⬇ {fmtDL(detail.project.downloads||0)}
                    {detail.project.updated ? ` • Actualizado ${new Date(detail.project.updated).toLocaleDateString()}` : ''}
                    {detail.versions?.[0]?.mc ? ` • MC ${detail.versions[0].mc}` : ''}
                  </div>
                  {detail.project.summary && <div className="text-sm text-white/70 mt-1">{detail.project.summary}</div>}
                  {(detail.project.categories||[]).length>0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {detail.project.categories.slice(0,6).map((c:string)=>(
                        <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-white/60">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 items-end">
                  {detail.versions?.length>0 ? (
                    <button onClick={()=>install(detailItem, detail.versions[0])} disabled={installing[detailItem.id+':'+detail.versions[0].id]}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm">
                      {installing[detailItem.id+':'+detail.versions[0].id] ? 'Instalando...' : '⬇ Instalar última versión'}
                    </button>
                  ) : (
                    <button onClick={()=>install(detailItem)} disabled={installing[detailItem.id]}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm">
                      {installing[detailItem.id] ? 'Instalando...' : '⬇ Instalar'}
                    </button>
                  )}
                  {results[detailItem.id+':'+detail.versions?.[0]?.id] && (
                    <div className={`text-[11px] font-bold text-right max-w-[320px] ${results[detailItem.id+':'+detail.versions?.[0]?.id].startsWith('✓')?'text-emerald-300':'text-rose-300'}`}>{results[detailItem.id+':'+detail.versions?.[0]?.id]}</div>
                  )}
                </div>
              </div>

              <div className="glass rounded-2xl overflow-hidden">
                <div className="flex gap-1 p-1 border-b border-white/10">
                  {([['desc','Descripción'],['versions',`Versiones (${detail.versions?.length||0})`]] as const).map(([id,label])=>(
                    <button key={id} onClick={()=>setDetailTab(id)} className={`px-4 py-2 rounded-lg text-xs font-bold ${detailTab===id?'bg-white text-black':'text-white/60 hover:text-white'}`}>{label}</button>
                  ))}
                  {detail.project.sourceUrl && (
                    <button onClick={()=>window.api?.openExternal?.(detail.project.sourceUrl)} className="ml-auto text-xs text-violet-300 hover:text-violet-200 self-center px-3">↗ Página original</button>
                  )}
                </div>
                <div className="p-4">
                  {detailTab==='desc' ? (
                    detail.project.bodyType==='html'
                      ? <div className="text-sm text-white/80 leading-relaxed" dangerouslySetInnerHTML={{__html: sanitizeHtml(detail.project.body||detail.project.summary||'Sin descripción.')}}/>
                      : <div className="text-sm text-white/80 leading-relaxed" dangerouslySetInnerHTML={{__html: mdToHtml(detail.project.body||detail.project.summary||'Sin descripción.')}}/>
                  ) : (
                    <div className="space-y-1.5">
                      {(detail.versions||[]).length===0 && <div className="text-white/45 text-sm py-6 text-center">Sin versiones listadas.</div>}
                      {(detail.versions||[]).map((v:any)=>{
                        const vkey = detailItem.id+':'+v.id
                        return (
                          <div key={v.id} className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-xl px-3 py-2.5 hover:bg-white/[0.04]">
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm truncate flex items-center gap-2">
                                {v.label}
                                {v.kind && v.kind!=='release' && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${v.kind==='beta'?'bg-amber-500/15 text-amber-300':'bg-rose-500/15 text-rose-300'}`}>{String(v.kind).toUpperCase()}</span>}
                              </div>
                              <div className="text-[11px] text-white/45 mt-0.5 truncate">
                                {v.mc || '—'}{v.loader && v.loader!=='-' ? ` • ${v.loader}` : ''}
                                {v.date ? ` • ${new Date(v.date).toLocaleDateString()}` : ''}
                                {v.downloads ? ` • ⬇ ${fmtDL(v.downloads)}` : ''}
                                {v.size ? ` • ${fmtBytes(v.size)}` : ''}
                              </div>
                              {results[vkey] && <div className={`text-[11px] mt-0.5 font-bold ${results[vkey].startsWith('✓')?'text-emerald-300':'text-rose-300'}`}>{results[vkey]}</div>}
                            </div>
                            <button onClick={()=>install(detailItem, v)} disabled={installing[vkey]}
                              className="shrink-0 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-1.5 rounded-lg text-xs">
                              {installing[vkey] ? 'Instalando...' : 'Instalar'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab!=='mine' && !detailItem && (
        items.length===0 && !loading ? (
          <div className="glass rounded-2xl p-10 text-center text-white/45">
            {error ? 'Sin resultados — ajusta filtros o la API key.' : 'Escribe algo y pulsa Buscar para explorar el catalogo.'}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(it=>(
              <div key={it.source+it.id} onClick={()=>openDetail(it)} className="glass rounded-2xl p-4 flex items-center gap-4 hover:bg-white/[0.06] card-hover cursor-pointer">
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
                <button onClick={(e)=>{e.stopPropagation(); install(it)}} disabled={installing[it.id]}
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
                  <div className="text-xs text-white/50 mb-3">
                    {(pack.installedAt||pack.created) ? new Date(pack.installedAt||pack.created).toLocaleDateString() : '—'}
                    {' • '}
                    {typeof pack.mods==='number' ? pack.mods : (pack.mods?.length||0)} mods
                    {pack.versionId && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-bold">🧩 {pack.base||''}</span>}
                  </div>
                  {pack.versionId ? (
                    <button onClick={()=>playPack(pack)} className="w-full neon-gradient text-white font-bold py-2 rounded-xl">▶ Jugar</button>
                  ) : (
                    <button onClick={()=>applyPack(pack.id)} className="w-full neon-gradient text-white font-bold py-2 rounded-xl">⚡ Aplicar</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="glass rounded-xl p-3 text-xs text-white/50 border border-white/10">
            Los packs descargados de Modrinth/CurseForge se instalan como <b>versiones aisladas</b> en <code className="bg-black/30 px-1 rounded">versions/&lt;pack&gt;/</code> con sus propios mods y config — no tocan tus mods de <code className="bg-black/30 px-1 rounded">mods/</code>. Los packs propios guardan la lista de tus mods actuales.
          </div>
        </div>
      )}
    </div>
  )
}
