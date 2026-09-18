import { homedir } from 'node:os'
import path from 'node:path'
import { ModelError } from '../modelErrors.js'

// Exact source audit + clean-profile no-turn probe, not a general sandbox guarantee.
// rust-v0.155.0-alpha.2.6, bf6f0a4ec97919bf697cdc532e7b8af4ec482fc6.
// rust-v0.155.0-alpha.9.2, f507a90df8684231353b1e6effe4dd894fc60415.
// Empty environments remove host tools; retained V8 Code Mode/clock are not host access.
const AUDITED_VERSIONS = new Set(['0.155.0-alpha.2.6', '0.155.0-alpha.9.2'])
const DISABLED_FEATURES = Object.freeze([
  'shell_tool', 'unified_exec', 'js_repl', 'code_mode', 'code_mode_host', 'code_mode_only',
  'multi_agent', 'multi_agent_v2', 'collab', 'apps', 'connectors', 'plugins', 'remote_plugin',
  'enable_mcp_apps', 'hooks', 'codex_hooks', 'plugin_hooks', 'browser_use', 'browser_use_external',
  'computer_use', 'image_generation', 'imagegenext', 'view_image', 'tool_search', 'search_tool',
  'tool_suggest', 'workspace_dependencies', 'memories', 'memory_tool', 'shell_snapshot',
  'shell_snapshot_v2', 'skill_mcp_dependency_install', 'remote_control',
  'network_proxy', 'auth_elicitation', 'mentions_v2'
])
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const emptyArray = value => Array.isArray(value) && value.length === 0
const emptyObject = value => object(value) && Object.keys(value).length === 0
const disabledEntries = value => object(value) && Object.values(value).every(entry => object(entry) && entry.enabled === false)
function requirePolicy(condition) {
  if (!condition) throw new ModelError('codex_policy', 'The private Codex safety policy could not be verified.', 503)
}

/** Unknown builds require a new source audit and no-turn effective-policy probe. */
export function assertVersion(version) {
  if (!AUDITED_VERSIONS.has(version)) throw new ModelError('codex_incompatible', 'This Codex version has not been verified for the experimental connection.', 503)
}

/** Check effective values and actual integration inventories, never CLI flags alone. */
export function assertConfigSafety({ version, config } = {}) {
  assertVersion(version)
  requirePolicy(object(config))
  requirePolicy(config.approval_policy === 'never' && config.sandbox_mode === 'read-only' && config.web_search === 'disabled')
  requirePolicy(config.agents?.enabled === false && emptyArray(config.notify) && config.project_doc_max_bytes === 0)
  requirePolicy(object(config.features) && DISABLED_FEATURES.every(flag => config.features[flag] === false))
  // Unknown enabled feature flags have not passed this exact-version capability audit.
  requirePolicy(Object.values(config.features).every(value => value === false))
  requirePolicy(disabledEntries(config.mcp_servers) && disabledEntries(config.plugins))
  requirePolicy(disabledEntries(config.apps) && config.apps._default?.enabled === false)
  requirePolicy(config.model_provider == null || config.model_provider === 'openai')
  requirePolicy(config.model_providers == null || emptyObject(config.model_providers))
  requirePolicy(config.forced_login_method == null || config.forced_login_method === 'chatgpt')
  for (const key of ['instructions', 'developer_instructions', 'model_instructions_file', 'experimental_instructions_file', 'model_catalog_json']) {
    requirePolicy(config[key] == null || config[key] === '')
  }
  // Reject destination/credential overrides even if they claim to be the built-in provider.
  for (const [key, value] of Object.entries(config)) {
    if (key === 'chatgpt_base_url') {
      requirePolicy(value == null || value === 'https://chatgpt.com/backend-api/')
      continue
    }
    if (/(?:base_url|endpoint|api_key|bearer_token|auth_token|issuer)/i.test(key)) requirePolicy(value == null)
  }
}

