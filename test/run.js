'use strict'
/** ENA Anbar — iş qaydalarının testi: npm test */
const { Store } = require('../src/store')
const { createServices } = require('../src/services')

let passed = 0
let failed = 0
const check = (name, ok, extra) => {
  ok ? passed++ : failed++
  console.log(`  ${ok ? '✅' : '❌'} ${name}${!ok && extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`)
}
const throws = (fn, re) => {
  try {
    fn()
    return false
  } catch (e) {
    return re ? re.test(e.message) : true
  }
}

async function main() {
  const store = await Store.open(null)
  let clock = new Date(2026, 10, 9, 10, 0, 0) // 09.11.2026
  const s = createServices(store, { now: () => clock })
  const W = 'Anbardar'

  console.log('\n── Giriş ──')
  check('ilk açılışda parol yoxdur', !s.auth.isSetup())
  check('qısa parol qəbul olunmur', throws(() => s.auth.setup({ general: '12', anbar: 'abcd' }), /4 simvol/))
  s.auth.setup({ general: 'ena2026', anbar: 'anbar99' })
  check('parollar təyin olundu', s.auth.isSetup() && s.auth.checkGeneral('ena2026') && !s.auth.checkGeneral('x') && s.auth.checkAnbar('anbar99'))
  check('ikinci dəfə təyin etmək olmaz', throws(() => s.auth.setup({ general: 'aaaa', anbar: 'bbbb' })))

  console.log('\n── Alış (yeni mallar avtomatik) ──')
  check('yeni kodda ad yoxdursa xəta', throws(() => s.docs.save({ kind: 'IN', date: '2026-11-01', lines: [{ code: 'A1', qty: '10', price: '5' }] }, W), /mal adını/))
  check('səhv VÖEN', throws(() => s.docs.save({ kind: 'IN', date: '2026-11-01', voen: '12 3!', lines: [{ code: 'A1', name: 'Yağ filtri', qty: '1', price: '1' }] }, W), /VÖEN/))
  check('gələcək tarix olmaz', throws(() => s.docs.save({ kind: 'IN', date: '2026-11-20', lines: [{ code: 'A1', name: 'x', qty: '1', price: '1' }] }, W), /Gələcək/))
  const in1 = s.docs.save({ kind: 'IN', date: '2026-11-01', voen: '1234567890', lines: [{ code: 'A1', name: 'Yağ filtri', qty: '10', price: '5' }, { code: 'B2', name: 'Əyləc bəndi', qty: '4', price: '12,50' }] }, W)
  check('alış №1, cəmi 100.00', in1.no === 1 && in1.total === 10000, in1)
  const a1 = s.items.list().find((i) => i.code === 'A1')
  check('mal anbara düşdü, əlavə tarixi 01.11', a1 && a1.name === 'Yağ filtri' && a1.addedDate === '2026-11-01' && a1.stock === 10000, a1)
  const in2 = s.docs.save({ kind: 'IN', date: '2026-11-05', voen: '1234567890', lines: [{ code: 'a1', name: 'başqa ad', qty: '10', price: '6' }] }, W)
  check('mövcud kod (kiçik hərflə) — ad dəyişmir, yeni mal yaranmır', s.items.list().filter((i) => i.code.toLowerCase() === 'a1').length === 1 && s.items.list().find((i) => i.code === 'A1').name === 'Yağ filtri')

  console.log('\n── Məxaric FIFO ──')
  check('anbarda olmayan kod', throws(() => s.docs.save({ kind: 'OUT', date: '2026-11-06', lines: [{ code: 'ZZ', qty: '1' }] }, W), /yoxdur/))
  check('qalıqdan çox çıxmaz', throws(() => s.docs.save({ kind: 'OUT', date: '2026-11-06', lines: [{ code: 'A1', qty: '21' }] }, W), /kifayət/))
  check('alışdan əvvəlki tarixə çıxmaz (01.11-də 10 var, 15 olmaz)', throws(() => s.docs.save({ kind: 'OUT', date: '2026-11-03', lines: [{ code: 'A1', qty: '15' }] }, W), /kifayət/))
  const pv = s.docs.preview({ date: '2026-11-06', lines: [{ code: 'A1', qty: '15' }] })[0]
  check('önbaxış: qalıq 20, 15 ədəd = 80.00', pv.stock === 20000 && pv.amount === 8000, pv)
  const out1 = s.docs.save({ kind: 'OUT', date: '2026-11-06', voen: '', lines: [{ code: 'A1', qty: '15' }] }, W)
  check('məxaric 15 ədəd: 10×5 + 5×6 = 80.00', out1.total === 8000, out1)
  const o1 = s.docs.get({ id: out1.id })
  check('FIFO bölgüsü: №1-dən 10, №2-dən 5', o1.lines[0].takes.length === 2 && o1.lines[0].takes[0].inNo === 1 && o1.lines[0].takes[0].qty === 10000 && o1.lines[0].takes[1].inNo === 2 && o1.lines[0].takes[1].qty === 5000, o1.lines[0].takes)
  check('orta qiymət 5.3333', o1.lines[0].price === 53333, o1.lines[0].price)
  const st = s.items.list().find((i) => i.code === 'A1')
  check('qalıq 5 ədəd, dəyəri 30.00', st.stock === 5000 && st.value === 3000, st)

  console.log('\n── Ləğv (arxivdə qalır) ──')
  check('məxaric olunmuş alışı ləğv etmək olmaz', throws(() => s.docs.cancel({ id: in1.id, reason: 'səhv' }, W), /№1/))
  check('səbəbsiz ləğv olmaz', throws(() => s.docs.cancel({ id: out1.id, reason: '' }, W), /səbəb/))
  s.docs.cancel({ id: out1.id, reason: 'səhv yazılıb' }, W)
  const st2 = s.items.list().find((i) => i.code === 'A1')
  check('məxaric ləğvi — mal anbara qayıtdı (20)', st2.stock === 20000 && st2.value === 11000, st2)
  check('ləğv edilən sənəd arxivdə qalır', s.docs.list({ kind: 'OUT' })[0].status === 'CANCELLED')
  s.docs.cancel({ id: in1.id, reason: 'təkrar' }, W)
  const st3 = s.items.list().find((i) => i.code === 'A1')
  check('alış ləğvi — qalıq 10 (yalnız №2)', st3.stock === 10000 && st3.value === 6000, st3)
  const out2 = s.docs.save({ kind: 'OUT', date: '2026-11-07', lines: [{ code: 'A1', qty: '3' }] }, W)
  check('ləğvdən sonra FIFO №2-dən: 3×6 = 18.00', out2.total === 1800)
  const hist = s.items.get({ id: st3.id })
  check('mal tarixçəsi: 4 hərəkət, son qalıq 7', hist.moves.length === 4 && hist.moves[0].balance === 7000, hist.moves.map((m) => [m.kind, m.status, m.balance]))
  const exact = s.docs.save({ kind: 'IN', date: '2026-11-08', lines: [{ code: 'C3', name: 'Bolt', qty: '3', price: '10' }] }, W)
  s.docs.save({ kind: 'OUT', date: '2026-11-08', lines: [{ code: 'C3', qty: '1' }] }, W)
  s.docs.save({ kind: 'OUT', date: '2026-11-08', lines: [{ code: 'C3', qty: '1' }] }, W)
  const last = s.docs.save({ kind: 'OUT', date: '2026-11-08', lines: [{ code: 'C3', qty: '1' }] }, W)
  check('qəpik itmir: 3 × 1 ədəd çıxış cəmi alışa bərabər', exact.total === 3000 && last.total === 1000)
  const odd = s.docs.save({ kind: 'IN', date: '2026-11-08', lines: [{ code: 'D4', name: 'Lampa', qty: '3', price: '3.3333' }] }, W)
  const o3 = [1, 1, 1].map(() => s.docs.save({ kind: 'OUT', date: '2026-11-08', lines: [{ code: 'D4', qty: '1' }] }, W).total)
  check('3 × 3.3333 = 10.00; çıxışların cəmi də 10.00', odd.total === 1000 && o3.reduce((a, b) => a + b, 0) === 1000, o3)
  const mx = s.items.update({ id: st3.id, code: 'A1', name: 'Yağ filtri (MAN)' }, W)
  check('mal adı dəyişdi', mx.id && s.items.list().find((i) => i.code === 'A1').name === 'Yağ filtri (MAN)')

  console.log('\n── Avtobuslar və xətlər ──')
  const r5 = s.routes.save({ name: '5' }, W).id
  const r12 = s.routes.save({ name: '12' }, W).id
  const r88 = s.routes.save({ name: '88A' }, W).id
  check('xətt təkrarlanmır', throws(() => s.routes.save({ name: '5' }, W), /artıq/))
  check('xətlər təbii sıra ilə: 5, 12, 88A', s.routes.list().map((r) => r.name).join(',') === '5,12,88A')
  check('nişan formatı yoxlanılır', throws(() => s.buses.save({ plate: 'ABC', routeId: r5 }, W), /10-AB-123/))
  const b1 = s.buses.save({ plate: '10 ab 123', routeId: r5, depart: '6:30' }, W).id
  const b2 = s.buses.save({ plate: '90-XX-456', routeId: r5, depart: '06:10' }, W).id
  s.buses.save({ plate: '77-BB-001', routeId: r12, depart: '07:00' }, W)
  check('nişan normallaşır: 10-AB-123, saat 06:30', s.buses.board().groups[0].buses.some((b) => b.plate === '10-AB-123' && b.depart === '06:30'))
  check('təkrar nişan olmaz', throws(() => s.buses.save({ plate: '10-AB-123', routeId: r12 }, W), /artıq/))
  const g = s.buses.board().groups
  check('xətlərə görə qruplaşır, saata görə sıralanır', g[0].name === '5' && g[0].buses.map((b) => b.plate).join(',') === '90-XX-456,10-AB-123' && g[1].buses.length === 1, g.map((x) => [x.name, x.buses.map((b) => b.plate)]))
  check('avtobusu olan xətti silmək olmaz', throws(() => s.routes.remove({ id: r5 }, W), /avtobus var/))

  console.log('\n── Müvəqqəti yerdəyişmə (2 gün) ──')
  check('öz xəttinə keçirmək olmaz', throws(() => s.moves.create({ busId: b1, toRouteId: r5, days: 1 }, W), /onsuz da/))
  s.moves.create({ busId: b1, toRouteId: r12, days: 2, reason: 'sürücü çatışmır' }, W)
  check('üst-üstə düşən yerdəyişmə olmaz', throws(() => s.moves.create({ busId: b1, toRouteId: r88, dateFrom: '2026-11-10', days: 1 }, W), /artıq/))
  let bd = s.buses.board()
  check('bu gün 10-AB-123 12 xəttində (müvəqqəti), 5-də «getdi» kimi', bd.groups[1].buses.some((b) => b.plate === '10-AB-123' && b.move) && bd.groups[0].away.some((b) => b.plate === '10-AB-123') && bd.moved === 1, bd.groups.map((x) => [x.name, x.buses.map((b) => b.plate), x.away.map((b) => b.plate)]))
  let nt = s.notes.today()
  check('bugünkü qeydə avtomatik düşdü', nt.notes.some((n) => n.kind === 'MOVE' && n.text.includes('10-AB-123') && n.text.includes('5 xəttindən 12 xəttinə keçdi')) && nt.active.length === 1, nt.notes.map((n) => n.text))
  s.notes.add({ text: '88A xəttində tıxac var' }, W)
  check('əl ilə qeyd', s.notes.today().notes.some((n) => n.kind === 'MANUAL' && n.text.includes('tıxac')))

  // Sabah (10.11): hələ 12-də
  clock = new Date(2026, 10, 10, 8, 0, 0)
  s.rollover()
  nt = s.notes.today()
  check('ertəsi gün: bugünkü qeydlər boşaldı', nt.notes.length === 0, nt.notes)
  check('dünənki qeydlər «köhnə qeydlər»də', s.notes.archive()[0].date === '2026-11-09' && s.notes.archive()[0].notes.some((n) => n.kind === 'MANUAL') && s.notes.archive()[0].notes.some((n) => n.kind === 'MOVE'))
  check('2-ci gün: hələ 12 xəttində, «davam edən» siyahısında', s.buses.board().groups[1].buses.some((b) => b.plate === '10-AB-123') && nt.active.length === 1)

  // 11.11: öz xəttinə qayıdır, qeyd yazılır
  clock = new Date(2026, 10, 11, 7, 0, 0)
  s.rollover()
  bd = s.buses.board()
  check('3-cü gün: öz xəttinə (5) qayıtdı', bd.groups[0].buses.some((b) => b.plate === '10-AB-123' && !b.move) && bd.moved === 0)
  nt = s.notes.today()
  check('bugünkü qeyddə: «öz xəttinə qayıtdı — 09.11–10.11 12 xəttində idi»', nt.notes.some((n) => n.kind === 'RETURN' && n.text.includes('10-AB-123') && n.text.includes('09.11 – 10.11.2026') && n.text.includes('12 xəttində idi')), nt.notes.map((n) => n.text))
  check('rollover təkrar qeyd yazmır', !s.rollover() && s.notes.today().notes.length === 1)

  // Proqram 3 gün bağlı qaldı
  s.moves.create({ busId: b2, toRouteId: r88, days: 1 }, W)
  clock = new Date(2026, 10, 14, 9, 0, 0)
  s.rollover()
  const arch = s.notes.archive()
  check('bağlı qaldığı günlər də tamamlandı: 12.11-də qayıtma qeydi', arch.some((d) => d.date === '2026-11-12' && d.notes.some((n) => n.text.includes('90-XX-456 öz xəttinə'))), arch.map((d) => d.date))

  console.log('\n── Vaxtından əvvəl qaytarma və cədvəl ──')
  const mv = s.moves.create({ busId: b2, toRouteId: r12, days: 5 }, W).id
  s.moves.end({ id: mv }, W)
  check('vaxtından əvvəl qaytarıldı — dərhal öz xəttində', s.buses.board().groups[0].buses.some((b) => b.plate === '90-XX-456' && !b.move))
  check('qaytarma qeydi', s.notes.today().notes.some((n) => n.text.includes('vaxtından əvvəl')))
  clock = new Date(2026, 10, 19, 9, 0, 0)
  s.rollover()
  check('vaxtından əvvəl bitən üçün təkrar «qayıtdı» qeydi yoxdur', !s.notes.archive().some((d) => d.notes.some((n) => n.text.includes('90-XX-456 öz xəttinə') && d.date === '2026-11-19')))
  s.buses.setDepart({ id: b1, depart: '05:45' }, W)
  check('çıxış saatı dəyişdi və qeydə düşdü', s.buses.board().groups[0].buses[0].plate === '10-AB-123' && s.notes.today().notes.some((n) => n.text.includes('06:30 → 05:45')))
  check('səhv saat', throws(() => s.buses.setDepart({ id: b1, depart: '25:00' }, W), /06:30/))
  const h = s.buses.history({ id: b1 })
  check('avtobus tarixçəsi: yerdəyişmə görünür', h.moves.length === 1 && h.moves[0].toRouteName === '12' && h.moves[0].dateTo === '2026-11-10')
  s.buses.remove({ id: b2, reason: 'təmirə getdi' }, W)
  check('siyahıdan çıxarılan avtobus görünmür, qeyd qalır', !s.buses.board().groups.some((x) => x.buses.some((b) => b.plate === '90-XX-456')) && s.notes.today().notes.some((n) => n.text.includes('təmirə')))

  console.log(failed ? `\n❌ ${failed} yoxlama alınmadı (${passed} keçdi)` : `\n✅ ${passed} yoxlama keçdi`)
  if (failed) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
