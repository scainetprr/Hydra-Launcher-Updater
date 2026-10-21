import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import axios from 'axios'
import { execSync, exec, spawn } from 'child_process'
import net from 'net'
import { autoUpdater } from 'electron-updater'
import { discordSetActivity, discordClearActivity, discordShutdown } from './discord'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// polyfill para CJS deps bundleadas (minecraft-launcher-core usa __dirname)
if (!(globalThis as any).__dirname) (globalThis as any).__dirname = __dirname
if (!(globalThis as any).__filename) (globalThis as any).__filename = __filename

let win: BrowserWindow | null = null

// Sesiones de Minecraft en curso (una por cuenta de usuario; se bloquea repetir la MISMA cuenta)
let mcSessions: { name: string; info: string }[] = []
// Una sola instancia del launcher: si el jugador abre Hydra de nuevo, se enfoca la primera
if (!app.requestSingleInstanceLock()) {
  app.quit()
}
app.on('second-instance', () => {
  try { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus() } } catch {}
})

// Auto-updater config
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.logger = console
// Ahora usa .minecraft original para enlazar todo como launcher normal
const MINECRAFT_ROOT = path.join(app.getPath('appData'), '.minecraft')
const ROOT = MINECRAFT_ROOT // versiones, assets, libraries, resourcepacks, etc. compartidos
const HYDRA_DIR = path.join(app.getPath('appData'), '.hydralauncher') // config Hydra (fallback)
const CONFIG_PATH = path.join(MINECRAFT_ROOT, 'hydra-config.json')
const ACCOUNTS_PATH = path.join(MINECRAFT_ROOT, 'hydra-accounts.json')
const LEGACY_CONFIG = path.join(HYDRA_DIR, 'config.json')
const LEGACY_ACCOUNTS = path.join(HYDRA_DIR, 'accounts.json')

// migrar config vieja .hydralauncher -> .minecraft si existe
try {
  if (fs.existsSync(LEGACY_CONFIG) && !fs.existsSync(CONFIG_PATH)) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
    fs.copyFileSync(LEGACY_CONFIG, CONFIG_PATH)
  }
  if (fs.existsSync(LEGACY_ACCOUNTS) && !fs.existsSync(ACCOUNTS_PATH)) {
    fs.copyFileSync(LEGACY_ACCOUNTS, ACCOUNTS_PATH)
  }
} catch {}
// .minecraft puede ser un junction a otra unidad (D:) que tarda en montarse al
// arrancar; si mkdirSync falla no debe crashear el proceso principal.
try { if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true }) } catch (e) { console.error('[main] no se pudo crear ROOT:', e) }
try { if (!fs.existsSync(HYDRA_DIR)) fs.mkdirSync(HYDRA_DIR, { recursive: true }) } catch (e) { console.error('[main] no se pudo crear HYDRA_DIR:', e) }

function createWindow() {
  const preloadCandidates = [path.join(__dirname, 'preload.mjs'), path.join(__dirname, 'preload.js')]
  const preloadPath = preloadCandidates.find(p => fs.existsSync(p)) || preloadCandidates[0]
  console.log('[main] preload:', preloadPath, 'exists:', fs.existsSync(preloadPath))
  console.log('[main] VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL)
  win = new BrowserWindow({
    width: 1280, height: 780, minWidth: 1100, minHeight: 680,
    frame: false, backgroundColor: '#07070a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true, nodeIntegration: false,
      webSecurity: true
    },
    icon: path.join(process.cwd(), 'public/icon.png')
  })
  // Con una sesión de Minecraft abierta, cerrar la ventana no cierra Hydra: se oculta
  // a segundo para no matar el juego; vuelve a aparecer cuando el juego termina.
  win.on('close', (e) => {
    if (mcSessions.length > 0) {
      e.preventDefault()
      console.log('[win] juego en curso — se oculta en vez de cerrar')
      try { win?.hide() } catch {}
    }
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.error('[did-fail-load]', code, desc, url))
  win.webContents.on('console-message', (_e, level, msg) => console.log('[renderer]', msg))
  win.webContents.on('did-finish-load', () => {
    try {
      let z = 0.8
      const cfg = readConfigFile()
      if (cfg?.uiZoom) z = Number(cfg.uiZoom) || 0.8
      win?.webContents.setZoomFactor(z)
    } catch {}
  })
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const htmlPath = path.join(__dirname, '../dist/app.html')
    console.log('[main] loadFile', htmlPath, fs.existsSync(htmlPath))
    win.loadFile(htmlPath)
    // win.webContents.openDevTools({ mode: 'detach' })
  }

  // Ctrl + / Ctrl - / Ctrl 0: zoom de la UI (se guarda en config)
  const applyZoom = (delta: number | null) => {
    try {
      const cw = win!.webContents
      let z = delta === null ? 0.8 : Math.min(1.5, Math.max(0.6, Math.round((cw.getZoomFactor() + delta) * 100) / 100))
      cw.setZoomFactor(z)
      const cfg = readConfigFile() || {}
      cfg.uiZoom = z
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
      win?.webContents.send('zoom-changed', z)
    } catch {}
  }
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.control) return
    if (input.key === '=' || input.key === '+') { applyZoom(0.1); e.preventDefault() }
    else if (input.key === '-') { applyZoom(-0.1); e.preventDefault() }
    else if (input.key === '0') { applyZoom(null); e.preventDefault() }
  })
}

// --- MINI SPLASH: red + actualizaciones + versiones antes de abrir ---
let splashWin: BrowserWindow | null = null
let startupUpdateCheck = false
let splashUpdateResolved = false
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function splashSetStep(step: string, state: 'run' | 'done' | 'err', text?: string) {
  if (!splashWin || splashWin.isDestroyed()) return
  const js = `window.__setStep && window.__setStep(${JSON.stringify(step)},${JSON.stringify(state)},${text !== undefined ? JSON.stringify(text) : 'null'}); true`
  splashWin.webContents.executeJavaScript(js).catch(() => {})
}

async function checkNetworkOnline(): Promise<boolean> {
  const hosts = ['https://github.com', 'https://api.modrinth.com']
  for (const h of hosts) {
    try { await axios.head(h, { timeout: 4000, validateStatus: () => true }); return true } catch {}
  }
  return false
}

function primaryIfaceName(): string {
  try {
    const ifs = os.networkInterfaces()
    for (const name of Object.keys(ifs)) {
      const list = ifs[name] || []
      if (list.some(i => !i.internal && i.family === 'IPv4')) return name
    }
  } catch {}
  return ''
}

function scanInstalledVersionCount(): number {
  try {
    const vDir = path.join(ROOT, 'versions')
    if (!fs.existsSync(vDir)) return 0
    return fs.readdirSync(vDir).filter(d => {
      try { return fs.statSync(path.join(vDir, d)).isDirectory() } catch { return false }
    }).length
  } catch { return 0 }
}

