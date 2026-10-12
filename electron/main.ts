import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import axios from 'axios'
import { execSync } from 'child_process'
import net from 'net'
import { autoUpdater } from 'electron-updater'
import { discordSetActivity, discordClearActivity, discordShutdown } from './discord'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// polyfill para CJS deps bundleadas (minecraft-launcher-core usa __dirname)
if (!(globalThis as any).__dirname) (globalThis as any).__dirname = __dirname
if (!(globalThis as any).__filename) (globalThis as any).__filename = __filename

let win: BrowserWindow | null = null

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
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true })
if (!fs.existsSync(HYDRA_DIR)) fs.mkdirSync(HYDRA_DIR, { recursive: true })

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

app.whenReady().then(() => {
  createWindow()
  setTimeout(() => setIdlePresence(), 3500)
  // Auto-updater en producción
  if (!process.env.VITE_DEV_SERVER_URL) {
    autoUpdater.checkForUpdatesAndNotify()
    autoUpdater.on('update-available', (info) => {
      console.log('[autoUpdater] update available:', info.version)
      win?.webContents.send('update-available', info)
    })
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[autoUpdater] update downloaded:', info.version)
      win?.webContents.send('update-downloaded', info)
    })
    autoUpdater.on('error', (err) => {
      console.error('[autoUpdater] error:', err)
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
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { try { discordShutdown() } catch {} })

// --- WINDOW ---
ipcMain.handle('win:min', () => win?.minimize())
ipcMain.handle('win:max', () => win?.isMaximized() ? win?.unmaximize() : win?.maximize())
ipcMain.handle('win:close', () => win?.close())

// --- AUTO-UPDATER ---
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
  autoUpdater.quitAndInstall()
  return { ok: true }
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
  const base = { ram: { min: '1G', max: '4G' }, javaPath: '', resolution: { w: 854, h: 480 }, servers: defaultServers.map(s=>({...s})), serversVersion: SERVERS_VERSION, cleanupOldOnUpdate: true, uiZoom: 0.8, curseforgeKey: '', lastVersion: '26.2', lastLoader: 'vanilla', lastAccountUuid: '' }
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
      buttons: [{ label: 'Hydra Launcher', url: 'https://scainetprr.github.io/hydra-launcher-web/' }],
      instance: false
    }).catch(() => {})
  } catch {}
}
ipcMain.handle('get-accounts', () => fs.existsSync(ACCOUNTS_PATH) ? JSON.parse(fs.readFileSync(ACCOUNTS_PATH,'utf-8')) : [])
ipcMain.handle('save-accounts', (_e, a) => { fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(a,null,2)); return true })

