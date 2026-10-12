import net from 'net'

let sock: net.Socket | null = null
let ready = false
let currentClientId = ''
let nonceSeq = 0

function frame(opcode: number, payload: any): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(8)
  header.writeInt32LE(opcode, 0)
  header.writeInt32LE(json.length, 4)
  return Buffer.concat([header, json])
}

function connectPipe(clientId: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const pipes: string[] = []
    for (let i = 0; i < 10; i++) {
      if (process.platform === 'win32') pipes.push(`\\\\.\\pipe\\discord-ipc-${i}`)
      else pipes.push(`/tmp/discord-ipc-${i}`)
    }
    let idx = 0
    const tryNext = () => {
      if (idx >= pipes.length) return reject(new Error('discord ipc not found'))
      const s = net.createConnection(pipes[idx++])
      const onError = (e: Error) => { s.destroy(); tryNext() }
      s.once('error', onError)
      s.once('connect', () => {
        s.removeListener('error', onError)
        s.on('error', () => { ready = false; sock = null })
        resolve(s)
      })
    }
    tryNext()
  })
}

async function ensure(clientId: string): Promise<net.Socket | null> {
  if (ready && sock && currentClientId === clientId) return sock
  try { sock?.destroy() } catch {}
  sock = null; ready = false
  if (!clientId || !/^\d{10,25}$/.test(clientId)) return null
  try {
    const s = await connectPipe(clientId)
    s.write(frame(0, { v: 1, client_id: clientId }))
    let buf = Buffer.alloc(0)
    await new Promise<void>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk])
        while (buf.length >= 8) {
          const len = buf.readInt32LE(4)
          if (buf.length < 8 + len) break
          const body = JSON.parse(buf.slice(8, 8 + len).toString('utf8'))
          buf = buf.slice(8 + len)
          if (body.evt === 'READY' || body.cmd === 'AUTHORIZE') { s.removeListener('data', onData); resolve(); return }
          if (body.evt === 'ERROR') { reject(new Error(body.data?.message || 'discord error')); return }
        }
      }
      s.on('data', onData)
      setTimeout(() => resolve(), 2500)
    })
    sock = s; ready = true; currentClientId = clientId
    return s
  } catch {
    return null
  }
}

export async function discordSetActivity(clientId: string, activity: any): Promise<boolean> {
  const s = await ensure(clientId)
  if (!s) return false
  try {
    s.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: String(++nonceSeq) }))
    return true
  } catch { return false }
}

export function discordClearActivity(): void {
  if (!ready || !sock) return
  try { sock.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: String(++nonceSeq) })) } catch {}
}

export function discordShutdown(): void {
  try { discordClearActivity() } catch {}
  try { sock?.destroy() } catch {}
  sock = null; ready = false
}
