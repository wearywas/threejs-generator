import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { llmClient } from '../api/llmClient'
import Modal from './Modal'
import GenerationProgress from './GenerationProgress'

const names = { anthropic: 'Anthropic', openai: 'OpenAI' }

/** Key presence is reported by the server; it is not a paid connection test. */
export function ModelSettingsButton({ settings, error, onOpen }) {
  const active = settings?.providers[settings.provider]
  const hasKey = Boolean(active?.keySource)
  const label = settings ? `${names[settings.provider]} / ${active.model}` : 'Connect'
  const keyStatus = !settings
    ? error ? 'Unable to check API key configuration. Open Model settings to reconnect.' : 'Checking API key configuration...'
    : hasKey
      ? `${names[settings.provider]}: API key configured (${active.keySource === 'environment' ? 'server environment' : 'session entry'}). Connection not tested.`
      : `${names[settings.provider]}: No API key configured. Open Model settings to add a key.`

  return <button type="button" onClick={onOpen} className="model-trigger" aria-haspopup="dialog" aria-label={`Model settings: ${label}`} aria-description={keyStatus} title={keyStatus}>
    <span className={`connection-dot${hasKey ? ' is-connected' : ''}`} aria-hidden="true" />
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
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requests = useSyncExternalStore(llmClient.subscribe, llmClient.getSnapshot, llmClient.getSnapshot)
  const selected = settings?.providers[provider]

  function applySettings(value) {
    setSettings(value)
    setProvider(value.provider)
    setModel(value.providers[value.provider].modelOverride)
  }
  useEffect(() => {
    let mounted = true
    llmClient.getSession().then(value => { if (mounted) applySettings(value) }).catch(err => { if (mounted) setError(err.message) })
    return () => { mounted = false }
  }, [])

  async function save(forgetKey = false) {
    setSaving(true)
    setError('')
    setNotice('')
    const pendingKey = key.trim()
    setKey('')
    try {
      const value = await llmClient.saveSettings({ provider, model: model.trim(), ...(forgetKey ? { forgetKey: true } : pendingKey ? { apiKey: pendingKey } : {}) })
      applySettings(value)
      setNotice(forgetKey ? 'Session key forgotten. Any server environment key still applies.' : 'Settings saved. No paid connection test was run.')
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="provider-settings text-sm">
      <ModelSettingsButton settings={settings} error={error} onOpen={onOpen} />
      {open && <Modal labelledBy="model-settings-title" onClose={() => { setKey(''); onClose() }} className="settings-dialog">
        <div className="dialog-heading">
          <div><h2 id="model-settings-title">Model settings</h2><p>Bring your own API key. Choose the model behind your workspace.</p></div>
          <button type="button" className="icon-button" aria-label="Close model settings" onClick={() => { setKey(''); onClose() }}>×</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <form autoComplete="off" onSubmit={event => { event.preventDefault(); save() }}>
            <fieldset disabled={disabled || saving || !settings} className="settings-fields disabled:opacity-60">
              <div className="flex flex-col gap-1 text-gray-300">
                <label htmlFor="model-provider">Provider</label>
                <select id="model-provider" className="input-dark" value={provider} onChange={event => {
                  const next = event.target.value
                  setProvider(next); setModel(settings.providers[next].modelOverride); setKey(''); setNotice(''); setError('')
                }}>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <label className="flex flex-col gap-1 text-gray-300 min-w-0">
                Model ID
                <input className="input-dark" value={model} placeholder={selected?.model || ''} onChange={event => setModel(event.target.value)} autoComplete="off" spellCheck={false} />
              </label>
              <div className="settings-key flex flex-col gap-1 text-gray-300 min-w-0">
                <label htmlFor="session-api-key">Session API key</label>
                {/* The fixed mask is only a placeholder, never a stored or submitted key. */}
                <input id="session-api-key" className="input-dark" type="password" value={key} onChange={event => setKey(event.target.value)} placeholder={selected?.keySource ? '********' : 'Enter your provider API key'} aria-describedby="session-key-status" autoComplete="off" spellCheck={false} />
                <p id="session-key-status" className="text-xs text-gray-400" aria-live="polite">
                  {selected?.keySource ? 'Key configured. Leave blank to keep it, or enter a new key to replace it.' : 'Enter a key, then save settings to use this provider.'}
                </p>
              </div>
              <button type="submit" className="btn-helios justify-self-start">{saving ? 'Saving...' : 'Save settings'}</button>
              {selected?.keySource === 'session' && <button type="button" className="text-gray-300 underline py-2" onClick={() => save(true)}>Forget session key</button>}
            </fieldset>
          </form>
          <p className="text-xs text-gray-400">
            {selected?.keySource === 'environment' ? 'Using a server environment key.' : selected?.keySource === 'session' ? 'Using a key held in local-server memory for this session.' : 'No key configured for this provider.'}
            {' '}Leave Model ID blank to use server defaults. Model access and API billing depend on your provider account.
          </p>
          <p className="text-xs text-gray-400 max-w-4xl">
            Keys go to your local server and selected provider, never browser storage. Session keys expire after one hour idle or when the server stops. Generated code runs in an isolated worker; this app is intended for local use.
          </p>
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
