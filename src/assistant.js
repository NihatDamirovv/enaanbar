'use strict'
/**
 * ENA Köməkçi — bazaya baxıb suallara cavab verən chatbot (Grok / OpenAI-uyğun API).
 * YALNIZ OXUYUR: alətlər heç nə yazmır, dəyişmir.
 * Limit: gündə ENA_LLM_DAILY sual (hamı üçün cəmi), hər sessiyaya saatda 20; cavab qısa saxlanılır.
 *
 * Mühit: ENA_LLM_KEY (açar), ENA_LLM_URL (default https://api.x.ai/v1), ENA_LLM_MODEL (boşdursa avtomatik seçilir)
 */
const { AppError, addDays, QTY, PRICE, MONEY } = require('./services')

const DAILY = Number(process.env.ENA_LLM_DAILY || 150)
const PER_SESSION_HOUR = 20
const MAX_ROUNDS = 4
const MAX_TOKENS = 700
const WEEKDAYS = ['bazar', 'bazar ertəsi', 'çərşənbə axşamı', 'çərşənbə', 'cümə axşamı', 'cümə', 'şənbə']

const q3 = (n) => Number((n / QTY).toFixed(3))
const m2 = (n) => Number((n / MONEY).toFixed(2))
const p4 = (n) => Number((n / PRICE).toFixed(4))
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

