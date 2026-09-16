// This function becomes the only script in an opaque-origin iframe. Generated
// source is never evaluated here, and the worker's private port is transferred away.
function broker() {
  let worker
  addEventListener('message', function connect(event) {
    if (event.source !== parent || worker || event.data?.type !== 'connect' || !event.ports[0]) return
    removeEventListener('message', connect)
    const url = URL.createObjectURL(new Blob([event.data.source], { type: 'text/javascript' }))
    worker = new Worker(url)
    const lifetime = event.ports[1]
    lifetime.onmessage = () => { worker.terminate(); URL.revokeObjectURL(url); lifetime.close() }
    worker.postMessage({ port: event.ports[0] }, [event.ports[0]])
    // Removing the frame also destroys its worker if the host disappears.
  })
  parent.postMessage({ type: 'asset-broker-ready' }, '*')
}

/** No same-origin, navigation, forms, downloads, popups, or external connections. */
export function createBrokerDocument(nonce) {
  const csp = `default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src data: blob:; style-src 'none'; base-uri 'none'; form-action 'none'`
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><script nonce="${nonce}">(${broker.toString()})()</script>`
}
