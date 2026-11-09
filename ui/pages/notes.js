'use strict'
/* Qeydlər — bugünkü qeydlər (gecə 00:00-da boşalır) və yanında köhnə qeydlər (gün-gün arxiv) */
Pages.notes = () => {
  const main = shell({
    title: 'Qeydlər',
    sub: 'Hər gün yenilənir — köhnə günlər arxivdə qalır',
    iconName: 'note',
    iconClass: 'c-violet',
    actions: `<button class="btn btn-sm" id="xls">${icon('excel', 16)}Excel</button>`,
  })
  main.style.overflow = 'hidden'
  main.innerHTML = `
    <div class="notes-layout">
      <div class="notes-col">
        <div class="card">
          <div class="card-head">
            <div class="page-icon c-violet" style="width:34px;height:34px">${icon('note', 17)}</div>
            <div class="grow"><h2>Bugünkü qeydlər</h2><div class="muted small" id="todayLbl"></div></div>
            <span class="badge violet" id="todayCnt"></span>
          </div>
          <form class="w-only" id="addForm" style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-end">
            <textarea class="inp grow" name="text" rows="2" placeholder="Qeyd yazın… (Ctrl+Enter — əlavə et)"></textarea>
            <button class="btn btn-primary" type="submit">${icon('plus', 16)}Əlavə et</button>
          </form>
          <div id="active"></div>
          <div class="notes-scroll" id="todayList"></div>
        </div>
      </div>
      <div class="notes-col">
        <div class="card">
          <div class="card-head">
            <div class="page-icon c-slate" style="width:34px;height:34px">${icon('archive', 17)}</div>
            <div class="grow"><h2>Köhnə qeydlər</h2><div class="muted small">Hər gecə bugünkü qeydlər bura köçür</div></div>
          </div>
          <div style="padding:12px 18px;border-bottom:1px solid var(--border)">
            <div class="search">${icon('search', 16)}<input class="inp" id="q" placeholder="Köhnə qeydlərdə axtar (məs. 10-AB-123)" autocomplete="off" /></div>
          </div>
          <div class="notes-scroll" id="archive"></div>
        </div>
      </div>
    </div>`

  const KIND = {
    MOVE: { icon: 'swap', cls: 'c-amber', label: 'Yerdəyişmə' },
    RETURN: { icon: 'undo', cls: 'c-green', label: 'Qayıdış' },
    AUTO: { icon: 'info', cls: 'c-blue', label: 'Avtomatik' },
    MANUAL: { icon: 'edit', cls: 'c-violet', label: 'Qeyd' },
  }
  const noteHtml = (n) => {
    const k = KIND[n.kind] || KIND.AUTO
    return `<div class="note">
      <div class="n-icon ${k.cls}" title="${k.label}">${icon(k.icon, 15)}</div>
      <div class="grow"><div class="n-text">${esc(n.text)}</div><div class="n-time">${hm(n.at)}${n.author ? ` · ${esc(n.author)}` : ''}</div></div>
    </div>`
  }
  const open = new Set()
  let firstLoad = true

  async function loadToday() {
    const d = await api('notes.today')
    $('#todayLbl').textContent = `${longDate(d.date)}, ${weekday(d.date)}`
    $('#todayCnt').textContent = `${d.notes.length} qeyd`
    $('#active').innerHTML = d.active.length
      ? `<div style="padding:12px 18px;border-bottom:1px solid var(--border);background:#fffbf3">
          <div class="label" style="margin-bottom:8px;color:var(--amber)">${icon('swap', 15)} Bu gün başqa xətdə olan avtobuslar</div>
          <div class="stack" style="gap:8px">${d.active
            .map((m) => `<div class="row" style="gap:10px;flex-wrap:wrap">${plate(m.plate)}<span><b>${esc(m.fromRouteName)}</b> → <b>${esc(m.toRouteName)}</b></span><span class="muted small">${m.dateFrom === m.dateTo ? 'yalnız bu gün' : `${dm(m.dateFrom)} – ${dm(m.dateTo)}`} · ${m.dateTo === d.date ? 'sabah' : dm(addDays(m.dateTo, 1))} öz xəttinə qayıdır</span></div>`)
            .join('')}</div>
        </div>`
      : ''
    $('#todayList').innerHTML = d.notes.length ? d.notes.map(noteHtml).join('') : emptyState('note', 'Bu gün hələ qeyd yoxdur', 'Avtobus başqa xəttə keçəndə qeyd bura özü düşür.')
  }

  async function loadArchive() {
    const days = await api('notes.archive', { q: $('#q').value })
    if (firstLoad && days[0]) open.add(days[0].date)
    firstLoad = false
    const searching = !!$('#q').value.trim()
    $('#archive').innerHTML = days.length
      ? days
          .map((d) => {
            const isOpen = searching || open.has(d.date)
            return `<button class="day-head ${isOpen ? 'open' : ''}" data-date="${d.date}">
          <span class="chev">${icon('chevron', 16)}</span>
          <span class="grow">${longDate(d.date)} <span class="muted" style="font-weight:400">· ${weekday(d.date)}</span></span>
          <span class="badge">${d.notes.length}</span>
        </button>
        ${isOpen ? d.notes.map(noteHtml).join('') : ''}`
          })
          .join('')
      : emptyState('archive', searching ? 'Heç nə tapılmadı' : 'Köhnə qeyd hələ yoxdur', searching ? '' : 'Sabahdan etibarən bugünkü qeydlər bura köçəcək.')
  }

  const load = async () => {
    try {
      await Promise.all([loadToday(), loadArchive()])
    } catch (err) {
      toast(err.message, 'err')
    }
  }

  $('#archive').addEventListener('click', (e) => {
    const h = e.target.closest('.day-head')
    if (!h) return
    const d = h.dataset.date
    open.has(d) ? open.delete(d) : open.add(d)
    loadArchive()
  })
  $('#q').addEventListener('input', debounce(loadArchive, 250))
  const form = $('#addForm')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await api('notes.add', { text: form.text.value })
      form.text.value = ''
      toast('Qeyd əlavə olundu')
    } catch (err) {
      toast(err.message, 'err')
    }
  })
  form.text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit()
  })
  $('#xls').addEventListener('click', () => excelExport('notes', { q: $('#q').value }))
  load()
  onDataChanged(load)
}
