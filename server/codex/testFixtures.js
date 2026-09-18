export const auditedVersion = '0.155.0-alpha.9.2'

// Independent literal fixture matching the no-turn probe and generated v2 schemas.
export function safeConfig() {
  return {
    approval_policy: 'never', sandbox_mode: 'read-only', web_search: 'disabled',
    agents: { enabled: false }, notify: [], project_doc_max_bytes: 0,
    mcp_servers: {}, plugins: {}, apps: { _default: { enabled: false } },
    hooks: { SessionStart: [], Stop: [] }, model_provider: null,
    chatgpt_base_url: 'https://chatgpt.com/backend-api/',
    features: {
      shell_tool: false, unified_exec: false, js_repl: false, code_mode: false,
      code_mode_host: false, code_mode_only: false, multi_agent: false, multi_agent_v2: false,
      collab: false, apps: false, connectors: false, plugins: false, remote_plugin: false,
      enable_mcp_apps: false, hooks: false, codex_hooks: false, plugin_hooks: false,
      browser_use: false, browser_use_external: false, computer_use: false,
      image_generation: false, imagegenext: false, view_image: false, tool_search: false,
      search_tool: false, tool_suggest: false, workspace_dependencies: false,
      memories: false, memory_tool: false, shell_snapshot: false, shell_snapshot_v2: false,
      skill_mcp_dependency_install: false, remote_control: false,
      network_proxy: false, auth_elicitation: false, mentions_v2: false
    }
  }
}

export function safeProof() {
  return {
    version: auditedVersion, config: safeConfig(),
    hooks: { data: [{ cwd: 'C:/empty', hooks: [], warnings: [], errors: [] }] },
    mcp: { data: [], nextCursor: null }
  }
}

export function modelCatalog() {
  return { data: [{ id: 'gpt-6-astra', model: 'gpt-6-astra', displayName: 'GPT-6 Astra', hidden: false,
    description: '', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [], inputModalities: ['text'] }], nextCursor: null }
}
