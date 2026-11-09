'use strict'
/* Alışlar pəncərəsi */
const _d = document.createElement('script')
_d.src = 'pages/docs.js'
_d.onload = () => (Pages.purchases = () => docsPage('IN')) && Pages.purchases()
document.body.appendChild(_d)
