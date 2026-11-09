'use strict'
/** Köməkçi testi — saxta LLM ilə (açar/internet lazım deyil): node test/assistant-test.js */
process.env.ENA_LLM_DAILY = '3'
const { Store } = require('../src/store')
const { createServices } = require('../src/services')
const { createAssistant } = require('../src/assistant')
const { seed } = require('../src/demo')

let passed = 0
let failed = 0
const check = (n, ok, x) => {
  ok ? passed++ : failed++
  console.log(`  ${ok ? '✅' : '❌'} ${n}${!ok && x !== undefined ? ' — ' + JSON.stringify(x).slice(0, 400) : ''}`)
}

async function main() {
  const store = await Store.open(null)
  let clock = new Date(2026, 10, 8, 9, 0, 0)
  const svc = createServices(store, { now: () => clock })
  svc.auth.setup({ general: 'aaaa1', anbar: 'bbbb1' })
  seed(svc)
  clock = new Date(2026, 10, 9, 9, 0, 0) // ertəsi gün: dünənki yerdəyişmə
  svc.rollover()

  // saxta LLM: əvvəl alət çağırır, sonra nəticəyə görə cavab yazır
  const seen = []
  let script = []
  const fakeFetch = async (url, opts) => {
    if (url.endsWith('/models')) return { ok: true, json: async () => ({ data: [{ id: 'grok-4' }, { id: 'grok-4-fast-non-reasoning' }] }) }
    const body = JSON.parse(opts.body)
    seen.push(body)
    const step = script.shift()
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: step(body) }] }) }
  }
  const a = createAssistant({ svc, store, fetchImpl: fakeFetch, env: { ENA_LLM_KEY: 'test' } })

  console.log('\n── Alətlər (birbaşa) ──')
  const T = a.TOOLS
  const st = T.anbar_axtar.run({ soz: 'filtr' })
  check('anbar_axtar «filtr» → yağ və hava filtri, qalıq ilə', st.tapildi === 2 && st.mallar.some((m) => m.kod === 'F-101' && m.qaliq === 14), st)
  check('anbar_axtar olmayan mal → 0', T.anbar_axtar.run({ soz: 'helikopter' }).tapildi === 0)
  const h = T.mal_tarixcesi.run({ kod: 'f-101' })
  check('mal_tarixcesi (kiçik hərflə kod)', h.mal?.ad === 'Yağ filtri MAN' && h.herektler.length === 3, h)
  check('mal_tarixcesi olmayan kod', !!T.mal_tarixcesi.run({ kod: 'YOX' }).xeta)
  const sum = T.anbar_xulase.run({})
  check('anbar_xulase', sum.mal_sayi === 8 && sum.umumi_deyer_azn > 0 && sum.en_deyerli.length > 0, sum)
  const docs = T.senedler.run({ nov: 'mexaric', baslangic: '2026-11-01', son: '2026-11-09' })
  check('senedler: məxariclər (ləğv edilən sayılmır)', docs.senet_sayi === 3, docs)
  const mv = T.yerdeyismeler.run({ baslangic: '2026-11-08', son: '2026-11-08' })
  check('yerdeyismeler dünən: 90-HK-457 (5 → 12) və 10-NN-781 (65 → 88A)', mv.say === 2 && mv.yerdeyismeler.some((m) => m.nisan === '90-HK-457' && m.haradan === '5' && m.haraya === '12'), mv)
  const bs = T.avtobuslar.run({ xett: '12' })
  check('avtobuslar bu gün 12 xətti: 90-HK-457 hələ orada (2 günlük)', bs.xetler[0].avtobuslar.some((x) => x.startsWith('90-HK-457')), bs)
  const nq = T.qeydler.run({ axtar: '10-NN-781' })
  check('qeydler axtarış: 10-NN-781 keçdi və qayıtdı', nq.say >= 2 && nq.qeydler.some((x) => x.includes('qayıtdı')), nq)
  check('avtobusa_verilen boş sorğu → xəta', !!T.avtobusa_verilen.run({}).xeta)

  console.log('\n── Söhbət (saxta Grok) ──')
  script = [
    () => ({ content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'yerdeyismeler', arguments: JSON.stringify({ baslangic: '2026-11-08', son: '2026-11-08' }) } }] }),
    (body) => {
      const tool = body.messages.find((m) => m.role === 'tool')
      const data = JSON.parse(tool.content)
      return { content: `Dünən ${data.say} avtobus xəttini dəyişib: ${data.yerdeyismeler.map((m) => `${m.nisan} (${m.haradan} → ${m.haraya})`).join(', ')}` }
    },
  ]
  const r = await a.ask({ messages: [{ role: 'user', content: 'Dünən hansı avtobus xəttini dəyişib?' }] }, { sessionKey: 's1', who: 'Mühasib' })
  check('cavab alət nəticəsinə əsaslanır', r.answer.includes('90-HK-457') && r.answer.includes('5 → 12'), r)
  check('model avtomatik seçildi (fast)', r.model === 'grok-4-fast-non-reasoning', r.model)
  check('sistem mesajında bu gün və dünən', seen[0].messages[0].content.includes('2026-11-09') && seen[0].messages[0].content.includes('dünən 2026-11-08'))
  check('alətlər göndərilir və yalnız oxuyandır', seen[0].tools.length === 8 && !seen[0].tools.some((t) => /yaz|sil|legv/.test(t.function.name)))
  check('cavab qısa saxlanılır (max_tokens)', seen[0].max_tokens <= 800)
  check('limit: 1 sual işləndi', r.usage.used === 1 && r.usage.left === 2, r.usage)

  script = [() => ({ content: 'Salam!' })]
  const r2 = await a.ask({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'Salam' }] }, { sessionKey: 's1' })
  check('sadə cavab (alətsiz)', r2.answer === 'Salam!')
  check('uzun sual qəbul olunmur', await a.ask({ messages: [{ role: 'user', content: 'x'.repeat(700) }] }, { sessionKey: 's1' }).then(() => false, (e) => /uzun/.test(e.message)))
  script = [() => ({ content: 'ok' })]
  await a.ask({ messages: [{ role: 'user', content: 'üçüncü' }] }, { sessionKey: 's2' })
  check('gündəlik limit bitəndə sual qəbul olunmur', await a.ask({ messages: [{ role: 'user', content: 'dördüncü' }] }, { sessionKey: 's3' }).then(() => false, (e) => /limiti/.test(e.message)))
  clock = new Date(2026, 10, 10, 9, 0, 0)
  check('ertəsi gün limit yenilənir', a.usage().left === 3)
  const noKey = createAssistant({ svc, store, fetchImpl: fakeFetch, env: {} })
  check('açar yoxdursa — aydın xəbərdarlıq', await noKey.ask({ messages: [{ role: 'user', content: 'x' }] }, {}).then(() => false, (e) => /qoşulmayıb/.test(e.message)))
  const bad = createAssistant({ svc, store, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }), env: { ENA_LLM_KEY: 'x', ENA_LLM_MODEL: 'm' } })
  check('səhv açar — aydın xəta', await bad.ask({ messages: [{ role: 'user', content: 'x' }] }, {}).then(() => false, (e) => /açarı qəbul olunmadı/.test(e.message)))

  console.log(failed ? `\n❌ ${failed} yoxlama alınmadı (${passed} keçdi)` : `\n✅ ${passed} yoxlama keçdi`)
  if (failed) process.exitCode = 1
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
