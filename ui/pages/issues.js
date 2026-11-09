'use strict'
/* Məxariclər pəncərəsi */
const _d = document.createElement('script')
_d.src = 'pages/docs.js'
_d.onload = () => (Pages.issues = () => docsPage('OUT')) && Pages.issues()
document.body.appendChild(_d)
