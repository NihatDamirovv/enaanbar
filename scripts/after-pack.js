'use strict'
/** electron-builder afterPack — .exe ikonu və məlumatı (imzalama söndürülüb, ona görə builder özü yazmır) */
const path = require('path')
const rceditMod = require('rcedit')
const rcedit = rceditMod.rcedit || rceditMod.default || rceditMod

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const version = context.packager.appInfo.version
  await rcedit(exe, {
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    'file-version': version,
    'product-version': version,
    'version-string': { ProductName: 'ENA Anbar', FileDescription: 'ENA Anbar', CompanyName: 'ENA', OriginalFilename: 'ENA Anbar.exe' },
  })
  console.log('  ✔ .exe ikonu yazıldı')
}
