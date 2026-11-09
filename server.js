'use strict'
/**
 * ENA Anbar — server. Baza burada saxlanılır; Windows proqramı (exe) buraya qoşulur.
 *   GET  /              — yükləmə səhifəsi
 *   GET  /download      — quraşdırıcı (exe)
 *   POST /api           — { method, args } (başlıq x-ena-token)
 *   GET  /api/export    — Excel faylı
 *   GET  /events        — canlı yenilənmə (SSE)
 * İşə salmaq: node server.js   (PORT=3130, ENA_DATA=./data, ENA_DOWNLOAD=./download)
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Store } = require('./src/store')
const { createServices } = require('./src/services')
const { createApi } = require('./src/api')
const { buildWorkbook } = require('./src/excel')

const PORT = Number(process.env.PORT || 3130)
const HOST = process.env.HOST || '127.0.0.1'
const DATA_DIR = process.env.ENA_DATA || path.join(__dirname, 'data')
const DOWNLOAD_DIR = process.env.ENA_DOWNLOAD || path.join(__dirname, 'download')
const DB_FILE = path.join(DATA_DIR, 'ena-anbar.db')
const BACKUP_DIR = path.join(DATA_DIR, 'backup')
const SESSION_IDLE = 12 * 3600_000 // daxil olmuş sessiya
const ANON_IDLE = 15 * 60_000 // hələ daxil olmamış
const idleOf = (s) => (s.role ? SESSION_IDLE : ANON_IDLE)

let store, svc, api
const sessions = new Map() // token → { gate, role, at, ip }
const guards = new Map() // ip → { fails, lockedUntil }
const clients = new Set() // SSE

// ── Ehtiyat nüsxə ────────────────────────────────────
const listBackups = () => (fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort().reverse() : [])
function backup(manual = false) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const t = svc.today()
  const d = new Date()
  const file = path.join(BACKUP_DIR, manual ? `ena-anbar-${t}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.db` : `ena-anbar-${t}.db`)
  if (!manual && fs.existsSync(file)) return path.basename(file)
  store.save()
  fs.copyFileSync(DB_FILE, file)
  for (const f of listBackups().slice(90)) fs.rmSync(path.join(BACKUP_DIR, f), { force: true })
  return path.basename(file)
}
const info = () => ({ where: 'server', dbFile: DB_FILE, backupDir: BACKUP_DIR, backups: listBackups().slice(0, 5), version: latestInstaller()?.version || '' })

// ── Köməkçilər ───────────────────────────────────────
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  for (const c of clients) c.res.write(msg)
}
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
function sessionOf(req, create) {
  const tok = String(req.headers['x-ena-token'] || '')
  let s = tok && sessions.get(tok)
  if (s && Date.now() - s.at > idleOf(s)) {
    sessions.delete(tok)
    s = null
  }
  if (s) {
    s.at = Date.now()
    return { token: tok, s, fresh: false }
  }
  if (!create) return null
  const token = crypto.randomBytes(24).toString('hex')
  s = { gate: false, role: null, at: Date.now(), ip: clientIp(req) }
  sessions.set(token, s)
  return { token, s, fresh: true }
}
function guardOf(req) {
  const ip = clientIp(req)
  if (!guards.has(ip)) guards.set(ip, { fails: 0, lockedUntil: 0 })
  return guards.get(ip)
}
function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  res.writeHead(status, { 'content-length': buf.length, 'x-content-type-options': 'nosniff', ...headers })
  res.end(buf)
}
const json = (res, status, obj) => send(res, status, obj, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Ən son quraşdırıcı: download/ENA-Anbar-Setup-<versiya>.exe */
function latestInstaller() {
  if (!fs.existsSync(DOWNLOAD_DIR)) return null
  const files = fs
    .readdirSync(DOWNLOAD_DIR)
    .map((f) => ({ f, m: f.match(/^ENA-Anbar-Setup-(\d+)\.(\d+)\.(\d+)\.exe$/) }))
    .filter((x) => x.m)
    .sort((a, b) => b.m[1] - a.m[1] || b.m[2] - a.m[2] || b.m[3] - a.m[3])
  if (!files[0]) return null
  const file = path.join(DOWNLOAD_DIR, files[0].f)
  const st = fs.statSync(file)
  return { file, name: files[0].f, version: `${files[0].m[1]}.${files[0].m[2]}.${files[0].m[3]}`, size: st.size, date: st.mtime }
}

