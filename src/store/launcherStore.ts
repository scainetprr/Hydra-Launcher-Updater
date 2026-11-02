import { create } from 'zustand'

type Account = { name: string; uuid: string; type: 'offline'|'microsoft'; access_token?: string; msRefresh?: string }
type Server = { id:string; name:string; ip:string; port:number; type:string; desc:string; banner:string }
export type Profile = { id:string; name:string; icon:string; version:string; loader:'vanilla'|'fabric'|'forge'|'neoforge'; ram:{min:string;max:string}; serverIp?:string }
type Config = { ram:{min:string;max:string}; javaPath:string; resolution:{w:number;h:number}; servers:Server[]; lastVersion?:string; lastLoader?:'vanilla'|'fabric'|'forge'|'neoforge'; lastAccountUuid?:string; cleanupOldOnUpdate?:boolean; uiZoom?:number; curseforgeKey?:string; serversVersion?:number; theme?:string; profiles?:Profile[]; votes?:Record<string,number>; discordClientId?:string; animatedBg?:string; animatedBgFile?:string; uiSounds?:boolean; uiSoundsVolume?:number; lowFx?:boolean }

// Modal in-app global (errores, crashes, confirmaciones): reemplaza a alert/confirm
// nativos y a los dialogos del main — esos dialogos robaban el foco al renderer y
// dejaban la barra de búsqueda de todas las secciones inutilizable tras cerrarlos.
export type UiModal = {
  id?: number                 // id IPC si viene del main (requiere respuesta via replyHydraModal)
  kind?: 'alert'|'confirm'|'crash'|'error'
  titulo?: string
  problema?: string
  detalle?: string
  meta?: string
  soluciones?: string[]
  culprit?: string            // mod culpable detectado
  console?: string            // ultimas lineas de la consola (colapsable)
  report?: string             // diagnostico completo para copiar
  reportFile?: string
  okLabel?: string
  cancelLabel?: string
  onConfirm?: (ok:boolean)=>void
}

// Los logs llegan en ráfagas (miles de líneas durante el lanzamiento): se agrupan en
// tandas de 150ms para que React no se congele y la ventana no quede "No responde".
let logBuf: string[] = []
let logFlush: ReturnType<typeof setTimeout> | null = null

export const useStore = create<{
  versions:any[]|null; latest:any; selectedVersion:string; loader:'vanilla'|'fabric'|'forge'|'neoforge';
  accounts:Account[]; activeAccount:Account|null;
  config:Config; logs:string[]; progress:any; launching:boolean;
  installedVersions:any[]; uiModal:UiModal|null;
  set:(p:Partial<any>)=>void; addLog:(s:string)=>void;
}>((set)=>({
  versions: null, latest: null, selectedVersion: '1.21.4', loader:'vanilla',
  accounts: [],
  activeAccount: null,
  config: { ram:{min:'1G',max:'4G'}, javaPath:'', resolution:{w:854,h:480}, servers:[], theme:'hydra', profiles:[], votes:{}, animatedBg:'off', uiSounds: true, uiSoundsVolume: 0.35 },
  logs: [], progress: null, launching:false,
  installedVersions: [],
  uiModal: null,
  set: (p)=> set(p),
  addLog: (s)=>{
    logBuf.push(s)
    if (logFlush) return
    logFlush = setTimeout(()=>{
      logFlush = null
      const lines = logBuf; logBuf = []
      if (lines.length) set(st=>({logs:[...st.logs.slice(-400), ...lines].slice(-400)}))
    }, 150)
  }
}))
