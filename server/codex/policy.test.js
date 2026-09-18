import { describe, expect, it } from 'vitest'
import { assertSafety, assertVersion, assertThreadSafety, authState, publicModels,
  buildChildEnv, profilePath, configArguments, validateAuthUrl } from './policy.js'
import { safeProof, modelCatalog } from './testFixtures.js'

describe('version-bounded effective Codex policy', () => {
  it('overrides the three observed enabled defaults and accepts the exact official ChatGPT endpoint', () => {
    const proof = safeProof()
    for (const flag of ['network_proxy', 'auth_elicitation', 'mentions_v2']) {
      proof.config.features[flag] = true
      expect(() => assertSafety(proof)).toThrow(expect.objectContaining({ code: 'codex_policy' }))
      expect(configArguments()).toContain(`features.${flag}=false`)
      proof.config.features[flag] = false
    }
    expect(() => assertSafety(proof)).not.toThrow()
    for (const url of ['https://chatgpt.com/backend-api', 'https://chatgpt.com/backend-api/?custom=1',
      'https://user@chatgpt.com/backend-api/', 'https://chatgpt.com/backend-api/#fragment', 'https://chatgpt.com/other/', 'https://evil.test/backend-api/']) {
      proof.config.chatgpt_base_url = url
      expect(() => assertSafety(proof)).toThrow(expect.objectContaining({ code: 'codex_policy' }))
    }
  })
  it.each(['0.155.0-alpha.2.6', '0.155.0-alpha.9.2'])('requires effective safety evidence for audited version %s', version => {
    const proof = { ...safeProof(), version }
    expect(() => assertSafety(proof)).not.toThrow()
    proof.config.features.shell_tool = true
    expect(() => assertSafety(proof)).toThrow(expect.objectContaining({ code: 'codex_policy' }))
    for (const unknown of ['0.155.0', '0.155.0-alpha.2.7', '0.155.0-alpha.9.1', '0.155.0-alpha.9.3', '', undefined]) {
      expect(() => assertVersion(unknown)).toThrow(expect.objectContaining({ code: 'codex_incompatible' }))
    }
  })

  it.each([
    ['approval_policy', 'on-request'], ['sandbox_mode', 'workspace-write'], ['web_search', 'cached'],
    ['agents', { enabled: true }], ['notify', ['command']], ['project_doc_max_bytes', 100],
    ['mcp_servers', { inherited: {} }], ['plugins', { inherited: { enabled: true } }],
    ['apps', { _default: { enabled: false }, inherited: { enabled: true } }]
  ])('rejects inherited or incompatible %s', (key, value) => {
    const proof = safeProof()
    proof.config[key] = value
    expect(() => assertSafety(proof)).toThrow(expect.objectContaining({ code: 'codex_policy' }))
  })

  it.each(['approval_policy', 'sandbox_mode', 'web_search', 'agents', 'notify', 'project_doc_max_bytes', 'mcp_servers', 'plugins', 'apps', 'features'])('requires explicit effective proof of %s', key => {
    const proof = safeProof()
    delete proof.config[key]
    expect(() => assertSafety(proof)).toThrow(expect.objectContaining({ code: 'codex_policy' }))
  })

  it('rejects missing or enabled critical flags and unknown enabled capabilities', () => {
    for (const value of [true, undefined, 'false', null]) {
      const proof = safeProof()
      proof.config.features.image_generation = value
      expect(() => assertSafety(proof)).toThrow(expect.objectContaining({ code: 'codex_policy' }))
    }
    const proof = safeProof()
    proof.config.features.new_host_capability = true
    expect(() => assertSafety(proof)).toThrow(expect.objectContaining({ code: 'codex_policy' }))
  })

  it('accepts explicitly disabled inherited entries, but requires actual empty hook and MCP inventories', () => {
    const proof = safeProof()
    proof.config.mcp_servers = { inherited: { enabled: false } }
    proof.config.plugins = { inherited: { enabled: false } }
    expect(() => assertSafety(proof)).not.toThrow()
    for (const entry of [{ tools: { tool: {} }, resources: [], resourceTemplates: [] },
      { tools: {}, resources: [{}], resourceTemplates: [] }, { tools: {}, resources: [], resourceTemplates: [{}] }, {}]) {
      expect(() => assertSafety({ ...proof, mcp: { data: [entry], nextCursor: null } })).toThrow(expect.objectContaining({ code: 'codex_policy' }))
    }
    for (const hooks of [undefined, {}, { data: [{ hooks: [{}], warnings: [], errors: [] }] }, { data: [{ hooks: [], warnings: [], errors: ['bad'] }] }]) {
      expect(() => assertSafety({ ...proof, hooks })).toThrow(expect.objectContaining({ code: 'codex_policy' }))
    }
    expect(() => assertSafety({ ...proof, mcp: { data: [], nextCursor: 'more' } })).toThrow(expect.objectContaining({ code: 'codex_policy' }))
  })

  it.each([
    ['model_provider', 'custom'], ['model_providers', { openai: { base_url: 'https://other.test' } }],
    ['chatgpt_base_url', 'https://other.test'], ['openai_base_url', 'https://other.test'],
    ['model_catalog_json', 'C:/other.json'], ['forced_login_method', 'api'],
    ['model_instructions_file', 'C:/instructions'], ['developer_instructions', 'inherited'],
    ['instructions', 'inherited'], ['experimental_bearer_token', 'secret']
  ])('rejects configured provider/auth/instruction override %s', (key, value) => {
    const proof = safeProof()
    proof.config[key] = value
    expect(() => assertSafety(proof)).toThrow(expect.objectContaining({ code: 'codex_policy' }))
  })

  it('does not equate launch flags with capability proof', () => {
    const args = configArguments()
    expect(args).toContain('features.image_generation=false')
    expect(args).toContain('features.imagegenext=false')
    expect(args).toContain('model_provider="openai"')
    expect(args).not.toContain('features.apply_patch_freeform=false')
    expect(() => assertSafety({ version: '0.155.0-alpha.2.6', config: safeProof().config })).toThrow(expect.objectContaining({ code: 'codex_policy' }))
  })

  it('requires empty instructions, explicit network denial, exact provider/model, and ephemeral threads', () => {
    const response = { thread: { id: 'thread', ephemeral: true, modelProvider: 'openai' }, model: 'gpt-6-astra',
      modelProvider: 'openai', cwd: 'C:/empty', instructionSources: [], sandbox: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'never' }
    expect(() => assertThreadSafety(response, 'gpt-6-astra', 'C:/empty')).not.toThrow()
    for (const patch of [{ instructionSources: ['AGENTS.md'] }, { instructionSources: undefined },
      { sandbox: { type: 'readOnly' } }, { model: 'fallback' }, { modelProvider: 'custom' },
      { thread: { id: 'thread', ephemeral: false } }, { approvalPolicy: 'on-request' }, { cwd: 'C:/repo' }]) {
      expect(() => assertThreadSafety({ ...response, ...patch }, 'gpt-6-astra', 'C:/empty')).toThrow(expect.objectContaining({ code: 'codex_policy' }))
    }
  })
})

