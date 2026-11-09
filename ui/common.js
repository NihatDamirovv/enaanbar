'use strict'
/* ENA Anbar — bütün pəncərələr üçün ortaq köməkçilər */

// ── İkonlar (xətti, 24×24) ─────────────────────────────
const ICONS = {
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  warehouse: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/>',
  bus: '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/><path d="M7 13h6"/><path d="M7 17h9"/>',
  in: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  out: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  sheet: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
  settings: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  calc: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8"/><path d="M16 14v4"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  excel: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m8 12 4 5"/><path d="m12 12-4 5"/><path d="M15 13h2"/><path d="M15 17h2"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
}
function icon(name, size = 18, sw = 1.9) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`
}

// ── Mətn və formatlar ─────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
function fmtFixed(n, scale, minDec, maxDec) {
  const v = Number(n) / 10 ** scale
  const neg = v < 0
  let s = Math.abs(v).toFixed(maxDec)
  if (maxDec > minDec) s = s.replace(new RegExp(`0{1,${maxDec - minDec}}$`), '').replace(/\.$/, '')
  const [a, b] = s.split('.')
  return (neg ? '−' : '') + group(a) + (b ? '.' + b : '')
}
const fmtQty = (n) => fmtFixed(n, 3, 0, 3) // say
const fmtPrice = (n) => fmtFixed(n, 4, 2, 4) // qiymət
const fmtMoney = (n) => fmtFixed(n, 2, 2, 2) // məbləğ (qəpik)
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr']
const WEEKDAYS = ['bazar', 'bazar ertəsi', 'çərşənbə axşamı', 'çərşənbə', 'cümə axşamı', 'cümə', 'şənbə']
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '')
const dm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '')
const hm = (stamp) => (stamp ? stamp.slice(11, 16) : '')
const isoToDate = (iso) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
const longDate = (iso) => {
  const d = isoToDate(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
const weekday = (iso) => WEEKDAYS[isoToDate(iso).getDay()]
const p2 = (n) => String(n).padStart(2, '0')
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
const addDays = (iso, n) => {
  const d = isoToDate(iso)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
const plate = (p, cls = '') => `<span class="plate ${cls}"><span>${esc(p)}</span></span>`
const debounce = (fn, ms) => {
  let t
  return (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}
const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

// ── Server ilə əlaqə ──────────────────────────────────
async function api(method, args) {
  const r = await window.ena.call(method, args)
  if (!r.ok) {
    const e = new Error(r.error || 'Xəta')
    e.field = r.field
    throw e
  }
  return r.data
}

// ── Bildiriş, pəncərə, panel ──────────────────────────
function toast(text, kind = 'ok') {
  let box = $('.toasts')
  if (!box) {
    box = document.createElement('div')
    box.className = 'toasts'
    document.body.appendChild(box)
  }
  const el = document.createElement('div')
  el.className = `toast ${kind === 'err' ? 'err' : ''}`
  el.innerHTML = `${icon(kind === 'err' ? 'alert' : 'check', 17, 2.2)}<span>${esc(text)}</span>`
  box.appendChild(el)
  setTimeout(() => el.remove(), kind === 'err' ? 5200 : 3200)
}

/** onOk bunu qaytarsa pəncərə açıq qalır */
const KEEP_OPEN = Symbol('keep')
/**
 * Kiçik pəncərə. onOk(form) xəta atarsa — mətn pəncərədə göstərilir, pəncərə bağlanmır.
 */
function modal({ title, body, okText = 'Yadda saxla', cancelText = 'Ləğv et', danger = false, wide = false, onOk, onOpen, noFoot = false, iconName, iconClass = 'c-blue' }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div')
    ov.className = 'overlay top'
    const m = document.createElement('form')
    m.className = `modal ${wide ? 'wide' : ''}`
    m.noValidate = true
    m.innerHTML = `
      <div class="modal-head">
        ${iconName ? `<div class="page-icon ${iconClass}" style="width:36px;height:36px">${icon(iconName, 18)}</div>` : ''}
        <h2 class="grow">${esc(title)}</h2>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-close>${icon('x', 17)}</button>
      </div>
      <div class="modal-body"><div class="m-err"></div>${body}</div>
      ${noFoot ? '' : `<div class="modal-foot">
        <button type="button" class="btn" data-close>${esc(cancelText)}</button>
        <button type="submit" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}">${esc(okText)}</button>
      </div>`}`
    const close = (v) => {
      ov.remove()
      m.remove()
      document.removeEventListener('keydown', onKey)
      resolve(v)
    }
    const onKey = (e) => e.key === 'Escape' && close(null)
    document.addEventListener('keydown', onKey)
    ov.addEventListener('click', () => close(null))
    $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => close(null)))
    m.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = $('button[type=submit]', m)
      btn.disabled = true
      try {
        const r = onOk ? await onOk(m) : true
        if (r === KEEP_OPEN) {
          $('.m-err', m).innerHTML = ''
          btn.disabled = false
          return
        }
        close(r === undefined ? true : r)
      } catch (err) {
        $('.m-err', m).innerHTML = `<div class="alert red" style="margin-bottom:12px">${icon('alert', 17)}<div>${esc(err.message)}</div></div>`
        $$('.inp.err', m).forEach((x) => x.classList.remove('err'))
        if (err.field) $(`[name="${err.field}"]`, m)?.classList.add('err')
        btn.disabled = false
      }
    })
    document.body.append(ov, m)
    if (onOpen) onOpen(m, close)
    setTimeout(() => $('input:not([type=hidden]):not([readonly]), textarea, select', m)?.focus(), 30)
  })
}

function confirmBox({ title, text, okText = 'Bəli', danger = false }) {
  return modal({ title, body: `<p style="margin:0;color:var(--text-2)">${text}</p>`, okText, danger, iconName: danger ? 'alert' : 'info', iconClass: danger ? 'c-red' : 'c-blue' })
}

let drawerClose = null
function drawer({ title, sub = '', body, foot = '', onOpen }) {
  if (drawerClose) drawerClose()
  const ov = document.createElement('div')
  ov.className = 'overlay'
  const d = document.createElement('aside')
  d.className = 'drawer'
  d.innerHTML = `
    <div class="drawer-head">
      <div class="grow"><h2>${title}</h2>${sub ? `<div class="muted small" style="margin-top:4px">${sub}</div>` : ''}</div>
      <button class="btn btn-ghost btn-icon btn-sm" data-close>${icon('x', 18)}</button>
    </div>
    <div class="drawer-body">${body}</div>
    ${foot ? `<div class="drawer-foot">${foot}</div>` : ''}`
  const close = () => {
    ov.remove()
    d.remove()
    document.removeEventListener('keydown', onKey)
    drawerClose = null
  }
  const onKey = (e) => e.key === 'Escape' && !$('.modal') && close()
  document.addEventListener('keydown', onKey)
  ov.addEventListener('click', close)
  $('[data-close]', d).addEventListener('click', close)
  document.body.append(ov, d)
  drawerClose = close
  if (onOpen) onOpen(d, close)
  return close
}

function emptyState(iconName, title, text = '') {
  return `<div class="empty"><div class="e-icon">${icon(iconName, 26)}</div><b>${esc(title)}</b>${text ? `<div class="small">${text}</div>` : ''}</div>`
}

// ── Pəncərənin çərçivəsi ──────────────────────────────
const S = { role: null, roleName: '', canWrite: false }

function shell({ title, sub = '', iconName, iconClass = 'c-blue', actions = '' }) {
  document.title = `ENA Anbar — ${title}`
  document.body.classList.toggle('ro', !S.canWrite)
  const app = $('#app')
  app.innerHTML = `
    <header class="topbar">
      <div class="page-icon ${iconClass}">${icon(iconName, 20)}</div>
      <div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      <div class="spacer"></div>
      ${actions}
      <span class="date-pill" id="todayPill">${icon('calendar', 16)}<span>${longDate(todayIso())}</span></span>
      <span class="role-pill ${S.canWrite ? 'role-anbar' : 'role-muhasib'}">${icon(S.canWrite ? 'user' : 'eye', 16)}${esc(S.roleName)}</span>
    </header>
    ${S.canWrite ? '' : `<div class="ro-banner">${icon('eye', 16)}<span><b>Yalnız baxış rejimi.</b> Burada heç nə dəyişmək olmur — anbardarın yazdıqları görünür və avtomatik yenilənir.</span></div>`}
    <main class="content" id="main"></main>`
  return $('#main')
}

/** Məlumat dəyişəndə (başqa pəncərədə yazılanda) səhifəni yenilə */
function onDataChanged(fn) {
  const run = debounce(fn, 150)
  window.ena.onChanged((d) => {
    if (d?.dayChanged) {
      const pill = $('#todayPill span')
      if (pill) pill.textContent = longDate(todayIso())
    }
    run(d)
  })
}

/** Enter → növbəti sahə (forma daxilində) */
function enterAsTab(root) {
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return
    const f = $$('input:not([type=hidden]):not([readonly]):not([disabled]), select', root)
    const i = f.indexOf(e.target)
    if (i >= 0 && i < f.length - 1) {
      e.preventDefault()
      f[i + 1].focus()
      f[i + 1].select?.()
    }
  })
}

async function excelExport(kind, args) {
  try {
    const r = await api('export.xlsx', { kind, ...args })
    if (r?.file) toast('Excel faylı yadda saxlandı')
  } catch (e) {
    toast(e.message, 'err')
  }
}

// ── Səhifəni yüklə ────────────────────────────────────
const PAGE = new URLSearchParams(location.search).get('p') || 'login'
const Pages = {}
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const st = await api('auth.state')
    S.role = st.role
    S.roleName = st.roleName
    S.canWrite = st.role === 'anbar'
    const s = document.createElement('script')
    s.src = `pages/${PAGE}.js`
    s.onload = () => Pages[PAGE] && Pages[PAGE](st)
    document.body.appendChild(s)
  } catch (e) {
    document.title = 'ENA Anbar'
    $('#app').innerHTML = `<div class="content" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">${emptyState('alert', 'Serverə qoşulmaq olmur', 'İnternet bağlantısını yoxlayın və yenidən cəhd edin.')}<button class="btn btn-primary" id="retry">Yenidən cəhd et</button></div>`
    $('#retry').addEventListener('click', () => location.reload())
  }
})
