'use strict'
/**
 * Köhnə ENA Anbar (.NET, ena_anbar.db) bazasını yeni bazaya köçürür.
 *   ENA_DATA=<yeni baza qovluğu> node scripts/import-old.js <köhnə ena_anbar.db> [--yes]
 * --yes olmadan yalnız yoxlayır (heç nə yazmır). Yeni bazada anbar məlumatı olmamalıdır.
 *
 * Köçürülür: kontragentlər, mallar (ölçü vahidi ilə), alışlar (sənəd = id + tarix + VÖEN),
 * məxariclər (sənəd = qaimə + tarix + VÖEN) — hər məxaric köhnə proqramdakı kimi öz alışına (alis_uid) bağlanır,
 * şərh / DQN / xətt sətirdə saxlanılır. İstifadəçilər və parollar köçürülmür.
 */
const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')
const { Store } = require('../src/store')
const { createServices, QTY, PRICE } = require('../src/services')

const oldFile = process.argv[2]
const APPLY = process.argv.includes('--yes')
if (!oldFile || !fs.existsSync(oldFile)) {
  console.error('İstifadə: node scripts/import-old.js <ena_anbar.db> [--yes]')
  process.exit(1)
}
const dataDir = process.env.ENA_DATA || path.join(__dirname, '..', 'data')

