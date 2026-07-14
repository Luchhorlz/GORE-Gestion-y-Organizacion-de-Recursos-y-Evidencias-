import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import JSZip from 'jszip'

const root = process.cwd()
const source = join(root, 'extension')
const outputDirectory = join(root, 'public', 'downloads')
const outputs = [join(outputDirectory, 'GORE-Chrome.zip'), join(outputDirectory, 'GORE-Chrome-v1.2.0.zip')]
const zip = new JSZip()

async function include(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name)
    const info = await stat(path)
    if (info.isDirectory()) await include(path)
    else zip.file(relative(source, path).replaceAll('\\', '/'), await readFile(path))
  }
}

await include(source)
await mkdir(outputDirectory, { recursive: true })
const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
for (const output of outputs) { await rm(output, { force: true }); await writeFile(output, archive) }
console.log(`Extensión empaquetada: ${relative(root, outputs[1])}`)
