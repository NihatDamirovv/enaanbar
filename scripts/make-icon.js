'use strict'
/** build/icon.svg → build/icon.png (512) + build/icon.ico (16…256) */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const dir = path.join(__dirname, '..', 'build')
const svg = path.join(dir, 'icon.svg')

;(async () => {
  await sharp(svg).resize(512, 512).png().toFile(path.join(dir, 'icon.png'))
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngs = await Promise.all(sizes.map((s) => sharp(svg).resize(s, s).png().toBuffer()))
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(sizes.length, 4)
  const dirs = []
  let offset = 6 + 16 * sizes.length
  sizes.forEach((s, i) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(s === 256 ? 0 : s, 0)
    e.writeUInt8(s === 256 ? 0 : s, 1)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(pngs[i].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += pngs[i].length
    dirs.push(e)
  })
  fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([head, ...dirs, ...pngs]))
  console.log('icon.png + icon.ico hazırdır')
})()
