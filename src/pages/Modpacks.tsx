import { useEffect, useState } from 'react'
import { useStore } from '../store/launcherStore'

export default function Modpacks() {
  const { set, addLog } = useStore()
  const [packs, setPacks] = useState<any[]>([])
  const [mods, setMods] = useState<string[]>([])
  const [newPackName, setNewPackName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    window.api?.getModpacks?.().then((p: any[]) => setPacks(p || [])).catch(() => setPacks([]))
    window.api?.getModsInfo?.().then((m: any) => setMods(m?.files || [])).catch(() => setMods([]))
  }, [])

  const createPack = async () => {
    if (!newPackName.trim()) return
    const id = 'pack_' + Date.now()
    const pack = {
      id,
      name: newPackName.trim(),
      mods: mods,
      created: Date.now(),
      version: '1.0'
    }
    const res = await window.api.saveModpack?.(pack)
    if (res?.ok) {
      setPacks([...packs, pack])
      setNewPackName('')
      addLog(`✔ Modpack creado: ${pack.name} (${mods.length} mods)`)
    }
  }

  const deletePack = async (id: string) => {
    if (!confirm('¿Eliminar este modpack?')) return
    const res = await window.api.deleteModpack?.(id)
    if (res?.ok) {
      setPacks(packs.filter(p => p.id !== id))
      addLog('🗑 Modpack eliminado')
    }
  }

  const startEdit = (pack: any) => {
    setEditingId(pack.id)
    setEditName(pack.name)
  }

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return
    const pack = packs.find(p => p.id === id)
    if (!pack) return
    const updated = { ...pack, name: editName.trim() }
    const res = await window.api.saveModpack?.(updated)
    if (res?.ok) {
      setPacks(packs.map(p => p.id === id ? updated : p))
      setEditingId(null)
      setEditName('')
      addLog(`✏ Modpack renombrado: ${editName}`)
    }
  }

  const applyPack = async (id: string) => {
    const res = await window.api.applyModpack?.(id)
    if (res?.ok) {
      addLog(`⚡ Modpack aplicado: ${packs.find(p => p.id === id)?.name} (${res.mods?.length || 0} mods)`)
      // TODO: implementar copia/symlink real a mods/ activo
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <h2 className="font-display text-2xl font-bold">Modpacks</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10">{packs.length} guardados</span>
      </div>

      {/* Crear nuevo modpack */}
      <div className="glass rounded-2xl p-4 border border-white/10">
        <h3 className="font-bold mb-3">Crear modpack desde mods actuales</h3>
        <p className="text-xs text-white/50 mb-3">
          Se incluirán <b>{mods.length} mods</b> (recursivo desde <code className="bg-black/30 px-1 rounded">%APPDATA%\.minecraft\mods\</code>)
        </p>
        <div className="flex gap-3">
          <input
            value={newPackName}
            onChange={e => setNewPackName(e.target.value)}
            placeholder="Nombre del modpack (ej: 'Create 1.21.1', 'PvP Pack')"
            className="flex-1 bg-[#14141c] border border-white/10 rounded-xl px-4 py-3 outline-none"
          />
          <button
            onClick={createPack}
            disabled={!newPackName.trim() || mods.length === 0}
            className="neon-gradient text-white font-bold px-6 rounded-xl disabled:opacity-50"
          >
            Crear modpack
          </button>
        </div>
      </div>

      {/* Lista de modpacks */}
      {packs.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-white/50">
          No hay modpacks guardados. Crea uno con tus mods actuales.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {packs.map(pack => (
            <div
              key={pack.id}
              className={`glass rounded-2xl p-4 border-2 transition ${editingId === pack.id ? 'border-violet-500' : 'border-transparent hover:bg-white/[0.08]'}`}
            >
              {editingId === pack.id ? (
                <div className="flex gap-2">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="flex-1 bg-[#14141c] border border-white/10 rounded-xl px-3 py-2 outline-none"
                    autoFocus
                  />
                  <button onClick={() => saveEdit(pack.id)} className="bg-emerald-600 text-white font-bold px-4 rounded-xl">Guardar</button>
                  <button onClick={() => { setEditingId(null); setEditName('') }} className="bg-red-600 text-white font-bold px-4 rounded-xl">Cancelar</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-lg">{pack.name}</h3>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(pack)} className="text-white/70 hover:text-white p-1" title="Renombrar">✏</button>
                      <button onClick={() => deletePack(pack.id)} className="text-red-400 hover:text-red-300 p-1" title="Eliminar">🗑</button>
                    </div>
                  </div>
                  <div className="text-xs text-white/50 mb-3">
                    {new Date(pack.created).toLocaleDateString()} • {pack.mods?.length || 0} mods
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => applyPack(pack.id)}
                      className="flex-1 neon-gradient text-white font-bold py-2 rounded-xl"
                    >
                      ⚡ Aplicar
                    </button>
                    <button
                      onClick={() => startEdit(pack)}
                      className="px-3 bg-white/10 border border-white/10 rounded-xl text-white/70 hover:text-white"
                    >
                      Editar
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="glass rounded-xl p-3 text-xs text-white/50 border border-amber-500/20 bg-amber-500/10">
        <b>⚠ Nota:</b> "Aplicar" por ahora solo loguea los mods. Próximamente: copiar/symlink a <code className="bg-black/30 px-1 rounded">mods/</code> activo + perfiles por versión.
      </div>
    </div>
  )
}