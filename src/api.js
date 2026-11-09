'use strict'
/**
 * Serverin API-si: hər əmr — { open?: girişsiz, write?: yalnız Anbardar, fn(args, ctx) }.
 * ctx = { session: { gate, role }, guard: { fails, lockedUntil } }
 */
const { AppError } = require('./services')

const ROLE_NAME = { anbar: 'Anbardar', muhasib: 'Mühasib' }

function createApi({ svc, store, backup, info, allowSetup = false }) {
  const who = (s) => ROLE_NAME[s.role] || 'sistem'

  function checkLock(g) {
    const left = g.lockedUntil - Date.now()
    if (left > 0) throw new AppError(`Çox səhv cəhd. ${Math.ceil(left / 1000)} saniyə gözləyin.`)
  }
  function failAttempt(g, msg) {
    g.fails++
    if (g.fails >= 5) {
      g.fails = 0
      g.lockedUntil = Date.now() + 60_000
      throw new AppError('5 dəfə səhv parol. 1 dəqiqə gözləyin.')
    }
    throw new AppError(msg, 'password')
  }

  const API = {
    'auth.state': { open: true, fn: (_a, { session: s }) => ({ setup: svc.auth.isSetup(), gate: s.gate, role: s.role, roleName: ROLE_NAME[s.role] || '', today: svc.today() }) },
    'auth.setup': {
      open: true,
      fn: (a, { session: s }) => {
        // parollar serverdə skriptlə təyin olunur (scripts/set-passwords.js) — kənardan heç kim «ilk quraşdırma» edə bilməz
        if (!allowSetup) throw new AppError('Parollar hələ təyin olunmayıb — sistem administratoruna müraciət edin')
        svc.auth.setup(a)
        s.gate = true
        return {}
      },
    },
    'auth.login': {
      open: true,
      fn: (a, { session: s, guard: g }) => {
        checkLock(g)
        if (!svc.auth.checkGeneral(a.password)) failAttempt(g, 'Parol səhvdir')
        g.fails = 0
        s.gate = true
        return {}
      },
    },
    'auth.role': {
      open: true,
      fn: (a, { session: s, guard: g }) => {
        if (!s.gate) throw new AppError('Əvvəlcə ümumi parolu yazın')
        if (a.role === 'muhasib') s.role = 'muhasib'
        else if (a.role === 'anbar') {
          checkLock(g)
          if (!svc.auth.checkAnbar(a.password)) failAttempt(g, 'Anbardar parolu səhvdir')
          g.fails = 0
          s.role = 'anbar'
        } else throw new AppError('Ekranı seçin')
        store.tx(() => svc.audit(who(s), 'Giriş'))
        return { role: s.role, roleName: ROLE_NAME[s.role] }
      },
    },
    'auth.back': {
      open: true,
      fn: (_a, { session: s }) => {
        if (!s.role) s.gate = false
        return {}
      },
    },
    'auth.logout': {
      fn: (_a, { session: s }) => {
        store.tx(() => svc.audit(who(s), 'Çıxış'))
        s.role = null
        s.gate = false
        return {}
      },
    },
    'auth.change': { write: true, fn: (a, { session: s }) => svc.auth.change(a, who(s)) },

    'app.info': { fn: () => info() },
    'app.backup': { write: true, fn: () => ({ file: backup(true) }) },

    'items.list': { fn: (a) => svc.items.list(a) },
    'items.get': { fn: (a) => svc.items.get(a) },
    'items.update': { write: true, fn: (a, c) => svc.items.update(a, who(c.session)) },
    'docs.list': { fn: (a) => svc.docs.list(a) },
    'docs.get': { fn: (a) => svc.docs.get(a) },
    'docs.nextNo': { fn: (a) => svc.docs.nextNo(a) },
    'docs.preview': { fn: (a) => svc.docs.preview(a) },
    'docs.save': { write: true, fn: (a, c) => svc.docs.save(a, who(c.session)) },
    'docs.cancel': { write: true, fn: (a, c) => svc.docs.cancel(a, who(c.session)) },
    'routes.list': { fn: () => svc.routes.list() },
    'routes.save': { write: true, fn: (a, c) => svc.routes.save(a, who(c.session)) },
    'routes.remove': { write: true, fn: (a, c) => svc.routes.remove(a, who(c.session)) },
    'buses.board': { fn: (a) => svc.buses.board(a) },
    'buses.save': { write: true, fn: (a, c) => svc.buses.save(a, who(c.session)) },
    'buses.remove': { write: true, fn: (a, c) => svc.buses.remove(a, who(c.session)) },
    'buses.history': { fn: (a) => svc.buses.history(a) },
    'buses.setDepart': { write: true, fn: (a, c) => svc.buses.setDepart(a, who(c.session)) },
    'moves.create': { write: true, fn: (a, c) => svc.moves.create(a, who(c.session)) },
    'moves.end': { write: true, fn: (a, c) => svc.moves.end(a, who(c.session)) },
    'notes.today': { fn: () => svc.notes.today() },
    'notes.archive': { fn: (a) => svc.notes.archive(a) },
    'notes.add': { write: true, fn: (a, c) => svc.notes.add(a, who(c.session)) },
  }

  /** → { ok, data } və ya { ok: false, error, field, code }; write — dəyişiklik oldusa */
  async function handle(method, args, ctx) {
    const def = API[method]
    try {
      if (!def) throw new AppError('Naməlum əmr')
      if (!def.open && !ctx.session.role) return { ok: false, code: 'SESSION', error: 'Sessiya bitib — yenidən daxil olun' }
      if (def.write && ctx.session.role !== 'anbar') throw new AppError('Yalnız baxış rejimi — dəyişmək üçün Anbardar kimi daxil olun')
      const data = await def.fn(args && typeof args === 'object' ? args : {}, ctx)
      return { ok: true, data, write: !!def.write }
    } catch (err) {
      if (!(err instanceof AppError)) console.error(method, err)
      return { ok: false, error: err instanceof AppError ? err.message : `Gözlənilməz xəta: ${err.message}`, field: err.field }
    }
  }

  return { handle, ROLE_NAME }
}

module.exports = { createApi, ROLE_NAME }
