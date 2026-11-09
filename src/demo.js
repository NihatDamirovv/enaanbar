'use strict'
/** Nümunə məlumat — yalnız yoxlama üçün (ENA_SEED=1) */
const { addDays } = require('./services')

function seed(svc) {
  const W = 'Anbardar'
  const t = svc.today()
  const d = (n) => addDays(t, -n)
  svc.docs.save({ kind: 'IN', date: d(8), voen: '1700456721', lines: [
    { code: 'F-101', name: 'Yağ filtri MAN', qty: '24', price: '18.50' },
    { code: 'F-102', name: 'Hava filtri MAN', qty: '12', price: '42' },
    { code: 'E-210', name: 'Əyləc bəndi (ön)', qty: '16', price: '65' },
    { code: 'L-330', name: 'Lampa H7 24V', qty: '40', price: '3.75' },
  ] }, W)
  svc.docs.save({ kind: 'IN', date: d(5), voen: '1402288310', lines: [
    { code: 'M-500', name: 'Motor yağı 10W-40 (litr)', qty: '120', price: '9.20' },
    { code: 'F-101', name: '', qty: '20', price: '19.40' },
    { code: 'A-077', name: 'Akkumulyator 225Ah', qty: '4', price: '410' },
  ] }, W)
  svc.docs.save({ kind: 'IN', date: d(2), voen: '1700456721', lines: [
    { code: 'S-018', name: 'Şin 295/80 R22.5', qty: '8', price: '385' },
    { code: 'W-040', name: 'Şüşəsilən fırça', qty: '30', price: '11.90' },
  ] }, W)
  svc.docs.save({ kind: 'OUT', date: d(4), lines: [{ code: 'F-101', qty: '30' }, { code: 'M-500', qty: '36' }] }, W)
  svc.docs.save({ kind: 'OUT', date: d(1), lines: [{ code: 'E-210', qty: '4' }, { code: 'L-330', qty: '12' }, { code: 'S-018', qty: '2' }] }, W)
  const bad = svc.docs.save({ kind: 'OUT', date: d(1), lines: [{ code: 'A-077', qty: '1' }] }, W)
  svc.docs.cancel({ id: bad.id, reason: 'Səhv yazılıb' }, W)
  svc.docs.save({ kind: 'OUT', date: t, lines: [{ code: 'W-040', qty: '6' }, { code: 'F-102', qty: '2' }] }, W)

  const r = {}
  for (const n of ['5', '12', '65', '88A']) r[n] = svc.routes.save({ name: n }, W).id
  const buses = [
    ['10-AB-123', '5', '06:00'], ['10-AB-124', '5', '06:12'], ['90-HK-457', '5', '06:24'], ['77-RT-310', '5', '06:36'],
    ['10-BC-901', '12', '05:50'], ['99-ZA-118', '12', '06:05'], ['10-CC-552', '12', '06:20'],
    ['90-KM-004', '65', '06:30'], ['10-NN-781', '65', '06:45'],
    ['77-AA-215', '88A', '06:10'], ['10-XY-632', '88A', ''],
  ]
  const ids = {}
  for (const [p, rt, dep] of buses) ids[p] = svc.buses.save({ plate: p, routeId: r[rt], depart: dep }, W).id
  svc.moves.create({ busId: ids['90-HK-457'], toRouteId: r['12'], days: 2, reason: '12 xəttində sürücü çatışmır' }, W)
  svc.moves.create({ busId: ids['10-NN-781'], toRouteId: r['88A'], days: 1, reason: '' }, W)
  svc.notes.add({ text: '88A xəttində Nərimanov tərəfdə yol təmiri — 15 dəqiqə gecikmə ola bilər.' }, W)
}

module.exports = { seed }
