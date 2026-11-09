'use strict'
/**
 * Serverdə parolları təyin etmək (ilk quraşdırma və ya unudulanda):
 *   echo '{"general":"...","anbar":"..."}' | ENA_DATA=/opt/ena-anbar/data node scripts/set-passwords.js [--force]
 * Parollar əmr sətrinə yazılmır — stdin-dən oxunur. Server dayanmış olmalıdır.
 */
const path = require('path')
const crypto = require('crypto')
const { Store } = require('../src/store')
const { createServices } = require('../src/services')

let input = ''
process.stdin.on('data', (c) => (input += c))
process.stdin.on('end', async () => {
  const { general, anbar } = JSON.parse(input)
  const file = path.join(process.env.ENA_DATA || path.join(__dirname, '..', 'data'), 'ena-anbar.db')
  const store = await Store.open(file)
  const svc = createServices(store)
  if (!svc.auth.isSetup()) {
    svc.auth.setup({ general, anbar })
    console.log('Parollar təyin olundu')
  } else if (process.argv.includes('--force')) {
    const hash = (pw) => {
      const salt = crypto.randomBytes(16)
      return `${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`
    }
    if (String(general).length < 4 || String(anbar).length < 4 || general === anbar) throw new Error('Parollar ən azı 4 simvol və fərqli olmalıdır')
    store.tx(() => {
      store.setMeta('general_hash', hash(general))
      store.setMeta('anbar_hash', hash(anbar))
      svc.audit('sistem', 'Parollar serverdə yeniləndi')
    })
    console.log('Parollar yeniləndi')
  } else console.log('Parollar artıq var — dəyişmək üçün --force')
})