const iso = (dmy) => {
  const m = String(dmy || '').match(/^(\d{2})-(\d{2})-(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
const stampOf = (s, fallbackIso) => {
  const m = String(s || '').match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}:\d{2}:\d{2})/)
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}` : `${fallbackIso} 00:00:00`
}
const clean = (v) => {
  const s = String(v ?? '').trim()
  return s === '.' ? '' : s
}
const amountOf = (qty, price) => Math.round((qty * price) / ((QTY * PRICE) / 100))

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')) })
  const old = new SQL.Database(fs.readFileSync(oldFile))
  const q = (sql) => {
    const r = old.exec(sql)
    return r[0] ? r[0].values.map((v) => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : []
  }

  const store = await Store.open(APPLY ? path.join(dataDir, 'ena-anbar.db') : null)
  const svc = createServices(store)
  const existing = store.get('SELECT (SELECT COUNT(*) FROM items) + (SELECT COUNT(*) FROM docs) AS n').n
  if (existing) {
    console.error(`Yeni bazada artıq ${existing} mal/sənəd var — köçürmə yalnız boş anbara edilir.`)
    process.exit(1)
  }

  const kont = q('SELECT id, adi, voen FROM kontragentler ORDER BY id')
  const anbar = q('SELECT * FROM anbar ORDER BY mal_kodu')
  const alis = q(`SELECT * FROM alis ORDER BY substr(tarix,7,4)||substr(tarix,4,2)||substr(tarix,1,2), daxil_zamani, row_uid`)
  const satis = q(`SELECT * FROM satis ORDER BY substr(tarix,7,4)||substr(tarix,4,2)||substr(tarix,1,2), id`)
  const report = { skippedZeroIn: 0, skippedZeroOut: 0, fifoFallback: 0, short: [], clamped: 0 }

  store.tx(() => {
    // 1) kontragentlər
    for (const k of kont) {
      const v = clean(k.voen).toUpperCase()
      if (v) store.run('INSERT OR IGNORE INTO parties (voen, name) VALUES (?, ?)', [v, clean(k.adi) || v])
    }
    // 2) mallar — əlavə tarixi: ilk alış (yoxdursa qeyd tarixi)
    const firstIn = new Map()
    for (const a of alis) if (!firstIn.has(clean(a.mal_kodu).toLowerCase())) firstIn.set(clean(a.mal_kodu).toLowerCase(), iso(a.tarix))
    const itemId = new Map()
    const addItem = (code, name, unit, added, at) => {
      const id = store.insert('INSERT INTO items (code, name, unit, added_date, created_at) VALUES (?, ?, ?, ?, ?)', [code, name || code, unit || '', added, at])
      itemId.set(code.toLowerCase(), id)
      return id
    }
    for (const r of anbar) {
      const added = firstIn.get(clean(r.mal_kodu).toLowerCase()) || iso(r.qeyd_zamani) || svc.today()
      addItem(clean(r.mal_kodu), clean(r.mal_adi), clean(r.olcu_vahidi), added, stampOf(r.qeyd_zamani, added))
    }
    const itemOf = (row) => itemId.get(clean(row.mal_kodu).toLowerCase()) ?? addItem(clean(row.mal_kodu), clean(row.mal_adi), clean(row.olcu_vahidi), iso(row.tarix), stampOf(row.daxil_zamani, iso(row.tarix)))

    // 3) alışlar
    let noIn = 0
    const layerOf = new Map() // row_uid → layer id
    const groupsIn = new Map()
    for (const a of alis) {
      const key = `${a.id}|${a.tarix}|${a.voen}`
      if (!groupsIn.has(key)) groupsIn.set(key, [])
      groupsIn.get(key).push(a)
    }
    for (const rows of groupsIn.values()) {
      const valid = rows.filter((r) => Math.round(Number(r.alis_miqdari) * QTY) > 0)
      report.skippedZeroIn += rows.length - valid.length
      if (!valid.length) continue
      const f = valid[0]
      const date = iso(f.tarix)
      const docId = store.insert('INSERT INTO docs (kind, no, doc_date, voen, party, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['IN', ++noIn, date, clean(f.voen).toUpperCase(), clean(f.kontragent), clean(f.id), stampOf(f.daxil_zamani, date)])
      valid.forEach((r, i) => {
        const qty = Math.round(Number(r.alis_miqdari) * QTY)
        const price = Math.round(Number(r.bir_maya) * PRICE)
        // məbləğ köhnə rəqəmlərdən (onluq itməsin)
        const amount = Math.round(Number(r.alis_miqdari) * Number(r.bir_maya) * 100)
        const item = itemOf(r)
        const lineId = store.insert('INSERT INTO lines (doc_id, line_no, item_id, qty, price, amount, note) VALUES (?, ?, ?, ?, ?, ?, ?)', [docId, i + 1, item, qty, price, amount, clean(r.serh)])
        const lid = store.insert('INSERT INTO layers (item_id, line_id, doc_date, cost, qty_in, qty_left, amount_in, amount_left) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [item, lineId, date, price, qty, qty, amount, amount])
        layerOf.set(r.row_uid, lid)
      })
    }

    // 4) məxariclər — öz alışından; çatmasa FIFO ilə
    const take = (layer, want, lineId) => {
      const t = Math.min(want, layer.qty_left)
      if (t <= 0) return [0, 0]
      const amt = t === layer.qty_left ? layer.amount_left : Math.min(layer.amount_left, amountOf(t, layer.cost))
      store.run('UPDATE layers SET qty_left = qty_left - ?, amount_left = amount_left - ? WHERE id = ?', [t, amt, layer.id])
      store.run('INSERT INTO takes (line_id, layer_id, qty, amount) VALUES (?, ?, ?, ?)', [lineId, layer.id, t, amt])
      layer.qty_left -= t
      layer.amount_left -= amt
      return [t, amt]
    }
    // hər qatın hələ «öz» məxariclərinə lazım olan miqdarı — FIFO ehtiyatı onlara toxunmasın
    const reserved = new Map()
    for (const s of satis) {
      const lid = layerOf.get(s.alis_uid)
      if (lid) reserved.set(lid, (reserved.get(lid) || 0) + Math.round(Number(s.miqdar) * QTY))
    }
    let noOut = 0
    const groupsOut = new Map()
    for (const s of satis) {
      const key = `${s.qaime}|${s.tarix}|${s.voen}`
      if (!groupsOut.has(key)) groupsOut.set(key, [])
      groupsOut.get(key).push(s)
    }
    for (const rows of groupsOut.values()) {
      const valid = rows.filter((r) => Math.round(Number(r.miqdar) * QTY) > 0)
      report.skippedZeroOut += rows.length - valid.length
      if (!valid.length) continue
      const f = valid[0]
      const date = iso(f.tarix)
      const docId = store.insert('INSERT INTO docs (kind, no, doc_date, voen, party, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['OUT', ++noOut, date, clean(f.voen).toUpperCase(), clean(f.kontragent), clean(f.qaime), stampOf(f.daxil_zamani, date)])
      valid.forEach((r, i) => {
        const qty = Math.round(Number(r.miqdar) * QTY)
        const item = itemOf(r)
        const lineId = store.insert('INSERT INTO lines (doc_id, line_no, item_id, qty, price, amount, note, dqn, route) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?)', [docId, i + 1, item, qty, clean(r.serh), clean(r.marshrut_dqn), clean(r.marshrut_xett)])
        let need = qty
        let amount = 0
        const own = layerOf.get(r.alis_uid)
        if (own) {
          const ly = store.get('SELECT * FROM layers WHERE id = ?', [own])
          // onluq yuvarlaqlaşdırma: 1-2 mində bir fərq — qatın qalanını götür
          if (ly.qty_left < need && need - ly.qty_left <= 2) {
            need = ly.qty_left
            report.clamped++
          }
          const [t, a] = take(ly, need, lineId)
          reserved.set(own, (reserved.get(own) || 0) - qty)
          need -= t
          amount += a
        }
        if (need > 0) {
          report.fifoFallback++
          const layers = store.all('SELECT * FROM layers WHERE item_id = ? AND qty_left > 0 ORDER BY doc_date, id', [item])
          // əvvəl heç kimə bağlı olmayan qalıq, sonra qalanı
          for (const pass of [true, false]) {
            for (const ly of layers) {
              if (need <= 0) break
              const free = pass ? ly.qty_left - Math.max(0, reserved.get(ly.id) || 0) : ly.qty_left
              if (free <= 0) continue
              const [t, a] = take(ly, Math.min(need, free), lineId)
              need -= t
              amount += a
            }
          }
        }
        if (need > 0) report.short.push(`${clean(r.mal_kodu)} ${clean(r.mal_adi)} · ${r.tarix} · qaimə ${r.qaime}: ${need / QTY} çatmadı`)
        const price = qty ? Math.round((amount * (QTY * PRICE)) / 100 / qty) : 0
        store.run('UPDATE lines SET amount = ?, price = ? WHERE id = ?', [amount, price, lineId])
      })
    }
    svc.audit('sistem', 'Köhnə bazadan köçürmə', `${kont.length} kontragent, ${itemId.size} mal, ${noIn} alış, ${noOut} məxaric`)
  })

  // ── Yoxlama: köhnə proqramın hesabı ilə müqayisə ──
  const oldLeft = q(`SELECT SUM(alis_miqdari - COALESCE((SELECT SUM(miqdar) FROM satis WHERE satis.alis_uid = alis.row_uid), 0)) q,
    SUM((alis_miqdari - COALESCE((SELECT SUM(miqdar) FROM satis WHERE satis.alis_uid = alis.row_uid), 0)) * bir_maya) v FROM alis`)[0]
  const n = store.get(`SELECT (SELECT COUNT(*) FROM parties) p, (SELECT COUNT(*) FROM items) i, (SELECT COUNT(*) FROM docs WHERE kind='IN') di, (SELECT COUNT(*) FROM docs WHERE kind='OUT') do,
    (SELECT COUNT(*) FROM lines l JOIN docs d ON d.id=l.doc_id WHERE d.kind='IN') li, (SELECT COUNT(*) FROM lines l JOIN docs d ON d.id=l.doc_id WHERE d.kind='OUT') lo,
    (SELECT SUM(qty_left) FROM layers) ql, (SELECT SUM(amount_left) FROM layers) vl, (SELECT SUM(amount) FROM lines l JOIN docs d ON d.id=l.doc_id WHERE d.kind='IN') ain, (SELECT SUM(amount) FROM lines l JOIN docs d ON d.id=l.doc_id WHERE d.kind='OUT') aout,
    (SELECT COUNT(*) FROM layers WHERE qty_left < 0 OR amount_left < 0) neg`)
  console.log(`\n${APPLY ? '✅ KÖÇÜRÜLDÜ' : '🔎 YOXLAMA (heç nə yazılmadı — yazmaq üçün --yes)'}`)
  console.log(`  Kontragent: ${n.p}   Mal: ${n.i}`)
  console.log(`  Alış: ${n.di} sənəd, ${n.li} sətir · cəmi ${(n.ain / 100).toFixed(2)} ₼`)
  console.log(`  Məxaric: ${n.do} sənəd, ${n.lo} sətir · cəmi ${(n.aout / 100).toFixed(2)} ₼`)
  console.log(`  Anbarda qalıq: ${(n.ql / QTY).toFixed(3)} (köhnə: ${Number(oldLeft.q).toFixed(3)})`)
  console.log(`  Qalıq dəyəri: ${(n.vl / 100).toFixed(2)} ₼ (köhnə: ${Number(oldLeft.v).toFixed(2)} ₼)`)
  console.log(`  Mənfi qat: ${n.neg}`)
  console.log(`  Sayı 0 olan sətir (köçürülmədi): alış ${report.skippedZeroIn}, məxaric ${report.skippedZeroOut}`)
  console.log(`  Öz alışı tapılmayan / çatmayan → FIFO ilə: ${report.fifoFallback}; yuvarlaqlaşdırma düzəlişi: ${report.clamped}`)
  console.log(`  Anbarda çatmayan məxaric: ${report.short.length}`)
  for (const s of report.short.slice(0, 30)) console.log('    · ' + s)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