// --- VERSIONS (Mojang manifest) ---
ipcMain.handle('get-versions', async () => {
  const { data } = await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { timeout: 8000 })
  return data // { latest, versions: [{id,type,url,releaseTime}] }
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
function findJavaCandidates(): string[] {
  const c: string[] = []
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
      let type = 'vanilla'; let valid = false; let modpack: string | null = null
      if (fs.existsSync(jsonPath)) {
        try {
          const j = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
          type = j.type || 'vanilla'
          valid = true
          if (j.hydraModpack?.name) modpack = String(j.hydraModpack.name)
        } catch {}
      }
      result.push({ id: d, type, valid, modpack })
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
        buttons: [{ label: 'Hydra Launcher', url: 'https://scainetprr.github.io/hydra-launcher-web/' }]
      }).catch(()=>{})
    }
    const { Client } = await import('minecraft-launcher-core')
    const launcher = new Client()

    const root = opts.root || ROOT
    const version: string = opts.version
    // Modpack Hydra: la versión seleccionada es una carpeta creada por el instalador de packs
    let mcVersion: string = version
    let packLoader = ''
    try {
      const packJson = path.join(root, 'versions', version, `${version}.json`)
      if (fs.existsSync(packJson)) {
        const pj = JSON.parse(fs.readFileSync(packJson, 'utf-8'))
        if (pj?.hydraModpack) {
          const mp = pj.hydraModpack
          mcVersion = mp.base || version
          packLoader = mp.loader || 'vanilla'
          send(`  modpack "${mp.name}" → Minecraft ${mcVersion}, loader ${packLoader}`)
          // Activar mods del pack: quitar mods sincronizados por otros packs y copiar los de este
          const vRoot = path.join(root, 'versions')
          const globalMods = path.join(root, 'mods')
          try {
            for (const d of fs.readdirSync(vRoot)) {
              const mk = path.join(vRoot, d, '.hydra-synced.json')
              if (!fs.existsSync(mk)) continue
              const prev: string[] = JSON.parse(fs.readFileSync(mk, 'utf-8'))
              for (const f of prev) { try { fs.rmSync(path.join(globalMods, f), { force: true }) } catch {} }
            }
          } catch {}
          const packMods = path.join(vRoot, version, 'mods')
          const synced: string[] = []
          if (fs.existsSync(packMods)) {
            fs.mkdirSync(globalMods, { recursive: true })
            for (const f of fs.readdirSync(packMods)) {
              if (!f.endsWith('.jar')) continue
              fs.copyFileSync(path.join(packMods, f), path.join(globalMods, f))
              synced.push(f)
            }
          }
          try { fs.writeFileSync(path.join(vRoot, version, '.hydra-synced.json'), JSON.stringify(synced)) } catch {}
          send(`  ${synced.length} mods del pack activados en /mods`)
        }
      }
    } catch (e: any) { send(`  aviso modpack: ${String(e?.message || e)}`) }
    // detectar tipo real desde manifest (release/snapshot) para no forzar 'release' en snapshots como 26.3-rc-3
    let type = 'release'
    try {
      const { data } = await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { timeout: 8000 })
      const found = (data.versions as any[]).find(v=>v.id===mcVersion)
      if (found?.type) type = found.type
      send(`  tipo detectado: ${type}`)
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

    // java: auto-detect si no viene
    let javaPath: string = opts.javaPath || ''
    if (!javaPath) {
      const cands = findJavaCandidates()
      send(`  javas detectadas: ${cands.join(' | ') || 'ninguna'}`)
      if (cands.length) {
        // preferir Java 21 para 1.20.5+ / 26.x, Java 17 para 1.18+
        javaPath = cands[0]
        // intentar elegir la mÃ¡s nueva si hay varias
        try {
          let best = cands[0]; let bestVer = 0
          for (const p of cands) {
            try {
              const out = execSync(`"${p}" -version`, { encoding:'utf-8' }).toString()
              const m = out.match(/version "(\\d+)\\./) || out.match(/(\\d+)\\./)
              const ver = m ? parseInt(m[1],10) : 0
              if (ver > bestVer) { bestVer = ver; best = p }
            } catch {}
          }
          javaPath = best
          send(`  java elegido: ${javaPath}`)
        } catch {}
      }
    } else {
      send(`  java custom: ${javaPath}`)
      if (!fs.existsSync(javaPath)) throw new Error(`Java no encontrado: ${javaPath}`)
    }

    // Como launcher normal: usa .minecraft directo, no instances aisladas, para compartir worlds/resourcepacks
    const gameDir = root // .minecraft
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
      const modsDir = path.join(root, 'mods')
      const modsCount = fs.existsSync(modsDir) ? fs.readdirSync(modsDir).filter(f => f.endsWith('.jar')).length : 0
      send(`  custom=${customVersion || '(vanilla, sin custom)'} loader=${opts.loader}`)
      send(`  mods en /mods: ${modsCount} jars${customVersion ? '' : ' (vanilla ignora mods)'}`)
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
      overrides: { gameDirectory: gameDir, detached: false }
    }
    if (javaPath) launchOpts.javaPath = javaPath
    if (forgePath) launchOpts.forge = forgePath
    if (opts.server?.ip) {
      launchOpts.quickPlay = { type: 'multiplayer', identifier: `${opts.server.ip}:${opts.server.port||25565}` }
      send(`  quickPlay → ${opts.server.ip}:${opts.server.port||25565}`)
    }

    // logs detallados
    ;(['debug','data','progress','download','close','error'] as const).forEach(ev=>{
      // @ts-ignore
      launcher.on(ev, (e:any)=> {
        const msg = typeof e === 'string' ? e : JSON.stringify(e).slice(0,1200)
        send(`[${ev}] ${msg}`)
      })
    })
    // algunos builds emiten 'arguments'
    // @ts-ignore
    launcher.on('arguments', (e:any)=> send(`[args] ${JSON.stringify(e).slice(0,800)}`))

    send(`  root=${root}`)
    send(`  launching... (descarga puede tardar la 1ra vez)`)
    const proc: any = await launcher.launch(launchOpts)
    send(`âœ” Minecraft lanzado PID ${proc?.pid || '?'}`)
    if (proc?.on) {
      proc.on('close', (code:number)=> {
        send(`  proceso cerrado code ${code}`)
        recordSessionEnd(true)
        try { win?.webContents.send('session-end', true) } catch {}
        lastIdleAt = 0
        setIdlePresence()
      })
      proc.on('error', (e:any)=> {
        send(`  proceso error ${String(e)}`)
        recordSessionEnd(false)
        try { win?.webContents.send('session-end', false) } catch {}
        lastIdleAt = 0
        setIdlePresence()
      })
    }
    return { ok: true, pid: proc?.pid }
  }catch(e:any){
    const msg = e?.message || String(e)
    const stack = e?.stack || ''
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
    if (source === 'curseforge') {
      const key = await getCurseForgeKey()
      if (!key) return { ok: false, needsKey: true, error: 'Falta la API key de CurseForge (Ajustes -> Integraciones)' }
      const headers = { 'x-api-key': key, Accept: 'application/json' }
      const params: any = {
        gameId: 432,
        classId: type === 'modpack' ? 4471 : 6,
        pageSize: Math.min(Number(limit) || 20, 50),
        index: Number(offset) || 0,
        sortField: index === 'recent' ? 3 : 6,
        sortOrder: 'desc'
      }
      if (query) params.searchFilter = query
      if (gameVersion) params.gameVersion = gameVersion
      if (loader && loader !== 'vanilla') params.modLoaderType = CF_LOADER[loader] || 0
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
    const facets: string[][] = [[`project_type:${type === 'modpack' ? 'modpack' : 'mod'}`]]
    if (gameVersion) facets.push([`versions:${gameVersion}`])
    if (loader && loader !== 'vanilla') facets.push([`categories:${loader}`])
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
  const { source, id, type, gameVersion, loader } = opts || {}
  const send = (m: string) => { console.log('[install]', m); win?.webContents.send('launch-log', m) }
  const modsDir = path.join(ROOT, 'mods')
  try {
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })
    let fileUrl = '', fileName = ''
    const cfHeaders = { 'x-api-key': await getCurseForgeKey(), Accept: 'application/json' }
    if (source === 'modrinth') {
      const params: any = {}
      if (gameVersion) params.game_versions = JSON.stringify([gameVersion])
      if (loader && loader !== 'vanilla') params.loaders = JSON.stringify([loader])
      const { data: versions } = await axios.get(`https://api.modrinth.com/v2/project/${id}/version`, { params, timeout: 20000 })
      if (!versions?.length) return { ok: false, error: `Sin versiones compatibles (${gameVersion || '*'} / ${loader || '*'})` }
      const v = versions[0]
      const file = (v.files || []).find((f: any) => f.primary) || v.files?.[0]
      if (!file) return { ok: false, error: 'Version sin archivos' }
      fileUrl = file.url; fileName = file.filename
      send(`  Modrinth: ${fileName} (${v.version_number || ''})`)
    } else if (source === 'curseforge') {
      if (!cfHeaders['x-api-key']) return { ok: false, needsKey: true, error: 'Falta la API key de CurseForge' }
      const { data: filesRes } = await axios.get(`https://api.curseforge.com/v1/mods/${id}/files`, {
        params: {
          pageSize: 50, index: 0,
          gameVersion: gameVersion || undefined,
          modLoaderType: loader && loader !== 'vanilla' ? CF_LOADER[loader] : undefined
        },
        headers: cfHeaders, timeout: 20000
      })
      const file = (filesRes.data || []).find((f: any) => f.isAvailable !== false && !f.isServerPack) || filesRes.data?.[0]
      if (!file) return { ok: false, error: 'Sin archivos compatibles en CurseForge' }
      const { data: dl } = await axios.get(`https://api.curseforge.com/v1/mods/${id}/files/${file.id}/download-url`, { headers: cfHeaders, timeout: 15000 })
      fileUrl = dl.data; fileName = file.fileName || (type === 'modpack' ? 'modpack.zip' : `${id}.jar`)
      send(`  CurseForge: ${fileName}`)
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

      // Overrides (config, resourcepacks...) → .minecraft global
      const overrides = path.join(tempDir, 'overrides')
      if (fs.existsSync(overrides)) {
        try { fs.cpSync(overrides, ROOT, { recursive: true }) } catch {}
        send('  overrides aplicados')
      }

      // JSON de version: el pack aparece en Instaladas y el launch lo detecta
      fs.writeFileSync(path.join(packDir, packId + '.json'), JSON.stringify({
        id: packId,
        inheritsFrom: baseVersion || '1.20.1',
        type: 'release',
        hydraModpack: { name: packName, loader: packLoader, base: baseVersion || '1.20.1' }
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

    const dest = path.join(modsDir, path.basename(fileName))
    fs.writeFileSync(dest, buf)
    send(`  Instalado en mods/: ${fileName} (${Math.round(buf.length / 1024)} KB)`)
    return { ok: true, filename: path.basename(fileName), size: buf.length }
  } catch (e: any) {
    const msg = String(e?.response?.data?.message || e?.message || e)
    send(`  fallo instalando: ${msg}`)
    return { ok: false, error: msg }
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
