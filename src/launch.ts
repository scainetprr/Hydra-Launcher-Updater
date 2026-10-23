import { useStore } from './store/launcherStore'

export type QuickServer = { ip: string; port?: number } | null

export async function launchGame(server: QuickServer = null): Promise<boolean> {
  const { selectedVersion, loader, activeAccount, accounts, config, set, addLog } = useStore.getState()
  const acct = activeAccount || accounts[0]
  if (!acct) {
    const msg = 'No hay cuenta seleccionada. Crea una cuenta offline o Microsoft en Cuentas antes de jugar.'
    addLog(msg)
    alert(msg)
    return false
  }
  set({ launching: true })
  addLog(`Lanzando ${selectedVersion} (${loader}) como ${acct.name}${server ? ` -> ${server.ip}` : ''}...`)
  try {
    const res = await window.api.launch({
      version: selectedVersion, loader,
      account: acct, ram: config.ram, javaPath: config.javaPath,
      server: server ? { ip: server.ip, port: server.port || 25565 } : null
    })
    if (!res.ok) {
      addLog(`Error: ${res.error}`)
      // el aviso de "instancia en curso" ya lo mostró el launcher con un dialogo nativo
      if (res.alreadyRunning) { set({ launching: false }); return false }
      alert(`Fallo al lanzar:\n${res.error}\n\nRevisa Ajustes -> Logs\nPrueba Version estable 1.21.1 y Java auto.`)
      set({ launching: false })
      return false
    }
    addLog(`Minecraft iniciado PID ${res.pid || ''}`)
    set({ launching: false })
    return true
  } catch (e: any) {
    addLog(`Excepcion: ${String(e)}`)
    alert(String(e))
    set({ launching: false })
    return false
  }
}
