# ENA Anbar

Avtobus şirkəti üçün Windows proqramı: **anbar (FIFO ilə alış/məxaric)**, **avtobuslar** (xətlərə görə, müvəqqəti yerdəyişmə), **gündəlik qeydlər** (hər gecə köhnə qeydlərə köçür), **ilk çıxış cədvəli**.
Sahibi: Nihat Damirov. XYpos ilə əlaqəsi yoxdur.

## Quruluş
- **Proqram (exe)** — Electron. Hər bölmə ayrı pəncərədə açılır. Məlumat kompüterdə saxlanmır, **serverə** yazılır.
- **Server** — `server.js` (Node, `http`). Baza SQLite (`sql.js`, bir fayl). Serverdə `ena-anbar.service`, `127.0.0.1:3130`, Caddy **:8082** arxasında.
  - `GET /` — exe yükləmə səhifəsi (`site/index.html`), `GET /download` — ən son `ENA-Anbar-Setup-x.y.z.exe`
  - `POST /api` `{method, args}` + `x-ena-token`; `GET /api/export` (Excel); `GET /events` (canlı yenilənmə, SSE)
- Bir kompüterdə yazılan dərhal başqa kompüterlərdə görünür (SSE).

## Giriş
1. **Ümumi parol** — hamı onunla girir.
2. Ekran: **Anbardar** (öz parolu ilə — hər şeyi yazır/dəyişir) və ya **Mühasib** (yalnız baxır).
- Parollar serverdə təyin olunur (kənardan «ilk quraşdırma» bağlıdır): `scripts/set-passwords.js` (stdin JSON, server dayanmış halda, `--force` ilə dəyişir). Proqramda: Parametrlər → Parolları dəyiş.
- 5 səhv parol → həmin IP 1 dəqiqə kilidlənir. Sessiya 12 saat (proqram açıqdırsa yaşayır).
- Real parollar: `.local-credentials.txt` (git-də deyil).

## Qaydalar
- **Heç nə silinmir.** Sənəd «ləğv edilir» (səbəb ilə), arxivdə qalır. Məxaric olunmuş alışı ləğv etmək olmaz — əvvəl məxaric ləğv edilir.
- **FIFO:** məxaric ən köhnə alışdan götürülür; qalıqdan çox çıxmaz; qəpik itmir (qat bitəndə qalan məbləğ tam keçir). Say 3, qiymət 4, məbləğ 2 onluq.
- Ana səhifə: VÖEN (10 rəqəm), tarix, mal kodu → mal adı avtomatik. Yeni kod alışda bir dəfə adı ilə yazılır → Anbara həmin tarixlə özü əlavə olunur.
- **Yerdəyişmə:** avtobus N gün başqa xətdə; müddət bitəndə özü öz xəttinə qayıdır. Keçid və qayıdış qeydlərə avtomatik yazılır («öz xəttinə qayıtdı — 09.11–10.11 12 xəttində idi»).
- **Qeydlər** tarixə bağlıdır: yeni gündə «Bugünkü qeydlər» boşdur, dünənkilər «Köhnə qeydlər»də. Server saat qurşağı `Asia/Baku` (systemd `TZ`).

## Əmrlər
```bash
npm test                                   # iş qaydaları (54 yoxlama)
npm run server                             # lokal server (PORT=3130, ENA_DATA=./data)
ENA_SERVER=http://127.0.0.1:3130 npm start # proqram lokal serverlə
npm run dist                               # dist/ENA-Anbar-Setup-<versiya>.exe (versiyanı package.json-da artır)
bash scripts/deploy-server.sh --exe        # serverə: kod + exe (baza toxunulmur)
```
- Server testi: `BASE=... ENA_PW=... ENA_APW=... node test/server-test.js` (25 yoxlama; **canlı bazaya qeyd yazır** — yalnız lokal serverdə işlət).
- Ekran şəkilləri: server `ENA_SEED=1 ENA_PW=.. ENA_APW=..` (nümunə məlumat) + proqram `ENA_SHOTS=<qovluq>` — `src/shots.js`.
- Windows-da imzalama yoxdur (`signAndEditExecutable: false`), ikon `scripts/after-pack.js` (rcedit) ilə yazılır; ikon: `npm run icons`.

## Server
- `/opt/ena-anbar/app` (kod), `/opt/ena-anbar/data/ena-anbar.db` (baza), `data/backup/` (gecəlik, 90 gün), `/opt/ena-anbar/download/` (son 3 exe).
- Caddy bloku `:8082` (əvvəlki nüsxə `/etc/caddy/Caddyfile.bak-before-ena-anbar-20261109-104838`). Serverdəki başqa layihələrə (Arifmetik, XYpos, Mafia) toxunma.