function createMiniSplash(): BrowserWindow {
  const sp = new BrowserWindow({
    width: 430, height: 262, frame: false, resizable: false, movable: false,
    center: true, show: false, alwaysOnTop: true, skipTaskbar: true,
    backgroundColor: '#07070a',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  sp.setMenuBarVisibility(false)

  let logoTag = '<div class="logo fallback">◆</div>'
  const logoCandidates = [
    path.join(__dirname, '../dist/hydra-logo.png'),
    path.join(process.cwd(), 'dist/hydra-logo.png'),
    path.join(process.cwd(), 'public/hydra-logo.png'),
  ]
  for (const p of logoCandidates) {
    try {
      if (fs.existsSync(p)) {
        logoTag = `<img class="logo" src="data:image/png;base64,${fs.readFileSync(p).toString('base64')}">`
        break
      }
    } catch {}
  }

  let ver = ''
  try { ver = app.getVersion() } catch {}
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{background:linear-gradient(145deg,#07070a 0%,#0b0b14 50%,#07070a 100%);color:#fff;font-family:'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;-webkit-app-region:drag;user-select:none;position:relative}
.logo{width:56px;height:56px;border-radius:14px;background:#000;border:1px solid rgba(255,255,255,.1);padding:7px;object-fit:contain;box-shadow:0 0 34px rgba(124,58,237,.55)}
.logo.fallback{display:grid;place-items:center;font-size:22px;color:#a78bfa}
.t1{margin-top:10px;font-size:17px;font-weight:900;letter-spacing:.5px;background:linear-gradient(90deg,#a78bfa,#22d3ee,#f472b6);-webkit-background-clip:text;background-clip:text;color:transparent}
.t2{margin-top:3px;font-size:8.5px;letter-spacing:2.5px;color:rgba(255,255,255,.42)}
.badge{position:absolute;top:9px;right:12px;font-size:9.5px;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.6)}
.rows{margin-top:15px;width:300px;display:flex;flex-direction:column;gap:8px}
.row{display:flex;align-items:center;gap:9px;font-size:11px;color:rgba(255,255,255,.75)}
.ico{width:13px;height:13px;border-radius:50%;flex:0 0 13px;position:relative}
.row[data-s=run] .ico{border:2px solid rgba(255,255,255,.15);border-top-color:#a78bfa;animation:sp .8s linear infinite}
.row[data-s=done] .ico{background:rgba(52,211,153,.16);border:1px solid rgba(52,211,153,.55)}
.row[data-s=done] .ico:after{content:'\\2713';position:absolute;inset:0;display:grid;place-items:center;font-size:8px;color:#34d399;font-weight:700}
.row[data-s=err] .ico{background:rgba(248,113,113,.16);border:1px solid rgba(248,113,113,.55)}
.row[data-s=err] .ico:after{content:'!';position:absolute;inset:0;display:grid;place-items:center;font-size:8px;color:#f87171;font-weight:700}
@keyframes sp{to{transform:rotate(360deg)}}
.bar{margin-top:15px;width:300px;height:4px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden}
.fill{height:100%;width:4%;background:linear-gradient(90deg,#7c3aed,#22d3ee);transition:width .45s ease;box-shadow:0 0 8px rgba(124,58,237,.8)}
.stat{margin-top:6px;width:300px;display:flex;justify-content:space-between;font-size:9.5px;color:rgba(255,255,255,.45)}
</style></head><body>
${logoTag}
<div class="t1">HYDRA LAUNCHER</div>
<div class="t2">CORTA UNA CABEZA • NACEN DOS</div>
<div class="badge">v${ver}</div>
<div class="rows">
  <div class="row" id="s-wifi" data-s="run"><span class="ico"></span><span class="tx">Verificando conexión a internet…</span></div>
  <div class="row" id="s-update" data-s="run"><span class="ico"></span><span class="tx">Buscando actualizaciones…</span></div>
  <div class="row" id="s-versions" data-s="run"><span class="ico"></span><span class="tx">Escaneando .minecraft/versions…</span></div>
</div>
<div class="bar"><div class="fill" id="fill"></div></div>
<div class="stat"><span id="stat">Preparando…</span><span id="pct">0%</span></div>
<script>
var done=0;
window.__setStep=function(id,st,tx){
  var r=document.getElementById('s-'+id); if(!r)return;
  r.setAttribute('data-s',st);
  if(tx!==null&&tx!==undefined){var t=r.querySelector('.tx'); if(t)t.textContent=tx;}
  if((st==='done'||st==='err')&&!r.dataset.f){
    r.dataset.f='1'; done++;
    var pct=Math.min(100,Math.round(done/3*100));
    document.getElementById('fill').style.width=pct+'%';
    document.getElementById('pct').textContent=pct+'%';
    if(done>=3)document.getElementById('stat').textContent='¡Listo!';
  }
};
</script></body></html>`

  sp.loadURL('data:text/html;base64,' + Buffer.from(html, 'utf-8').toString('base64'))
  sp.once('ready-to-show', () => { try { if (!sp.isDestroyed()) sp.show() } catch {} })
  splashWin = sp
  return sp
}

async function runStartupSplashChecks(sp: BrowserWindow, isDev: boolean): Promise<void> {
  splashWin = sp
  const t0 = Date.now()

  // 1) WiFi / internet (en paralelo con el resto)
  const wifiP = (async () => {
    const online = await checkNetworkOnline()
    if (online) {
      const iface = primaryIfaceName()
      splashSetStep('wifi', 'done', iface ? `Conectado — ${iface}` : 'Conectado a internet')
    } else {
      splashSetStep('wifi', 'err', 'Sin conexión a internet')
    }
    return online
  })()

  // 2) Versiones en .minecraft/versions (lectura local, instantánea)
  const versionsP = (async () => {
    const n = scanInstalledVersionCount()
    splashSetStep('versions', n > 0 ? 'done' : 'done',
      n > 0 ? `${n} versión${n === 1 ? '' : 'es'} instalada${n === 1 ? '' : 's'}` : 'Sin versiones instaladas')
    return n
  })()

  // 3) Actualizaciones
  const online = await wifiP
  if (isDev) {
    splashSetStep('update', 'done', 'Modo desarrollo — omitido')
  } else if (!online) {
    splashSetStep('update', 'err', 'Sin conexión — se reintentará')
  } else {
    startupUpdateCheck = true
    splashSetStep('update', 'run', 'Buscando actualizaciones…')
    const p = autoUpdater.checkForUpdates().then(() => {}).catch(() => {})
    await Promise.race([p, sleep(8000)])
    // si en 8s no hubo respuesta (evento update-*), marcar como no verificado
    if (!splashUpdateResolved) splashSetStep('update', 'err', 'Sin respuesta — se reintentará en 30 min')
  }

  await versionsP

  const elapsed = Date.now() - t0
  if (elapsed < 1800) await sleep(1800 - elapsed) // mínimo visible para que no parpadee
}

app.whenReady().then(async () => {
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  const shot = !!process.env.HYDRA_SHOT

  // Actualización detectada → limpieza total de archivos del launcher (conserva solo .minecraft)
  if (!isDev && !shot) wipeLauncherFilesOnUpdate()

  // Auto-updater en producción (registrado antes de cualquier chequeo)
  if (!isDev) {
    autoUpdater.on('update-available', (info) => {
      console.log('[autoUpdater] update available:', info.version)
      pendingUpdate = { available: info, downloaded: null }
      win?.webContents.send('update-available', info)
      splashUpdateResolved = true
      splashSetStep('update', 'done', `Nueva versión v${info.version} disponible`)
    })
    autoUpdater.on('update-not-available', () => {
      splashUpdateResolved = true
      splashSetStep('update', 'done', `Launcher actualizado (v${app.getVersion()})`)
    })
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[autoUpdater] update downloaded:', info.version)
      pendingUpdate = { available: pendingUpdate?.available || info, downloaded: info }
      win?.webContents.send('update-downloaded', info)
      splashUpdateResolved = true
      splashSetStep('update', 'done', `v${info.version} descargada — lista para instalar`)
    })
    autoUpdater.on('error', (err) => {
      console.error('[autoUpdater] error:', err)
      splashUpdateResolved = true
      splashSetStep('update', 'err', 'No se pudo verificar (se reintentará)')
    })
  }

  // Mini splash: WiFi + actualizaciones + versiones antes de abrir
  let sp: BrowserWindow | null = null
  if (!shot) {
    try {
      sp = createMiniSplash()
      await runStartupSplashChecks(sp, isDev)
    } catch (e) { console.error('[splash]', e) }
  }

  createWindow()

  if (sp) {
    // cerrar el splash recién cuando la ventana principal ya cargó
    await new Promise<void>(resolve => {
      let settled = false
      const fin = () => { if (!settled) { settled = true; resolve() } }
      win?.webContents.once('did-finish-load', () => setTimeout(fin, 400))
      setTimeout(fin, 3000)
    })
    try { if (!sp.isDestroyed()) sp.close() } catch {}
    if (splashWin === sp) splashWin = null
  }

  setTimeout(() => setIdlePresence(), 3500)
  // Auto-updater en producción
  if (!isDev) {
    if (!startupUpdateCheck) autoUpdater.checkForUpdatesAndNotify().catch(() => {})
    // re-chequeo periodico: si el launcher quedó abierto no debe perderse una actualización
    setInterval(() => { autoUpdater.checkForUpdates().catch(() => {}) }, 30 * 60 * 1000)
    let lastFocusCheck = 0
    win?.on('focus', () => {
      const now = Date.now()
      if (now - lastFocusCheck > 10 * 60 * 1000) {
        lastFocusCheck = now
        autoUpdater.checkForUpdates().catch(() => {})
      }
    })
  }
  if (process.env.HYDRA_SHOT) {
    setTimeout(async () => {
      try {
        const tab = process.env.HYDRA_SHOT_TAB || 'home'
        await win?.webContents.executeJavaScript(`document.querySelector('[data-tab="${tab}"]')?.click(); true`)
        await new Promise(r => setTimeout(r, 800))
        const sub = process.env.HYDRA_SHOT_SUB
        if (sub) await win?.webContents.executeJavaScript(`document.querySelector('[data-tab-sub="${sub}"]')?.click(); true`)
        await new Promise(r => setTimeout(r, sub ? 5500 : 3700))
        const img = await win?.webContents.capturePage()
        if (img) fs.writeFileSync(process.env.HYDRA_SHOT!, img.toPNG())
      } catch (e) { console.error('[shot]', e) }
      app.exit(0)
    }, 4000)
  }
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && mcSessions.length === 0) app.quit() })
app.on('before-quit', () => { try { discordShutdown() } catch {} })

// --- WINDOW ---
ipcMain.handle('win:min', () => win?.minimize())
ipcMain.handle('win:max', () => win?.isMaximized() ? win?.unmaximize() : win?.maximize())
ipcMain.handle('win:close', () => win?.close())

// --- AUTO-UPDATER ---
let pendingUpdate: { available: any; downloaded: any } | null = null
ipcMain.handle('get-update-state', () => pendingUpdate)
ipcMain.handle('check-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, updateInfo: result?.updateInfo }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
})
ipcMain.handle('install-update', async (_e, opts: any) => {
  try { if (opts?.cleanupOld !== false) cleanupOldInstallers(app.getVersion()) } catch {}
  try {
    // descargar primero si aún no está descargada (quitAndInstall solo sirve con NSIS ya descargado)
    if (!pendingUpdate?.downloaded) {
      autoUpdater.autoDownload = true
      await autoUpdater.downloadUpdate()
    }
    const file: string | undefined = (autoUpdater as any).downloadedUpdateHelper?.file
    if (!file || !fs.existsSync(file)) throw new Error('No se encontró el instalador descargado')
    // nuestro instalador es Inno Setup: usar flags de Inno, no los de NSIS (/S)
    autoUpdater.autoInstallOnAppQuit = false // evitar doble instalador al salir
    const child = spawn(file, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'], {
      detached: true, stdio: 'ignore', windowsHide: false
    })
    child.unref()
    setTimeout(() => { try { app.quit() } catch {} }, 1200)
    return { ok: true }
  } catch (e: any) {
    console.error('[install-update]', e)
    return { ok: false, error: e?.message || String(e) }
  }
})
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('set-zoom', (_e, z: number) => {
  try { win?.webContents.setZoomFactor(Number(z) || 0.8); return true } catch { return false }
})

// --- CONFIG ---
const SERVERS_VERSION = 2

function readConfigFile(): any {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {}
  return null
}

ipcMain.handle('get-config', () => {
  const base = { ram: { min: '1G', max: '4G' }, javaPath: '', resolution: { w: 854, h: 480 }, servers: defaultServers.map(s=>({...s})), serversVersion: SERVERS_VERSION, cleanupOldOnUpdate: true, uiZoom: 0.8, curseforgeKey: '', lastVersion: '26.2', lastLoader: 'vanilla', lastAccountUuid: '', setupDone: false }
  const cfg = readConfigFile()
  if (!cfg) return base
  if (!cfg.lastVersion) cfg.lastVersion = '26.2'
  if (!cfg.lastLoader) cfg.lastLoader = 'vanilla'
  if (cfg.serversVersion !== SERVERS_VERSION) {
    cfg.servers = defaultServers.map(s=>({...s}))
    cfg.serversVersion = SERVERS_VERSION
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)) } catch {}
  }
  if (cfg.cleanupOldOnUpdate === undefined) cfg.cleanupOldOnUpdate = true
  if (!cfg.uiZoom) cfg.uiZoom = 0.8
  if (cfg.curseforgeKey === undefined) cfg.curseforgeKey = ''
  // migracion: usuarios con config previa ya usan el launcher → no mostrar setup de 1ra vez
  if (cfg.setupDone === undefined) cfg.setupDone = true
  return cfg
})
ipcMain.handle('save-config', (_e, c) => { fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2)); setIdlePresence(c); return true })

// Presencia en Discord mientras el launcher está abierto (sin partida en curso)
let lastIdleAt = 0
function setIdlePresence(cfg?: any): void {
  try {
    const now = Date.now()
    if (now - lastIdleAt < 900) return
    lastIdleAt = now
    const c = cfg || readConfigFile()
    if (!c?.discordClientId) { discordClearActivity(); return }
    const servers: any[] = (c.servers?.length ? c.servers : defaultServers)
    const s = servers.find((x: any) => x.id === 'hyperhard') || servers[0]
    const label = s ? (s.id === 'hyperhard' ? 'HyperHard Network' : s.name) : ''
    const ip = s?.ip || ''
    discordSetActivity(String(c.discordClientId), {
      details: 'Jugando a Hydra Launcher',
      state: ip ? `${label} • ${ip}` : 'Menú principal',
      buttons: [{ label: 'Hydra Launcher', url: 'https://launcher.hyperhard.space/' }],
      instance: false
    }).catch(() => {})
  } catch {}
}
ipcMain.handle('get-accounts', () => fs.existsSync(ACCOUNTS_PATH) ? JSON.parse(fs.readFileSync(ACCOUNTS_PATH,'utf-8')) : [])
ipcMain.handle('save-accounts', (_e, a) => { fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(a,null,2)); return true })

// --- VERSIONS (Mojang manifest) ---
// Caché en disco: sin wifi igual se sirve la última lista conocida (nunca lanza excepción).
const VERSIONS_CACHE = path.join(HYDRA_DIR, 'version_manifest_v2.json')
ipcMain.handle('get-versions', async () => {
  try {
    const { data } = await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { timeout: 8000 })
    try { fs.writeFileSync(VERSIONS_CACHE, JSON.stringify(data)) } catch {}
    return data // { latest, versions: [{id,type,url,releaseTime}] }
  } catch {
    try { if (fs.existsSync(VERSIONS_CACHE)) return JSON.parse(fs.readFileSync(VERSIONS_CACHE, 'utf-8')) } catch {}
    return { latest: { release: '', snapshot: '' }, versions: [], offline: true }
  }
})
ipcMain.handle('get-fabric', async (_e, mc: string) => {
  try {
    const { data } = await axios.get(`https://meta.fabricmc.net/v2/versions/loader/${mc}`, { timeout: 6000 })
    return data
  } catch { return [] }
})
ipcMain.handle('get-forge', async (_e, mc:string) => {
  try {
    // Prism meta da versiones forge por mc
    const { data } = await axios.get(`https://meta.prismlauncher.net/v1/net.minecraftforge/${mc}.json`, { timeout: 6000 }).catch(async ()=> {
      // fallback a maven metadata
      const m = await axios.get(`https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json`, { timeout: 6000 })
      return { data: m.data }
    })
    return data
  } catch { return [] }
})

// --- FABRIC INSTALLER ---
// Reutiliza instalaciÃ³n existente para no sobrescribir cada vez.
// Busca fabric-loader-*-<mc> ya instalados y usa el loader mÃ¡s nuevo.
async function installFabric(mcVersion: string, send: (m:string)=>void): Promise<string> {
  const vDir = path.join(ROOT, 'versions')
  try {
    if (fs.existsSync(vDir)) {
      const existing = fs.readdirSync(vDir).filter(d => {
        const low = d.toLowerCase()
        return low.startsWith('fabric-loader-') && d.endsWith(`-${mcVersion}`) && fs.statSync(path.join(vDir, d)).isDirectory()
      })
      if (existing.length) {
        // ordena por versiÃ³n de loader desc (0.19.5 > 0.19.3)
        existing.sort().reverse()
        const pick = existing[0]
        const jsonPath = path.join(vDir, pick, `${pick}.json`)
        if (fs.existsSync(jsonPath)) {
          try {
            const j = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
            send(`  Fabric reutilizado: ${pick} (mainClass=${j.mainClass || '?'})`)
            return pick
          } catch { /* cae a descargar */ }
        }
      }
    }
  } catch {}
  send(`  Fabric: buscando loader para ${mcVersion}...`)
  const { data: loaders } = await axios.get(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`, { timeout: 8000 })
  if (!loaders || !loaders.length) throw new Error(`No hay Fabric loader para ${mcVersion}`)
  const loaderVer = loaders[0].loader.version
  send(`  Fabric loader ${loaderVer} encontrado`)
  const { data: profile } = await axios.get(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVer}/profile/json`, { timeout: 8000 })
  const customId: string = profile.id // ej fabric-loader-0.16.9-26.2
  const dir = path.join(ROOT, 'versions', customId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const jsonPath = path.join(dir, `${customId}.json`)
  // solo escribe si no existe o cambiÃ³ el id, para no romper instalaciÃ³n que ya funciona
  if (!fs.existsSync(jsonPath)) {
    fs.writeFileSync(jsonPath, JSON.stringify(profile, null, 2))
  }
  send(`  Fabric instalado: ${customId} (mainClass=${profile.mainClass})`)
  return customId
}

async function installForge(mcVersion: string, send: (m:string)=>void): Promise<string> {
  send(`  Forge: buscando versiones para ${mcVersion}...`)
  // intenta Prism meta
  try {
    const { data } = await axios.get(`https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json`, { timeout: 8000 })
    const key = `${mcVersion}-recommended` in data.promos ? `${mcVersion}-recommended` : `${mcVersion}-latest`
    const forgeVer = data.promos[key]
    if (!forgeVer) throw new Error('no promo')
    const fullVer = `${mcVersion}-${forgeVer}`
    send(`  Forge ${fullVer} encontrado (promo ${key})`)
    // descargar installer json vÃ­a maven? Para MCLC necesitamos wrapper, simplificamos creando custom json bÃ¡sico
    // Descargamos version json de Forge desde Prism
    const { data: forgeJson } = await axios.get(`https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVer}/forge-${fullVer}.json`, { timeout: 8000 }).catch(()=>({data:null}))
    if (forgeJson) {
      // no es el profile, pero intentamos guardar
    }
    // Fallback: crear custom id y dejar que MCLC lo intente con wrapper (requiere jar)
    // Descargamos el universal jar para usar con options.forge
    const jarUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVer}/forge-${fullVer}-universal.jar`
    const forgeDir = path.join(ROOT, 'forge', fullVer)
    if (!fs.existsSync(forgeDir)) fs.mkdirSync(forgeDir, { recursive: true })
    const jarPath = path.join(forgeDir, `forge-${fullVer}.jar`)
    if (!fs.existsSync(jarPath)) {
      send(`  Descargando Forge jar...`)
      const res = await axios.get(jarUrl, { responseType: 'arraybuffer', timeout: 30000 })
      fs.writeFileSync(jarPath, Buffer.from(res.data))
      send(`  Forge jar guardado`)
    }
    // Creamos un custom json que hereda de mcVersion
    const customId = `forge-${fullVer}`
    const dir = path.join(ROOT, 'versions', customId)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    // intentamos obtener vanilla json para heredar
    // Por ahora retornamos el jar path para usar con options.forge
    return jarPath // seÃ±al especial
  } catch (e:any) {
    throw new Error(`Forge no disponible para ${mcVersion}: ${e.message}`)
  }
}

// --- JAVA detect (usa JAVA_HOME y Adoptium) ---
// --- JAVA GESTIONADO (Adoptium Temurin auto-descargado por Hydra) ---
const MANAGED_JAVA_DIR = path.join(HYDRA_DIR, 'java')

function getManagedJavaExe(major?: number): string {
  try {
    if (!fs.existsSync(MANAGED_JAVA_DIR)) return ''
    for (const d of fs.readdirSync(MANAGED_JAVA_DIR)) {
      if (major && d !== String(major)) continue
      const p = path.join(MANAGED_JAVA_DIR, d, 'bin', 'java.exe')
      if (fs.existsSync(p)) return p
    }
  } catch {}
  return ''
}

function javaVersionStr(jp: string): string {
  try {
    // java -version escribe a stderr → redirigir 2>&1
    const out = execSync(`"${jp}" -version 2>&1`, { encoding: 'utf-8' })
    const m = out.match(/version "([^"]+)"/) || out.match(/openjdk ([^\s"]+)/i)
    return m ? m[1] : ''
  } catch { return '' }
}

function javaMajorOf(jp: string): number {
  try {
    const out = execSync(`"${jp}" -version 2>&1`, { encoding: 'utf-8' })
    const m = out.match(/version "(\d+)(?:[._]|")/) || out.match(/openjdk (\d+)/i) || out.match(/(\d+)\.\d+\.\d+/)
    if (m) { const v = parseInt(m[1], 10); return v === 1 ? 8 : v } // "1.8.0" → Java 8
  } catch {}
  return 0
}

// MC 1.20.5+ necesita Java 21; 1.18–1.20.4 Java 17; más viejo Java 8
function mcNeedsJavaMajor(ver: string): number {
  const m = String(ver).match(/^1\.(\d+)/)
  if (!m) return 21 // snapshots / 26.x modernos
  const minor = parseInt(m[1], 10)
  if (minor > 20) return 21
  if (minor === 20) {
    const patch = parseInt(String(ver).split('.')[2] || '0', 10)
    return patch >= 5 ? 21 : 17
  }
  if (minor >= 18) return 17
  return 8
}

async function installManagedJava(major: number, send: (m: string) => void): Promise<{ ok: boolean; javaPath: string; error?: string }> {
  try {
    const existing = getManagedJavaExe(major)
    if (existing) return { ok: true, javaPath: existing }
    const dest = path.join(MANAGED_JAVA_DIR, String(major))
    fs.mkdirSync(dest, { recursive: true })
    const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/windows/x64/jre/hotspot/normal/eclipse`
    send(`  Descargando Adoptium Temurin ${major} JRE (~45 MB), puede tardar segun tu internet...`)
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 600000 })
    const zipPath = path.join(HYDRA_DIR, `temurin-${major}.zip`)
    fs.writeFileSync(zipPath, Buffer.from(res.data))
    send('  Extrayendo Java...')
    const AdmZip = (await import('adm-zip')).default
    const tmp = path.join(HYDRA_DIR, `java-tmp-${major}`)
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
    new AdmZip(zipPath).extractAllTo(tmp, true)
    const sub = fs.readdirSync(tmp).find(e => fs.statSync(path.join(tmp, e)).isDirectory())
    if (!sub) throw new Error('El paquete de Java vino vacio')
    try { fs.rmSync(dest, { recursive: true, force: true }) } catch {}
    fs.cpSync(path.join(tmp, sub), dest, { recursive: true })
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
    try { fs.rmSync(zipPath, { force: true }) } catch {}
    const javaPath = path.join(dest, 'bin', 'java.exe')
    if (!fs.existsSync(javaPath)) throw new Error('java.exe no encontrado tras extraer')
    send(`  ✓ Java ${major} instalado (${javaVersionStr(javaPath) || major})`)
    return { ok: true, javaPath }
  } catch (e: any) {
    const msg = String(e?.response?.status ? `HTTP ${e.response.status} en la descarga` : (e?.message || e))
    return { ok: false, javaPath: '', error: msg }
  }
}

// Pide permiso al usuario ANTES de descargar una Java que no tiene (propuesta de uso):
// si ya está instalada la usa sin molestar; si falta, ventana emergente explicando qué y por qué.
async function ensureManagedJava(major: number, mcVer: string, send: (m: string) => void): Promise<{ ok: boolean; javaPath: string; error?: string }> {
  const existing = getManagedJavaExe(major)
  if (existing) return { ok: true, javaPath: existing }
  const box: any = {
    type: 'question',
    buttons: [`Sí, instalar Java ${major} y jugar`, 'Ahora no'],
    defaultId: 0,
    cancelId: 1,
    title: 'Hydra Launcher — Java requerida',
    message: `Para jugar Minecraft ${mcVer} necesitas Java ${major}.`,
    detail: `En tu PC no se encontró Java ${major} (las versiones antiguas, como Java 8, no sirven para esta versión).\n\nHydra puede instalar Adoptium Temurin ${major} — gratuita, ~45 MB, sin permisos de administrador y solo se hace una vez. ¿La instalamos ahora?`,
    noLink: true
  }
  let accept = false
  try {
    const w = win && !win.isDestroyed() ? win : undefined
    const r = w ? await dialog.showMessageBox(w, box) : await dialog.showMessageBox(box)
    accept = r.response === 0
  } catch { accept = false }
  if (!accept) {
    return { ok: false, javaPath: '', error: `Se necesita Java ${major} para jugar ${mcVer} y declinaste la instalación automática.\n\nPuedes instalarla tú mismo desde https://adoptium.net/temurin/releases/ (JRE ${major}, Windows x64) o vuelve a intentarlo y acepta en la ventana.` }
  }
  send(`  ✓ Instalación aceptada — descargando Adoptium Temurin ${major}...`)
  return installManagedJava(major, send)
}

ipcMain.handle('get-pc-scan', async () => {
  const managed = getManagedJavaExe()
  const all = findJavaCandidates()
  const system = all.filter(p => !p.startsWith(MANAGED_JAVA_DIR))
  let version = '', major = 0
  if (all.length) { version = javaVersionStr(all[0]); major = javaMajorOf(all[0]) }
  let gpu = ''
  try {
    gpu = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)"', { encoding: 'utf-8', timeout: 8000 }).trim().split('\n')[0].trim()
  } catch {}
  return {
    ram: { totalGB: Math.floor(os.totalmem() / (1024 * 1024 * 1024)), freeGB: Math.floor(os.freemem() / (1024 * 1024 * 1024)) },
    java: { found: all.length > 0, system, managed, path: all[0] || '', version, major },
    gpu
  }
})

ipcMain.handle('install-java', async (_e, opts: any) => {
  const major = Number(opts?.major) || 21
  const send = (m: string) => { try { win?.webContents.send('launch-log', m) } catch {} }
  return await installManagedJava(major, send)
})

ipcMain.handle('open-external', (_e, url: string) => {
  try { shell.openExternal(url); return true } catch { return false }
})

// caché corta: `where java`/`java -version` son execSync y bloquean el proceso principal
// (la ventana se marcaba "No responde" en cada lanzamiento). Re-detecta cada 60s o si no hay ninguna.
let javaScanAt = 0
let javaScanList: string[] = []
function findJavaCandidates(): string[] {
  const now = Date.now()
  if (javaScanList.length && now - javaScanAt < 60000) return javaScanList
  const c: string[] = []
  const managed = getManagedJavaExe()
  if (managed) c.push(managed)
  const envJava = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : ''
  if (envJava && fs.existsSync(envJava)) c.push(envJava)
  const adoptium = 'C:\\Program Files\\Eclipse Adoptium'
  if (fs.existsSync(adoptium)) {
    fs.readdirSync(adoptium).forEach(d => {
      const p = path.join(adoptium, d, 'bin', 'java.exe')
      if (fs.existsSync(p)) c.push(p)
    })
  }
  // busca java en PATH
  try {
    const where = execSync('where java', { encoding:'utf-8' }).split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
    where.forEach(p=>{ if(fs.existsSync(p) && !c.includes(p)) c.push(p) })
  } catch {}
  // common jre locations
  const extra = ['C:\\Program Files\\Java', 'C:\\Program Files (x86)\\Java']
  extra.forEach(base=>{ if(fs.existsSync(base)) fs.readdirSync(base).forEach(d=>{ const p=path.join(base,d,'bin','java.exe'); if(fs.existsSync(p) && !c.includes(p)) c.push(p) }) })
  javaScanAt = now
  javaScanList = c
  return c
}
ipcMain.handle('detect-java', async () => findJavaCandidates())
ipcMain.handle('get-installed', async () => {
  try {
    const vDir = path.join(ROOT, 'versions')
    if (!fs.existsSync(vDir)) return []
    return fs.readdirSync(vDir).filter(d=> fs.statSync(path.join(vDir,d)).isDirectory())
  } catch { return [] }
})

// Detecta el loader real (fabric/forge/neoforge) de una version instalada.
// Prioriza hydraModpack.loader; si no, infiere desde mainClass y libraries del json.
function detectLoaderFromJson(j: any, id: string): string | null {
  const explicit = j?.hydraModpack?.loader
  if (explicit && typeof explicit === 'string') {
    const e = explicit.toLowerCase()
    if (e === 'fabric' || e === 'forge' || e === 'neoforge') return e
  }
  const mc = String(j?.mainClass || '').toLowerCase()
  if (mc.includes('fabric') || mc.includes('knotclient')) return 'fabric'
  if (mc.includes('neoforge')) return 'neoforge'
  if (mc.includes('forge') || mc.includes('cpw.mods') || mc.includes('launchwrapper')) {
    // launchwrapper es usado por forge antiguo y fabric viejo; refina con libraries
    const libs = Array.isArray(j?.libraries) ? j.libraries.map((l: any) => String(l?.name || '').toLowerCase()).join(' ') : ''
    if (libs.includes('fabric')) return 'fabric'
    if (libs.includes('neoforge')) return 'neoforge'
    if (libs.includes('forge')) return 'forge'
    return 'forge'
  }
  const libs = Array.isArray(j?.libraries) ? j.libraries.map((l: any) => String(l?.name || '').toLowerCase()).join(' ') : ''
  if (libs.includes('fabric-loader') || libs.includes('sponge-mixin')) return 'fabric'
  if (libs.includes('neoforge')) return 'neoforge'
  if (libs.includes('minecraftforge')) return 'forge'
  return detectLoaderFromId(id)
}
function detectLoaderFromId(id: string): string | null {
  const s = id.toLowerCase()
  if (s.includes('fabric')) return 'fabric'
  if (s.includes('neoforge')) return 'neoforge'
  if (s.includes('forge')) return 'forge'
  return null
}

// Retorna info completa de TODAS las versiones en disco (id, tipo json, si es válida)
// Esto permite al launcher detectar versiones instaladas por el usuario en el launcher oficial
ipcMain.handle('get-installed-versions-full', async () => {
  try {
    const vDir = path.join(ROOT, 'versions')
    if (!fs.existsSync(vDir)) return []
    const dirs = fs.readdirSync(vDir).filter(d=> fs.statSync(path.join(vDir,d)).isDirectory())
    const result = []
    for (const d of dirs) {
      const jsonPath = path.join(vDir, d, d + '.json')
      let type = 'vanilla'; let valid = false; let modpack: string | null = null; let loader: string | null = null; let base: string | null = null; let projectId: string | null = null
      if (fs.existsSync(jsonPath)) {
        try {
          const j = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
          type = j.type || 'vanilla'
          valid = true
          if (j.hydraModpack?.name) modpack = String(j.hydraModpack.name)
          if (j.hydraModpack?.base) base = String(j.hydraModpack.base)
          if (j.hydraModpack?.projectId) projectId = String(j.hydraModpack.projectId)
          loader = detectLoaderFromJson(j, d)
        } catch {}
      } else {
        loader = detectLoaderFromId(d)
      }
      result.push({ id: d, type, valid, modpack, loader, base, projectId })
    }
    return result
  } catch { return [] }
})

// devuelve el custom id exacto de fabric para un mc (el más nuevo instalado), o '' si no hay
ipcMain.handle('get-fabric-installed', async (_e, mc: string) => {
  try {
    const vDir = path.join(ROOT, 'versions')
    if (!fs.existsSync(vDir)) return ''
    const found = fs.readdirSync(vDir).filter(d => d.toLowerCase().startsWith('fabric-loader-') && d.endsWith(`-${mc}`) && fs.statSync(path.join(vDir, d)).isDirectory())
    if (!found.length) return ''
    found.sort().reverse()
    return found[0]
  } catch { return '' }
})
function getAllModsRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  let files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files = files.concat(getAllModsRecursive(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.jar')) {
      // ruta relativa a la carpeta mods
      const relPath = path.relative(path.join(ROOT, 'mods'), fullPath)
      files.push(relPath)
    }
  }
  return files
}

ipcMain.handle('get-mods-info', async () => {
  try {
    const mDir = path.join(ROOT, 'mods')
    if (!fs.existsSync(mDir)) return { count: 0, files: [] }
    const files = getAllModsRecursive(mDir)
    return { count: files.length, files: files.slice(0, 50) }
  } catch { return { count: 0, files: [] } }
})

// --- MODPACKS ---
const MODPACKS_PATH = path.join(ROOT, 'hydra-modpacks.json')

function loadModpacks(): any[] {
  try {
    if (fs.existsSync(MODPACKS_PATH)) {
      return JSON.parse(fs.readFileSync(MODPACKS_PATH, 'utf-8'))
    }
  } catch {}
  return []
}

function saveModpacks(packs: any[]): void {
  try {
    fs.writeFileSync(MODPACKS_PATH, JSON.stringify(packs, null, 2))
  } catch {}
}

ipcMain.handle('get-modpacks', async () => loadModpacks())

ipcMain.handle('save-modpack', async (_e, pack: any) => {
  const packs = loadModpacks()
  const existing = packs.findIndex(p => p.id === pack.id)
  if (existing >= 0) packs[existing] = pack
  else packs.push(pack)
  saveModpacks(packs)
  return { ok: true }
})

ipcMain.handle('delete-modpack', async (_e, id: string) => {
  const packs = loadModpacks().filter(p => p.id !== id)
  saveModpacks(packs)
  return { ok: true }
})

// Obtener mods de un modpack (rutas relativas)
ipcMain.handle('get-modpack-mods', async (_e, packId: string) => {
  const packs = loadModpacks()
  const pack = packs.find(p => p.id === packId)
  return pack?.mods || []
})

// Aplicar modpack: copiar/activar mods (para futuro: symlink o copiar a mods/ activo)
ipcMain.handle('apply-modpack', async (_e, packId: string) => {
  const packs = loadModpacks()
  const pack = packs.find(p => p.id === packId)
  if (!pack) return { ok: false, error: 'Modpack no encontrado' }
  // Por ahora solo retorna la lista; la UI decide qué hacer
  return { ok: true, mods: pack.mods }
})
ipcMain.handle('get-system-ram', async () => {
  const total = os.totalmem()
  const free = os.freemem()
  const gb = Math.floor(total / (1024*1024*1024))
  return { totalBytes: total, freeBytes: free, totalGB: gb }
})

// --- PING SERVER (simple TCP) ---
ipcMain.handle('ping-server', (_e, ip:string, port:number) => new Promise(res=>{
  const s = net.createConnection({host:ip, port: port||25565}, ()=>{ s.end(); res({online:true}) })
  s.on('error', ()=> res({online:false}))
  setTimeout(()=>{ try{s.destroy()}catch{}; res({online:false}) }, 1800)
}))

// --- MICROSOFT AUTH (msmc) ---
// Flujo correcto: Auth.launch -> Xbox -> getMinecraft -> mclc()
// Guardamos msRefresh (xbox.save) para refrescar sesiÃ³n antes de entrar a servidores premium.
ipcMain.handle('ms-login', async () => {
  try {
    const { Auth } = await import('msmc')
    const auth = new Auth('select_account')
    const xbox = await auth.launch('electron')
    const mc = await xbox.getMinecraft()
    // mclc() da el objeto listo para minecraft-launcher-core
    const mclcUser: any = (mc as any).mclc ? (mc as any).mclc(false) : null
    const profile = (mc as any).profile || {}
    const msRefresh: string = typeof (xbox as any).save === 'function' ? (xbox as any).save() : ''
    const mcRefresh: string = (mc as any).refreshTkn || ''
    const data = {
      name: mclcUser?.name || profile.name || 'Premium',
      uuid: (mclcUser?.uuid || profile.id || '').replace(/-/g, ''),
      access_token: mclcUser?.access_token || (mc as any).mcToken || '',
      client_token: mclcUser?.client_token || '',
      xuid: mclcUser?.meta?.xuid || (mc as any).xuid || '',
      user_properties: '{}',
      meta: { type: 'msa', demo: false, xuid: mclcUser?.meta?.xuid || (mc as any).xuid || '' },
      msRefresh, mcRefresh,
      exp: (mc as any).exp || 0
    }
    if (!data.access_token || !data.uuid) throw new Error('Microsoft no devolvió token/perfil (¿cerraste la ventana?)')
    return { ok: true, data }
  } catch(e:any){ return { ok:false, error: String(e?.message||e) } }
})

// Refresca sesión Microsoft usando el refresh token guardado. Devuelve MCLC user fresco o null.
async function refreshMicrosoft(msRefresh: string, send: (m:string)=>void): Promise<any|null> {
  if (!msRefresh) return null
  try {
    const { Auth } = await import('msmc')
    const auth = new Auth('select_account')
    send('  refrescando sesión Microsoft...')
    const xbox = await auth.refresh(msRefresh)
    const mc = await xbox.getMinecraft()
    const mclcUser: any = (mc as any).mclc ? (mc as any).mclc(false) : null
    const newRefresh: string = typeof (xbox as any).save === 'function' ? (xbox as any).save() : msRefresh
    const fresh = {
      name: mclcUser?.name || (mc as any).profile?.name || '',
      uuid: (mclcUser?.uuid || (mc as any).profile?.id || '').replace(/-/g, ''),
      access_token: mclcUser?.access_token || (mc as any).mcToken || '',
      client_token: mclcUser?.client_token || '',
      xuid: mclcUser?.meta?.xuid || (mc as any).xuid || '',
      msRefresh: newRefresh,
      mcRefresh: (mc as any).refreshTkn || '',
      exp: (mc as any).exp || 0
    }
    if (!fresh.access_token) { send('  âš  refresh sin access_token'); return null }
    // persiste el token fresco en hydra-accounts.json para la prÃ³xima
    try {
      if (fs.existsSync(ACCOUNTS_PATH)) {
        const arr = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf-8'))
        const idx = arr.findIndex((a:any)=>a.uuid===fresh.uuid || a.name===fresh.name)
        if (idx>=0) {
          arr[idx] = { ...arr[idx], ...fresh, type: 'microsoft' }
          fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(arr, null, 2))
          send('  token Microsoft actualizado en cuentas')
        }
      }
    } catch {}
    send(`  sesión fresca para ${fresh.name}`)
    return fresh
  } catch(e:any) {
    send(`  ⚠ no se pudo refrescar (${String(e?.message||e).slice(0,150)}), se usará token guardado`)
    return null
  }
}

// --- LAUNCH con minecraft-launcher-core ---
ipcMain.handle('launch', async (_e, opts:any) => {
  const send = (m:string) => { console.log('[launch]', m); win?.webContents.send('launch-log', m) }
  // misma cuenta ya en juego → aviso y no se lanza otra; cuentas distintas sí pueden coexistir
  const acctName = String(opts?.account?.name || 'jugador')
  const dup = mcSessions.find(s => s.name === acctName)
  if (dup) {
    const aviso = `Ya hay una instancia de Minecraft en curso con ${acctName} (${dup.info}). Cierra esa sesión o elige otra cuenta para abrir otra.`
    send(`⚠ ${aviso}`)
    const boxOpts = {
      type: 'warning' as const, buttons: ['Entendido'], defaultId: 0, noLink: true,
      title: 'Hydra Launcher — instancia en curso',
      message: `Ya hay una instancia de Minecraft en curso con ${acctName}`,
      detail: `${dup.info}\n\nCierra esa sesión o elige otra cuenta en Cuentas. Puedes abrir varias instancias a la vez siempre que cada una use un usuario distinto.`
    }
    try { if (win && !win.isDestroyed()) await dialog.showMessageBox(win, boxOpts); else await dialog.showMessageBox(boxOpts) } catch {}
    return { ok: false, alreadyRunning: true, error: aviso }
  }
  if (mcSessions.length) send(`ℹ abriendo instancia adicional con ${acctName} (${mcSessions.length} en curso)`)
  const session = { name: acctName, info: '' }
  try{
    send(`→ Hydra preparando ${opts.version} (${opts.loader||'vanilla'}) como ${opts.account?.name}...`)
    const cfg = readConfigFile()
    const srvName = opts.server?.ip ? (defaultServers.find(s=>s.ip===opts.server.ip)?.name || opts.server.ip) : ''
    recordSessionStart({ version: opts.version, loader: opts.loader, server: opts.server?.ip || '' })
    try { win?.webContents.send('session-start', { version: opts.version }) } catch {}
    if (cfg?.discordClientId) {
      discordSetActivity(String(cfg.discordClientId), {
        details: srvName ? `Jugando en ${srvName}` : `Minecraft ${opts.version}`,
        state: `${opts.account?.name} • Hydra Launcher`,
        startTimestamp: Math.floor(Date.now() / 1000),
        buttons: [{ label: 'Hydra Launcher', url: 'https://launcher.hyperhard.space/' }]
      }).catch(()=>{})
    }
    const { Client } = await import('minecraft-launcher-core')
    const launcher = new Client()

    const root = opts.root || ROOT
    const version: string = opts.version
    // Modpack Hydra: la versión seleccionada es una carpeta creada por el instalador de packs
    let mcVersion: string = version
    let packLoader = ''
    let packInstanceDir = ''
    try {
      const packJson = path.join(root, 'versions', version, `${version}.json`)
      if (fs.existsSync(packJson)) {
        const pj = JSON.parse(fs.readFileSync(packJson, 'utf-8'))
        if (pj?.hydraModpack) {
          const mp = pj.hydraModpack
          mcVersion = mp.base || version
          packLoader = mp.loader || 'vanilla'
          packInstanceDir = path.join(root, 'versions', version)
          send(`  modpack "${mp.name}" → Minecraft ${mcVersion}, loader ${packLoader}, instancia aislada ${version}`)
          // Limpieza única: quitar mods que versiones anteriores (<=1.3.3) copiaron al .minecraft global
          const vRoot = path.join(root, 'versions')
          const globalMods = path.join(root, 'mods')
          let cleaned = 0
          try {
            for (const d of fs.readdirSync(vRoot)) {
              const mk = path.join(vRoot, d, '.hydra-synced.json')
              if (!fs.existsSync(mk)) continue
              const prev: string[] = JSON.parse(fs.readFileSync(mk, 'utf-8'))
              for (const f of prev) { try { fs.rmSync(path.join(globalMods, f), { force: true }); cleaned++ } catch {} }
              try { fs.rmSync(mk, { force: true }) } catch {}
            }
          } catch {}
          if (cleaned) send(`  limpiados ${cleaned} mods que versiones anteriores habían copiado a /mods`)
        }
      }
    } catch (e: any) { send(`  aviso modpack: ${String(e?.message || e)}`) }
    // detectar tipo real (release/snapshot) para no forzar 'release' en snapshots como 26.3-rc-3
    // primero el json local (sin red si la versión ya está en disco); solo si no está, consulta Mojang
    let type = 'release'
    try {
      let foundType = ''
      const localBaseJson = path.join(root, 'versions', mcVersion, `${mcVersion}.json`)
      if (fs.existsSync(localBaseJson)) {
        try { foundType = JSON.parse(fs.readFileSync(localBaseJson, 'utf-8')).type || '' } catch {}
      }
      if (foundType) {
        type = foundType
        send(`  tipo detectado (json local, sin red): ${type}`)
      } else {
        const { data } = await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { timeout: 8000 })
        const found = (data.versions as any[]).find(v=>v.id===mcVersion)
        if (found?.type) type = found.type
        send(`  tipo detectado: ${type}`)
      }
    } catch { send('  no se pudo detectar tipo, usando release') }

    // auth: premium (msa) con refresh â€” offline solo si type offline
    let auth: any
    const isPremium = opts.account?.type === 'microsoft' || !!opts.account?.access_token
    if (isPremium) {
      let token = opts.account?.access_token || ''
      let uuid = (opts.account?.uuid || '').replace(/-/g, '')
      let name = opts.account?.name || 'Premium'
      let xuid = opts.account?.xuid || ''
      // intenta refrescar si hay msRefresh o si el token estÃ¡ vacÃ­o/vencido
      if (opts.account?.msRefresh) {
        const fresh = await refreshMicrosoft(opts.account.msRefresh, send)
        if (fresh?.access_token) {
          token = fresh.access_token; uuid = fresh.uuid || uuid; name = fresh.name || name; xuid = fresh.xuid || xuid
          // actualiza tambiÃ©n mcRefresh por si cambiÃ³
          opts.account.msRefresh = fresh.msRefresh
        }
      }
      if (!token) {
        throw new Error(`Cuenta Microsoft "${name}" sin token válido. Borra la cuenta en Cuentas y vuelve a hacer "Microsoft →" para iniciar sesión de nuevo.`)
      }
      auth = {
        access_token: token,
        client_token: opts.account?.client_token || token,
        uuid, name,
        user_properties: '{}',
        meta: { type: 'msa', demo: false, xuid: xuid || token }
      }
      send(`  auth premium ${name} ${uuid} (token ${token.slice(0,6)}...${token.slice(-4)})`)
    } else {
      const { v3 } = await import('uuid')
      const name = opts.account?.name || 'Player'
      // usa UUID guardado si existe, si no genera v3 determinÃ­stico (igual que Accounts.tsx)
      const deterministic = v3(name, v3.DNS).replace(/-/g,'')
      const cleanUuid = (opts.account?.uuid || deterministic).replace(/-/g,'')
      const token = cleanUuid
      auth = {
        access_token: token,
        client_token: token,
        uuid: cleanUuid,
        name,
        user_properties: '{}',
        meta: { type: 'mojang', demo: false }
      }
      send(`  auth offline ${auth.name} ${auth.uuid} (v3) â€” para servidores no-premium pon online-mode=false`)
    }

    // java: auto-detect si no viene; fallback al Java gestionado de Hydra (Adoptium auto-descargado)
    // IMPORTANTE: no basta con "haber Java" — hay que elegir uno >= mcNeedsJavaMajor (ej: MC 1.21
    // exige Java 21 y muchos PCs solo tienen Java 8 instalado → UnsupportedClassVersionError 65.0)
    let javaPath: string = opts.javaPath || ''
    const needJava = mcNeedsJavaMajor(mcVersion)
    if (!javaPath) {
      const cands = findJavaCandidates()
      send(`  javas detectadas: ${cands.join(' | ') || 'ninguna'} | ${mcVersion} necesita Java ${needJava}`)
      let best = ''; let bestVer = 0
      for (const p of cands) {
        const ver = javaMajorOf(p)
        if (ver >= needJava && ver > bestVer) { bestVer = ver; best = p }
      }
      if (best) {
        javaPath = best
        send(`  java elegido: ${javaPath} (Java ${bestVer})`)
      } else {
        // sin Java, o solo Javaes demasiado viejos → Hydra instala el correcto (Adoptium gestionado)
        const reason = cands.length
          ? `las detectadas no llegan a Java ${needJava} (maxima: Java ${Math.max(...cands.map(p => javaMajorOf(p)))})`
          : 'no hay Java en tu PC'
        send(`  ⚠ ${reason} — pidiendo permiso para instalar Adoptium Temurin ${needJava}...`)
        const inst = await ensureManagedJava(needJava, mcVersion, send)
        if (!inst.ok) throw new Error(inst.error || `Java insuficiente para ${mcVersion} (necesita Java ${needJava}). Instálala desde https://adoptium.net/temurin/releases/ (JRE ${needJava}, Windows x64)`)
        javaPath = inst.javaPath
      }
    } else {
      send(`  java custom: ${javaPath}`)
      if (!fs.existsSync(javaPath)) throw new Error(`Java no encontrado: ${javaPath}`)
      const customVer = javaMajorOf(javaPath)
      if (customVer && customVer < needJava) {
        // el Java configurado en Ajustes no sirve para esta version → no lanzar, instalar el correcto
        send(`  ⚠ El Java custom (Java ${customVer}) es demasiado viejo para ${mcVersion} (necesita Java ${needJava}) — pidiendo permiso para instalar el correcto...`)
        const inst = await ensureManagedJava(needJava, mcVersion, send)
        if (!inst.ok) throw new Error(`Tu Java configurado (Java ${customVer}) no sirve para ${mcVersion} (necesita Java ${needJava}).\n\n${inst.error || `Instala Java ${needJava} desde https://adoptium.net/temurin/releases/ (JRE ${needJava}, Windows x64)`}`)
        javaPath = inst.javaPath
      }
    }

    // Instancia aislada para modpacks: su propio gameDir (mods, config, saves) — no toca .minecraft global
    const gameDir = packInstanceDir || root
    if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true })

    let customVersion: string | null = null
    let forgePath: string | null = null
    // el modpack impone su propio loader; si no, usa el seleccionado en la UI
    const effLoader = packLoader || opts.loader
    if (effLoader === 'fabric') {
      customVersion = await installFabric(mcVersion, send)
    } else if (effLoader === 'forge' || effLoader === 'neoforge') {
      const res = await installForge(mcVersion, send)
      if (res.endsWith('.jar')) forgePath = res
      else customVersion = res
    }

    // diagnÃ³stico visible en Ajustes â†’ Logs: quÃ© custom se va a usar y cuÃ¡ntos mods hay
    try {
      const modsDir = packInstanceDir ? path.join(packInstanceDir, 'mods') : path.join(root, 'mods')
      const modsCount = fs.existsSync(modsDir) ? fs.readdirSync(modsDir).filter(f => f.endsWith('.jar')).length : 0
      send(`  custom=${customVersion || '(vanilla, sin custom)'} loader=${effLoader}`)
      send(`  mods en ${packInstanceDir ? 'instancia del pack' : '/mods'}: ${modsCount} jars${customVersion ? '' : ' (vanilla ignora mods)'}`)
      if (customVersion) {
        const cj = path.join(root, 'versions', customVersion, `${customVersion}.json`)
        if (fs.existsSync(cj)) {
          const parsed = JSON.parse(fs.readFileSync(cj, 'utf-8'))
          send(`  custom json: mainClass=${parsed.mainClass} inheritsFrom=${parsed.inheritsFrom}`)
        } else {
          send(`  âš  custom json NO existe: ${cj}`)
        }
      }
    } catch {}

    const launchOpts:any = {
      authorization: auth,
      root,
      version: { number: mcVersion, type, custom: customVersion || undefined },
      memory: { max: opts.ram?.max || '4G', min: opts.ram?.min || '1G' },
      overrides: { gameDirectory: gameDir, detached: true }
    }
    if (javaPath) launchOpts.javaPath = javaPath
    if (forgePath) launchOpts.forge = forgePath
    if (opts.server?.ip) {
      launchOpts.quickPlay = { type: 'multiplayer', identifier: `${opts.server.ip}:${opts.server.port||25565}` }
      send(`  quickPlay → ${opts.server.ip}:${opts.server.port||25565}`)
    }

    // logs detallados — progress/download NO se vuelcan al log: en la 1ra ejecución son
    // 5000+ eventos que saturaban el renderer (ventana "No responde"); el progreso va por 'progress' IPC
    const recentOut: string[] = []
    ;(['debug','data','close','error'] as const).forEach(ev=>{
      // @ts-ignore
      launcher.on(ev, (e:any)=> {
        const msg = typeof e === 'string' ? e : JSON.stringify(e).slice(0,1200)
        send(`[${ev}] ${msg}`)
        if (ev === 'data') { recentOut.push(msg); if (recentOut.length > 120) recentOut.shift() }
      })
    })
    // algunos builds emiten 'arguments'
    // @ts-ignore
    launcher.on('arguments', (e:any)=> send(`[args] ${JSON.stringify(e).slice(0,800)}`))

    send(`  root=${root}`)
    send(`  launching... (descarga puede tardar la 1ra vez)`)
    const proc: any = await launcher.launch(launchOpts)
    // MCLC devuelve null en vez de throw cuando no puede arrancar (p.ej. Java incompatible) — antes esto pasaba como exito silencioso
    if (!proc) throw new Error('Minecraft no pudo arrancar (proceso nulo). Tu Java puede ser incompatible con esta version — si tienes varias javas instaladas, prueba a elegir otra en Ajustes → Java.')
    send(`Minecraft lanzado PID ${proc?.pid || '?'}`)
    session.info = `Minecraft ${mcVersion}${packLoader && packLoader !== 'vanilla' ? ` (${packLoader})` : ''} como ${acctName} — PID ${proc?.pid || '?'}`
    mcSessions.push(session)
    // el launcher se oculta mientras Minecraft corre (se restaura en close/error)
    try { if (win && !win.isDestroyed()) win.hide() } catch {}
    if (proc?.on) {
      proc.on('close', (code:number)=> {
        mcSessions = mcSessions.filter(s => s !== session)
        send(`  proceso cerrado code ${code}`)
        // Minecraft terminó → el launcher vuelve a aparecer
        try { if (win && !win.isDestroyed()) { win.show(); win.focus() } } catch {}
        // salida anormal: guarda informe con la última salida de la consola del juego
        // (aquí caen los errores reales: Java incompatible, falta de RAM, mods rotos...)
        if (code && code !== 0) {
          const report = recordCrash(opts, `Minecraft terminó con código ${code} (no salió por su cuenta)`, recentOut.join('\n'))
          send(`  ⚠ salida anormal (code ${code}) — informe guardado en hydra-crashes`)
          // ventana emergente con diagnostico legible (0xC000013A = el usuario cerro la consola a mano → no molesta)
          if (code !== -1073741510) showLaunchFailureDialog(opts, recentOut.join('\n'), code, javaPath, mcVersion, report)
        }
        recordSessionEnd(code === 0 || code == null)
        try { win?.webContents.send('session-end', code === 0 || code == null) } catch {}
        lastIdleAt = 0
        setIdlePresence()
      })
      proc.on('error', (e:any)=> {
        mcSessions = mcSessions.filter(s => s !== session)
        send(`  proceso error ${String(e)}`)
        // el juego no llegó a arrancar → el launcher vuelve a aparecer
        try { if (win && !win.isDestroyed()) { win.show(); win.focus() } } catch {}
        const report = recordCrash(opts, `No se pudo ejecutar el proceso Java: ${String(e)}`, recentOut.join('\n'))
        showLaunchFailureDialog(opts, recentOut.join('\n'), null, javaPath, mcVersion, report)
        recordSessionEnd(false)
        try { win?.webContents.send('session-end', false) } catch {}
        lastIdleAt = 0
        setIdlePresence()
      })
    }
    return { ok: true, pid: proc?.pid }
  }catch(e:any){
    let msg = e?.message || String(e)
    const stack = e?.stack || ''
    // si es un error de axios, muestra el endpoint exacto que falló (clave para diagnosticar 4xx/5xx)
    const netUrl = e?.config?.url || e?.request?.responseURL || ''
    const netStatus = e?.response?.status
    if (netUrl) {
      const body = typeof e?.response?.data === 'string' ? e.response.data.slice(0,300) : (e?.response?.data ? JSON.stringify(e.response.data).slice(0,300) : '')
      msg += `\nEndpoint: ${netUrl}${netStatus ? ` (HTTP ${netStatus})` : ''}${body ? `\nRespuesta: ${body}` : ''}`
    }
    send(`âœ— FALLO: ${msg}`)
    if (stack) send(stack.slice(0,3000))
    console.error(e)
    recordCrash(opts, msg, stack)
    recordSessionEnd(false)
    lastIdleAt = 0
    setIdlePresence()
    try { dialog.showErrorBox('Hydra Launcher - fallo al lanzar', `${msg}\n\nRevisa Ajustes → Logs\nJava: ${findJavaCandidates().join(', ') || 'no detectado'}\nVersión: ${opts?.version}`) } catch {}
    return { ok:false, error: msg + '\n' + stack }
  }
})

// --- LIMPIEZA TOTAL AL ACTUALIZAR ---
// Al actualizar (marcador .minecraft\hydra-last-version), limpia SOLO la basura:
// informes de crash, caché del actualizador e instaladores antiguos.
// Conserva TODO lo del usuario: cuenta, config (RAM/versión/tema), stats, Java gestionada
// y el localStorage (asistente de primera ejecución). El contenido del juego jamás se toca.
const LAST_VERSION_MARKER = path.join(ROOT, 'hydra-last-version')
function wipeLauncherFilesOnUpdate(): void {
  try {
    const cur = app.getVersion()
    let prev = ''
    try { prev = fs.existsSync(LAST_VERSION_MARKER) ? fs.readFileSync(LAST_VERSION_MARKER, 'utf-8').trim() : '' } catch {}
    if (prev === cur) return
    const rm = (p: string) => {
      try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }) } catch (e) { console.log('[wipe] no se pudo borrar', p, String(e)) }
    }
    if (prev) {
      console.log(`[wipe] actualización ${prev} → ${cur}: limpiando basura (se conservan cuenta, config, stats y Java gestionada)`)
      rm(path.join(ROOT, 'hydra-crashes'))
      try { rm(path.join(os.homedir(), 'AppData', 'Local', 'hydra-launcher-updater')) } catch {}
      try { cleanupOldInstallers(cur) } catch {}
      console.log('[wipe] limpieza de basura completa')
    } else {
      console.log('[wipe] primera ejecución con marcador de versión — sin versión anterior que limpiar')
    }
    try {
      if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true })
      fs.writeFileSync(LAST_VERSION_MARKER, cur)
    } catch {}
  } catch (e) { console.error('[wipe]', e) }
}

