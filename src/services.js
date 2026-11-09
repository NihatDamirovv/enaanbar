'use strict'
/**
 * ENA Anbar — bütün iş qaydaları (anbar FIFO, avtobuslar, yerdəyişmə, qeydlər, cədvəl).
 * Ekranlar yalnız bu funksiyaları çağırır; yazma icazəsi main.js-də yoxlanılır.
 */
const crypto = require('crypto')

class AppError extends Error {
  constructor(message, field) {
    super(message)
    this.field = field
  }
}

// ── Köməkçilər ────────────────────────────────────────────────
const p2 = (n) => String(n).padStart(2, '0')
const isoOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  return isoOf(new Date(y, m - 1, d + n))
}
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '')
const dm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '')
const str = (v, max = 200) => (v == null ? '' : String(v)).trim().slice(0, max)

/** "12,5" → 12500 (mində bir). scale = onluq rəqəm sayı */
function parseFixed(v, scale, label) {
  const s = str(v, 30).replace(/\s/g, '').replace(',', '.')
  if (!s) return null
  if (!/^\d+(\.\d+)?$/.test(s)) throw new AppError(`${label}: rəqəm yazın`)
  const [a, b = ''] = s.split('.')
  if (b.length > scale) throw new AppError(`${label}: nöqtədən sonra ən çox ${scale} rəqəm`)
  const n = Number(a) * 10 ** scale + Number((b + '0'.repeat(scale)).slice(0, scale) || 0)
  if (!Number.isSafeInteger(n) || n > 1e15) throw new AppError(`${label}: çox böyük rəqəm`)
  return n
}
const QTY = 1000 // say: mində bir
const PRICE = 10000 // qiymət: on mində bir manat
const MONEY = 100 // məbləğ: qəpik
/** say × qiymət → qəpik (yuvarlaqlaşdırma ilə) */
const lineAmount = (qty, price) => Math.round((qty * price) / ((QTY * PRICE) / MONEY))

function normPlate(v) {
  const s = str(v, 20).toUpperCase().replace(/[\s.]/g, '')
  const m = s.match(/^(\d{2})-?([A-Z]{1,2})-?(\d{3})$/)
  if (!m) throw new AppError('Dövlət qeydiyyat nişanı belə olmalıdır: 10-AB-123', 'plate')
  return `${m[1]}-${m[2]}-${m[3]}`
}

function normTime(v) {
  const s = str(v, 10).replace('.', ':')
  if (!s) return ''
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new AppError('Saat belə yazılır: 06:30', 'depart')
  return `${p2(Number(m[1]))}:${m[2]}`
}

/** Xətləri təbii sıralama: 2, 5, 12, 88A */
const routeSort = (a, b) => String(a.name).localeCompare(String(b.name), 'az', { numeric: true })

function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(pw, salt, 32)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}
function checkPassword(pw, stored) {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  const got = crypto.scryptSync(String(pw ?? ''), Buffer.from(salt, 'hex'), 32)
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'))
}

