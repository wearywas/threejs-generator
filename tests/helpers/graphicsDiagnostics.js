/** Optional CI evidence must not prevent the functional browser test running. */
export async function collectGraphicsDiagnostics(browser, testInfo) {
  let cdp, timer, finished = false
  const collect = async () => {
    cdp = await browser.newBrowserCDPSession()
    if (finished) { void cdp.detach().catch(() => {}); return }
    const [{ gpu }, { processInfo }] = await Promise.all([
      cdp.send('SystemInfo.getInfo'), cdp.send('SystemInfo.getProcessInfo'),
    ])
    if (finished) return
    const details = {
      browser: browser.version(),
      processes: processInfo.filter(process => ['browser', 'GPU'].includes(process.type)),
      devices: gpu.devices,
      renderer: gpu.auxAttributes?.glRenderer,
      vendor: gpu.auxAttributes?.glVendor,
      features: gpu.featureStatus,
    }
    console.log(`[Browser isolation] ${JSON.stringify({ processes: details.processes.map(({ type, id }) => ({ type, id })), renderer: details.renderer })}`)
    await testInfo.attach('graphics-backend', { body: Buffer.from(JSON.stringify(details, null, 2)), contentType: 'application/json' })
  }
  try {
    await Promise.race([
      collect(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Graphics diagnostics timed out')), 5000) }),
    ])
  } catch (error) { console.warn(`[Browser isolation] Diagnostics unavailable: ${error.message}`) }
  finally {
    finished = true
    clearTimeout(timer)
    // Browser ownership remains with the fixture; even detach must not stall it.
    void cdp?.detach().catch(() => {})
  }
}
