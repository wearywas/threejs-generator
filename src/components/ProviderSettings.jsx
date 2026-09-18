import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { llmClient } from '../api/llmClient'
import Modal from './Modal'
import GenerationProgress from './GenerationProgress'

// Lock a reopened dialog before browser input can race its session refresh.
const useSettingsEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
const names = { anthropic: 'Anthropic', openai: 'OpenAI', codex: 'Codex (experimental)' }
const connectionLabels = {
  not_connected: 'Not connected',
  missing: 'Codex CLI missing',
  incompatible: 'Incompatible Codex connection',
  signed_out: 'Signed out',
  api_key: 'API-key authentication is incompatible',
  connected: 'Connected: authentication detected',
  unavailable: 'Connection unavailable',
}

function codexModel(config, preferred = config?.modelOverride) {
  const connection = config?.connection
  const candidate = preferred || connection?.defaultModel
  return connection?.models?.some(model => model.id === candidate) ? candidate : ''
}

function safeAuthUrl(value) {
  try {
    const url = new URL(value)
    return typeof value === 'string' && value.length <= 16384 && !value.includes('#') && url.protocol === 'https:'
      && ['auth.openai.com', 'auth0.openai.com'].includes(url.hostname)
      && ['/authorize', '/oauth/authorize'].includes(url.pathname)
      && !url.username && !url.password && !url.port ? value : ''
  } catch { return '' }
}

/** Key presence is reported by the server; it is not a paid connection test. */
export function ModelSettingsButton({ settings, error, onOpen }) {
  const active = settings?.providers[settings.provider]
  const isCodex = settings?.provider === 'codex'
  const hasKey = Boolean(active?.keySource)
  const connected = isCodex ? active?.connection?.state === 'connected' : hasKey
  const label = settings ? `${names[settings.provider]} / ${active?.model || 'Choose a model'}` : 'Connect'
  const keyStatus = !settings
    ? error ? 'Unable to check API key configuration. Open Model settings to reconnect.' : 'Checking API key configuration...'
    : isCodex
      ? `Codex: ${connectionLabels[active?.connection?.state] || connectionLabels.not_connected}. ${connected ? 'Generation not tested; model requests may still fail.' : 'Open Model settings to check the connection.'}`
    : hasKey
      ? `${names[settings.provider]}: API key configured (${active.keySource === 'environment' ? 'server environment' : 'session entry'}). Connection not tested.`
      : `${names[settings.provider]}: No API key configured. Open Model settings to add a key.`

  return <button type="button" onClick={onOpen} className="model-trigger" aria-haspopup="dialog" aria-label={`Model settings: ${label}`} aria-description={keyStatus} title={keyStatus}>
    <span className={`connection-dot${connected ? ' is-connected' : ''}`} aria-hidden="true" />
    <span className="model-trigger-label">Model settings</span>
    <span className="model-trigger-value">{label}</span>
  </button>
}

