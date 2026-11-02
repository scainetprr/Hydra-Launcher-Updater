import { useEffect, useState } from 'react'
import { useStore, UiModal } from '../store/launcherStore'

// Modal global in-app: errores, crashes, confirmaciones y avisos del main se muestran
// AQUI en vez de con dialogos nativos de Windows. Los nativos robaban el foco al
// renderer al cerrarse y dejaban la barra de búsqueda de todas las secciones
// inutilizable (bug reportado por el usuario). Además quedan compactos y en español.

/** Abre un modal (resolviendo como "no" una confirmacion pendiente anterior). */
export function openModal(m: UiModal) {
  const st = useStore.getState()
  const prev = st.uiModal
  if (prev?.onConfirm) { try { prev.onConfirm(false) } catch {} }
  st.set({ uiModal: m })
}

/** Aviso sin botón de confirmación (sustituye a window.alert). */
export function uiAlert(problema: string, extra: Partial<UiModal> = {}) {
  openModal({ kind: 'alert', titulo: extra.titulo || 'Aviso', problema, ...extra })
}

/** Confirmación (sustituye a window.confirm): resuelve true solo al pulsar Aceptar. */
export function uiConfirm(problema: string, extra: Partial<UiModal> = {}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    openModal({
      kind: 'confirm', titulo: extra.titulo || 'Confirmar', problema,
      okLabel: 'Aceptar', cancelLabel: 'Cancelar', ...extra,
      onConfirm: (ok: boolean) => resolve(ok)
    })
  })
}

/** Instala los overrides UNA vez: window.alert/confirm pasan a ser modales in-app. */
export function installDialogOverrides() {
  const w = window as any
  if (w.__hydraDialogs) return
  w.__hydraDialogs = true
  w.alert = (msg?: any) => { uiAlert(String(msg)) }
  w.confirm = (msg?: any): Promise<boolean> => uiConfirm(String(msg))
}

export default function GlobalModal() {
  const m = useStore(s => s.uiModal)
  const set = useStore(s => s.set)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setCopied(false) }, [m])

  // registro del puente IPC + teclado (Escape cierra, Enter acepta)
  useEffect(() => {
    installDialogOverrides()
    window.api?.onHydraModal?.((payload: any) => openModal(payload || {}))
    const onKey = (e: KeyboardEvent) => {
      const cur = useStore.getState().uiModal
      if (!cur) return
      if (e.key === 'Escape') { e.preventDefault(); close(cur, cur.kind === 'confirm' ? 1 : 0) }
      else if (e.key === 'Enter') { e.preventDefault(); close(cur, 0) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!m) return null

  function close(cur: UiModal, response: number) {
    set({ uiModal: null })
    if (cur.id) window.api?.replyHydraModal?.(cur.id, response)
    if (cur.onConfirm) { try { cur.onConfirm(cur.kind === 'confirm' ? response === 0 : true) } catch {} }
  }

  const isConfirm = m.kind === 'confirm'
  const icon = m.kind === 'crash' || m.kind === 'error' ? '💥' : isConfirm ? '❓' : '⚠️'
  const copyReport = () => {
    if (!m.report) return
    try { navigator.clipboard?.writeText(m.report); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/65 grid place-items-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(m, isConfirm ? 1 : 0) }}>
      <div className="w-full max-w-[540px] max-h-[86vh] overflow-auto glass-strong rounded-2xl p-5 drop-in border border-white/10">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none">{icon}</span>
          <div className="min-w-0">
            <div className="font-display font-black text-lg leading-tight">{m.titulo || 'Hydra Launcher'}</div>
            {m.meta && <div className="text-[11px] text-white/40 mt-1">{m.meta}</div>}
          </div>
        </div>

        {m.problema && <p className="text-sm text-white/85 mt-3 leading-relaxed whitespace-pre-line">{m.problema}</p>}
        {m.detalle && <p className="text-xs text-white/55 mt-2">{m.detalle}</p>}

        {m.culprit && (
          <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
            <span>🔧</span>
            <span className="text-xs text-amber-200">Mod sospechoso: <b className="font-mono break-all">{m.culprit}</b></span>
          </div>
        )}

        {!!m.soluciones?.length && (
          <div className="mt-3">
            <div className="text-[11px] font-black text-white/45 uppercase tracking-wider mb-1.5">Qué puedes hacer</div>
            <ol className="space-y-1.5 list-decimal ml-5 text-xs text-white/75 marker:text-white/40">
              {m.soluciones.map((s, i) => <li key={i} className="pl-1 leading-relaxed">{s}</li>)}
            </ol>
          </div>
        )}

        {m.console && (
          <details className="mt-3">
            <summary className="text-[11px] text-white/40 cursor-pointer hover:text-white/70 select-none">Últimas líneas de la consola</summary>
            <pre className="mt-1.5 text-[10px] text-white/50 bg-black/40 rounded-lg p-2.5 overflow-auto max-h-40 whitespace-pre-wrap break-all font-mono">{m.console}</pre>
          </details>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
          {m.report && (
            <button onClick={copyReport} className="mr-auto text-xs px-3 py-2 rounded-lg bg-white/10 border border-white/10 font-semibold hover:bg-white/[0.16]">
              {copied ? '✓ Copiado' : 'Copiar diagnóstico'}
            </button>
          )}
          {isConfirm && (
            <button onClick={() => close(m, 1)} className="text-xs px-4 py-2 rounded-lg bg-white/10 border border-white/10 font-bold hover:bg-white/[0.16]">
              {m.cancelLabel || 'Cancelar'}
            </button>
          )}
          <button autoFocus onClick={() => close(m, 0)} className="text-xs px-5 py-2 rounded-lg bg-white text-black font-black hover:bg-white/90">
            {m.okLabel || (isConfirm ? 'Aceptar' : 'Entendido')}
          </button>
        </div>
      </div>
    </div>
  )
}