// --- CLEANUP instaladores antiguos (descargas / escritorio) ---
function cleanupOldInstallers(currentVersion: string): number {
  const dirs: string[] = []
  try { dirs.push(app.getPath('downloads')) } catch {}
  try { dirs.push(app.getPath('desktop')) } catch {}
  try { dirs.push(os.tmpdir()) } catch {}
  const re = /^Hydra-Launcher-(Setup|Portable)-v(\d+\.\d+\.\d+)\.(exe|zip)$/i
  let removed = 0
  for (const dir of dirs) {
    try {
      if (!dir || !fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir)) {
        const m = f.match(re)
        if (!m) continue
        if (m[2] === currentVersion) continue
        try { fs.unlinkSync(path.join(dir, f)); removed++ } catch {}
      }
    } catch {}
  }
  return removed
}
ipcMain.handle('cleanup-old-installers', () => {
  const removed = cleanupOldInstallers(app.getVersion())
  return { ok: true, removed }
})

// --- ELIMINAR VERSION DE MINECRAFT INSTALADA ---
ipcMain.handle('delete-version', async (_e, id: string) => {
  try {
    if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) return { ok: false, error: 'ID invalido' }
    const dir = path.join(ROOT, 'versions', id)
    if (!fs.existsSync(dir)) return { ok: false, error: 'Version no instalada' }
    fs.rmSync(dir, { recursive: true, force: true })
    return { ok: true }
  } catch (e: any) { return { ok: false, error: String(e?.message || e) } }
})