describe('authentication, models, environment and official login', () => {
  it('accepts only managed ChatGPT authentication and exposes no account identity', () => {
    expect(authState({ account: { type: 'chatgpt', email: 'private', planType: 'pro' }, requiresOpenaiAuth: true })).toBe('connected')
    expect(authState({ account: null, requiresOpenaiAuth: true })).toBe('signed_out')
    expect(authState({ account: { type: 'apiKey' }, requiresOpenaiAuth: true })).toBe('api_key')
    expect(() => authState({ account: { type: 'chatgptAuthTokens' } })).toThrow(expect.objectContaining({ code: 'codex_policy' }))
    expect(() => authState({})).toThrow(expect.objectContaining({ code: 'codex_policy' }))
  })

  it('allows only available visible text models with safe public identity', () => {
    expect(publicModels(modelCatalog())).toEqual([{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }])
    const catalog = modelCatalog()
    catalog.data[0].hidden = true
    expect(publicModels(catalog)).toEqual([])
    expect(() => publicModels({})).toThrow(expect.objectContaining({ code: 'codex_policy' }))
    expect(() => publicModels({ data: [], nextCursor: 'unread' })).toThrow(expect.objectContaining({ code: 'codex_policy' }))
  })

  it('isolates the persistent application profile and drops secrets, proxies and executable hooks from child env', () => {
    const env = { LOCALAPPDATA: 'C:/Users/test/AppData/Local', USERPROFILE: 'C:/Users/test', SystemRoot: 'C:/Windows',
      OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', CODEX_HOME: 'C:/normal',
      OPENAI_BASE_URL: 'https://other.test', NODE_OPTIONS: 'hook', HTTPS_PROXY: 'proxy', PATH: 'untrusted' }
    const profile = profilePath({ env, platform: 'win32', home: 'C:/Users/test' })
    expect(profile.replaceAll('\\', '/')).toBe('C:/Users/test/AppData/Local/ThreeJSGenerator/codex-profile-experimental')
    expect(buildChildEnv(env, profile)).toEqual({ LOCALAPPDATA: env.LOCALAPPDATA, USERPROFILE: env.USERPROFILE,
      SystemRoot: 'C:/Windows', CODEX_HOME: profile })
    expect(profilePath({ env: {}, platform: 'linux', home: '/home/test' })).toBe('/home/test/.local/share/ThreeJSGenerator/codex-profile-experimental')
  })

  it.each(['http://auth.openai.com/authorize', 'https://auth.openai.com.evil.test/authorize',
    'https://user:pass@auth.openai.com/authorize', 'https://auth.openai.com/authorize#secret',
    'https://auth.openai.com:444/authorize', 'javascript:alert(1)', 'https://other.test'])('rejects unsafe login URL %s', url => {
    expect(() => validateAuthUrl(url)).toThrow(expect.objectContaining({ code: 'codex_policy' }))
  })

  it('accepts official HTTPS authorization URLs without changing their flow parameters', () => {
    for (const host of ['auth.openai.com', 'auth0.openai.com']) {
      const url = `https://${host}/oauth/authorize?state=opaque&code_challenge=abc`
      expect(validateAuthUrl(url)).toBe(url)
    }
  })
})
