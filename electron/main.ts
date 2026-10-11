import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import axios from 'axios'
import { execSync } from 'child_process'
import net from 'net'
import { autoUpdater } from 'electron-updater'

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
      webSecurity: false
    },
    icon: path.join(process.cwd(), 'public/icon.png')
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.error('[did-fail-load]', code, desc, url))
  win.webContents.on('console-message', (_e, level, msg) => console.log('[renderer]', msg))
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const htmlPath = path.join(__dirname, '../dist/index.html')
    console.log('[main] loadFile', htmlPath, fs.existsSync(htmlPath))
    win.loadFile(htmlPath)
    // win.webContents.openDevTools({ mode: 'detach' })
  }
}

app.whenReady().then(() => {
  createWindow()
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
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

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
ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall()
  return { ok: true }
})

// --- CONFIG ---
ipcMain.handle('get-config', () => {
  if (!fs.existsSync(CONFIG_PATH)) return { ram: { min: '1G', max: '4G' }, javaPath: '', resolution: { w: 854, h: 480 }, servers: defaultServers, lastVersion: '26.2', lastLoader: 'vanilla', lastAccountUuid: '' }
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    if (!cfg.lastVersion) cfg.lastVersion = '26.2'
    if (!cfg.lastLoader) cfg.lastLoader = 'vanilla'
    return cfg
  } catch { return { ram: { min: '1G', max: '4G' }, javaPath: '', resolution: { w: 854, h: 480 }, servers: defaultServers, lastVersion: '26.2', lastLoader: 'vanilla', lastAccountUuid: '' } }
})
ipcMain.handle('save-config', (_e, c) => { fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2)); return true })
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
      let type = 'vanilla'; let valid = false
      if (fs.existsSync(jsonPath)) {
        try {
          const j = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
          type = j.type || 'vanilla'
          valid = true
        } catch {}
      }
      result.push({ id: d, type, valid })
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
    if (!data.access_token || !data.uuid) throw new Error('Microsoft no devolviÃ³ token/perfil (Â¿cerraste la ventana?)')
    return { ok: true, data }
  } catch(e:any){ return { ok:false, error: String(e?.message||e) } }
})

// Refresca sesiÃ³n Microsoft usando el refresh token guardado. Devuelve MCLC user fresco o null.
async function refreshMicrosoft(msRefresh: string, send: (m:string)=>void): Promise<any|null> {
  if (!msRefresh) return null
  try {
    const { Auth } = await import('msmc')
    const auth = new Auth('select_account')
    send('  refrescando sesiÃ³n Microsoft...')
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
    send(`  sesiÃ³n fresca para ${fresh.name}`)
    return fresh
  } catch(e:any) {
    send(`  âš  no se pudo refrescar (${String(e?.message||e).slice(0,150)}), se usarÃ¡ token guardado`)
    return null
  }
}

// --- LAUNCH con minecraft-launcher-core ---
ipcMain.handle('launch', async (_e, opts:any) => {
  const send = (m:string) => { console.log('[launch]', m); win?.webContents.send('launch-log', m) }
  try{
    send(`â†’ Hydra preparando ${opts.version} (${opts.loader||'vanilla'}) como ${opts.account?.name}...`)
    const { Client } = await import('minecraft-launcher-core')
    const launcher = new Client()

    const root = opts.root || ROOT
    const version: string = opts.version
    // detectar tipo real desde manifest (release/snapshot) para no forzar 'release' en snapshots como 26.3-rc-3
    let type = 'release'
    try {
      const { data } = await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { timeout: 8000 })
      const found = (data.versions as any[]).find(v=>v.id===version)
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
        throw new Error(`Cuenta Microsoft "${name}" sin token vÃ¡lido. Borra la cuenta en Cuentas y vuelve a hacer "Microsoft â†’" para iniciar sesiÃ³n de nuevo.`)
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
    if (opts.loader === 'fabric') {
      customVersion = await installFabric(version, send)
    } else if (opts.loader === 'forge') {
      const res = await installForge(version, send)
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
      version: { number: version, type, custom: customVersion || undefined },
      memory: { max: opts.ram?.max || '4G', min: opts.ram?.min || '1G' },
      overrides: { gameDirectory: gameDir, detached: false }
    }
    if (javaPath) launchOpts.javaPath = javaPath
    if (forgePath) launchOpts.forge = forgePath
    if (opts.server?.ip) {
      launchOpts.quickPlay = { type: 'multiplayer', identifier: `${opts.server.ip}:${opts.server.port||25565}` }
      send(`  quickPlay â†’ ${opts.server.ip}:${opts.server.port||25565}`)
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
      proc.on('close', (code:number)=> send(`  proceso cerrado code ${code}`))
      proc.on('error', (e:any)=> send(`  proceso error ${String(e)}`))
    }
    return { ok: true, pid: proc?.pid }
  }catch(e:any){
    const msg = e?.message || String(e)
    const stack = e?.stack || ''
    send(`âœ— FALLO: ${msg}`)
    if (stack) send(stack.slice(0,3000))
    console.error(e)
    try { dialog.showErrorBox('Hydra Launcher - fallo al lanzar', `${msg}\n\nRevisa Ajustes â†’ Logs\nJava: ${findJavaCandidates().join(', ') || 'no detectado'}\nVersiÃ³n: ${opts?.version}`) } catch {}
    return { ok:false, error: msg + '\n' + stack }
  }
})

const defaultServers = [
  { id:'eventos', name:'Eventos Exclusivos', ip:'eventos.tu-servidor.com', port:25565, type:'event', desc:'Tus eventos creados - Parkour, PvP, Spleef', banner:'ðŸŽ‰' },
  { id:'survival', name:'Survival', ip:'survival.tu-servidor.com', port:25565, type:'survival', desc:'Survival clÃ¡sico 1.20+ con economÃ­a', banner:'ðŸŒ²' },
  { id:'oneblock', name:'OneBlock', ip:'oneblock.tu-servidor.com', port:25565, type:'oneblock', desc:'Un bloque infinito - Skyblock extremo', banner:'ðŸ§±' },
  { id:'lobby', name:'Lobby Principal', ip:'lobby.tu-servidor.com', port:25565, type:'lobby', desc:'Conecta y elige modo', banner:'ðŸ°' },
]

