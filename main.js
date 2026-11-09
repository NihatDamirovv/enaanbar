'use strict'
/**
 * ENA Anbar — Windows proqramı (Electron).
 * Baza SERVERDƏDİR: hər əmr serverə gedir (POST /api), dəyişikliklər canlı gəlir (GET /events).
 * Burada yalnız pəncərələr idarə olunur.
 */
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')

if (!app.requestSingleInstanceLock()) app.quit()
// tarix sahələri 09.11.2026, saat 24 saatlıq görünsün (Chromium-da «az» dili yoxdur — eyni formatlı «tr»)
app.commandLine.appendSwitch('lang', 'tr')

const SERVER = (process.env.ENA_SERVER || 'http://16.16.236.53:8082').replace(/\/$/, '')
const ICON = path.join(__dirname, 'build', 'icon.png')
const OFFLINE = 'Serverə qoşulmaq olmur. İnternet bağlantısını yoxlayın və yenidən cəhd edin.'

let token = ''
let role = null // 'anbar' | 'muhasib'

const PAGES = {
  login: { w: 940, h: 620, title: 'Giriş', resizable: false },
  menu: { w: 1120, h: 740, title: 'Əsas menyu' },
  entry: { w: 1200, h: 780, title: 'Ana səhifə', write: true },
  items: { w: 1180, h: 760, title: 'Anbar' },
  purchases: { w: 1180, h: 760, title: 'Alışlar' },
  issues: { w: 1180, h: 760, title: 'Məxariclər' },
  buses: { w: 1220, h: 800, title: 'Avtobuslar' },
  notes: { w: 1120, h: 760, title: 'Qeydlər' },
  schedule: { w: 1000, h: 780, title: 'Çıxış cədvəli' },
  settings: { w: 820, h: 700, title: 'Parametrlər', write: true },
}
const wins = new Map()

function openPage(name) {
  const cfg = PAGES[name]
  const open = wins.get(name)
  if (open && !open.isDestroyed()) {
    if (open.isMinimized()) open.restore()
    open.focus()
    return open
  }
  const win = new BrowserWindow({
    width: cfg.w,
    height: cfg.h,
    minWidth: name === 'login' ? cfg.w : 820,
    minHeight: name === 'login' ? cfg.h : 560,
    resizable: cfg.resizable !== false,
    maximizable: cfg.resizable !== false,
    title: `ENA Anbar — ${cfg.title}`,
    backgroundColor: '#f3f5f9',
    autoHideMenuBar: true,
    show: false,
    icon: fs.existsSync(ICON) ? ICON : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  })
  win.removeMenu()
  win.loadFile(path.join(__dirname, 'ui', 'window.html'), { query: { p: name } })
  win.once('ready-to-show', () => !process.env.ENA_SHOTS && win.show())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.on('closed', () => {
    wins.delete(name)
    // əsas menyu bağlananda proqram bağlanır
    if (name === 'menu' && role && !process.env.ENA_SHOTS) app.quit()
  })
  wins.set(name, win)
  return win
}

function broadcast(data = {}) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('ena:changed', data)
}