/** Enumerate integrations only after assertConfigSafety has accepted the config. */
export function assertSafety({ version, config, hooks, mcp } = {}) {
  assertConfigSafety({ version, config })
  requirePolicy(object(hooks) && Array.isArray(hooks.data))
  requirePolicy(hooks.data.every(entry => emptyArray(entry.hooks) && emptyArray(entry.errors) && emptyArray(entry.warnings)))
  requirePolicy(object(mcp) && Array.isArray(mcp.data) && mcp.nextCursor == null)
  requirePolicy(mcp.data.every(entry => emptyObject(entry.tools) && emptyArray(entry.resources)
    && emptyArray(entry.resourceTemplates) && entry.toolsError == null))
}

/** The response is the last safety gate before any model turn can be sent. */
export function assertThreadSafety(response, model, cwd) {
  const samePath = (a, b) => typeof a === 'string' && path.resolve(a) === path.resolve(b)
  requirePolicy(object(response) && response.model === model && response.modelProvider === 'openai')
  requirePolicy(response.thread?.ephemeral === true && typeof response.thread.id === 'string' && response.thread.id.length > 0)
  requirePolicy(response.thread.modelProvider === 'openai' && samePath(response.cwd, cwd))
  requirePolicy(emptyArray(response.instructionSources) && response.approvalPolicy === 'never')
  requirePolicy(response.sandbox?.type === 'readOnly' && response.sandbox.networkAccess === false)
}

/** Reduce account data immediately; never retain identity or tokens. */
export function authState(response) {
  requirePolicy(object(response) && typeof response.requiresOpenaiAuth === 'boolean' && Object.hasOwn(response, 'account'))
  if (response.account === null) return 'signed_out'
  if (response.account?.type === 'apiKey') return 'api_key'
  requirePolicy(response.account?.type === 'chatgpt')
  return 'connected'
}

/** Only catalog-visible text model identifiers can be selected by callers. */
export function publicModels(response) {
  requirePolicy(object(response) && Array.isArray(response.data) && response.nextCursor == null)
  const models = new Map()
  for (const entry of response.data) {
    requirePolicy(object(entry) && typeof entry.model === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(entry.model))
    requirePolicy(typeof entry.hidden === 'boolean' && typeof entry.displayName === 'string' && entry.displayName.length <= 200)
    if (entry.hidden || (entry.inputModalities && !entry.inputModalities.includes('text'))) continue
    models.set(entry.model, { id: entry.model, name: entry.displayName })
  }
  return [...models.values()]
}

/** Build a small environment from public OS paths; credentials/proxies/hooks never pass. */
export function buildChildEnv(env, profile) {
  const allowed = ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'HOME', 'HOMEDRIVE', 'HOMEPATH']
  const childEnv = {}
  for (const name of allowed) {
    const key = Object.keys(env).find(candidate => candidate.toLowerCase() === name.toLowerCase())
    if (key && typeof env[key] === 'string') childEnv[name] = env[key]
  }
  return { ...childEnv, CODEX_HOME: profile }
}

/** A persistent app-owned profile, never the user's ordinary Codex home. */
export function profilePath({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  if (platform === 'win32') return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), 'ThreeJSGenerator', 'codex-profile-experimental')
  return path.posix.join(home, '.local', 'share', 'ThreeJSGenerator', 'codex-profile-experimental')
}

/** These restrictions complement, but do not replace, the effective checks above. */
export function configArguments() {
  return [...DISABLED_FEATURES.map(flag => `features.${flag}=false`),
    'web_search="disabled"', 'agents.enabled=false', 'approval_policy="never"', 'sandbox_mode="read-only"',
    'mcp_servers={}', 'plugins={}', 'apps._default.enabled=false', 'project_doc_max_bytes=0',
    'notify=[]', 'analytics.enabled=false', 'feedback.enabled=false', 'model_provider="openai"'
  ].flatMap(value => ['-c', value])
}

/** Managed browser login only, and only to the official authorization endpoints. */
export function validateAuthUrl(value) {
  let url
  try { url = new URL(value) } catch { requirePolicy(false) }
  requirePolicy(typeof value === 'string' && value.length <= 16384 && url.protocol === 'https:')
  requirePolicy(['auth.openai.com', 'auth0.openai.com'].includes(url.hostname) && !url.username && !url.password && !url.hash && !url.port)
  requirePolicy(['/authorize', '/oauth/authorize'].includes(url.pathname))
  return value
}