/** Local model configuration; API keys are never saved in browser storage. */
export default function ProviderSettings({ disabled, open, onOpen, onClose }) {
  const [settings, setSettings] = useState(null)
  const [provider, setProvider] = useState('anthropic')
  const [model, setModel] = useState('')
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [authUrl, setAuthUrl] = useState('')
  const initialized = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requests = useSyncExternalStore(llmClient.subscribe, llmClient.getSnapshot, llmClient.getSnapshot)
  const selected = settings?.providers[provider]
  const isCodex = provider === 'codex'
  const connection = selected?.connection
  const connectionState = connection?.state || 'not_connected'
  const validCodexModel = connectionState === 'connected' && connection?.models?.some(candidate => candidate.id === model)

  function applySettings(value) {
    setSettings(value)
    if (value.providers.codex?.connection?.state !== 'signed_out') setAuthUrl('')
    setProvider(value.provider)
    setModel(value.provider === 'codex' ? codexModel(value.providers.codex) : value.providers[value.provider].modelOverride)
  }
  useSettingsEffect(() => {
    if (!open && initialized.current) return
    let mounted = true
    setRefreshing(true)
    setKey(''); setNotice('')
    llmClient.getSession().then(value => { if (mounted) { applySettings(value); setError('') } })
      .catch(err => { if (mounted) setError(err.message) })
      .finally(() => { if (mounted) { initialized.current = true; setRefreshing(false) } })
    return () => { mounted = false }
  }, [open])

  async function connect(login = false) {
    setConnecting(true)
    setError(''); setNotice('')
    try {
      const result = await (login ? llmClient.loginCodex() : llmClient.connectCodex())
      // Connection responses describe the saved provider, not this unsaved form.
      setSettings(result.session)
      if (result.session.providers.codex?.connection?.state !== 'signed_out') setAuthUrl('')
      setModel(previous => codexModel(result.session.providers.codex, previous))
      if (login && result.authUrl) {
        const url = safeAuthUrl(result.authUrl)
        if (!url) {
          setAuthUrl('')
          throw new Error('The local service did not return a valid sign-in link. Refresh the connection and try again.')
        }
        if (result.session.providers.codex?.connection?.state === 'signed_out') setAuthUrl(url)
      }
    } catch (err) { setError(err.message) }
    finally { setConnecting(false) }
  }

  async function save(forgetKey = false) {
    if (isCodex && !validCodexModel) return
    setSaving(true)
    setError('')
    setNotice('')
    const pendingKey = key.trim()
    setKey('')
    try {
      const value = await llmClient.saveSettings({ provider, model: model.trim(), ...(!isCodex ? forgetKey ? { forgetKey: true } : pendingKey ? { apiKey: pendingKey } : {} : {}) })
      applySettings(value)
      setNotice(isCodex ? 'Settings saved. No Codex generation test was run.' : forgetKey ? 'Session key forgotten. Any server environment key still applies.' : 'Settings saved. No paid connection test was run.')
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="provider-settings text-sm">
      <ModelSettingsButton settings={settings} error={error} onOpen={onOpen} />
      {open && <Modal labelledBy="model-settings-title" onClose={() => { setKey(''); onClose() }} className="settings-dialog">
        <div className="dialog-heading">
          <div><h2 id="model-settings-title">Model settings</h2><p>{settings?.providers.codex ? 'Choose the model and connection behind your workspace.' : 'Bring your own API key. Choose the model behind your workspace.'}</p></div>
          <button type="button" className="icon-button" aria-label="Close model settings" onClick={() => { setKey(''); onClose() }}>×</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <form autoComplete="off" onSubmit={event => { event.preventDefault(); save() }}>
            <fieldset disabled={disabled || saving || refreshing || connecting || !settings} className="settings-fields disabled:opacity-60" style={isCodex ? { '--settings-provider-width': '220px' } : undefined}>
              <div className="flex flex-col gap-1 text-gray-300">
                <label htmlFor="model-provider">Provider</label>
                <select id="model-provider" className="input-dark" value={provider} onChange={event => {
                  const next = event.target.value
                  setProvider(next); setModel(next === 'codex' ? codexModel(settings.providers.codex) : settings.providers[next].modelOverride)
                  setKey(''); setNotice(''); setError('')
                }}>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  {settings?.providers.codex && <option value="codex">Codex (experimental)</option>}
                </select>
              </div>
              {isCodex ? <div className="flex flex-col gap-1 text-gray-300 min-w-0">
                <label htmlFor="codex-model">Model</label>
                <select id="codex-model" className="input-dark" value={model} onChange={event => setModel(event.target.value)} aria-describedby="codex-model-status">
                  <option value="">Choose a model</option>
                  {(connection?.models || []).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name || candidate.id}</option>)}
                </select>
              </div> : <label className="flex flex-col gap-1 text-gray-300 min-w-0">
                Model ID
                <input className="input-dark" value={model} placeholder={selected?.model || ''} onChange={event => setModel(event.target.value)} autoComplete="off" spellCheck={false} />
              </label>}
              {isCodex ? <>
                <div className="settings-key space-y-2 text-gray-300" aria-busy={connecting}>
                  <p role="status">{connectionLabels[connectionState] || connectionLabels.unavailable}</p>
                  {connection?.message && <p className="text-xs text-gray-400">{connection.message}</p>}
                  {connectionState === 'api_key' && <p className="text-xs text-gray-400">This connection supports ChatGPT authentication only. API-key authentication cannot be used with this prototype.</p>}
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="btn-secondary" onClick={() => connect()}>{connectionState === 'not_connected' ? 'Connect' : 'Refresh connection'}</button>
                    {connectionState === 'signed_out' && <button type="button" className="btn-secondary" onClick={() => connect(true)}>Sign in with ChatGPT</button>}
                  </div>
                  {authUrl && <p className="text-xs text-gray-300">
                    <a href={authUrl} target="_blank" rel="noopener noreferrer" className="text-helios-300 underline">Continue ChatGPT sign-in</a>
                    {' '}Then return here and select Refresh connection.
                  </p>}
                  <p id="codex-model-status" className="text-xs text-gray-400">{connectionState === 'connected'
                    ? 'Generation not tested. Authentication detected does not guarantee model access or a successful request. Choose an available model before saving.'
                    : 'Connect with ChatGPT to discover available models before saving.'}</p>
                </div>
                <div className="settings-key space-y-2 text-xs text-gray-400">
                  <p>Uses your Codex allowance. No separate provider API key is used for this connection. Limits and model access depend on your account.</p>
                  <p>This experimental connection uses a dedicated app profile with a one-time managed ChatGPT login. Your normal Codex setup is left untouched.</p>
                </div>
              </> : <div className="settings-key flex flex-col gap-1 text-gray-300 min-w-0">
                <label htmlFor="session-api-key">Session API key</label>
                {/* The fixed mask is only a placeholder, never a stored or submitted key. */}
                <input id="session-api-key" className="input-dark" type="password" value={key} onChange={event => setKey(event.target.value)} placeholder={selected?.keySource ? '********' : 'Enter your provider API key'} aria-describedby="session-key-status" autoComplete="off" spellCheck={false} />
                <p id="session-key-status" className="text-xs text-gray-400" aria-live="polite">
                  {selected?.keySource ? 'Key configured. Leave blank to keep it, or enter a new key to replace it.' : 'Enter a key, then save settings to use this provider.'}
                </p>
              </div>}
              <button type="submit" disabled={isCodex && !validCodexModel} className="btn-helios justify-self-start">{saving ? 'Saving...' : 'Save settings'}</button>
              {!isCodex && selected?.keySource === 'session' && <button type="button" className="text-gray-300 underline py-2" onClick={() => save(true)}>Forget session key</button>}
            </fieldset>
          </form>
          {!isCodex && <><p className="text-xs text-gray-400">
            {selected?.keySource === 'environment' ? 'Using a server environment key.' : selected?.keySource === 'session' ? 'Using a key held in local-server memory for this session.' : 'No key configured for this provider.'}
            {' '}Leave Model ID blank to use server defaults. Model access and API billing depend on your provider account.
          </p>
          <p className="text-xs text-gray-400 max-w-4xl">
            Keys go to your local server and selected provider, never browser storage. Session keys expire after one hour idle or when the server stops. Generated code runs in an isolated worker; this app is intended for local use.
          </p></>}
          {(error || requests.requiresConfirmation) && <div role="alert" className="text-red-300">{error || 'Session expired. Reconnect, then save your provider/model choice before generating again.'} <button type="button" className="underline" onClick={async () => {
            try { applySettings(await llmClient.getSession()); setError('') } catch (err) { setError(err.message) }
          }}>Reconnect</button></div>}
          {notice && <p role="status" className="text-helios-300">{notice}</p>}
          {requests.lastResponse && <p className="text-xs text-gray-400">Last response: {names[requests.lastResponse.provider]} / {requests.lastResponse.model}.
            {' '}Tokens: {requests.lastResponse.usage?.input_tokens ?? '?'} input, {requests.lastResponse.usage?.output_tokens ?? '?'} output.
          </p>}
        </div>
      </Modal>}
      {!open && error && <p role="alert" className="connection-error">{error}</p>}
    </div>
  )
}

/** Request controls stay visible even when connection settings are closed. */
export function RequestStatus({ disabled, onCancelRequest, onOpenSettings }) {
  const requests = useSyncExternalStore(llmClient.subscribe, llmClient.getSnapshot, llmClient.getSnapshot)
  return <>
      <GenerationProgress active={disabled} onCancelRequest={onCancelRequest} />
      {requests.requiresConfirmation && <p role="alert" className="request-status text-amber-300">Session expired. Confirm your provider settings before generating again. <button className="underline" onClick={onOpenSettings}>Reconnect</button></p>}
  </>
}
