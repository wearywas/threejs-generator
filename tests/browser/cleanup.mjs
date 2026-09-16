import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export function validateBuildDirectory(directory) {
  if (typeof directory !== 'string'
    || path.dirname(directory) !== tmpdir()
    || !/^threejs-browser-test-[0-9a-f-]{36}$/.test(path.basename(directory))) {
    throw new Error('Expected the dedicated temporary directory allocated by Playwright config.')
  }
  return directory
}

export default async function cleanup(config) {
  const directory = validateBuildDirectory(config.metadata.buildDirectory)
  await rm(directory, { recursive: true, force: true, maxRetries: 3 })
}
