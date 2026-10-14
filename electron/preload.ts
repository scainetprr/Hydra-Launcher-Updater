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
  getPcScan: () => ipcRenderer.invoke('get-pc-scan'),
  installJava: (opts:any) => ipcRenderer.invoke('install-java', opts),
  openExternal: (url:string) => ipcRenderer.invoke('open-external', url),
  // servers
  pingServer: (ip:string, port:number) => ipcRenderer.invoke('ping-server', ip, port),
  pingFull: (ip:string, port:number) => ipcRenderer.invoke('ping-full', ip, port),
  // versiones / limpieza
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  deleteVersion: (id:string) => ipcRenderer.invoke('delete-version', id),
  cleanupOldInstallers: () => ipcRenderer.invoke('cleanup-old-installers'),
  // interfaz
  setZoom: (z:number) => ipcRenderer.invoke('set-zoom', z),
  // mods / modpacks (Modrinth + CurseForge)
  browseContent: (opts:any) => ipcRenderer.invoke('browse-content', opts),
  getContentDetail: (opts:any) => ipcRenderer.invoke('get-content-detail', opts),
  installContent: (opts:any) => ipcRenderer.invoke('install-content', opts),
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
  // stats / crashes
  getStats: () => ipcRenderer.invoke('get-stats'),
  getPendingCrashes: () => ipcRenderer.invoke('get-pending-crashes'),
  dismissCrashes: () => ipcRenderer.invoke('dismiss-crashes'),
  readCrash: (file: string) => ipcRenderer.invoke('read-crash', file),
  shellOpenPath: (p: string) => ipcRenderer.invoke('shell-open-path', p),
  onSessionStart: (cb: (info:any)=>void) => ipcRenderer.on('session-start', (_e, v)=>cb(v)),
  onSessionEnd: (cb: (ok:boolean)=>void) => ipcRenderer.on('session-end', (_e, v)=>cb(v)),  // news / comunidad (repo publico, curado por el owner)
  getNews: () => ipcRenderer.invoke('get-news'),
  getCommunityServers: () => ipcRenderer.invoke('get-community-servers'),
  // skins
  getSkin: (uuidOrName: string) => ipcRenderer.invoke('get-skin', uuidOrName),
  uploadSkin: (opts: any) => ipcRenderer.invoke('upload-skin', opts),
  // fs
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  saveAccounts: (a:any) => ipcRenderer.invoke('save-accounts', a),
  // window
  winMin: () => ipcRenderer.invoke('win:min'),
  winMax: () => ipcRenderer.invoke('win:max'),
  winClose: () => ipcRenderer.invoke('win:close'),
  // auto-updater
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  installUpdate: (opts?: any) => ipcRenderer.invoke('install-update', opts),
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),
  onUpdateAvailable: (cb: (info:any)=>void) => ipcRenderer.on('update-available', (_e, v)=>cb(v)),
  onUpdateDownloaded: (cb: (info:any)=>void) => ipcRenderer.on('update-downloaded', (_e, v)=>cb(v)),
})
