'use strict'
/** Excel faylları: anbar, alışlar, məxariclər, avtobuslar, qeydlər */
const ExcelJS = require('exceljs')
const { QTY, PRICE, MONEY } = require('./services')

const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '')
const q = (n) => n / QTY
const p = (n) => n / PRICE
const m = (n) => n / MONEY

function sheet(wb, title, columns) {
  const ws = wb.addWorksheet(title, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = columns
  const h = ws.getRow(1)
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2453D4' } }
  h.alignment = { vertical: 'middle' }
  h.height = 22
  return ws
}
const NUM3 = '#,##0.###'
const NUM4 = '#,##0.00##'
const NUM2 = '#,##0.00'

async function buildWorkbook(svc, a = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ENA Anbar'
  wb.created = new Date()
  const t = svc.today()
  const kind = a.kind

  if (kind === 'items') {
    const ws = sheet(wb, 'Anbar', [
      { header: 'Kod', key: 'code', width: 14 },
      { header: 'Mal adı', key: 'name', width: 38 },
      { header: 'Vahid', key: 'unit', width: 10 },
      { header: 'Əlavə olunub', key: 'added', width: 14 },
      { header: 'Alınıb', key: 'in', width: 12, style: { numFmt: NUM3 } },
      { header: 'Çıxıb', key: 'out', width: 12, style: { numFmt: NUM3 } },
      { header: 'Qalıq', key: 'stock', width: 12, style: { numFmt: NUM3 } },
      { header: 'Qalıq dəyəri (₼)', key: 'value', width: 16, style: { numFmt: NUM2 } },
    ])
    for (const r of svc.items.list({ q: a.q })) ws.addRow({ code: r.code, name: r.name, unit: r.unit, added: dmy(r.addedDate), in: q(r.qtyIn), out: q(r.qtyOut), stock: q(r.stock), value: m(r.value) })
    return { wb, name: `Anbar-qaliq-${t}` }
  }

  if (kind === 'IN' || kind === 'OUT') {
    const docs = svc.docs.list({ kind, from: a.from, to: a.to, q: a.q, status: a.status })
    const ws = sheet(wb, kind === 'IN' ? 'Alışlar' : 'Məxariclər', [
      { header: '№', key: 'no', width: 7 },
      { header: 'Tarix', key: 'date', width: 12 },
      { header: 'VÖEN', key: 'voen', width: 13 },
      { header: 'Kontragent', key: 'party', width: 24 },
      { header: 'Köhnə №', key: 'ref', width: 13 },
      { header: 'Mal kodu', key: 'code', width: 13 },
      { header: 'Mal adı', key: 'name', width: 36 },
      { header: 'Say', key: 'qty', width: 10, style: { numFmt: NUM3 } },
      { header: kind === 'IN' ? 'Qiymət' : 'Qiymət (FIFO, orta)', key: 'price', width: 14, style: { numFmt: NUM4 } },
      { header: 'Məbləğ (₼)', key: 'amount', width: 14, style: { numFmt: NUM2 } },
      { header: 'Şərh', key: 'note', width: 22 },
      { header: 'DQN', key: 'dqn', width: 10 },
      { header: 'Xətt', key: 'route', width: 8 },
      { header: 'Status', key: 'status', width: 14 },
    ])
    for (const d of docs.slice().reverse()) {
      for (const l of d.lines) {
        const row = ws.addRow({ no: d.no, date: dmy(d.date), voen: d.voen, party: d.party, ref: d.ref, note: l.note, dqn: l.dqn, route: l.route, code: l.code, name: l.name, qty: q(l.qty), price: p(l.price), amount: m(l.amount), status: d.status === 'ACTIVE' ? '' : 'Ləğv edilib' })
        if (d.status !== 'ACTIVE') row.font = { color: { argb: 'FF94A3B8' }, strike: true }
      }
    }
    return { wb, name: `${kind === 'IN' ? 'Alislar' : 'Mexaricler'}-${a.from || ''}-${a.to || t}`.replace(/--/g, '-') }
  }

  if (kind === 'buses') {
    const b = svc.buses.board({})
    const ws = sheet(wb, `Avtobuslar ${dmy(b.date)}`, [
      { header: 'Xətt', key: 'route', width: 10 },
      { header: 'Nişan', key: 'plate', width: 14 },
      { header: 'İlk çıxış', key: 'depart', width: 11 },
      { header: 'Qeyd', key: 'note', width: 50 },
    ])
    for (const g of b.groups) {
      for (const x of g.buses) ws.addRow({ route: g.name, plate: x.plate, depart: x.depart, note: x.move ? `Müvəqqəti: ${x.routeName} xəttindən, ${dmy(x.move.dateTo)} tarixinədək` : '' })
      for (const x of g.away) ws.addRow({ route: g.name, plate: x.plate, depart: x.depart, note: `Bu gün ${x.move.toRouteName} xəttindədir (${dmy(x.move.dateTo)} tarixinədək)` }).font = { color: { argb: 'FF94A3B8' } }
    }
    return { wb, name: `Avtobuslar-${t}` }
  }

  if (kind === 'notes') {
    const ws = sheet(wb, 'Qeydlər', [
      { header: 'Tarix', key: 'date', width: 12 },
      { header: 'Saat', key: 'time', width: 8 },
      { header: 'Qeyd', key: 'text', width: 90 },
      { header: 'Kim', key: 'author', width: 12 },
    ])
    const today = svc.notes.today()
    const days = [{ date: today.date, notes: today.notes }, ...svc.notes.archive({ q: a.q })]
    for (const d of days) for (const n of d.notes) ws.addRow({ date: dmy(d.date), time: n.at.slice(11, 16), text: n.text, author: n.author })
    ws.getColumn('text').alignment = { wrapText: true, vertical: 'top' }
    return { wb, name: `Qeydler-${t}` }
  }

  throw new Error('Naməlum hesabat')
}

module.exports = { buildWorkbook }