// --- PING MINECRAFT (Server List Ping) ---
function writeVarInt(n: number): Buffer {
  const bytes: number[] = []
  let num = n
  while (true) {
    let b = num & 0x7f
    num >>>= 7
    if (num !== 0) b |= 0x80
    bytes.push(b)
    if (num === 0) break
  }
  return Buffer.from(bytes)
}
function strPacket(s: string): Buffer {
  const b = Buffer.from(s, 'utf8')
  return Buffer.concat([writeVarInt(b.length), b])
}
function readVarInt(buf: Buffer, pos: { i: number }): number {
  let num = 0, shift = 0
  while (true) {
    if (pos.i >= buf.length) throw new Error('eof')
    const b = buf[pos.i++]
    num |= (b & 0x7f) << shift
    if ((b & 0x80) === 0) break
    shift += 7
    if (shift > 35) throw new Error('varint overflow')
  }
  return num
}
function cleanComponent(c: any): string {
  if (!c) return ''
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map(cleanComponent).join('')
  return (c.text ? String(c.text) : '') + (Array.isArray(c.extra) ? c.extra.map(cleanComponent).join('') : '')
}

ipcMain.handle('ping-full', (_e, ip: string, port: number) => new Promise(res => {
  const start = Date.now()
  let settled = false
  let socket: net.Socket | null = null
  const finish = (r: any) => {
    if (settled) return
    settled = true
    try { socket?.destroy() } catch {}
    res(r)
  }
  try {
    socket = net.createConnection({ host: ip, port: port || 25565 })
  } catch { return finish({ online: false }) }
  let buf = Buffer.alloc(0)
  setTimeout(() => finish({ online: false }), 5000)
  socket.on('connect', () => {
    try {
      const handshake = Buffer.concat([
        writeVarInt(0x00),
        writeVarInt(-1),
        strPacket(ip),
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        writeVarInt(1)
      ])
      const hs = Buffer.concat([writeVarInt(handshake.length), handshake])
      const req = Buffer.concat([writeVarInt(1), writeVarInt(0x00)])
      socket!.write(Buffer.concat([hs, req]))
    } catch { finish({ online: false }) }
  })
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk])
    try {
      const pos = { i: 0 }
      const len = readVarInt(buf, pos)
      if (buf.length - pos.i < len) return
      const packetId = readVarInt(buf, pos)
      if (packetId !== 0) return
      const strLen = readVarInt(buf, pos)
      const jsonStr = buf.slice(pos.i, pos.i + strLen).toString('utf8')
      const data = JSON.parse(jsonStr)
      finish({
        online: true,
        latency: Date.now() - start,
        players: { online: data.players?.online ?? 0, max: data.players?.max ?? 0 },
        version: data.version?.name || '',
        motd: cleanComponent(data.description)
      })
    } catch {}
  })
  socket.on('error', () => finish({ online: false }))
  socket.on('close', () => finish({ online: false }))
}))

