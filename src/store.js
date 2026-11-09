'use strict'
/**
 * Baza — SQLite (sql.js, WASM). Bütün məlumat bir faylda saxlanılır.
 * Hər yazıdan sonra fayl təhlükəsiz şəkildə (əvvəl .tmp, sonra əvəz) yenilənir.
 */
const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- Mallar: kod təkrarlanmır (böyük/kiçik hərf fərqi yoxdur)
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  added_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Sənədlər: IN = alış, OUT = məxaric. Silinmir — ləğv edilir (status CANCELLED).
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('IN','OUT')),
  no INTEGER NOT NULL,
  doc_date TEXT NOT NULL,
  voen TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  cancel_reason TEXT,
  UNIQUE (kind, no)
);

-- Sətirlər. qty — mində bir (1 = 0.001), price — on mində bir manat, amount — qəpik.
CREATE TABLE IF NOT EXISTS lines (
  id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  amount INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lines_doc ON lines (doc_id);
CREATE INDEX IF NOT EXISTS lines_item ON lines (item_id);

-- FIFO qatları: hər alış sətri bir qat
CREATE TABLE IF NOT EXISTS layers (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL,
  line_id INTEGER NOT NULL UNIQUE,
  doc_date TEXT NOT NULL,
  cost INTEGER NOT NULL,
  qty_in INTEGER NOT NULL,
  qty_left INTEGER NOT NULL,
  amount_in INTEGER NOT NULL,
  amount_left INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS layers_item ON layers (item_id, doc_date, id);

-- Məxaric sətrinin hansı qatdan nə qədər götürdüyü
CREATE TABLE IF NOT EXISTS takes (
  id INTEGER PRIMARY KEY,
  line_id INTEGER NOT NULL,
  layer_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  reversed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS takes_line ON takes (line_id);
CREATE INDEX IF NOT EXISTS takes_layer ON takes (layer_id);

-- Avtobus xətləri
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL,
  removed_at TEXT
);

-- Avtobuslar: route_id — öz (daimi) xətti
CREATE TABLE IF NOT EXISTS buses (
  id INTEGER PRIMARY KEY,
  plate TEXT NOT NULL,
  route_id INTEGER NOT NULL,
  depart TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  removed_at TEXT,
  removed_reason TEXT
);

-- Müvəqqəti yerdəyişmə: date_from..date_to günlərində başqa xətdə; sonra öz xəttinə qayıdır
CREATE TABLE IF NOT EXISTS moves (
  id INTEGER PRIMARY KEY,
  bus_id INTEGER NOT NULL,
  from_route_id INTEGER NOT NULL,
  to_route_id INTEGER NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  ended_on TEXT
);
CREATE INDEX IF NOT EXISTS moves_bus ON moves (bus_id);

-- Gündəlik qeydlər (köhnə günlər arxivdə qalır)
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  note_date TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'MANUAL',
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS notes_date ON notes (note_date);

-- Kim nə edib
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  who TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
`

class Store {
  static async open(file) {
    const wasmBinary = fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const SQL = await initSqlJs({ wasmBinary })
    return new Store(SQL, file)
  }

  constructor(SQL, file) {
    this.file = file
    this.db = file && fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database()
    this.inTx = false
    this.db.run(SCHEMA)
    this.migrate()
    if (file) this.save()
  }

  /** Köhnə bazaya yeni sütunlar (məlumat itmir) */
  migrate() {
    const addCol = (t, c, def) => {
      if (!this.all(`PRAGMA table_info(${t})`).some((r) => r.name === c)) this.db.run(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`)
    }
    addCol('items', 'unit', "TEXT NOT NULL DEFAULT ''")
    addCol('docs', 'ref', "TEXT NOT NULL DEFAULT ''") // köhnə sənəd nömrəsi (qaimə)
    addCol('docs', 'party', "TEXT NOT NULL DEFAULT ''") // kontragentin adı
    addCol('lines', 'note', "TEXT NOT NULL DEFAULT ''") // şərh
    addCol('lines', 'dqn', "TEXT NOT NULL DEFAULT ''") // avtobus (DQN)
    addCol('lines', 'route', "TEXT NOT NULL DEFAULT ''") // xətt
    this.db.run('CREATE TABLE IF NOT EXISTS parties (voen TEXT PRIMARY KEY COLLATE NOCASE, name TEXT NOT NULL)')
    this.db.run('CREATE INDEX IF NOT EXISTS docs_kind_date ON docs (kind, doc_date)')
  }

  all(sql, params = []) {
    const st = this.db.prepare(sql)
    try {
      st.bind(params)
      const rows = []
      while (st.step()) rows.push(st.getAsObject())
      return rows
    } finally {
      st.free()
    }
  }

  get(sql, params = []) {
    return this.all(sql, params)[0]
  }

  run(sql, params = []) {
    this.db.run(sql, params)
  }

  insert(sql, params = []) {
    this.db.run(sql, params)
    return this.get('SELECT last_insert_rowid() AS id').id
  }

  /** Hamısı və ya heç biri: xəta olsa bütün dəyişiklik geri qaytarılır */
  tx(fn) {
    if (this.inTx) return fn()
    this.db.run('BEGIN')
    this.inTx = true
    try {
      const r = fn()
      this.db.run('COMMIT')
      this.inTx = false
      this.save()
      return r
    } catch (e) {
      this.inTx = false
      try {
        this.db.run('ROLLBACK')
      } catch {
        /* artıq geri qaytarılıb */
      }
      throw e
    }
  }

  save() {
    if (!this.file) return
    const data = Buffer.from(this.db.export())
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = this.file + '.tmp'
    fs.writeFileSync(tmp, data)
    fs.renameSync(tmp, this.file)
  }

  meta(key) {
    const r = this.get('SELECT value FROM meta WHERE key = ?', [key])
    return r ? r.value : null
  }

  setMeta(key, value) {
    this.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
  }
}

module.exports = { Store }
