import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/editor/browser/coreCommands.js'
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js'
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-editor/editor/contrib/find/browser/findController.js'
import 'monaco-editor/editor/contrib/folding/browser/folding.js'
import 'monaco-editor/editor/contrib/tokenization/browser/tokenization.js'
import { createTokenizationSupport } from 'monaco-editor/languages/features/json/tokenization.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

// Specs are read-only and already validated. Keep syntax colors, search and
// indentation folding without loading JSON completion/validation services.
monaco.languages.register({ id: 'json', aliases: ['JSON'], extensions: ['.json'] })
monaco.languages.setTokensProvider('json', createTokenizationSupport(true))
monaco.languages.setLanguageConfiguration('json', {
  // Preserve Monaco JSON's selection rules without its language-service bundle.
  wordPattern: /(-?\d*\.\d\w*)|([^\[\{\]\}\:\"\,\s]+)/g,
  brackets: [['{', '}'], ['[', ']']]
})

// Use the audited local package, never the loader's CDN default.
globalThis.MonacoEnvironment = {
  getWorker() { return new EditorWorker() }
}
loader.config({ monaco })

export default Editor
