import React from 'react'
import './recovery.css'

/** Recovery is not a Library save or a portable backup. Restore is always explicit. */
export default function WorkspaceRecovery({ recovery, restoring, onRestore, onCancel }) {
  const { candidate, status, error, conflict, controller } = recovery
  if (candidate) return (
    <section className="workspace-recovery" aria-label="Workspace recovery">
      <div>
        <strong>Pick up where you left off</strong>
        {candidate.document && <p className="recovery-prompt">{candidate.document.prompt || 'Untitled asset'}</p>}
        {candidate.document && <p>Your last working asset{candidate.draftCode != null ? ' and unapplied code draft' : ''} is saved in this browser. Restoring uses no AI credits.</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="recovery-actions">
        {candidate.document && <button type="button" className="btn-helios" disabled={restoring || status === 'discarding'} onClick={onRestore}>{restoring ? 'Restoring...' : 'Restore workspace'}</button>}
        {restoring ? <button type="button" className="btn-secondary" onClick={onCancel}>Cancel restore</button> :
          <button type="button" className="btn-secondary" disabled={status === 'discarding'} onClick={() => controller.discard()}>Discard recovery</button>}
      </div>
    </section>
  )
  if (error) return (
    <div className="workspace-recovery recovery-warning" role="alert">
      <p>Changes are not protected by local recovery. {error}</p>
      {!conflict && <button type="button" className="btn-secondary" onClick={() => controller.retry()}>Retry recovery save</button>}
    </div>
  )
  return null
}

export function RecoveryStatus({ status }) {
  if (status !== 'saved' && status !== 'saving') return null
  return (
    <p className="recovery-status" role="status" aria-label="Recovery status">
      {status === 'saved' ? 'Recovery saved in this browser' : 'Saving recovery...'}
      <span>Save to Library to keep a named copy. Download or back up your Library to move between computers.</span>
    </p>
  )
}
