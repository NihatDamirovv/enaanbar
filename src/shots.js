'use strict'
/**
 * Yoxlama üçün ekran şəkilləri (yalnız inkişafda).
 * Əvvəl server nümunə məlumatla işə salınır (ENA_SEED=1 ENA_PW=.. ENA_APW=.. node server.js),
 * sonra: ENA_SERVER=http://127.0.0.1:3130 ENA_SHOTS=<qovluq> ENA_PW=.. ENA_APW=.. electron .
 */
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function run({ remote, openPage, setRole }) {
  const out = process.env.ENA_SHOTS
  fs.mkdirSync(out, { recursive: true })
  const shot = async (name, file) => {
    const win = openPage(name)
    await new Promise((r) => win.webContents.once('did-finish-load', r))
    await wait(1200)
    fs.writeFileSync(path.join(out, file), (await win.webContents.capturePage()).toPNG())
    return win
  }
  try {
    let w = await shot('login', '01-giris.png')
    w.destroy()
    await remote('auth.login', { password: process.env.ENA_PW })
    w = await shot('login', '02-ekran-secimi.png')
    w.destroy()
    const role = process.env.ENA_ROLE || 'anbar'
    const r = await remote('auth.role', { role, password: process.env.ENA_APW })
    if (!r.ok) throw new Error(r.error)
    setRole(role)
    const EXTRA = {
      entry: [["document.querySelector('[data-k=OUT]').click(); setTimeout(() => { const i = document.querySelector('[data-f=code]'); i.value = 'F-101'; i.dispatchEvent(new Event('input', { bubbles: true })); const q = document.querySelector('[data-f=qty]'); q.value = '5'; q.dispatchEvent(new Event('input', { bubbles: true })) }, 200)", 'mexaric']],
      items: [["document.querySelectorAll('tr[data-id]')[2].click()", 'mal']],
      issues: [["document.querySelector('tr[data-id]').click()", 'senet']],
      buses: [["document.querySelector('[data-act=move]').click()", 'yerdeyisme']],
      assistant: [["document.querySelector('[data-q]').click()", 'cavab']],
    }
    const pages = (process.env.ENA_PAGES || 'menu,entry,items,purchases,issues,buses,notes,schedule,settings,assistant').split(',')
    for (const [i, p] of pages.entries()) {
      if (role !== 'anbar' && (p === 'entry' || p === 'settings')) continue
      const n = String(i + 3).padStart(2, '0')
      w = await shot(p, `${n}-${p}.png`)
      for (const [js, tag] of EXTRA[p] || []) {
        if (!(await w.webContents.executeJavaScript(`(() => { try { ${js}; return true } catch { return false } })()`))) continue
        await wait(2500)
        fs.writeFileSync(path.join(out, `${n}-${p}-${tag}.png`), (await w.webContents.capturePage()).toPNG())
      }
      w.destroy()
    }
  } catch (e) {
    fs.writeFileSync(path.join(out, 'error.txt'), String(e?.stack || e))
  }
  app.exit(0)
}

module.exports = { run }
