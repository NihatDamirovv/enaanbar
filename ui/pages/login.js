'use strict'
/* Giriş: ilk açılışda parolların təyini → ümumi parol → ekran seçimi (Anbardar / Mühasib) */
Pages.login = (st) => {
  document.title = 'ENA Anbar — Giriş'
  $('#app').innerHTML = `
    <div class="login">
      <section class="login-brand">
        <div class="logo">E</div>
        <h1>ENA Anbar</h1>
        <p>Anbar, avtobuslar və gündəlik qeydlər — bir proqramda.</p>
        <ul>
          <li><span class="ic">${icon('warehouse', 18)}</span>Alış və məxaric — FIFO ilə</li>
          <li><span class="ic">${icon('bus', 18)}</span>Avtobuslar xətlərə görə</li>
          <li><span class="ic">${icon('note', 18)}</span>Hər günün qeydləri arxivdə</li>
          <li><span class="ic">${icon('clock', 18)}</span>İlk çıxış cədvəli</li>
        </ul>
      </section>
      <section class="login-form"><div class="login-box" id="box"></div></section>
    </div>`
  const box = $('#box')
  const errBox = (msg) => `<div class="alert red" style="margin-bottom:14px">${icon('alert', 17)}<div>${esc(msg)}</div></div>`

  function setupView() {
    box.innerHTML = `
      <h2>Xoş gəldiniz</h2>
      <p class="lead">Proqram ilk dəfə açılır. İki parol təyin edin.</p>
      <form id="f" class="stack" novalidate>
        <div id="err"></div>
        <div class="field"><label>Ümumi parol</label><input class="inp" name="general" type="password" autocomplete="off" /><span class="hint">Hamı bu parolla proqrama girir</span></div>
        <div class="field"><label>Ümumi parol (təkrar)</label><input class="inp" name="general2" type="password" autocomplete="off" /></div>
        <div class="field"><label>Anbardar parolu</label><input class="inp" name="anbar" type="password" autocomplete="off" /><span class="hint">Yalnız anbardar bilir — yazmaq və dəyişmək üçün</span></div>
        <div class="field"><label>Anbardar parolu (təkrar)</label><input class="inp" name="anbar2" type="password" autocomplete="off" /></div>
        <button class="btn btn-primary btn-lg" type="submit">${icon('check', 18)}Yadda saxla və davam et</button>
      </form>`
    const f = $('#f')
    enterAsTab(f)
    f.general.focus()
    f.addEventListener('submit', async (e) => {
      e.preventDefault()
      $('#err').innerHTML = ''
      if (f.general.value !== f.general2.value) return ($('#err').innerHTML = errBox('Ümumi parol təkrarı ilə eyni deyil'))
      if (f.anbar.value !== f.anbar2.value) return ($('#err').innerHTML = errBox('Anbardar parolu təkrarı ilə eyni deyil'))
      try {
        await api('auth.setup', { general: f.general.value, anbar: f.anbar.value })
        roleView()
      } catch (err) {
        $('#err').innerHTML = errBox(err.message)
      }
    })
  }

  function gateView() {
    box.innerHTML = `
      <h2>Daxil olun</h2>
      <p class="lead">Ümumi parolu yazın.</p>
      <form id="f" class="stack" novalidate>
        <div id="err"></div>
        <div class="field"><label>Parol</label><input class="inp" name="password" type="password" autocomplete="off" /></div>
        <button class="btn btn-primary btn-lg" type="submit">Daxil ol ${icon('chevron', 18)}</button>
      </form>`
    const f = $('#f')
    f.password.focus()
    f.addEventListener('submit', async (e) => {
      e.preventDefault()
      try {
        await api('auth.login', { password: f.password.value })
        roleView()
      } catch (err) {
        $('#err').innerHTML = errBox(err.message)
        f.password.select()
      }
    })
  }

  function roleView() {
    box.innerHTML = `
      <h2>Ekranı seçin</h2>
      <p class="lead">Kim kimi işləyəcəksiniz?</p>
      <form id="f" class="stack" novalidate>
        <div id="err"></div>
        <button type="button" class="role-card" data-role="anbar">
          <div class="r-icon c-green">${icon('warehouse', 22)}</div>
          <div class="grow"><b>Anbardar</b><span>Hər şeyi yazır və dəyişir</span></div>
          ${icon('lock', 17)}
        </button>
        <div id="anbarPw" class="field hidden"><label>Anbardar parolu</label><input class="inp" name="password" type="password" autocomplete="off" /></div>
        <button type="button" class="role-card" data-role="muhasib">
          <div class="r-icon c-slate">${icon('calc', 22)}</div>
          <div class="grow"><b>Mühasib</b><span>Yalnız baxır — anbardarın etdiklərini görür</span></div>
          ${icon('eye', 17)}
        </button>
        <button class="btn btn-primary btn-lg" type="submit" id="go" disabled>Daxil ol ${icon('chevron', 18)}</button>
        <button class="btn btn-ghost" type="button" id="back">Geri</button>
      </form>`
    const f = $('#f')
    let role = null
    $$('.role-card', f).forEach((c) =>
      c.addEventListener('click', () => {
        role = c.dataset.role
        $$('.role-card', f).forEach((x) => x.classList.toggle('on', x === c))
        $('#anbarPw').classList.toggle('hidden', role !== 'anbar')
        $('#go').disabled = false
        if (role === 'anbar') f.password.focus()
        else $('#go').focus()
      }),
    )
    $('#back').addEventListener('click', async () => {
      await api('auth.back')
      gateView()
    })
    f.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (!role) return
      $('#go').disabled = true
      try {
        await api('auth.role', { role, password: f.password.value })
      } catch (err) {
        $('#err').innerHTML = errBox(err.message)
        $('#go').disabled = false
        if (role === 'anbar') f.password.select()
      }
    })
  }

  if (!st.setup) setupView()
  else if (!st.gate) gateView()
  else roleView()
}