// ── Server ilə əlaqə ─────────────────────────────────
async function remote(method, args) {
  const r = await fetch(`${SERVER}/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ena-token': token },
    body: JSON.stringify({ method, args }),
    signal: AbortSignal.timeout(20_000),
  })
  const j = await r.json()
  if (j.token) token = j.token
  return j
}

/** Sessiya bitəndə (server yenidən başladı və ya 12 saat istifadə olunmadı) — giriş ekranı */
let expiring = false
function sessionExpired() {
  if (expiring || !role) return
  expiring = true
  role = null
  token = ''
  stopEvents()
  openPage('login')
  for (const [n, w] of wins) if (n !== 'login' && !w.isDestroyed()) w.close()
  dialog.showMessageBox(wins.get('login'), { type: 'info', title: 'ENA Anbar', message: 'Sessiya bitib', detail: 'Yenidən daxil olun.' }).finally(() => (expiring = false))
}

// Canlı yenilənmə: başqa kompüterdə yazılan dərhal görünür
let events = null
async function startEvents() {
  stopEvents()
  const ctl = new AbortController()
  events = ctl
  let wait = 1000
  while (events === ctl && role) {
    try {
      const r = await fetch(`${SERVER}/events`, { headers: { 'x-ena-token': token }, signal: ctl.signal })
      if (r.status === 401) return sessionExpired()
      if (!r.ok || !r.body) throw new Error(String(r.status))
      wait = 1000
      broadcast({ reconnected: true })
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const line = chunk.split('\n').find((l) => l.startsWith('data: '))
          if (line) {
            try {
              broadcast(JSON.parse(line.slice(6)))
            } catch {
              /* boş */
            }
          }
        }
      }
    } catch {
      if (ctl.signal.aborted) return
    }
    await new Promise((r) => setTimeout(r, wait))
    wait = Math.min(wait * 2, 15_000)
  }
}
function stopEvents() {
  if (events) events.abort()
  events = null
}

function afterLogin() {
  const login = wins.get('login')
  openPage('menu')
  if (login && !login.isDestroyed()) login.close()
  startEvents()
}

// ── Pəncərələrdən gələn əmrlər ───────────────────────
const LOCAL = {
  'win.open': (a) => {
    const cfg = PAGES[a?.name]
    if (!cfg || a.name === 'login' || a.name === 'menu') return { ok: false, error: 'Belə pəncərə yoxdur' }
    if (cfg.write && role !== 'anbar') return { ok: false, error: 'Bu pəncərə yalnız anbardar üçündür' }
    openPage(a.name)
    return { ok: true, data: {} }
  },
  'export.xlsx': async (a, e) => {
    const q = new URLSearchParams(Object.entries(a || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]))
    const r = await fetch(`${SERVER}/api/export?${q}`, { headers: { 'x-ena-token': token }, signal: AbortSignal.timeout(60_000) })
    if (r.status === 401) {
      sessionExpired()
      return { ok: false, error: 'Sessiya bitib' }
    }
    if (!r.ok) return { ok: false, error: 'Excel faylı alınmadı' }
    const name = decodeURIComponent(r.headers.get('x-file-name') || 'ENA-Anbar.xlsx')
    const buf = Buffer.from(await r.arrayBuffer())
    const s = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'Excel faylını yadda saxla',
      defaultPath: path.join(app.getPath('documents'), name),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (s.canceled || !s.filePath) return { ok: true, data: { file: null } }
    fs.writeFileSync(s.filePath, buf)
    shell.showItemInFolder(s.filePath)
    return { ok: true, data: { file: s.filePath } }
  },
}

ipcMain.handle('ena', async (e, method, args) => {
  try {
    if (LOCAL[method]) return await LOCAL[method](args, e)
    const j = await remote(method, args)
    if (!j.ok && j.code === 'SESSION') {
      sessionExpired()
      return j
    }
    if (j.ok) {
      if (method === 'auth.state') role = j.data.role
      if (method === 'app.info') j.data.server = SERVER
      if (method === 'auth.role') {
        role = j.data.role
        setTimeout(afterLogin, 10)
      }
      if (method === 'auth.logout') {
        role = null
        token = ''
        stopEvents()
        setTimeout(() => {
          openPage('login')
          for (const [n, w] of wins) if (n !== 'login' && !w.isDestroyed()) w.close()
        }, 10)
      }
    }
    return j
  } catch (err) {
    console.error(method, err?.message)
    return { ok: false, error: OFFLINE, offline: true }
  }
})

app.on('second-instance', () => {
  const w = wins.get('menu') || wins.get('login')
  if (w && !w.isDestroyed()) {
    if (w.isMinimized()) w.restore()
    w.focus()
  }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  if (process.env.ENA_SHOTS) return require('./src/shots').run({ remote, openPage, setRole: (r) => (role = r) })
  openPage('login')
})

app.on('window-all-closed', () => !process.env.ENA_SHOTS && app.quit())