function createAssistant({ svc, store, fetchImpl = fetch, env = process.env }) {
  const key = env.ENA_LLM_KEY || ''
  const base = (env.ENA_LLM_URL || 'https://api.x.ai/v1').replace(/\/$/, '')
  let model = env.ENA_LLM_MODEL || ''

  // ── Alətlər (yalnız oxuma) ─────────────────────────
  const TOOLS = {
    anbar_axtar: {
      description: 'Anbarda malı kod və ya ad ilə axtarır: qalıq, ölçü vahidi, qalıq dəyəri (FIFO), son hərəkət tarixi. «Filan maldan varmı?» sualları üçün.',
      parameters: { type: 'object', properties: { soz: { type: 'string', description: 'mal kodu və ya adın bir hissəsi (məs. "filtr", "PRDCT0241")' } }, required: ['soz'] },
      run: ({ soz }) => {
        const all = svc.items.list({ q: soz })
        return {
          tapildi: all.length,
          mallar: all.slice(0, 15).map((i) => ({ kod: i.code, ad: i.name, vahid: i.unit, qaliq: q3(i.stock), qaliq_deyeri_azn: m2(i.value), son_hereket: i.lastDate })),
          qeyd: all.length > 15 ? `daha ${all.length - 15} mal var — sözü dəqiqləşdirin` : undefined,
        }
      },
    },
    mal_tarixcesi: {
      description: 'Bir malın (dəqiq kod ilə) son alış və məxaricləri: tarix, sənəd, say, qiymət, kimə/hansı avtobusa (DQN) verildiyi.',
      parameters: { type: 'object', properties: { kod: { type: 'string' }, limit: { type: 'integer', description: 'neçə hərəkət (default 15, max 40)' } }, required: ['kod'] },
      run: ({ kod, limit }) => {
        const it = store.get('SELECT id FROM items WHERE code = ? COLLATE NOCASE', [String(kod || '').trim()])
        if (!it) return { xeta: 'belə kodlu mal yoxdur' }
        const d = svc.items.get({ id: it.id })
        return {
          mal: { kod: d.item.code, ad: d.item.name, vahid: d.item.unit, elave_olunub: d.item.addedDate },
          qaliq: q3(d.layers.reduce((s, l) => s + l.qtyLeft, 0)),
          herektler: d.moves.slice(0, Math.min(Number(limit) || 15, 40)).map((m) => ({ tarix: m.date, nov: m.kind === 'IN' ? 'alış' : 'məxaric', senet: m.no, kontragent: m.party || m.voen, say: q3(m.qty), qiymet: p4(m.price), mebleg: m2(m.amount), dqn: m.dqn || undefined, xett: m.route || undefined, serh: m.note || undefined, legv: m.status !== 'ACTIVE' || undefined })),
        }
      },
    },
    anbar_xulase: {
      description: 'Anbarın ümumi vəziyyəti: mal sayı, qalığı olan mallar, ümumi dəyər, ən dəyərli 10 qalıq, qalığı bitmiş mallar sayı.',
      parameters: { type: 'object', properties: {} },
      run: () => {
        const all = svc.items.list()
        const withStock = all.filter((i) => i.stock > 0)
        return {
          mal_sayi: all.length,
          qaligi_olan: withStock.length,
          qaligi_bitmis: all.length - withStock.length,
          umumi_deyer_azn: m2(all.reduce((s, i) => s + i.value, 0)),
          en_deyerli: withStock.sort((a, b) => b.value - a.value).slice(0, 10).map((i) => ({ kod: i.code, ad: i.name, qaliq: q3(i.stock), deyer: m2(i.value) })),
        }
      },
    },
    senedler: {
      description: 'Alış və ya məxaric sənədləri tarix aralığında (və ya axtarışla): nömrə, tarix, kontragent, mallar, məbləğ. Cəmi məbləğ də qaytarılır.',
      parameters: {
        type: 'object',
        properties: {
          nov: { type: 'string', enum: ['alis', 'mexaric'] },
          baslangic: { type: 'string', description: 'YYYY-MM-DD' },
          son: { type: 'string', description: 'YYYY-MM-DD' },
          axtar: { type: 'string', description: 'VÖEN, kontragent, mal kodu/adı, DQN' },
        },
        required: ['nov'],
      },
      run: ({ nov, baslangic, son, axtar }) => {
        const docs = svc.docs.list({ kind: nov === 'alis' ? 'IN' : 'OUT', from: baslangic, to: son, q: axtar, status: 'ACTIVE' })
        return {
          senet_sayi: docs.length,
          cemi_azn: m2(docs.reduce((s, d) => s + d.total, 0)),
          senedler: docs.slice(0, 12).map((d) => ({ no: d.no, tarix: d.date, kontragent: d.party || d.voen, mebleg: m2(d.total), mallar: d.lines.slice(0, 6).map((l) => `${l.code} ${l.name} × ${q3(l.qty)}${l.dqn ? ` (DQN ${l.dqn})` : ''}`) })),
          qeyd: docs.length > 12 ? `yalnız 12-si göstərildi` : undefined,
        }
      },
    },
    avtobusa_verilen: {
      description: 'Avtobusa (DQN — nişan və ya nömrə) və ya xəttə verilən mallar (məxaric) tarix aralığında: mallar, say, məbləğ, cəmi.',
      parameters: { type: 'object', properties: { dqn: { type: 'string' }, xett: { type: 'string' }, baslangic: { type: 'string' }, son: { type: 'string' } } },
      run: ({ dqn, xett, baslangic, son }) => {
        const where = ["d.kind = 'OUT'", "d.status = 'ACTIVE'"]
        const p = []
        if (dqn) where.push('(l.dqn = ? OR l.dqn LIKE ?)') && p.push(String(dqn).trim(), `%${String(dqn).trim()}%`)
        if (xett) where.push('l.route = ?') && p.push(String(xett).trim())
        if (isIso(baslangic)) where.push('d.doc_date >= ?') && p.push(baslangic)
        if (isIso(son)) where.push('d.doc_date <= ?') && p.push(son)
        if (p.length === 0) return { xeta: 'DQN və ya xətt yazın' }
        const rows = store.all(`SELECT d.doc_date AS date, d.no, l.dqn, l.route, l.qty, l.amount, l.note, i.code, i.name FROM lines l JOIN docs d ON d.id = l.doc_id JOIN items i ON i.id = l.item_id WHERE ${where.join(' AND ')} ORDER BY d.doc_date DESC LIMIT 400`, p)
        return { setir: rows.length, cemi_azn: m2(rows.reduce((s, r) => s + r.amount, 0)), son_setirler: rows.slice(0, 15).map((r) => ({ tarix: r.date, senet: r.no, dqn: r.dqn, xett: r.route, mal: `${r.code} ${r.name}`, say: q3(r.qty), mebleg: m2(r.amount), serh: r.note || undefined })) }
      },
    },
    yerdeyismeler: {
      description: 'Avtobusların müvəqqəti xətt dəyişməsi (yerdəyişmə): hansı nişanlı avtobus hansı xətdən hansına, hansı tarixlərdə. «Dünən hansı avtobus xəttini dəyişib?» kimi suallar üçün.',
      parameters: { type: 'object', properties: { baslangic: { type: 'string', description: 'YYYY-MM-DD' }, son: { type: 'string', description: 'YYYY-MM-DD' }, nisan: { type: 'string' } } },
      run: ({ baslangic, son, nisan }) => {
        const t = svc.today()
        const from = isIso(baslangic) ? baslangic : addDays(t, -7)
        const to = isIso(son) ? son : t
        const rows = store.all(
          `SELECT m.*, b.plate, (SELECT name FROM routes WHERE id = m.from_route_id) AS fromName, (SELECT name FROM routes WHERE id = m.to_route_id) AS toName
           FROM moves m JOIN buses b ON b.id = m.bus_id WHERE m.date_from <= ? AND m.date_to >= ? ${nisan ? 'AND b.plate LIKE ?' : ''} ORDER BY m.date_from DESC LIMIT 50`,
          nisan ? [to, from, `%${String(nisan).toUpperCase().replace(/\s/g, '')}%`] : [to, from],
        )
        return { dovr: `${from} — ${to}`, say: rows.length, yerdeyismeler: rows.map((m) => ({ nisan: m.plate, haradan: m.fromName, haraya: m.toName, baslayib: m.date_from, bitir: m.date_to, vaxtindan_evvel_qaytarilib: m.ended_on ? m.ended_on : undefined, sebeb: m.reason || undefined })) }
      },
    },
    avtobuslar: {
      description: 'Verilmiş gündə avtobusların xətlərə görə siyahısı (müvəqqəti keçənlər də), ilk çıxış saatları.',
      parameters: { type: 'object', properties: { tarix: { type: 'string', description: 'YYYY-MM-DD, default bu gün' }, xett: { type: 'string' } } },
      run: ({ tarix, xett }) => {
        const b = svc.buses.board({ date: tarix })
        const groups = b.groups.filter((g) => !xett || g.name.toLowerCase() === String(xett).toLowerCase())
        return { tarix: b.date, avtobus_sayi: b.total, bu_gun_basqa_xetde: b.moved, xetler: groups.map((g) => ({ xett: g.name, avtobuslar: g.buses.map((x) => `${x.plate}${x.depart ? ' ' + x.depart : ''}${x.move ? ` (müvəqqəti, ${x.routeName} xəttindən)` : ''}`), basqa_xetde: g.away.map((x) => `${x.plate} → ${x.move.toRouteName}`) })) }
      },
    },
    qeydler: {
      description: 'Gündəlik qeydlər: verilmiş günün qeydləri və ya qeydlərdə söz axtarışı (məs. nişan).',
      parameters: { type: 'object', properties: { tarix: { type: 'string', description: 'YYYY-MM-DD' }, axtar: { type: 'string' } } },
      run: ({ tarix, axtar }) => {
        const rows = isIso(tarix)
          ? store.all('SELECT note_date AS date, created_at AS at, text FROM notes WHERE note_date = ? ORDER BY created_at', [tarix])
          : store.all('SELECT note_date AS date, created_at AS at, text FROM notes WHERE text LIKE ? ORDER BY created_at DESC LIMIT 40', [`%${String(axtar || '').trim()}%`])
        return { say: rows.length, qeydler: rows.slice(0, 40).map((r) => `${r.date} ${r.at.slice(11, 16)} — ${r.text}`) }
      },
    },
  }
  const toolDefs = Object.entries(TOOLS).map(([name, t]) => ({ type: 'function', function: { name, description: t.description, parameters: t.parameters } }))

  // ── Limitlər ────────────────────────────────────────
  function usage() {
    const t = svc.today()
    const day = store.meta('llm_day')
    const used = day === t ? Number(store.meta('llm_used') || 0) : 0
    return { used, limit: DAILY, left: Math.max(0, DAILY - used) }
  }
  function spend() {
    const t = svc.today()
    const u = usage()
    store.tx(() => {
      store.setMeta('llm_day', t)
      store.setMeta('llm_used', String(u.used + 1))
    })
  }

  // ehtiyat model: əsas modelin dəqiqəlik limiti dolanda (pulsuz planlarda limit modelə görə ayrıdır)
  const fallback = env.ENA_LLM_FALLBACK || ''
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function call(m, messages) {
    const r = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      // gpt-oss kimi «düşünən» modellərdə düşünmə qısa saxlanılır (limit və sürət üçün)
      body: JSON.stringify({ model: m, messages, tools: toolDefs, tool_choice: 'auto', temperature: 0.2, max_tokens: /gpt-oss|qwen3/i.test(m) ? MAX_TOKENS * 2 : MAX_TOKENS, ...(/gpt-oss/i.test(m) ? { reasoning_effort: 'low' } : {}) }),
      signal: AbortSignal.timeout(45_000),
    })
    const j = await r.json().catch(() => ({}))
    return { r, j }
  }

  async function llm(messages) {
    const order = [model, fallback].filter(Boolean)
    for (let attempt = 0; attempt < 4; attempt++) {
      const m = order[Math.min(attempt >> 1, order.length - 1)]
      const { r, j } = await call(m, messages)
      if (r.ok) return j.choices?.[0]?.message
      console.error('LLM', m, r.status, JSON.stringify(j).slice(0, 300))
      if (r.status === 401 || r.status === 403) throw new AppError('Köməkçinin API açarı qəbul olunmadı — administratora deyin')
      if (r.status !== 429) throw new AppError('Köməkçi hazırda cavab vermir — bir az sonra yenidən yoxlayın')
      // «try again in 1.9s» — qısa gözləmə və təkrar, sonra ehtiyat model
      const sec = Number(String(j?.error?.message || '').match(/try again in ([\d.]+)s/)?.[1] || r.headers?.get?.('retry-after') || 0)
      if (/per day|TPD|RPD/i.test(String(j?.error?.message || '')) && !fallback) break
      if (sec > 0 && sec <= 12) await sleep(sec * 1000 + 300)
      else if (attempt % 2 === 0 && order.length > 1) continue
      else await sleep(2500)
    }
    throw new AppError('Köməkçi hazırda məşğuldur — bir dəqiqədən sonra yenidən soruşun')
  }

  async function pickModel() {
    if (model) return model
    try {
      const r = await fetchImpl(`${base}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) })
      const ids = ((await r.json()).data || []).map((m) => m.id)
      const prefer = [/grok-4.*fast.*non-reasoning/, /grok-4.*fast/, /grok-3-mini/, /mini/, /grok-4/, /grok/]
      for (const re of prefer) {
        const hit = ids.find((id) => re.test(id))
        if (hit) return (model = hit)
      }
      if (ids[0]) return (model = ids[0])
    } catch {
      /* default */
    }
    return (model = 'grok-3-mini')
  }

  const hourly = new Map() // sessiya → [vaxtlar]

  /** messages: [{ role: 'user'|'assistant', content }] — son 8-i götürülür */
  async function ask({ messages }, ctx) {
    if (!key) throw new AppError('Köməkçi hələ qoşulmayıb (API açarı yoxdur)')
    const hist = (Array.isArray(messages) ? messages : [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }))
    const last = hist[hist.length - 1]
    if (!last || last.role !== 'user') throw new AppError('Sualı yazın')
    if (last.content.length > 600) throw new AppError('Sual çox uzundur (ən çox 600 simvol)')
    const u = usage()
    if (u.left <= 0) throw new AppError(`Bu günün sual limiti (${DAILY}) bitib — sabah yenidən olacaq`)
    const now = Date.now()
    const sk = ctx?.sessionKey || 'x'
    const times = (hourly.get(sk) || []).filter((x) => now - x < 3600_000)
    if (times.length >= PER_SESSION_HOUR) throw new AppError(`Saatda ən çox ${PER_SESSION_HOUR} sual — bir az gözləyin`)
    times.push(now)
    hourly.set(sk, times)

    await pickModel()
    const t = svc.today()
    const d = new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)))
    const system = `Sən «ENA Köməkçi»sən — avtobus şirkətinin ENA Anbar proqramında köməkçi. Bu gün ${t} (${WEEKDAYS[d.getDay()]}), dünən ${addDays(t, -1)}.
Qaydalar:
- Həmişə Azərbaycan dilində, qısa və aydın cavab ver. Rəqəmləri dəqiq yaz (manat: ₼, 2 onluq).
- Məlumatı YALNIZ alətlərdən götür, uydurma. Tapılmasa «tapılmadı» de. Lazımi aləti çağır, tarixləri YYYY-MM-DD ver.
- Sən heç nə dəyişə bilməzsən. Belə istəkdə de: alış və məxaric «Ana səhifə»də, avtobus və yerdəyişmə «Avtobuslar»da, çıxış saatı «Çıxış cədvəli»ndə yazılır — bunu yalnız Anbardar edə bilər.
- Siyahı uzundursa ən vacib 5–10-nu göstər, qalanını say kimi de. Cədvəl lazım olsa qısa markdown cədvəli işlət.
- Anbar FIFO ilə işləyir; «DQN» — avtobusun nişanı/nömrəsi, «xətt» — marşrut.
İstifadəçi: ${ctx?.who || ''}.`
    const msgs = [{ role: 'system', content: system }, ...hist]
    spend()
    const used = []
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const msg = await llm(msgs)
      if (!msg) throw new AppError('Köməkçi cavab vermədi')
      const calls = msg.tool_calls || []
      if (!calls.length) return { answer: String(msg.content || '').trim() || 'Cavab tapılmadı.', tools: used, usage: usage(), model }
      msgs.push({ role: 'assistant', content: msg.content || '', tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.function?.name, arguments: c.function?.arguments || '{}' } })) })
      for (const c of calls) {
        const tool = TOOLS[c.function?.name]
        let out
        try {
          const args = JSON.parse(c.function?.arguments || '{}')
          out = tool ? tool.run(args) : { xeta: 'naməlum alət' }
          used.push(c.function.name)
        } catch (e) {
          out = { xeta: String(e.message || e) }
        }
        msgs.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out).slice(0, 5000) })
      }
    }
    return { answer: 'Sual çox mürəkkəb çıxdı — daha sadə soruşun.', tools: used, usage: usage(), model }
  }

  return { ask, usage, enabled: () => !!key, TOOLS }
}

module.exports = { createAssistant }