// ── Xidmətlər ─────────────────────────────────────────────────
function createServices(store, opts = {}) {
  const now = opts.now || (() => new Date())
  const today = () => isoOf(now())
  const stamp = () => {
    const d = now()
    return `${isoOf(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
  }
  const audit = (who, action, detail = '') => store.run('INSERT INTO audit (at, who, action, detail) VALUES (?, ?, ?, ?)', [stamp(), who, action, detail])
  const addNote = (date, text, kind = 'AUTO', author = '', at = stamp()) =>
    store.run('INSERT INTO notes (note_date, kind, text, created_at, author) VALUES (?, ?, ?, ?, ?)', [date, kind, text, at, author])

  const routeName = (id) => store.get('SELECT name FROM routes WHERE id = ?', [id])?.name ?? '?'

  // ── Giriş ───────────────────────────────────────────────────
  const auth = {
    isSetup: () => !!store.meta('general_hash'),
    setup({ general, anbar }) {
      if (auth.isSetup()) throw new AppError('Parollar artıq təyin olunub')
      const g = str(general, 64)
      const a = str(anbar, 64)
      if (g.length < 4) throw new AppError('Ümumi parol ən azı 4 simvol olmalıdır', 'general')
      if (a.length < 4) throw new AppError('Anbardar parolu ən azı 4 simvol olmalıdır', 'anbar')
      if (g === a) throw new AppError('Anbardar parolu ümumi paroldan fərqli olmalıdır', 'anbar')
      store.tx(() => {
        store.setMeta('general_hash', hashPassword(g))
        store.setMeta('anbar_hash', hashPassword(a))
        store.setMeta('rollover_date', today())
        audit('sistem', 'Parollar təyin olundu')
      })
    },
    checkGeneral: (pw) => checkPassword(pw, store.meta('general_hash')),
    checkAnbar: (pw) => checkPassword(pw, store.meta('anbar_hash')),
    change({ current, general, anbar }, who) {
      if (!auth.checkAnbar(current)) throw new AppError('Hazırkı anbardar parolu səhvdir', 'current')
      const g = str(general, 64)
      const a = str(anbar, 64)
      if (!g && !a) throw new AppError('Dəyişmək üçün yeni parol yazın')
      if (g && g.length < 4) throw new AppError('Ümumi parol ən azı 4 simvol olmalıdır', 'general')
      if (a && a.length < 4) throw new AppError('Anbardar parolu ən azı 4 simvol olmalıdır', 'anbar')
      store.tx(() => {
        if (g) store.setMeta('general_hash', hashPassword(g))
        if (a) store.setMeta('anbar_hash', hashPassword(a))
        audit(who, 'Parol dəyişdi', [g && 'ümumi', a && 'anbardar'].filter(Boolean).join(', '))
      })
    },
  }

  // ── Mallar ──────────────────────────────────────────────────
  const itemByCode = (code) => store.get('SELECT * FROM items WHERE code = ? COLLATE NOCASE', [str(code, 40)])

  const items = {
    list({ q } = {}) {
      const rows = store.all(`
        SELECT i.id, i.code, i.name, i.added_date AS addedDate,
          COALESCE((SELECT SUM(l.qty) FROM lines l JOIN docs d ON d.id = l.doc_id WHERE l.item_id = i.id AND d.kind = 'IN' AND d.status = 'ACTIVE'), 0) AS qtyIn,
          COALESCE((SELECT SUM(l.qty) FROM lines l JOIN docs d ON d.id = l.doc_id WHERE l.item_id = i.id AND d.kind = 'OUT' AND d.status = 'ACTIVE'), 0) AS qtyOut,
          COALESCE((SELECT SUM(qty_left) FROM layers WHERE item_id = i.id), 0) AS stock,
          COALESCE((SELECT SUM(amount_left) FROM layers WHERE item_id = i.id), 0) AS value,
          (SELECT MAX(d.doc_date) FROM lines l JOIN docs d ON d.id = l.doc_id WHERE l.item_id = i.id AND d.status = 'ACTIVE') AS lastDate
        FROM items i ORDER BY i.code COLLATE NOCASE`)
      const s = str(q, 60).toLocaleLowerCase('az')
      return s ? rows.filter((r) => r.code.toLocaleLowerCase('az').includes(s) || r.name.toLocaleLowerCase('az').includes(s)) : rows
    },
    get({ id }) {
      const item = store.get('SELECT id, code, name, added_date AS addedDate FROM items WHERE id = ?', [id])
      if (!item) throw new AppError('Mal tapılmadı')
      const moves = store.all(
        `SELECT d.id AS docId, d.kind, d.no, d.doc_date AS date, d.voen, d.status, l.qty, l.price, l.amount
         FROM lines l JOIN docs d ON d.id = l.doc_id WHERE l.item_id = ?
         ORDER BY d.doc_date, d.created_at, d.id, l.line_no`,
        [id],
      )
      let bal = 0
      for (const m of moves) {
        if (m.status === 'ACTIVE') bal += m.kind === 'IN' ? m.qty : -m.qty
        m.balance = bal
      }
      const layers = store.all('SELECT l.doc_date AS date, l.cost, l.qty_in AS qtyIn, l.qty_left AS qtyLeft, l.amount_left AS amountLeft, d.no FROM layers l JOIN lines ln ON ln.id = l.line_id JOIN docs d ON d.id = ln.doc_id WHERE l.item_id = ? AND l.qty_left > 0 ORDER BY l.doc_date, l.id', [id])
      return { item, moves: moves.reverse(), layers }
    },
    update({ id, code, name }, who) {
      const item = store.get('SELECT * FROM items WHERE id = ?', [id])
      if (!item) throw new AppError('Mal tapılmadı')
      const c = str(code, 40)
      const n = str(name, 120)
      if (!c) throw new AppError('Mal kodunu yazın', 'code')
      if (!n) throw new AppError('Mal adını yazın', 'name')
      const other = itemByCode(c)
      if (other && other.id !== item.id) throw new AppError(`«${c}» kodu artıq «${other.name}» malındadır`, 'code')
      store.tx(() => {
        store.run('UPDATE items SET code = ?, name = ? WHERE id = ?', [c, n, id])
        audit(who, 'Mal dəyişdi', `${item.code} «${item.name}» → ${c} «${n}»`)
      })
      return { id }
    },
  }

  // ── Sənədlər (alış / məxaric) ──────────────────────────────
  const docLines = (docId) =>
    store.all(
      `SELECT l.id, l.line_no AS lineNo, l.qty, l.price, l.amount, i.id AS itemId, i.code, i.name
       FROM lines l JOIN items i ON i.id = l.item_id WHERE l.doc_id = ? ORDER BY l.line_no`,
      [docId],
    )

  /** FIFO: anbardan ən köhnə alışdan başlayaraq götürür */
  function consume(itemId, qty, date, lineId, lineNo, item) {
    const layers = store.all('SELECT * FROM layers WHERE item_id = ? AND qty_left > 0 AND doc_date <= ? ORDER BY doc_date, id', [itemId, date])
    let need = qty
    let amount = 0
    for (const ly of layers) {
      if (need <= 0) break
      const take = Math.min(need, ly.qty_left)
      // qat tam bitirsə — qalan məbləğin hamısı (qəpik itkisi olmasın)
      const amt = take === ly.qty_left ? ly.amount_left : Math.min(ly.amount_left, lineAmount(take, ly.cost))
      store.run('UPDATE layers SET qty_left = qty_left - ?, amount_left = amount_left - ? WHERE id = ?', [take, amt, ly.id])
      store.run('INSERT INTO takes (line_id, layer_id, qty, amount) VALUES (?, ?, ?, ?)', [lineId, ly.id, take, amt])
      need -= take
      amount += amt
    }
    if (need > 0) {
      const have = qty - need
      throw new AppError(`Sətir ${lineNo}: «${item.code} ${item.name}» anbarda kifayət qədər yoxdur — ${dmy(date)} tarixinə qalıq ${fmtQty(have)}, istənilən ${fmtQty(qty)}`)
    }
    return amount
  }

  const docs = {
    nextNo: ({ kind }) => (store.get('SELECT MAX(no) AS n FROM docs WHERE kind = ?', [kind])?.n ?? 0) + 1,

    save({ kind, date, voen, lines }, who) {
      if (kind !== 'IN' && kind !== 'OUT') throw new AppError('Növ: alış və ya məxaric')
      if (!isIso(date)) throw new AppError('Tarixi düzgün yazın', 'date')
      if (date > today()) throw new AppError('Gələcək tarixlə sənəd yazmaq olmaz', 'date')
      const v = str(voen, 20).replace(/\s/g, '')
      if (v && !/^\d{10}$/.test(v)) throw new AppError('VÖEN 10 rəqəmdən ibarət olmalıdır', 'voen')
      const rows = (Array.isArray(lines) ? lines : []).filter((l) => str(l.code) || str(l.qty) || str(l.name))
      if (!rows.length) throw new AppError('Ən azı bir sətir yazın')
      if (rows.length > 500) throw new AppError('Bir sənəddə ən çox 500 sətir')

      return store.tx(() => {
        const no = docs.nextNo({ kind })
        const docId = store.insert('INSERT INTO docs (kind, no, doc_date, voen, created_at) VALUES (?, ?, ?, ?, ?)', [kind, no, date, v, stamp()])
        let total = 0
        rows.forEach((l, i) => {
          const n = i + 1
          const code = str(l.code, 40)
          if (!code) throw new AppError(`Sətir ${n}: mal kodunu yazın`)
          const qty = parseFixed(l.qty, 3, `Sətir ${n}, say`)
          if (!qty) throw new AppError(`Sətir ${n}: sayı yazın (0-dan böyük)`)
          let item = itemByCode(code)
          if (kind === 'IN') {
            const price = parseFixed(l.price, 4, `Sətir ${n}, qiymət`)
            if (price == null) throw new AppError(`Sətir ${n}: qiyməti yazın`)
            if (!item) {
              const name = str(l.name, 120)
              if (!name) throw new AppError(`Sətir ${n}: «${code}» yeni koddur — mal adını yazın`)
              const id = store.insert('INSERT INTO items (code, name, added_date, created_at) VALUES (?, ?, ?, ?)', [code, name, date, stamp()])
              item = { id, code, name }
              audit(who, 'Yeni mal', `${code} «${name}»`)
            }
            const amount = lineAmount(qty, price)
            const lineId = store.insert('INSERT INTO lines (doc_id, line_no, item_id, qty, price, amount) VALUES (?, ?, ?, ?, ?, ?)', [docId, n, item.id, qty, price, amount])
            store.run('INSERT INTO layers (item_id, line_id, doc_date, cost, qty_in, qty_left, amount_in, amount_left) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [item.id, lineId, date, price, qty, qty, amount, amount])
            total += amount
          } else {
            if (!item) throw new AppError(`Sətir ${n}: «${code}» kodlu mal anbarda yoxdur`)
            const lineId = store.insert('INSERT INTO lines (doc_id, line_no, item_id, qty, price, amount) VALUES (?, ?, ?, ?, 0, 0)', [docId, n, item.id, qty])
            const amount = consume(item.id, qty, date, lineId, n, item)
            // orta qiymət (göstəriş üçün): məbləğ / say
            const price = Math.round((amount * (QTY * PRICE)) / MONEY / qty)
            store.run('UPDATE lines SET amount = ?, price = ? WHERE id = ?', [amount, price, lineId])
            total += amount
          }
        })
        audit(who, kind === 'IN' ? 'Alış yazıldı' : 'Məxaric yazıldı', `№${no} · ${dmy(date)} · ${rows.length} sətir · ${fmtMoney(total)} ₼`)
        return { id: docId, no, total }
      })
    },

    list({ kind, from, to, q, status } = {}) {
      const where = ['d.kind = ?']
      const params = [kind]
      if (isIso(from)) where.push('d.doc_date >= ?') && params.push(from)
      if (isIso(to)) where.push('d.doc_date <= ?') && params.push(to)
      if (status === 'ACTIVE' || status === 'CANCELLED') where.push('d.status = ?') && params.push(status)
      const s = str(q, 60)
      if (s) {
        where.push(`(d.voen LIKE ? OR CAST(d.no AS TEXT) = ? OR EXISTS (SELECT 1 FROM lines l JOIN items i ON i.id = l.item_id WHERE l.doc_id = d.id AND (i.code LIKE ? OR i.name LIKE ?)))`)
        params.push(`%${s}%`, s.replace(/^№/, ''), `%${s}%`, `%${s}%`)
      }
      const rows = store.all(
        `SELECT d.id, d.kind, d.no, d.doc_date AS date, d.voen, d.status, d.created_at AS createdAt, d.cancelled_at AS cancelledAt, d.cancel_reason AS cancelReason,
           (SELECT COUNT(*) FROM lines WHERE doc_id = d.id) AS lineCount,
           (SELECT COALESCE(SUM(amount), 0) FROM lines WHERE doc_id = d.id) AS total
         FROM docs d WHERE ${where.join(' AND ')} ORDER BY d.doc_date DESC, d.no DESC LIMIT 1000`,
        params,
      )
      for (const r of rows) r.lines = docLines(r.id)
      return rows
    },

    get({ id }) {
      const d = store.get('SELECT id, kind, no, doc_date AS date, voen, status, created_at AS createdAt, cancelled_at AS cancelledAt, cancel_reason AS cancelReason FROM docs WHERE id = ?', [id])
      if (!d) throw new AppError('Sənəd tapılmadı')
      d.lines = docLines(id)
      if (d.kind === 'OUT') {
        for (const l of d.lines) {
          l.takes = store.all(
            `SELECT t.qty, t.amount, ly.cost, ly.doc_date AS date, dd.no AS inNo, t.reversed
             FROM takes t JOIN layers ly ON ly.id = t.layer_id JOIN lines ln ON ln.id = ly.line_id JOIN docs dd ON dd.id = ln.doc_id
             WHERE t.line_id = ? ORDER BY t.id`,
            [l.id],
          )
        }
      } else {
        for (const l of d.lines) {
          l.used = store.all(
            `SELECT DISTINCT od.no FROM layers ly JOIN takes t ON t.layer_id = ly.id AND t.reversed = 0
             JOIN lines ol ON ol.id = t.line_id JOIN docs od ON od.id = ol.doc_id WHERE ly.line_id = ? ORDER BY od.no`,
            [l.id],
          ).map((r) => r.no)
        }
      }
      d.total = d.lines.reduce((s, l) => s + l.amount, 0)
      return d
    },

    /** Ləğv: sənəd silinmir, arxivdə «Ləğv edilib» kimi qalır */
    cancel({ id, reason }, who) {
      const d = store.get('SELECT * FROM docs WHERE id = ?', [id])
      if (!d) throw new AppError('Sənəd tapılmadı')
      if (d.status !== 'ACTIVE') throw new AppError('Sənəd artıq ləğv edilib')
      const why = str(reason, 300)
      if (!why) throw new AppError('Ləğv səbəbini yazın', 'reason')
      store.tx(() => {
        if (d.kind === 'IN') {
          const used = store.all(
            `SELECT DISTINCT od.no FROM lines l JOIN layers ly ON ly.line_id = l.id JOIN takes t ON t.layer_id = ly.id AND t.reversed = 0
             JOIN lines ol ON ol.id = t.line_id JOIN docs od ON od.id = ol.doc_id WHERE l.doc_id = ? ORDER BY od.no`,
            [id],
          ).map((r) => `№${r.no}`)
          if (used.length) throw new AppError(`Bu alışdan artıq məxaric olunub (${used.join(', ')}). Əvvəlcə həmin məxaricləri ləğv edin.`)
          store.run('UPDATE layers SET qty_left = 0, amount_left = 0 WHERE line_id IN (SELECT id FROM lines WHERE doc_id = ?)', [id])
        } else {
          const takes = store.all('SELECT t.* FROM takes t JOIN lines l ON l.id = t.line_id WHERE l.doc_id = ? AND t.reversed = 0', [id])
          for (const t of takes) store.run('UPDATE layers SET qty_left = qty_left + ?, amount_left = amount_left + ? WHERE id = ?', [t.qty, t.amount, t.layer_id])
          store.run('UPDATE takes SET reversed = 1 WHERE line_id IN (SELECT id FROM lines WHERE doc_id = ?)', [id])
        }
        store.run("UPDATE docs SET status = 'CANCELLED', cancelled_at = ?, cancel_reason = ? WHERE id = ?", [stamp(), why, id])
        audit(who, d.kind === 'IN' ? 'Alış ləğv edildi' : 'Məxaric ləğv edildi', `№${d.no} · ${why}`)
      })
      return { id }
    },

    /** Məxaric yazmazdan əvvəl: qalıq və FIFO ilə təxmini məbləğ */
    preview({ date, lines }) {
      const at = isIso(date) ? date : today()
      return (Array.isArray(lines) ? lines : []).map((l) => {
        const item = str(l.code) ? itemByCode(l.code) : null
        if (!item) return { found: false }
        const layers = store.all('SELECT * FROM layers WHERE item_id = ? AND qty_left > 0 AND doc_date <= ? ORDER BY doc_date, id', [item.id, at])
        const stock = layers.reduce((s, x) => s + x.qty_left, 0)
        let qty = 0
        try {
          qty = parseFixed(l.qty, 3, 'say') || 0
        } catch {
          qty = 0
        }
        let need = qty
        let amount = 0
        for (const ly of layers) {
          if (need <= 0) break
          const take = Math.min(need, ly.qty_left)
          amount += take === ly.qty_left ? ly.amount_left : Math.min(ly.amount_left, lineAmount(take, ly.cost))
          need -= take
        }
        return { found: true, stock, enough: need <= 0, amount: need <= 0 ? amount : null }
      })
    },
  }

  // ── Xətlər və avtobuslar ───────────────────────────────────
  const activeMove = (busId, date) =>
    store.get('SELECT * FROM moves WHERE bus_id = ? AND date_from <= ? AND date_to >= ? AND (ended_on IS NULL OR ended_on > ?) ORDER BY id DESC LIMIT 1', [busId, date, date, date])

  const routes = {
    list() {
      return store.all('SELECT id, name FROM routes WHERE removed_at IS NULL').sort(routeSort)
    },
    save({ id, name }, who) {
      const n = str(name, 30)
      if (!n) throw new AppError('Xəttin adını (nömrəsini) yazın', 'name')
      const same = store.get('SELECT id FROM routes WHERE name = ? COLLATE NOCASE AND removed_at IS NULL', [n])
      if (same && same.id !== id) throw new AppError(`«${n}» xətti artıq var`, 'name')
      return store.tx(() => {
        if (id) {
          const old = store.get('SELECT name FROM routes WHERE id = ?', [id])
          if (!old) throw new AppError('Xətt tapılmadı')
          store.run('UPDATE routes SET name = ? WHERE id = ?', [n, id])
          addNote(today(), `Xəttin adı dəyişdi: ${old.name} → ${n}`, 'AUTO', who)
          audit(who, 'Xətt dəyişdi', `${old.name} → ${n}`)
          return { id }
        }
        const removed = store.get('SELECT id FROM routes WHERE name = ? COLLATE NOCASE AND removed_at IS NOT NULL', [n])
        if (removed) {
          store.run('UPDATE routes SET removed_at = NULL WHERE id = ?', [removed.id])
          audit(who, 'Xətt bərpa olundu', n)
          return { id: removed.id }
        }
        const nid = store.insert('INSERT INTO routes (name, created_at) VALUES (?, ?)', [n, stamp()])
        audit(who, 'Yeni xətt', n)
        return { id: nid }
      })
    },
    remove({ id }, who) {
      const r = store.get('SELECT * FROM routes WHERE id = ? AND removed_at IS NULL', [id])
      if (!r) throw new AppError('Xətt tapılmadı')
      const cnt = store.get('SELECT COUNT(*) AS n FROM buses WHERE route_id = ? AND removed_at IS NULL', [id]).n
      if (cnt) throw new AppError(`Bu xətdə ${cnt} avtobus var — əvvəlcə onları başqa xəttə keçirin`)
      const mv = store.get('SELECT COUNT(*) AS n FROM moves WHERE to_route_id = ? AND ended_on IS NULL AND date_to >= ?', [id, today()]).n
      if (mv) throw new AppError('Bu xəttə müvəqqəti keçirilmiş avtobus var')
      store.tx(() => {
        store.run('UPDATE routes SET removed_at = ? WHERE id = ?', [stamp(), id])
        audit(who, 'Xətt silindi', r.name)
      })
      return { id }
    },
  }

  const busRow = (b, date) => {
    const mv = activeMove(b.id, date)
    return {
      id: b.id,
      plate: b.plate,
      depart: b.depart,
      routeId: b.route_id,
      routeName: routeName(b.route_id),
      effectiveRouteId: mv ? mv.to_route_id : b.route_id,
      move: mv ? { id: mv.id, toRouteId: mv.to_route_id, toRouteName: routeName(mv.to_route_id), dateFrom: mv.date_from, dateTo: mv.date_to, reason: mv.reason } : null,
    }
  }

  const buses = {
    board({ date } = {}) {
      const d = isIso(date) ? date : today()
      const list = store.all('SELECT * FROM buses WHERE removed_at IS NULL').map((b) => busRow(b, d))
      const byTime = (a, b) => (a.depart || '99:99').localeCompare(b.depart || '99:99') || a.plate.localeCompare(b.plate)
      const groups = routes.list().map((r) => ({
        id: r.id,
        name: r.name,
        buses: list.filter((b) => b.effectiveRouteId === r.id).sort(byTime),
        away: list.filter((b) => b.routeId === r.id && b.effectiveRouteId !== r.id).sort(byTime),
      }))
      const upcoming = store
        .all('SELECT * FROM moves WHERE ended_on IS NULL AND date_from > ? ORDER BY date_from', [d])
        .map((m) => ({ id: m.id, plate: store.get('SELECT plate FROM buses WHERE id = ?', [m.bus_id])?.plate, toRouteName: routeName(m.to_route_id), fromRouteName: routeName(m.from_route_id), dateFrom: m.date_from, dateTo: m.date_to }))
      return { date: d, total: list.length, moved: list.filter((b) => b.move).length, groups, upcoming }
    },
    save({ id, plate, routeId, depart }, who) {
      const p = normPlate(plate)
      const t = normTime(depart)
      const r = store.get('SELECT * FROM routes WHERE id = ? AND removed_at IS NULL', [Number(routeId)])
      if (!r) throw new AppError('Xətti seçin', 'routeId')
      const dup = store.get('SELECT id FROM buses WHERE plate = ? AND removed_at IS NULL', [p])
      if (dup && dup.id !== id) throw new AppError(`${p} nişanlı avtobus artıq siyahıdadır`, 'plate')
      return store.tx(() => {
        if (id) {
          const old = store.get('SELECT * FROM buses WHERE id = ? AND removed_at IS NULL', [id])
          if (!old) throw new AppError('Avtobus tapılmadı')
          store.run('UPDATE buses SET plate = ?, route_id = ?, depart = ? WHERE id = ?', [p, r.id, t, id])
          const ch = []
          if (old.plate !== p) ch.push(`nişan ${old.plate} → ${p}`)
          if (old.route_id !== r.id) ch.push(`daimi xətt ${routeName(old.route_id)} → ${r.name}`)
          if (old.depart !== t) ch.push(`çıxış saatı ${old.depart || '—'} → ${t || '—'}`)
          if (ch.length) {
            addNote(today(), `${p}: ${ch.join(', ')}`, 'AUTO', who)
            audit(who, 'Avtobus dəyişdi', `${p}: ${ch.join(', ')}`)
          }
          return { id }
        }
        const nid = store.insert('INSERT INTO buses (plate, route_id, depart, created_at) VALUES (?, ?, ?, ?)', [p, r.id, t, stamp()])
        addNote(today(), `Yeni avtobus: ${p} — ${r.name} xətti${t ? `, çıxış ${t}` : ''}`, 'AUTO', who)
        audit(who, 'Yeni avtobus', `${p} · ${r.name}`)
        return { id: nid }
      })
    },
    remove({ id, reason }, who) {
      const b = store.get('SELECT * FROM buses WHERE id = ? AND removed_at IS NULL', [id])
      if (!b) throw new AppError('Avtobus tapılmadı')
      const why = str(reason, 300)
      if (!why) throw new AppError('Səbəbi yazın', 'reason')
      store.tx(() => {
        store.run('UPDATE moves SET ended_on = ? WHERE bus_id = ? AND ended_on IS NULL AND date_to >= ?', [today(), id, today()])
        store.run('UPDATE buses SET removed_at = ?, removed_reason = ? WHERE id = ?', [stamp(), why, id])
        addNote(today(), `${b.plate} siyahıdan çıxarıldı (${routeName(b.route_id)} xətti). Səbəb: ${why}`, 'AUTO', who)
        audit(who, 'Avtobus çıxarıldı', `${b.plate} · ${why}`)
      })
      return { id }
    },
    history({ id }) {
      const b = store.get('SELECT * FROM buses WHERE id = ?', [id])
      if (!b) throw new AppError('Avtobus tapılmadı')
      const moves = store.all('SELECT * FROM moves WHERE bus_id = ? ORDER BY date_from DESC, id DESC', [id]).map((m) => ({
        id: m.id,
        fromRouteName: routeName(m.from_route_id),
        toRouteName: routeName(m.to_route_id),
        dateFrom: m.date_from,
        dateTo: m.ended_on && m.ended_on <= m.date_to ? addDays(m.ended_on, -1) : m.date_to,
        planned: m.date_to,
        endedEarly: !!m.ended_on && m.ended_on <= m.date_to,
        reason: m.reason,
      }))
      const notes = store.all('SELECT note_date AS date, text, created_at AS at FROM notes WHERE text LIKE ? ORDER BY created_at DESC LIMIT 200', [`%${b.plate}%`])
      return { bus: busRow(b, today()), moves, notes }
    },
    setDepart({ id, depart }, who) {
      const b = store.get('SELECT * FROM buses WHERE id = ? AND removed_at IS NULL', [id])
      if (!b) throw new AppError('Avtobus tapılmadı')
      const t = normTime(depart)
      if (t === b.depart) return { id }
      store.tx(() => {
        store.run('UPDATE buses SET depart = ? WHERE id = ?', [t, id])
        addNote(today(), `${b.plate}: ilk çıxış saatı ${b.depart || '—'} → ${t || '—'}`, 'AUTO', who)
        audit(who, 'Çıxış saatı', `${b.plate}: ${b.depart || '—'} → ${t || '—'}`)
      })
      return { id }
    },
  }

  // ── Müvəqqəti yerdəyişmə ───────────────────────────────────
  const moves = {
    create({ busId, toRouteId, dateFrom, days, reason }, who) {
      const b = store.get('SELECT * FROM buses WHERE id = ? AND removed_at IS NULL', [busId])
      if (!b) throw new AppError('Avtobus tapılmadı')
      const to = store.get('SELECT * FROM routes WHERE id = ? AND removed_at IS NULL', [Number(toRouteId)])
      if (!to) throw new AppError('Hansı xəttə keçdiyini seçin', 'toRouteId')
      if (to.id === b.route_id) throw new AppError('Avtobus onsuz da bu xəttdədir', 'toRouteId')
      const from = isIso(dateFrom) ? dateFrom : today()
      if (from < addDays(today(), -7)) throw new AppError('Başlama tarixi ən çox 7 gün əvvəl ola bilər', 'dateFrom')
      const n = Number(days)
      if (!Number.isInteger(n) || n < 1 || n > 60) throw new AppError('Neçə gün: 1-dən 60-a qədər', 'days')
      const until = addDays(from, n - 1)
      const overlap = store.get('SELECT * FROM moves WHERE bus_id = ? AND ended_on IS NULL AND date_from <= ? AND date_to >= ?', [b.id, until, from])
      if (overlap) throw new AppError(`${b.plate} artıq ${dmy(overlap.date_from)} – ${dmy(overlap.date_to)} tarixlərində ${routeName(overlap.to_route_id)} xəttinə keçirilib`)
      const why = str(reason, 300)
      return store.tx(() => {
        const id = store.insert('INSERT INTO moves (bus_id, from_route_id, to_route_id, date_from, date_to, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [b.id, b.route_id, to.id, from, until, why, stamp()])
        const period = n === 1 ? `${dmy(from)}, 1 gün` : `${dm(from)} – ${dmy(until)}, ${n} gün`
        const verb = from > today() ? 'keçəcək' : 'keçdi'
        addNote(today(), `${b.plate}: ${routeName(b.route_id)} xəttindən ${to.name} xəttinə ${verb} (${period})${why ? `. Səbəb: ${why}` : ''}`, 'MOVE', who)
        audit(who, 'Yerdəyişmə', `${b.plate}: ${routeName(b.route_id)} → ${to.name} · ${period}`)
        return { id }
      })
    },
    end({ id }, who) {
      const m = store.get('SELECT * FROM moves WHERE id = ?', [id])
      if (!m || m.ended_on) throw new AppError('Yerdəyişmə tapılmadı')
      const b = store.get('SELECT * FROM buses WHERE id = ?', [m.bus_id])
      const t = today()
      if (m.date_to < t) throw new AppError('Bu yerdəyişmə artıq bitib')
      store.tx(() => {
        const endOn = m.date_from > t ? m.date_from : t
        store.run('UPDATE moves SET ended_on = ? WHERE id = ?', [endOn, id])
        const txt = m.date_from > t ? `${b.plate}: ${dmy(m.date_from)} üçün planlanan ${routeName(m.to_route_id)} xəttinə keçid ləğv edildi` : `${b.plate} öz xəttinə (${routeName(m.from_route_id)}) vaxtından əvvəl qaytarıldı — ${routeName(m.to_route_id)} xəttində idi`
        addNote(t, txt, 'RETURN', who)
        audit(who, 'Yerdəyişmə bitdi', txt)
      })
      return { id }
    },
  }

  // ── Qeydlər ────────────────────────────────────────────────
  /**
   * Yeni günə keçid: dünən bitən yerdəyişmələr üçün «öz xəttinə qayıtdı» qeydi yazılır.
   * Proqram gecə bağlı olsa belə, açılanda buraxılan bütün günləri tamamlayır.
   */
  function rollover() {
    const t = today()
    let last = store.meta('rollover_date')
    if (!last) {
      store.tx(() => store.setMeta('rollover_date', t))
      return false
    }
    if (last >= t) return false
    store.tx(() => {
      while (last < t) {
        last = addDays(last, 1)
        const ended = store.all('SELECT * FROM moves WHERE ended_on IS NULL AND date_to = ?', [addDays(last, -1)])
        for (const m of ended) {
          const b = store.get('SELECT plate FROM buses WHERE id = ?', [m.bus_id])
          const period = m.date_from === m.date_to ? dmy(m.date_from) : `${dm(m.date_from)} – ${dmy(m.date_to)}`
          addNote(last, `${b?.plate ?? '?'} öz xəttinə (${routeName(m.from_route_id)}) qayıtdı — ${period} tarixində ${routeName(m.to_route_id)} xəttində idi`, 'RETURN', 'sistem', `${last} 00:00:00`)
        }
      }
      store.setMeta('rollover_date', t)
    })
    return true
  }

  const notes = {
    today() {
      const t = today()
      const list = store.all('SELECT id, kind, text, created_at AS at, author FROM notes WHERE note_date = ? ORDER BY created_at DESC, id DESC', [t])
      const active = store
        .all('SELECT * FROM moves WHERE ended_on IS NULL AND date_from <= ? AND date_to >= ? ORDER BY date_to', [t, t])
        .map((m) => ({ id: m.id, plate: store.get('SELECT plate FROM buses WHERE id = ?', [m.bus_id])?.plate, fromRouteName: routeName(m.from_route_id), toRouteName: routeName(m.to_route_id), dateFrom: m.date_from, dateTo: m.date_to, reason: m.reason }))
      return { date: t, notes: list, active }
    },
    archive({ q } = {}) {
      const s = str(q, 80)
      const rows = s
        ? store.all('SELECT id, note_date AS date, kind, text, created_at AS at, author FROM notes WHERE note_date < ? AND text LIKE ? ORDER BY note_date DESC, created_at DESC, id DESC LIMIT 3000', [today(), `%${s}%`])
        : store.all('SELECT id, note_date AS date, kind, text, created_at AS at, author FROM notes WHERE note_date < ? ORDER BY note_date DESC, created_at DESC, id DESC LIMIT 3000', [today()])
      const days = []
      for (const r of rows) {
        let d = days[days.length - 1]
        if (!d || d.date !== r.date) days.push((d = { date: r.date, notes: [] }))
        d.notes.push(r)
      }
      return days
    },
    add({ text }, who) {
      const s = str(text, 1000)
      if (!s) throw new AppError('Qeydi yazın', 'text')
      store.tx(() => addNote(today(), s, 'MANUAL', who))
      return { ok: true }
    },
  }

  return { auth, items, docs, routes, buses, moves, notes, rollover, today, audit }
}

// formatlar (xəta mətnləri üçün)
function fmtQty(n) {
  return String(Number((n / QTY).toFixed(3)))
}
function fmtMoney(n) {
  return (n / MONEY).toFixed(2)
}

module.exports = { createServices, AppError, normPlate, normTime, addDays, isoOf, QTY, PRICE, MONEY }