// --- MODS / MODPACKS: Modrinth + CurseForge ---
async function getCurseForgeKey(): Promise<string> {
  return readConfigFile()?.curseforgeKey || ''
}
const CF_LOADER: Record<string, number> = { forge: 1, fabric: 3, quilt: 4, neoforge: 5, vanilla: 0 }

ipcMain.handle('browse-content', async (_e, opts: any) => {
  const { source, query, gameVersion, loader, type, limit = 20, offset = 0, index = 'downloads' } = opts || {}
  try {
    const isMainType = !type || type === 'mod' || type === 'modpack'
    if (source === 'curseforge') {
      const key = await getCurseForgeKey()
      if (!key) return { ok: false, needsKey: true, error: 'Falta la API key de CurseForge — consiguela gratis en console.curseforge.com y peguela en el recuadro amarillo de arriba' }
      const headers = { 'x-api-key': key, Accept: 'application/json' }
      const CF_CLASS: Record<string, number> = { mod: 6, modpack: 4471, shader: 6552, resourcepack: 12, world: 17 }
      const params: any = {
        gameId: 432,
        classId: CF_CLASS[type] ?? 6,
        pageSize: Math.min(Number(limit) || 20, 50),
        index: Number(offset) || 0,
        sortField: index === 'recent' ? 3 : 6,
        sortOrder: 'desc'
      }
      if (query) params.searchFilter = query
      if (gameVersion) params.gameVersion = gameVersion
      if (loader && loader !== 'vanilla' && isMainType) params.modLoaderType = CF_LOADER[loader] || 0
      const { data } = await axios.get('https://api.curseforge.com/v1/mods/search', { params, headers, timeout: 15000 })
      return {
        ok: true,
        total: data.pagination?.totalCount ?? 0,
        items: (data.data || []).map((m: any) => ({
          source: 'curseforge', id: String(m.id), title: m.name, author: m.authors?.[0]?.name || '',
          description: m.summary || '', downloads: m.downloadCount || 0,
          icon: m.logo?.thumbnailUrl || m.logo?.url || '',
          updated: m.dateModified || '', categories: (m.categories || []).map((c: any) => c.name).slice(0, 4)
        }))
      }
    }
    const facets: string[][] = [[`project_type:${type || 'mod'}`]]
    if (gameVersion) facets.push([`versions:${gameVersion}`])
    if (loader && loader !== 'vanilla' && isMainType) facets.push([`categories:${loader}`])
    const { data } = await axios.get('https://api.modrinth.com/v2/search', {
      params: { query: query || '', limit, offset, index: index === 'recent' ? 'updated' : index, facets: JSON.stringify(facets) },
      timeout: 15000
    })
    return {
      ok: true,
      total: data.total_hits ?? 0,
      items: (data.hits || []).map((h: any) => ({
        source: 'modrinth', id: h.project_id, title: h.title, author: h.author || '',
        description: h.description || '', downloads: h.downloads || 0,
        icon: h.icon_url || '', updated: h.date_modified || '',
        categories: (h.categories || []).filter((c: string) => !['client', 'server', 'paper', 'spigot', 'bukkit', 'purpur', 'sponge', 'folia', 'velocity', 'bungeecord', 'waterfall', 'iris', 'liteloader', 'rift', 'minecraft', 'java'].includes(c)).slice(0, 4)
      }))
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.response?.data?.message || e?.message || e) }
  }
})

