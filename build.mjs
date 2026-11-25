// Build desktop/plugin.js by concatenating src/*.js in lexical order.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, 'src')
const files = readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort()
if (!files.length) throw new Error('no sources in src/')

const body = files.map((f) => readFileSync(join(srcDir, f), 'utf8').trimEnd()).join('\n\n')
const footer = `\nexport { App, HermifactDirective, CSS, plugin }\n`

const out = `${body}\n${footer}`
mkdirSync(join(here, 'desktop'), { recursive: true })
writeFileSync(join(here, 'desktop', 'plugin.js'), out)
console.log(`built desktop/plugin.js from ${files.length} files — ${out.split('\n').length} lines, ${(out.length / 1024).toFixed(1)} KB`)
