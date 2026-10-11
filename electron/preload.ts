import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // versiones
  getVersions: () => ipcRenderer.invoke('get-versions'),
  getFabricVersions: (mc: string) => ipcRenderer.invoke('get-fabric', mc),
  getForgeVersions: (mc: string) => ipcRenderer.invoke('get-forge', mc),
  // launcher
  launch: (opts: any) => ipcRenderer.invoke('launch', opts),
  onLaunchLog: (cb: (msg:string)=>void) => ipcRenderer.on('launch-log', (_e, v)=>cb(v)),
  onProgress: (cb: (p:any)=>void) => ipcRenderer.on('download-progress', (_e, v)=>cb(v)),
  // config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (c:any) => ipcRenderer.invoke('save-config', c),
  // java / ram
  detectJava: () => ipcRenderer.invoke('detect-java'),
  // servers
  pingServer: (ip:string, port:number) => ipcRenderer.invoke('ping-server', ip, port),
  // auth
  loginMicrosoft: () => ipcRenderer.invoke('ms-login'),
  getInstalled: () => ipcRenderer.invoke('get-installed'),
  getInstalledVersionsFull: () => ipcRenderer.invoke('get-installed-versions-full'),
  getFabricInstalled: (mc: string) => ipcRenderer.invoke('get-fabric-installed', mc),
  getModsInfo: () => ipcRenderer.invoke('get-mods-info'),
  getModpacks: () => ipcRenderer.invoke('get-modpacks'),
  saveModpack: (pack: any) => ipcRenderer.invoke('save-modpack', pack),
  deleteModpack: (id: string) => ipcRenderer.invoke('delete-modpack', id),
  getModpackMods: (id: string) => ipcRenderer.invoke('get-modpack-mods', id),
  applyModpack: (id: string) => ipcRenderer.invoke('apply-modpack', id),
  getSystemRam: () => ipcRenderer.invoke('get-system-ram'),
  // fs
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  saveAccounts: (a:any) => ipcRenderer.invoke('save-accounts', a),
  // window
  winMin: () => ipcRenderer.invoke('win:min'),
  winMax: () => ipcRenderer.invoke('win:max'),
  winClose: () => ipcRenderer.invoke('win:close'),
  // auto-updater
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (cb: (info:any)=>void) => ipcRenderer.on('update-available', (_e, v)=>cb(v)),
  onUpdateDownloaded: (cb: (info:any)=>void) => ipcRenderer.on('update-downloaded', (_e, v)=>cb(v)),
})