ipcMain.handle('install-content', async (_e, opts: any) => {
  const { source, id, type, gameVersion, loader, versionId, fileId } = opts || {}
  const send = (m: string) => { console.log('[install]', m); win?.webContents.send('launch-log', m) }
  const isMainType = !type || type === 'mod' || type === 'modpack'
  const destName = type === 'shader' ? 'shaderpacks' : type === 'resourcepack' ? 'resourcepacks' : type === 'world' ? 'saves' : 'mods'
  const contentDir = path.join(ROOT, destName)
  try {
    if (!fs.existsSync(contentDir)) fs.mkdirSync(contentDir, { recursive: true })
    let fileUrl = '', fileName = ''
    const cfHeaders = { 'x-api-key': await getCurseForgeKey(), Accept: 'application/json' }
    if (source === 'modrinth') {
      if (versionId) {
        const { data: v } = await axios.get(`https://api.modrinth.com/v2/version/${versionId}`, { timeout: 20000 })
        const file = (v.files || []).find((f: any) => f.primary) || v.files?.[0]
        if (!file) return { ok: false, error: 'Version sin archivos' }
        fileUrl = file.url; fileName = file.filename
        send(`  Modrinth (${v.version_number || versionId}): ${fileName}`)
      } else {
        const params: any = {}
        if (gameVersion) params.game_versions = JSON.stringify([gameVersion])
        if (loader && loader !== 'vanilla' && isMainType) params.loaders = JSON.stringify([loader])
        const { data: versions } = await axios.get(`https://api.modrinth.com/v2/project/${id}/version`, { params, timeout: 20000 })
        if (!versions?.length) return { ok: false, error: `Sin versiones compatibles (${gameVersion || '*'} / ${loader || '*'})` }
        const v = versions[0]
        const file = (v.files || []).find((f: any) => f.primary) || v.files?.[0]
        if (!file) return { ok: false, error: 'Version sin archivos' }
        fileUrl = file.url; fileName = file.filename
        send(`  Modrinth: ${fileName} (${v.version_number || ''})`)
      }
    } else if (source === 'curseforge') {
      if (!cfHeaders['x-api-key']) return { ok: false, needsKey: true, error: 'Falta la API key de CurseForge' }
      if (fileId) {
        const { data: dl } = await axios.get(`https://api.curseforge.com/v1/mods/${id}/files/${fileId}/download-url`, { headers: cfHeaders, timeout: 15000 })
        fileUrl = dl.data
        fileName = decodeURIComponent(String(dl.data).split('?')[0].split('/').pop() || (type === 'modpack' ? 'modpack.zip' : `${id}.jar`))
        send(`  CurseForge (file ${fileId}): ${fileName}`)
      } else {
        const { data: filesRes } = await axios.get(`https://api.curseforge.com/v1/mods/${id}/files`, {
          params: {
            pageSize: 50, index: 0,
            gameVersion: gameVersion || undefined,
            modLoaderType: loader && loader !== 'vanilla' && isMainType ? CF_LOADER[loader] : undefined
          },
          headers: cfHeaders, timeout: 20000
        })
        const file = (filesRes.data || []).find((f: any) => f.isAvailable !== false && !f.isServerPack) || filesRes.data?.[0]
        if (!file) return { ok: false, error: 'Sin archivos compatibles en CurseForge' }
        const { data: dl } = await axios.get(`https://api.curseforge.com/v1/mods/${id}/files/${file.id}/download-url`, { headers: cfHeaders, timeout: 15000 })
        fileUrl = dl.data; fileName = file.fileName || (type === 'modpack' ? 'modpack.zip' : `${id}.jar`)
        send(`  CurseForge: ${fileName}`)
      }
    } else return { ok: false, error: 'Fuente desconocida' }

    const res = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 120000 })
    const buf = Buffer.from(res.data)

    if (type === 'modpack') {
      const AdmZip = (await import('adm-zip')).default
      const zip = new AdmZip(buf)
      const tempDir = path.join(HYDRA_DIR, 'tmp-pack-' + Date.now())
      fs.mkdirSync(tempDir, { recursive: true })
      zip.extractAllTo(tempDir, true)
      let manifest: any = null
      let packName = fileName.replace(/\.(mrpack|zip)$/i, '')
      let baseVersion = ''
      let packLoader = 'vanilla'
      let installed = 0
      let skipped = 0
      const manifestPath = path.join(tempDir, 'modrinth.index.json')
      const cfManifestPath = path.join(tempDir, 'manifest.json')
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        packName = manifest?.name || packName
        baseVersion = String(manifest?.dependencies?.minecraft || '')
        if (manifest?.dependencies?.['fabric-loader']) packLoader = 'fabric'
        else if (manifest?.dependencies?.neoforge) packLoader = 'neoforge'
        else if (manifest?.dependencies?.forge) packLoader = 'forge'
      } else if (fs.existsSync(cfManifestPath)) {
        manifest = JSON.parse(fs.readFileSync(cfManifestPath, 'utf-8'))
        packName = manifest?.name || packName
        baseVersion = String(manifest?.minecraftVersion || '')
        const ml = (manifest?.modLoaders || []).find((m: any) => m.primary) || manifest?.modLoaders?.[0]
        const mlId = String(ml?.id || '')
        if (mlId.startsWith('fabric')) packLoader = 'fabric'
        else if (mlId.startsWith('neoforge')) packLoader = 'neoforge'
        else if (mlId.startsWith('forge')) packLoader = 'forge'
      } else {
        try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
        return { ok: false, error: 'El archivo no tiene manifest (no es un modpack valido)' }
      }

      // Crear carpeta de version/<id> para que aparezca en Instaladas y se pueda lanzar
      const sanitizeId = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'modpack'
      let packId = sanitizeId(packName)
      if (fs.existsSync(path.join(ROOT, 'versions', packId))) packId = `${packId}-${Date.now().toString(36)}`
      const packDir = path.join(ROOT, 'versions', packId)
      const packModsDir = path.join(packDir, 'mods')
      fs.mkdirSync(packModsDir, { recursive: true })
      send(`  Modpack ${packName} → version ${packId} (base ${baseVersion || '?'}, ${packLoader})`)

      const files = manifest?.files || []
      send(`  ${files.length} archivos...`)
      if (fs.existsSync(manifestPath)) {
        // Modrinth (.mrpack): URLs directas en downloads[]
        for (const f of files) {
          try {
            const url = Array.isArray(f.downloads) && f.downloads.length ? f.downloads[0] : ''
            if (!url) { skipped++; continue }
            const destPath = path.join(packModsDir, path.basename(f.path || ''))
            const fr = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000 })
            fs.writeFileSync(destPath, Buffer.from(fr.data))
            installed++
            send(`    OK ${path.basename(f.path || '')}`)
          } catch { skipped++ }
        }
      } else {
        // CurseForge: projectID/fileID vía API
        for (const f of files) {
          try {
            if (!cfHeaders['x-api-key']) { skipped++; continue }
            const { data: dl } = await axios.get(`https://api.curseforge.com/v1/mods/${f.projectID}/files/${f.fileID}/download-url`, { headers: cfHeaders, timeout: 15000 })
            const fr = await axios.get(dl.data, { responseType: 'arraybuffer', timeout: 120000 })
            const m = String(dl.data).split('?')[0].split('/').pop()
            fs.writeFileSync(path.join(packModsDir, decodeURIComponent(m || `${f.projectID}.jar`)), Buffer.from(fr.data))
            installed++
          } catch { skipped++ }
        }
      }

      // Overrides (config, resourcepacks, options...) → dentro de la instancia del pack (NO al .minecraft global)
      const overrides = path.join(tempDir, 'overrides')
      if (fs.existsSync(overrides)) {
        try { fs.cpSync(overrides, packDir, { recursive: true }) } catch {}
        send('  overrides aplicados a la instancia del pack')
      }

      // JSON de version: el pack aparece en Instaladas y el launch lo detecta
      fs.writeFileSync(path.join(packDir, packId + '.json'), JSON.stringify({
        id: packId,
        inheritsFrom: baseVersion || '1.20.1',
        type: 'release',
        hydraModpack: { name: packName, loader: packLoader, base: baseVersion || '1.20.1', projectId: String(id) }
      }, null, 2))

      // Registrar en "Mis modpacks"
      const packs = loadModpacks()
      const rec = { id: packId, name: packName, base: baseVersion, loader: packLoader, versionId: packId, installedAt: Date.now(), mods: installed }
      const ix = packs.findIndex(p => p.id === packId)
      if (ix >= 0) packs[ix] = rec
      else packs.push(rec)
      saveModpacks(packs)

      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
      send(`  Modpack instalado como version: ${packId} (${installed} mods${skipped ? `, ${skipped} omitidos` : ''})`)
      return { ok: true, packName, packId, installed, skipped, baseVersion, loader: packLoader }
    }

    const dest = path.join(contentDir, path.basename(fileName))
    fs.writeFileSync(dest, buf)
    send(`  Instalado en ${destName}/: ${fileName} (${Math.round(buf.length / 1024)} KB)`)
    return { ok: true, filename: path.basename(fileName), size: buf.length }
  } catch (e: any) {
    const msg = String(e?.response?.data?.message || e?.message || e)
    send(`  fallo instalando: ${msg}`)
    return { ok: false, error: msg }
  }
})

// Ficha completa de un mod/modpack (descripcion + lista de versiones para elegir)
ipcMain.handle('get-content-detail', async (_e, opts: any) => {
  const { source, id, fallbackAuthor } = opts || {}
  try {
    if (source === 'modrinth') {
      const { data: p } = await axios.get(`https://api.modrinth.com/v2/project/${id}`, { timeout: 15000 })
      let author = fallbackAuthor || ''
      try {
        const { data: members } = await axios.get(`https://api.modrinth.com/v2/team/${p.team}/members`, { timeout: 10000 })
        const owner = members.find((m: any) => m.role === 'Owner') || members[0]
        if (owner?.user?.username) author = owner.user.username
      } catch {}
      let versionsRaw: any[] = []
      try {
        const { data } = await axios.get(`https://api.modrinth.com/v2/project/${id}/version`, { timeout: 15000 })
        versionsRaw = data || []
      } catch {}
      const versions = versionsRaw.slice(0, 60).map((v: any) => {
        const f = (v.files || []).find((x: any) => x.primary) || v.files?.[0]
        return {
          id: String(v.id), label: v.version_number || v.name || String(v.id),
          mc: (v.game_versions || []).slice(0, 3).join(', '),
          loader: (v.loaders || []).join(', ') || '-',
          date: v.date_published ? Date.parse(v.date_published) : 0,
          downloads: v.downloads || 0, size: f?.size || 0,
          kind: v.version_type || 'release'
        }
      })
      // modlist del pack: dependencias de la version mas reciente resueltas por lote
      let modsList: any[] = []
      try {
        const deps: any[] = (versionsRaw[0]?.dependencies || []).filter((d: any) => d.project_id && d.dependency_type !== 'incompatible')
        const ids = [...new Set(deps.map((d: any) => d.project_id))] as string[]
        const depMap = new Map(deps.map((d: any) => [d.project_id, d]))
        const projects: any[] = []
        for (let i = 0; i < ids.length; i += 50) {
          try {
            const { data } = await axios.get('https://api.modrinth.com/v2/projects', { params: { ids: JSON.stringify(ids.slice(i, i + 50)) }, timeout: 15000 })
            projects.push(...(data || []))
          } catch {}
        }
        modsList = projects.slice(0, 150).map((p: any) => ({
          id: p.id, versionId: String(depMap.get(p.id)?.version_id || ''), title: p.title || p.slug || p.id,
          icon: p.icon_url || '', downloads: p.downloads || 0,
          description: p.description || '', kind: depMap.get(p.id)?.dependency_type || 'required'
        }))
      } catch {}
      return {
        ok: true,
        project: {
          title: p.title, author, summary: p.description || '',
          body: p.body || '', bodyType: 'md',
          icon: p.icon_url || '', downloads: p.downloads || 0,
          updated: p.date_modified ? Date.parse(p.date_modified) : 0,
          categories: (p.categories || []).slice(0, 8),
          sourceUrl: p.source_url || p.project_url || ''
        },
        versions, modsList
      }
    }
    // CurseForge
    const key = await getCurseForgeKey()
    if (!key) return { ok: false, needsKey: true, error: 'Falta la API key de CurseForge — peguela en el recuadro amarillo' }
    const h = { 'x-api-key': key, Accept: 'application/json' }
    const { data: m } = await axios.get(`https://api.curseforge.com/v1/mods/${id}`, { headers: h, timeout: 15000 })
    const mod = m.data
    let files: any[] = []
    try {
      const { data: fr } = await axios.get(`https://api.curseforge.com/v1/mods/${id}/files`, { params: { pageSize: 50, index: 0 }, headers: h, timeout: 15000 })
      files = fr.data || []
    } catch {}
    const LOADER_RE = /fabric|forge|neoforge|quilt|liteloader|rift/i
    const versions = files
      .filter((f: any) => f.isAvailable !== false && !f.isServerPack)
      .map((f: any) => {
        const sortable = f.sortableGameVersions || []
        const loaders = [...new Set(sortable.map((s: any) => String(s.gameVersion || '')).filter((x: string) => LOADER_RE.test(x)))]
        return {
          id: String(f.id), label: f.displayName || f.fileName || String(f.id),
          mc: (f.gameVersion || []).slice(0, 3).join(', '),
          loader: loaders.join(', ') || '-',
          date: f.datePublished ? Date.parse(f.datePublished) : 0,
          downloads: f.downloadCount || 0, size: f.fileLength || 0,
          kind: f.releaseType === 1 ? 'alpha' : f.releaseType === 2 ? 'beta' : 'release'
        }
      })
      .sort((a: any, b: any) => b.date - a.date)
    // descripcion completa (el objeto mod no la trae)
    let cfBody = ''
    try {
      const { data: dsc } = await axios.get(`https://api.curseforge.com/v1/mods/${id}/description`, { headers: h, timeout: 15000 })
      if (typeof dsc?.data === 'string') cfBody = dsc.data
    } catch {}
    // modlist: dependencias del primer archivo resueltas en lote
    let modsList: any[] = []
    try {
      const rels: any[] = (files[0]?.dependencies || []).filter((d: any) => d.modId && [1, 2, 3, 6].includes(d.relationType))
      const ids = [...new Set(rels.map((d: any) => d.modId))] as number[]
      const relMap = new Map(rels.map((d: any) => [d.modId, d]))
      const found: any[] = []
      for (let i = 0; i < ids.length; i += 100) {
        try {
          const { data } = await axios.post('https://api.curseforge.com/v1/mods', { modIds: ids.slice(i, i + 100) }, { headers: { ...h, 'Content-Type': 'application/json' }, timeout: 15000 })
          found.push(...(data?.data || []))
        } catch {}
      }
      modsList = found.slice(0, 150).map((mm: any) => ({
        id: String(mm.id), versionId: '', title: mm.name || String(mm.id),
        icon: mm.logo?.thumbnailUrl || mm.logo?.url || '',
        downloads: mm.downloadCount || 0, description: mm.summary || '',
        kind: relMap.get(mm.id)?.relationType === 2 ? 'optional' : 'required',
        website: mm.links?.websiteUrl || ''
      }))
    } catch {}
    return {
      ok: true,
      project: {
        title: mod.name, author: mod.authors?.[0]?.name || fallbackAuthor || '',
        summary: mod.summary || '', body: cfBody || mod.summary || '',
        bodyType: cfBody.includes('<') ? 'html' : 'md',
        icon: mod.logo?.thumbnailUrl || mod.logo?.url || '',
        downloads: mod.downloadCount || 0,
        updated: mod.dateModified ? Date.parse(mod.dateModified) : 0,
        categories: (mod.categories || []).map((c: any) => c.name).slice(0, 8),
        sourceUrl: mod.links?.websiteUrl || ''
      },
      versions, modsList
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.response?.data?.message || e?.message || e) }
  }
})

