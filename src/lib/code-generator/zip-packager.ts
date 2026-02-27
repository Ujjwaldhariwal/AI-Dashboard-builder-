// Module: ZipPackager
import JSZip from 'jszip'
import type { GeneratedFileMap } from './template-generator'

export async function packageProjectAsZip(files: GeneratedFileMap): Promise<Blob> {
  const zip = new JSZip()

  Object.entries(files).forEach(([filePath, content]) => {
    zip.file(filePath, content)
  })

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
