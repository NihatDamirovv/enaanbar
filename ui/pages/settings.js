'use strict'
/* Parametrlər — parolların dəyişməsi, məlumat qovluğu və ehtiyat nüsxə */
Pages.settings = () => {
  const main = shell({ title: 'Parametrlər', sub: 'Parollar və ehtiyat nüsxə', iconName: 'settings', iconClass: 'c-slate' })
  main.innerHTML = `
    <div class="stack" style="gap:16px;max-width:720px">
      <section class="card">
        <div class="card-head"><div class="page-icon c-blue" style="width:34px;height:34px">${icon('key', 17)}</div><h2 class="grow">Parolları dəyiş</h2></div>
        <form class="card-body stack" id="pw" novalidate>
          <div id="pwErr"></div>
          <div class="field"><label>Hazırkı anbardar parolu</label><input class="inp" name="current" type="password" autocomplete="off" style="max-width:320px" /></div>
          <div class="row" style="gap:14px;align-items:flex-start">
            <div class="field grow"><label>Yeni ümumi parol</label><input class="inp" name="general" type="password" autocomplete="off" /><span class="hint">Boş qalsa — dəyişmir</span></div>
            <div class="field grow"><label>Yeni anbardar parolu</label><input class="inp" name="anbar" type="password" autocomplete="off" /><span class="hint">Boş qalsa — dəyişmir</span></div>
          </div>
          <div><button class="btn btn-primary" type="submit">${icon('check', 16)}Parolu dəyiş</button></div>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><div class="page-icon c-green" style="width:34px;height:34px">${icon('archive', 17)}</div><h2 class="grow">Məlumat və ehtiyat nüsxə</h2></div>
        <div class="card-body stack" id="info"></div>
      </section>
    </div>`

  async function loadInfo() {
    const i = await api('app.info')
    $('#info').innerHTML = `
      <dl class="kv">
        <dt>Server</dt><dd>${esc(i.server || '')}</dd>
        <dt>Baza</dt><dd>Serverdə — bütün kompüterlər eyni bazanı görür</dd>
        <dt>Son nüsxələr</dt><dd>${i.backups.map(esc).join('<br/>') || '—'}</dd>
        <dt>Son versiya</dt><dd>ENA Anbar ${esc(i.version || '—')}</dd>
      </dl>
      <div class="alert blue">${icon('info', 17)}<div>Server hər gün özü bazanın ehtiyat nüsxəsini çıxarır (son 90 gün saxlanılır). Kompüter xarab olsa da məlumat itmir.</div></div>
      <div class="row">
        <button class="btn btn-primary" id="bk">${icon('save', 16)}İndi ehtiyat nüsxə çıxar</button>
      </div>`
    $('#bk').addEventListener('click', async () => {
      try {
        await api('app.backup')
        toast('Ehtiyat nüsxə çıxarıldı')
        loadInfo()
      } catch (err) {
        toast(err.message, 'err')
      }
    })
  }

  const f = $('#pw')
  f.addEventListener('submit', async (e) => {
    e.preventDefault()
    $('#pwErr').innerHTML = ''
    try {
      await api('auth.change', { current: f.current.value, general: f.general.value, anbar: f.anbar.value })
      f.reset()
      toast('Parol dəyişdi')
    } catch (err) {
      $('#pwErr').innerHTML = `<div class="alert red">${icon('alert', 17)}<div>${esc(err.message)}</div></div>`
    }
  })
  loadInfo()
}