const defaultServers = [
  { id: 'hyperhard', name: 'Servidor Principal', ip: 'mc.hyperhard.space', port: 25565, type: 'principal', desc: 'HyperHard Network — el corazon de la comunidad.', banner: '⛏' },
  { id: 'hydra-eventos', name: 'Eventos Hydra', ip: 'eventos.hyperhard.space', port: 25565, type: 'event', desc: 'Parkour, PvP, Spleef y eventos exclusivos de Hydra.', banner: '🎉' },
]

// --- STATS LOCALES (sesiones, tiempo, logros) ---
const STATS_PATH = path.join(ROOT, 'hydra-stats.json')
const CRASH_DIR = path.join(ROOT, 'hydra-crashes')
const COMMUNITY_CACHE = path.join(HYDRA_DIR, 'community-cache.json')
const NEWS_CACHE = path.join(HYDRA_DIR, 'news-cache.json')
const RAW_BASE = 'https://raw.githubusercontent.com/scainetprr/hydra-launcher-web/main'

function readStatsFile(): any {
  try {
    if (fs.existsSync(STATS_PATH)) return JSON.parse(fs.readFileSync(STATS_PATH, 'utf-8'))
  } catch {}
  return { counters: { launches: 0, crashes: 0, playMs: 0, byServer: {} }, sessions: [], achievements: {} }
}
function writeStatsFile(s: any): void {
  try { fs.writeFileSync(STATS_PATH, JSON.stringify(s, null, 2)) } catch {}
}

const ACHIEVEMENTS = [
  { id: 'first_launch', icon: '🎮', name: 'Primer arranque', desc: 'Lanza Minecraft por primera vez', test: (s: any) => s.counters.launches >= 1 },
  { id: 'launch_10', icon: '🚀', name: 'Habitual', desc: '10 lanzamientos', test: (s: any) => s.counters.launches >= 10 },
  { id: 'launch_50', icon: '🏅', name: 'Veterano Hydra', desc: '50 lanzamientos', test: (s: any) => s.counters.launches >= 50 },
  { id: 'time_1h', icon: '⏱️', name: 'Primera hora', desc: '1 hora jugada', test: (s: any) => s.counters.playMs >= 3600_000 },
  { id: 'time_10h', icon: '⏰', name: 'Diez horas', desc: '10 horas jugadas', test: (s: any) => s.counters.playMs >= 36_000_000 },
  { id: 'time_50h', icon: '🌟', name: 'Cincuenta horas', desc: '50 horas jugadas', test: (s: any) => s.counters.playMs >= 180_000_000 },
  { id: 'server_hyperhard', icon: '⛏️', name: 'HyperHard', desc: 'Entra al servidor principal', test: (s: any) => (s.counters.byServer?.['mc.hyperhard.space'] || 0) >= 1 },
  { id: 'server_eventos', icon: '🎉', name: 'Eventos Hydra', desc: 'Entra al servidor de eventos', test: (s: any) => (s.counters.byServer?.['eventos.hyperhard.space'] || 0) >= 1 },
  { id: 'night_owl', icon: '🌙', name: 'Búho nocturno', desc: 'Juega entre la 0:00 y las 5:00', test: (s: any) => (s.sessions || []).some((x: any) => { const h = new Date(x.start).getHours(); return h >= 0 && h < 5 }) },
  { id: 'marathon', icon: '🏄', name: 'Maratón', desc: 'Sesión de más de 3 horas', test: (s: any) => (s.sessions || []).some((x: any) => (x.ms || 0) >= 3 * 3600_000) },
  { id: 'explorer', icon: '🗺️', name: 'Explorador', desc: 'Juega 5 versiones distintas', test: (s: any) => new Set((s.sessions || []).map((x: any) => x.version)).size >= 5 },
  { id: 'modded', icon: '🧩', name: 'Modder', desc: 'Lanza con Fabric o Forge', test: (s: any) => (s.sessions || []).some((x: any) => x.loader && x.loader !== 'vanilla') },
]

function evaluateAchievements(s: any): string[] {
  const earned: string[] = []
  for (const a of ACHIEVEMENTS) {
    try {
      if (!s.achievements[a.id] && a.test(s)) { s.achievements[a.id] = Date.now(); earned.push(a.id) }
    } catch {}
  }
  if (earned.length) writeStatsFile(s)
  return earned
}

ipcMain.handle('get-stats', () => {
  const s = readStatsFile()
  evaluateAchievements(s)
  return {
    ok: true,
    counters: s.counters,
    sessions: (s.sessions || []).slice(-40).reverse(),
    achievements: s.achievements,
    catalog: ACHIEVEMENTS.map(({ test, ...rest }) => rest)
  }
})

let pendingSession: any = null
function recordSessionStart(info: any) {
  pendingSession = { start: Date.now(), version: info?.version || '', loader: info?.loader || 'vanilla', server: info?.server || '' }
}
function recordSessionEnd(ok: boolean) {
  if (!pendingSession) return
  const s = readStatsFile()
  const end = Date.now()
  const ms = Math.max(0, end - pendingSession.start)
  s.sessions = s.sessions || []
  s.sessions.push({ ...pendingSession, end, ms, ok: ok !== false })
  if (s.sessions.length > 400) s.sessions = s.sessions.slice(-400)
  if (ok !== false) {
    s.counters.launches = (s.counters.launches || 0) + 1
    s.counters.playMs = (s.counters.playMs || 0) + ms
    if (pendingSession.server) {
      s.counters.byServer = s.counters.byServer || {}
      s.counters.byServer[pendingSession.server] = (s.counters.byServer[pendingSession.server] || 0) + 1
    }
  }
  writeStatsFile(s)
  evaluateAchievements(s)
  pendingSession = null
}

