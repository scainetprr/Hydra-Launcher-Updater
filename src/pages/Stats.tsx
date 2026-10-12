import { useEffect, useState } from 'react'

function fmtMs(ms: number): string {
  if (!ms) return '0m'
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m`
  return '<1m'
}
function fmtDate(t: number): string {
  try { return new Date(t).toLocaleString('es', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) } catch { return '' }
}

export default function Stats(){
  const [data,setData]=useState<any>(null)
  const [err,setErr]=useState('')

  const load = ()=>{
    window.api?.getStats?.().then((r:any)=>{ if(r?.ok) setData(r); else setErr(r?.error||'Sin datos') }).catch(()=>setErr('No se pudo cargar'))
  }
  useEffect(load,[])

  if(!data) return <div className="glass rounded-2xl p-10 text-center text-white/60">{err||'Cargando estadísticas...'}</div>

  const c = data.counters || {}
  const earned:any = data.achievements || {}
  const byServer:any = c.byServer || {}
  const serverRows = Object.entries(byServer).sort((a:any,b:any)=>b[1]-a[1])
  const distinctVersions = new Set((data.sessions||[]).map((s:any)=>s.version)).size

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-2xl font-bold">Estadísticas</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10 text-white/60">Todo local en tu PC</span>
        <button onClick={load} className="ml-auto glass px-3 py-1.5 rounded-xl text-sm font-semibold">Actualizar</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { lbl:'Tiempo jugado', val: fmtMs(c.playMs||0) },
          { lbl:'Lanzamientos', val: String(c.launches||0) },
          { lbl:'Sesiones', val: String((data.sessions||[]).length) },
          { lbl:'Versiones distintas', val: String(distinctVersions) },
        ].map(s=>(
          <div key={s.lbl} className="glass rounded-2xl p-4 card-hover">
            <div className="text-[11px] text-white/45">{s.lbl}</div>
            <div className="text-xl font-black mt-1">{s.val}</div>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-5 card-hover">
        <div className="font-bold mb-3">🏆 Logros <span className="text-xs font-normal text-white/45 ml-2">{Object.keys(earned).length}/{(data.catalog||[]).length} desbloqueados</span></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {(data.catalog||[]).map((a:any)=>{
            const got = !!earned[a.id]
            return (
              <div key={a.id} className={`rounded-xl p-3 border flex items-center gap-3 ${got?'border-emerald-500/30 bg-emerald-500/10':'border-white/[0.06] bg-white/[0.03] opacity-55'}`}>
                <span className="text-2xl">{got?a.icon:'🔒'}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-none">{a.name}</div>
                  <div className="text-[11px] text-white/50 mt-1 truncate">{a.desc}</div>
                </div>
                {got && <span className="ml-auto text-[10px] text-emerald-300 font-bold">{fmtDate(earned[a.id])}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5 card-hover">
          <div className="font-bold mb-3">⛏ Tiempo por servidor</div>
          {serverRows.length ? (
            <div className="space-y-2">
              {serverRows.map(([ip,n]:any)=>(
                <div key={ip} className="flex items-center gap-3 text-sm">
                  <span className="font-semibold truncate">{ip}</span>
                  <span className="ml-auto text-white/50">{n} visita{n===1?'':'s'}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-sm text-white/45">Aún no has entrado a ningún servidor con Hydra.</div>}
        </div>
        <div className="glass rounded-2xl p-5 card-hover">
          <div className="font-bold mb-3">🕐 Últimas sesiones</div>
          {(data.sessions||[]).length ? (
            <div className="space-y-1.5 max-h-[220px] overflow-auto pr-1">
              {(data.sessions||[]).slice(0,12).map((s:any,i:number)=>(
                <div key={i} className="flex items-center gap-2 text-[12px] text-white/70">
                  <span className={s.ok!==false?'text-emerald-400':'text-red-400'}>{s.ok!==false?'●':'✕'}</span>
                  <span className="font-semibold">{s.version}</span>
                  {s.loader && s.loader!=='vanilla' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">{s.loader}</span>}
                  {s.server && <span className="truncate text-white/45">{s.server}</span>}
                  <span className="ml-auto">{fmtMs(s.ms)}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-sm text-white/45">Sin sesiones todavía — ¡lanza Minecraft!</div>}
        </div>
      </div>
    </div>
  )
}