const SITE = path.join(__dirname, 'site')
function landing(res) {
  const inst = latestInstaller()
  const p2 = (n) => String(n).padStart(2, '0')
  const html = fs
    .readFileSync(path.join(SITE, 'index.html'), 'utf8')
    .replace(/\{\{VERSION\}\}/g, inst ? inst.version : '—')
    .replace(/\{\{SIZE\}\}/g, inst ? `${Math.round(inst.size / 1048576)} MB` : '')
    .replace(/\{\{DATE\}\}/g, inst ? `${p2(inst.date.getDate())}.${p2(inst.date.getMonth() + 1)}.${inst.date.getFullYear()}` : '')
    .replace(/\{\{READY\}\}/g, inst ? '' : 'disabled')
  send(res, 200, html, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-frame-options': 'DENY' })
}

// ── Sorğular ─────────────────────────────────────────
async function onRequest(req, res) {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return landing(res)
    if (req.method === 'GET' && p === '/icon.png') return send(res, 200, fs.readFileSync(path.join(__dirname, 'build', 'icon.png')), { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' })
    if (req.method === 'GET' && p === '/health') return json(res, 200, { ok: true })
    if (req.method === 'GET' && p === '/download') {
      const inst = latestInstaller()
      if (!inst) return send(res, 404, 'Quraşdırıcı hələ yüklənməyib', { 'content-type': 'text/plain; charset=utf-8' })
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': inst.size, 'content-disposition': `attachment; filename="${inst.name}"`, 'cache-control': 'no-cache' })
      return fs.createReadStream(inst.file).pipe(res)
    }
    if (req.method === 'GET' && p === '/api/version') {
      const inst = latestInstaller()
      return json(res, 200, { version: inst?.version || null })
    }

    if (req.method === 'POST' && p === '/api') {
      const body = JSON.parse((await readBody(req)) || '{}')
      const sess = sessionOf(req, true)
      const r = await api.handle(String(body.method || ''), body.args, { session: sess.s, guard: guardOf(req) })
      if (r.write) broadcast({ method: body.method })
      delete r.write
      if (sess.fresh) r.token = sess.token
      // çıxışda sessiya silinir
      if (body.method === 'auth.logout' && r.ok) sessions.delete(sess.token)
      return json(res, 200, r)
    }

    if (req.method === 'GET' && p === '/api/export') {
      const sess = sessionOf(req, false)
      if (!sess?.s.role) return json(res, 401, { ok: false, code: 'SESSION', error: 'Sessiya bitib' })
      const args = Object.fromEntries(url.searchParams)
      const { wb, name } = await buildWorkbook(svc, args)
      const buf = Buffer.from(await wb.xlsx.writeBuffer())
      return send(res, 200, buf, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'x-file-name': encodeURIComponent(name + '.xlsx') })
    }

    if (req.method === 'GET' && p === '/events') {
      const sess = sessionOf(req, false)
      if (!sess?.s.role) return json(res, 401, { ok: false, code: 'SESSION' })
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
      res.write(': ok\n\n')
      const c = { res, sess }
      clients.add(c)
      req.on('close', () => clients.delete(c))
      return
    }
    send(res, 404, 'Tapılmadı', { 'content-type': 'text/plain; charset=utf-8' })
  } catch (err) {
    console.error(req.method, p, err)
    if (!res.headersSent) json(res, 400, { ok: false, error: 'Sorğu oxunmadı' })
    else res.end()
  }
}

// ── Gün dəyişməsi, sessiyaların təmizlənməsi ─────────
let lastDay = null
function tick() {
  try {
    const changed = svc.rollover()
    const t = svc.today()
    if (changed || (lastDay && lastDay !== t)) {
      backup()
      broadcast({ dayChanged: true })
    }
    lastDay = t
    const now = Date.now()
    for (const [k, s] of sessions) if (now - s.at > idleOf(s)) sessions.delete(k)
    for (const [ip, g] of guards) if (!g.fails && g.lockedUntil < now) guards.delete(ip)
    for (const c of clients) {
      c.sess.s.at = now // açıq proqram — sessiya yaşayır
      c.res.write(': ping\n\n')
    }
  } catch (e) {
    console.error('tick', e)
  }
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  store = await Store.open(DB_FILE)
  svc = createServices(store)
  if (process.env.ENA_SEED === '1' && !svc.auth.isSetup()) {
    svc.auth.setup({ general: process.env.ENA_PW, anbar: process.env.ENA_APW })
    require('./src/demo').seed(svc)
  }
  api = createApi({ svc, store, backup, info, allowSetup: process.env.ENA_ALLOW_SETUP === '1' })
  tick()
  if (svc.auth.isSetup()) backup()
  setInterval(tick, 25_000)
  http.createServer(onRequest).listen(PORT, HOST, () => console.log(`ENA Anbar server: http://${HOST}:${PORT} · baza ${DB_FILE}`))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