// --- CRASH REPORTER LOCAL ---
function recordCrash(opts: any, error: string, stack: string): string | null {
  try {
    if (!fs.existsSync(CRASH_DIR)) fs.mkdirSync(CRASH_DIR, { recursive: true })
    const file = path.join(CRASH_DIR, `crash-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    const report = {
      when: new Date().toISOString(),
      launcher: app.getVersion(),
      os: `${os.platform()} ${os.release()} (${os.arch()})`,
      error: String(error).slice(0, 2000),
      stack: String(stack || '').slice(0, 4000),
      launch: { version: opts?.version, loader: opts?.loader, ram: opts?.ram, javaPath: opts?.javaPath || 'auto', account: opts?.account?.name, server: opts?.server?.ip || null }
    }
    fs.writeFileSync(file, JSON.stringify(report, null, 2))
    const s = readStatsFile()
    s.counters.crashes = (s.counters.crashes || 0) + 1
    writeStatsFile(s)
    return file
  } catch { return null }
}

// --- DIAGNOSTICO LEGIBLE CUANDO MINECRAFT CIERRA CON ERROR ---
// Traduce la salida cruda de la consola a un problema + soluciones accionables en español.
function diagnoseLaunchFailure(out: string, code: number | null, javaExe: string, mcVer: string): { titulo: string; problema: string; soluciones: string[] } {
  const t = out || ''
  const has = (re: RegExp) => re.test(t)

  // 1) Java demasiado viejo (el caso de la amiga): class file 65.0 = Java 21, su runtime llega a 52.0 = Java 8
  const cv = t.match(/class file version (\d+)/i)
  if (cv && has(/UnsupportedClassVersionError|compiled by a more recent version of the Java/i)) {
    const need = Math.max(parseInt(cv[1], 10) - 44, 8)
    const up = t.match(/only recognizes class file versions up to (\d+)/i)
    const have = up ? Math.max(parseInt(up[1], 10) - 44, 0) : (javaExe ? javaMajorOf(javaExe) : 0)
    return {
      titulo: 'Java demasiado viejo',
      problema: `Tu PC está usando Java ${have || '?'} pero ${mcVer || 'esta versión'} necesita Java ${need}. Minecraft no puede arrancar con esa Java.`,
      soluciones: [
        `Instala Adoptium Temurin JRE ${need} desde adoptium.net/temurin (Windows x64) — o actualiza Hydra Launcher: desde la v1.3.17 la descarga y usa sola.`,
        'En Ajustes → Java deja la ruta en automático (sin Java personalizada).',
        'Si tienes varias Javas instaladas, desinstala las viejas (Panel de control → Programas) para evitar que se elija la incorrecta.'
      ]
    }
  }
  // 1b) Crash NATIVO del JVM (hs_err_pid): casi siempre el driver de gráficos — p.ej. al
  // compilar shaders al entrar a un servidor con GPUs Intel viejas (ig*icd64.dll)
  if (has(/EXCEPTION_ACCESS_VIOLATION|hs_err_pid|crash happened outside the Java Virtual Machine|Problematic frame/i)) {
    const dll = (t.match(/\[([A-Za-z0-9_]+\.dll)\+0x/i) || [])[1] || ''
    const vendor = /ig\w*icd|igd|intel/i.test(dll) ? 'Intel' : /^nv|nvidia/i.test(dll) ? 'NVIDIA' : /^(ati|amd)|aticfx|atidxx|amdx/i.test(dll) ? 'AMD' : ''
    const shaders = has(/glLinkProgram|compileProgram|GlProgram|ShaderSource|glCompileShader/i)
    return {
      titulo: 'Crash del driver de gráficos (no es Hydra, ni la cuenta, ni el servidor)',
      problema: `Minecraft crasheó en código nativo de tu PC${dll ? ` (${dll}${vendor ? ` — gráficos ${vendor}` : ''})` : ''}${shaders ? ' mientras compilaba shaders al entrar' : ' mientras renderizaba'} — un fallo 0xc0000005 del driver, no de Java ni del launcher.`,
      soluciones: [
        vendor
          ? `Actualiza el driver de gráficos ${vendor}: Windows Update → Actualización opcional, o la web de ${vendor} (en GPUs viejas, busca el último driver de tu modelo exacto).`
          : 'Actualiza los drivers de tu tarjeta gráfica (NVIDIA/AMD/Intel) desde su web o Windows Update.',
        'Mientras tanto: en Opciones de video baja Gráficos a "Rápido" y quita shaders/resource packs (en servidores, quita el resource pack del server).',
        'Si pasa siempre al entrar a un servidor, prueba otra versión de Minecraft (algunas usan menos efectos al cargar).',
        'El informe completo del JVM está en .minecraft\\hs_err_pid*.log — compártelo si el problema sigue.'
      ]
    }
  }
  // 2) Java demasiado NUEVA para mods/Forge antiguos (module access)
  if (has(/InaccessibleObjectException|module .+ does not (open|opens|add|export)|Unable to make .+ accessible/i)) {
    return {
      titulo: 'Java incompatible con mods antiguos',
      problema: `Los mods/Forge de esta versión no soportan la Java instalada${javaExe ? ` (${javaExe})` : ''}.`,
      soluciones: [
        'En Ajustes → Java pon una ruta de Java 8/17 (la que pida la versión antigua) o déjalo en automático y vuelve a lanzar.',
        'Si instalaste una Java nueva, no la elimines: elige otra para esta versión.',
        'Actualiza los mods o cambia a una versión más reciente de Minecraft.'
      ]
    }
  }
  // 3) Se acabó la RAM → subirla
  if (has(/OutOfMemoryError|Java heap space|GC overhead limit/i)) {
    return {
      titulo: 'Se acabó la memoria (RAM)',
      problema: 'Minecraft se quedó sin RAM — típico con muchos mods o texturas de 128x+.',
      soluciones: [
        'Ajustes → RAM asignada: súbela (p. ej. 4G si tienes 8GB de equipo).',
        'Cierra Chrome, Discord u otros programas pesados antes de jugar.',
        'Si ya está en el máximo, baja los mods o pon texturas más ligeras.'
      ]
    }
  }
  // 4) Xmx mayor que la RAM real → bajarla
  if (has(/Could not reserve enough space|Invalid maximum heap size|Insufficient memory for|reserve/i)) {
    return {
      titulo: 'RAM asignada mayor que la de tu equipo',
      problema: `El launcher pidió más memoria de la que tu PC puede dar (salida: código ${code ?? '?'}).`,
      soluciones: [
        'Ajustes → RAM asignada: baja a 2G–4G (nunca más de ~la mitad de tu RAM total).',
        'Cierra programas abiertos y vuelve a intentarlo.'
      ]
    }
  }
  // 5) Argumentos JVM inválidos
  if (has(/Could not create the Java Virtual Machine|Unrecognized VM option|Unrecognized option|Could not find the main class/i)) {
    return {
      titulo: 'Argumentos de Java inválidos',
      problema: 'La JVM rechazó los parámetros de arranque (RAM personalizada o Java inadecuada).',
      soluciones: [
        'Ajustes → RAM: usa valores estándar (2G/4G) sin textos raros.',
        'Ajustes → Java: pon la ruta en automático y reintenta.',
        'Prueba otra versión desde Versiones por si esa necesita otra Java.'
      ]
    }
  }
  // 6) Permisos / antivirus
  if (has(/Access is denied|Permission denied|Sharing violation|EPERM|unable to create.*file/i)) {
    return {
      titulo: 'Permisos bloqueados',
      problema: 'Windows o el antivirus impidieron leer/escribir archivos del juego.',
      soluciones: [
        'Añade una excepción en tu antivirus para la carpeta .minecraft y Hydra.',
        'Cierra otros launchers/Minecraft abiertos y reintenta.',
        'Ejecuta Hydra Launcher como administrador (clic derecho → Ejecutar como administrador).'
      ]
    }
  }
  // 7) Cuenta / sesión
  if (has(/Invalid session|Failed to authenticate|Unauthorized|HTTP 401|HTTP 403|Forbidden|refreshMicrosoft|access token/i)) {
    return {
      titulo: 'Sesión de cuenta inválida',
      problema: 'El token de tu cuenta venció o es inválido — Mojang rechazó el inicio.',
      soluciones: [
        'En Cuentas: elimina y vuelve a agregar tu cuenta (Microsoft u offline).',
        'Comprueba tu conexión e inténtalo de nuevo.',
        'Prueba con una cuenta offline si no vas a entrar a servidores premium.'
      ]
    }
  }
  // 8) Archivos dañados / mods incompatibles
  if (has(/ClassNotFoundException|NoClassDefFoundError|Unable to access jarfile|NoSuchMethodError|Mixin\w*Error|InvalidInjectionException|VerifyError/i)) {
    const mixin = has(/Mixin\w*Error|InvalidInjectionException|NoSuchMethodError/i)
    return {
      titulo: mixin ? 'Mods incompatibles con la versión' : 'Archivos del juego dañados',
      problema: mixin
        ? `Un mod no encaja con esta versión/loader (salida: código ${code ?? '?'}).`
        : 'Falta o está corrupto un archivo de la versión.',
      soluciones: mixin
        ? [
            'Quita los mods recién añadidos (carpeta mods) y vuelve a lanzar.',
            'Comprueba que los mods sean de la misma versión y loader (Fabric/Forge).',
            'Si es un modpack, reinstálalo desde Mods → Modpacks.'
          ]
        : [
            'Vuelve a lanzar la versión: Hydra re-descarga lo que falte.',
            'Si sigue, borra la carpeta de la versión en .minecraft/versions/<version> y lanza otra vez.',
            'Revisa Ajustes → Logs para ver el archivo exacto que falló.'
          ]
    }
  }
  // 9) GPU / ventanas
  if (has(/GLFW error|Window creation failed|Failed to initialize OpenGL|No available OpenGL/i)) {
    return {
      titulo: 'Fallo gráfico al abrir la ventana',
      problema: 'Minecraft no pudo crear la ventana de juego (GPU/drivers).',
      soluciones: [
        'Actualiza los drivers de tu tarjeta gráfica (NVIDIA/AMD/Intel).',
        'Cierra overlays: Discord, OBS, Steam, MSI Afterburner.',
        'Prueba con la resolución por defecto (Ajustes → Resolución).'
      ]
    }
  }
  // 10) Java de otra arquitectura
  if (has(/Error loading shared library|not a valid Win32 application|Bad CPU type|wrong ELF class/i)) {
    return {
      titulo: 'Java de arquitectura incorrecta',
      problema: 'La Java instalada no es compatible con tu Windows (32/64 bits).',
      soluciones: [
        'Instala Adoptium Temurin de Windows x64 desde adoptium.net/temurin.',
        'Desinstala las Javas de 32 bits antiguas.'
      ]
    }
  }
  // 11) Fallo de conexión a un servidor (netty/NIO) — el juego muere al intentar entrar a un server caído/inaccesible
  if (has(/AnnotatedConnectException|ConnectException|Connection refused|Connection timed out|No route to host|UnknownHostException|finishConnect|pollConnectNow/i)) {
    const host = (out.match(/(?:refused: |timed out: |no further information: )([^\s]+)/i) || [])[1] || ''
    return {
      titulo: 'Falló la conexión a un servidor (no es Hydra, ni tu Java, ni tu PC)',
      problema: `Minecraft murió mientras intentaba conectarse por red a un servidor${host ? ` (${host})` : ''} — la conexión TCP falló (server caído, IP incorrecta o sin ruta hacia él).`,
      soluciones: [
        'Si era un servidor del Nido: revisa en Discord si está caído o en mantenimiento — el panel del launcher ya lo muestra Offline.',
        'Si era otro servidor: verifica la IP:puerto y que esté encendido; prueba otro servidor para confirmar que tu conexión va bien.',
        'Cuando el servidor vuelva, vuelve a intentarlo — en tu equipo no hay nada que arreglar.',
        'El detalle completo está en el informe guardado (.minecraft\\hydra-crashes).'
      ]
    }
  }
  // fallback
  return {
    titulo: 'Minecraft terminó con error',
    problema: `El juego se cerró con código ${code ?? '?'} sin un error reconocido.`,
    soluciones: [
      'Mira las últimas líneas de la consola de abajo — ahí está el detalle real.',
      'Vuelve a intentarlo: a la 1ª ejecución Hydra descarga todo y a veces tarda.',
      'Si insiste, copia el diagnóstico y compártelo para poder revisarlo.'
    ]
  }
}

let launchDialogOpen = false
function showLaunchFailureDialog(opts: any, outText: string, code: number | null, javaExe: string, mcVer: string, reportFile: string | null) {
  if (launchDialogOpen) return
  launchDialogOpen = true
  const d = diagnoseLaunchFailure(outText, code, javaExe, mcVer)
  const lastLines = outText.split('\n').filter(Boolean).slice(-15).join('\n')
  const report = [
    `Hydra ${app.getVersion()} | MC ${mcVer || opts?.version || '?'} | loader ${opts?.loader || 'vanilla'} | exit ${code ?? '?'}`,
    `Java: ${javaExe || opts?.javaPath || 'auto'} | RAM: ${opts?.ram?.max || '4G'}`,
    `Problema: ${d.problema}`,
    '',
    lastLines
  ].join('\n')
  const sols = d.soluciones.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const boxOpts: any = {
    type: 'error',
    buttons: ['Copiar diagnóstico', 'Cerrar'],
    defaultId: 1,
    cancelId: 1,
    title: 'Hydra Launcher — Minecraft no pudo abrir',
    message: d.problema,
    detail: `${d.titulo}\n\nPosibles soluciones:\n${sols}\n\n${reportFile ? `Informe guardado: ${reportFile}\n` : ''}Últimas líneas de la consola:\n${lastLines || '(sin salida)'}\n\nSi nada funciona, copia el diagnóstico y pégalo donde te pidan ayuda.`,
    noLink: true
  }
  const w = win && !win.isDestroyed() ? win : undefined
  const p = w ? dialog.showMessageBox(w, boxOpts) : dialog.showMessageBox(boxOpts)
  p.then(r => {
    launchDialogOpen = false
    if (r.response === 0) {
      try {
        clipboard.writeText(report)
        const info: any = { type: 'info', buttons: ['OK'], title: 'Hydra Launcher', message: 'Diagnóstico copiado', detail: 'Pégalo donde te lo pidan (Discord, foro, soporte).', noLink: true }
        const w2 = win && !win.isDestroyed() ? win : undefined
        if (w2) dialog.showMessageBox(w2, info); else dialog.showMessageBox(info)
      } catch {}
    }
  }).catch(() => { launchDialogOpen = false })
}

ipcMain.handle('get-pending-crashes', () => {
  try {
    if (!fs.existsSync(CRASH_DIR)) return { ok: true, crashes: [] }
    const marker = path.join(HYDRA_DIR, 'last-crash-check')
    let lastCheck = 0
    try { lastCheck = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf-8')) || 0 : 0 } catch {}
    const crashes = fs.readdirSync(CRASH_DIR).filter(f => f.endsWith('.json')).map(f => {
      const p = path.join(CRASH_DIR, f)
      return { file: p, name: f, mtime: fs.statSync(p).mtimeMs }
    }).filter(c => c.mtime > lastCheck).sort((a, b) => b.mtime - a.mtime).slice(0, 3)
    return { ok: true, crashes }
  } catch { return { ok: true, crashes: [] } }
})
ipcMain.handle('dismiss-crashes', () => {
  try { fs.writeFileSync(path.join(HYDRA_DIR, 'last-crash-check'), String(Date.now())) } catch {}
  return true
})
ipcMain.handle('read-crash', (_e, file: string) => {
  try {
    if (!file || !file.startsWith(CRASH_DIR)) return { ok: false, error: 'ruta invalida' }
    return { ok: true, content: fs.readFileSync(file, 'utf-8') }
  } catch (e: any) { return { ok: false, error: String(e?.message || e) } }
})
ipcMain.handle('shell-open-path', (_e, p: string) => {
  try {
    if (!p || !p.startsWith(CRASH_DIR)) return false
    shell.showItemInFolder(p)
    return true
  } catch { return false }
})

// --- NEWS + SERVIDORES DE COMUNIDAD (JSON curado en el repo publico; solo el owner edita) ---
async function fetchCachedJson(url: string, cachePath: string, ttlMs: number): Promise<any> {
  try {
    const { data } = await axios.get(url, { timeout: 10000 })
    try { fs.writeFileSync(cachePath, JSON.stringify({ t: Date.now(), data })) } catch {}
    return data
  } catch {
    try {
      if (fs.existsSync(cachePath)) {
        const c = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
        if (Date.now() - (c.t || 0) < ttlMs * 7) return c.data
      }
    } catch {}
    return null
  }
}
ipcMain.handle('get-news', async () => {
  const data = await fetchCachedJson(`${RAW_BASE}/news.json`, NEWS_CACHE, 10 * 60_000)
  return { ok: !!data, posts: data?.posts || [] }
})
ipcMain.handle('get-community-servers', async () => {
  const data = await fetchCachedJson(`${RAW_BASE}/community-servers.json`, COMMUNITY_CACHE, 10 * 60_000)
  return { ok: !!data, servers: data?.servers || [], updated: data?.updated || '' }
})

// --- SKINS (Mojang sessionserver + upload con token Microsoft) ---
ipcMain.handle('get-skin', async (_e, uuidOrName: string) => {
  try {
    let uuid = String(uuidOrName || '').replace(/-/g, '')
    if (!/^[0-9a-f]{32}$/i.test(uuid)) {
      const { data: prof } = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(uuidOrName)}`, { timeout: 8000 })
      uuid = String(prof?.id || '').replace(/-/g, '')
      if (!uuid) return { ok: false, error: 'Cuenta no encontrada en Mojang' }
    }
    const { data } = await axios.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, { timeout: 8000 })
    const prop = (data?.properties || []).find((p: any) => p.name === 'textures')
    if (!prop?.value) return { ok: false, error: 'Sin textura' }
    const tex = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf-8'))
    const url = tex?.textures?.SKIN?.url
    if (!url) return { ok: false, error: 'Sin skin' }
    const model = tex.textures.SKIN.metadata?.model === 'slim' ? 'slim' : 'classic'
    const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 })
    return { ok: true, dataUrl: `data:image/png;base64,${Buffer.from(img.data).toString('base64')}`, model }
  } catch (e: any) { return { ok: false, error: String(e?.response?.data?.errorMessage || e?.message || e) } }
})

ipcMain.handle('upload-skin', async (_e, opts: any) => {
  try {
    const { b64, variant, msRefresh } = opts || {}
    if (!b64 || !msRefresh) return { ok: false, error: 'Faltan datos (skin o sesión Microsoft)' }
    const { Auth } = await import('msmc')
    const auth = new Auth('select_account')
    const xbox = await auth.refresh(msRefresh)
    const mc = await xbox.getMinecraft()
    const token: string = (mc as any).mclc ? ((mc as any).mclc(false)?.access_token || (mc as any).mcToken) : (mc as any).mcToken
    if (!token) return { ok: false, error: 'No se pudo obtener el token de Minecraft' }
    const buf = Buffer.from(String(b64).replace(/^data:image\/png;base64,/, ''), 'base64')
    if (buf.length < 100 || buf.length > 2_000_000) return { ok: false, error: 'PNG invalido (100B - 2MB)' }
    const fd = new FormData()
    fd.append('file', new Blob([new Uint8Array(buf)], { type: 'image/png' }), 'skin.png')
    fd.append('variant', String(variant || 'classic').toLowerCase() === 'slim' ? 'SLIM' : 'CLASSIC')
    const r = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd as any
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return { ok: false, error: `Mojang ${r.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e: any) { return { ok: false, error: String(e?.message || e) } }
})
