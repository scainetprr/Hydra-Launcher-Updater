import { create } from 'zustand'

type Account = { name: string; uuid: string; type: 'offline'|'microsoft'; access_token?: string }
type Server = { id:string; name:string; ip:string; port:number; type:string; desc:string; banner:string }
type Config = { ram:{min:string;max:string}; javaPath:string; resolution:{w:number;h:number}; servers:Server[]; lastVersion?:string; lastLoader?:'vanilla'|'fabric'|'forge'; lastAccountUuid?:string }

export const useStore = create<{
  versions:any[]|null; latest:any; selectedVersion:string; loader:'vanilla'|'fabric'|'forge'; 
  accounts:Account[]; activeAccount:Account|null;
  config:Config; logs:string[]; progress:any; launching:boolean;
  set:(p:Partial<any>)=>void; addLog:(s:string)=>void;
}>((set)=>({
  versions: null, latest: null, selectedVersion: '1.21.4', loader:'vanilla',
  accounts: [{ name:'Player', uuid:'offline-player', type:'offline'}],
  activeAccount: null,
  config: { ram:{min:'1G',max:'4G'}, javaPath:'', resolution:{w:854,h:480}, servers:[] },
  logs: [], progress: null, launching:false,
  set: (p)=> set(p),
  addLog: (s)=> set(st=>({logs:[...st.logs.slice(-400), s]}))
}))