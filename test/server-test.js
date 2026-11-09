'use strict'
/**
 * Server testi (işləyən serverə qarşı): BASE=http://127.0.0.1:3130 ENA_PW=.. ENA_APW=.. node test/server-test.js
 * Giriş, yetkilər (mühasib yaza bilmir), canlı yenilənmə, Excel, səhv parol kilidi.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:3130'
let passed = 0
let failed = 0
const check = (n, ok, x) => {
  ok ? passed++ : failed++
  console.log(`  ${ok ? '✅' : '❌'} ${n}${!ok && x !== undefined ? ' — ' + JSON.stringify(x) : ''}`)
}
function client() {
  let token = ''
  return {
    get token() {
      return token
    },
    async call(method, args) {
      const r = await fetch(`${BASE}/api`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ena-token': token }, body: JSON.stringify({ method, args }) })
      const j = await r.json()
      if (j.token) token = j.token
      return j
    },
  }
}

async function main() {
  console.log('\n── Səhifələr ──')
  const home = await fetch(BASE + '/')
  const html = await home.text()
  check('yükləmə səhifəsi açılır', home.status === 200 && html.includes('ENA Anbar-ı yüklə'))
  check('ikon', (await fetch(BASE + '/icon.png')).headers.get('content-type') === 'image/png')
  const dl = await fetch(BASE + '/download')
  check('/download — exe və ya 404 (hələ yüklənməyib)', dl.status === 200 ? dl.headers.get('content-disposition')?.includes('ENA-Anbar-Setup-') : dl.status === 404, dl.status)
  check('naməlum ünvan 404', (await fetch(BASE + '/admin')).status === 404)

  console.log('\n── Giriş və yetkilər ──')
  const anon = client()
  check('girişsiz məlumat yoxdur', (await anon.call('items.list')).code === 'SESSION')
  check('girişsiz yazmaq olmaz', (await anon.call('docs.save', { kind: 'IN' })).code === 'SESSION')
  check('setup ikinci dəfə olmaz', !(await anon.call('auth.setup', { general: 'aaaa1', anbar: 'bbbb1' })).ok)
  check('ümumi parolsuz ekran seçmək olmaz', !(await anon.call('auth.role', { role: 'muhasib' })).ok)
  check('səhv ümumi parol', (await anon.call('auth.login', { password: 'yanlis' })).error === 'Parol səhvdir')

  const m = client()
  check('mühasib: ümumi parol', (await m.call('auth.login', { password: process.env.ENA_PW })).ok)
  check('mühasib: ekran', (await m.call('auth.role', { role: 'muhasib' })).data?.role === 'muhasib')
  const items = await m.call('items.list')
  check('mühasib görür', items.ok && Array.isArray(items.data))
  const w = await m.call('notes.add', { text: 'mühasib yazmağa çalışır' })
  check('mühasib yaza bilmir', !w.ok && /Yalnız baxış/.test(w.error), w)
  check('mühasib sənədi ləğv edə bilmir', !(await m.call('docs.cancel', { id: 1, reason: 'x' })).ok)

  const a = client()
  await a.call('auth.login', { password: process.env.ENA_PW })
  check('anbardar səhv parol', (await a.call('auth.role', { role: 'anbar', password: 'yanlis' })).error === 'Anbardar parolu səhvdir')
  check('anbardar', (await a.call('auth.role', { role: 'anbar', password: process.env.ENA_APW })).data?.role === 'anbar')

  console.log('\n── Canlı yenilənmə ──')
  const ctl = new AbortController()
  const got = new Promise((resolve) => {
    fetch(`${BASE}/events`, { headers: { 'x-ena-token': m.token }, signal: ctl.signal })
      .then(async (r) => {
        const reader = r.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) return
          buf += dec.decode(value)
          if (buf.includes('notes.add')) return resolve(true)
        }
      })
      .catch(() => resolve(false))
    setTimeout(() => resolve(false), 5000)
  })
  await new Promise((r) => setTimeout(r, 300))
  const add = await a.call('notes.add', { text: 'Server testi: canlı yenilənmə' })
  check('anbardar qeyd yazdı', add.ok, add)
  check('mühasibin proqramına dərhal xəbər gəldi', await got)
  ctl.abort()
  check('mühasib yeni qeydi görür', (await m.call('notes.today')).data.notes.some((n) => n.text === 'Server testi: canlı yenilənmə'))
  check('girişsiz canlı kanal yoxdur', (await fetch(`${BASE}/events`)).status === 401)

  console.log('\n── Excel ──')
  const x = await fetch(`${BASE}/api/export?kind=items`, { headers: { 'x-ena-token': m.token } })
  const buf = Buffer.from(await x.arrayBuffer())
  check('Excel faylı (xlsx)', x.status === 200 && buf.slice(0, 2).toString() === 'PK' && decodeURIComponent(x.headers.get('x-file-name')).endsWith('.xlsx'), x.status)
  check('girişsiz Excel yoxdur', (await fetch(`${BASE}/api/export?kind=items`)).status === 401)

  console.log('\n── Çıxış ──')
  await m.call('auth.logout')
  check('çıxışdan sonra sessiya yoxdur', (await m.call('items.list')).code === 'SESSION')

  console.log('\n── Kilid (5 səhv) ──')
  const z = client()
  let last
  for (let i = 0; i < 5; i++) last = await z.call('auth.login', { password: 'yanlis' + i })
  check('5-ci səhvdə kilid', /1 dəqiqə/.test(last.error), last)
  check('kilid zamanı düz parol da qəbul olunmur', /gözləyin/.test((await z.call('auth.login', { password: process.env.ENA_PW })).error))

  console.log(failed ? `\n❌ ${failed} yoxlama alınmadı (${passed} keçdi)` : `\n✅ ${passed} yoxlama keçdi`)
  if (failed) process.exitCode = 1
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
