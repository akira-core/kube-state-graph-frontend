import { expect, test, type Page } from '@playwright/test';

const HOSTNAME = 'sw%2Fdist-a';

async function stubConfig(
  page: Page,
  { demoMode = false, refreshIntervalSeconds = 0 }: { demoMode?: boolean; refreshIntervalSeconds?: number } = {}
): Promise<{ trace: string[] }> {
  const trace: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/demo/trace.json')) {
      trace.push(request.url());
    }
  });
  await page.route('**/config.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        demoMode,
        endpoints: {
          graph: '/demo/graph.json',
          storageGraph: '/demo/storage-graph.json',
          trace: '/demo/trace.json',
          labelValues: '/prom',
        },
        theme: 'system',
        defaultLayout: 'fcose',
        refreshIntervalSeconds,
      }),
    });
  });
  await page.route('**/prom/api/v1/label/*/values**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: ['prod'] }),
    });
  });
  return { trace };
}

// The bundled fixture is a destination trace (its start switch investigates an `in`
// interface), so it only draws under `track_dir=destination`; the default `source` walks
// it the other way and the hosts become leaves with onward edges. The stubbed endpoint
// answers the same body whatever was asked, so the drawing tests ask for `destination`.
const DRAWABLE_SCOPE = `hostname=${HOSTNAME}&track_dir=destination`;

test('network sankey mount issues 0 requests until Query; views and Min Δ share the one payload', async ({ page }) => {
  const urls = await stubConfig(page);
  await page.goto(`/network/sankey?${DRAWABLE_SCOPE}&from=now-1h&to=now`);
  await expect(page.getByTestId('trace-empty-awaiting')).toBeVisible({ timeout: 30_000 });
  expect(urls.trace).toHaveLength(0);
  expect(page.getByRole('button', { name: 'Reload data' })).toBeDisabled();

  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByTestId('sankey-svg')).toBeVisible({ timeout: 30_000 });
  expect(urls.trace).toHaveLength(1);
  const request = urls.trace[0] ?? '';
  expect(request).toContain(`hostname=${HOSTNAME}`);
  expect(request).toContain('max_hops=7');
  expect(request).toContain('top_n=3');
  expect(request).toContain('threshold=10');
  expect(request).toContain('track_dir=destination');
  expect(request).toMatch(/[?&]from_ts=\d{13}(&|$)/);
  expect(request).toMatch(/[?&]to_ts=\d{13}(&|$)/);
  await expect(page).toHaveURL(new RegExp(`hostname=${HOSTNAME}`));
  await expect(page).toHaveURL(/track_dir=destination/);

  // The Graph view of the same category draws the held payload: no request of its own.
  await page.getByTestId('nav-view').getByRole('link', { name: 'Graph' }).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  expect(urls.trace).toHaveLength(1);
  await expect(page).toHaveURL(/\/network\/graph\?/);
  await expect(page).toHaveURL(/hostname=/);

  await page.getByTestId('nav-view').getByRole('link', { name: 'Sankey' }).click();
  await expect(page.getByTestId('sankey-svg')).toBeVisible();
  expect(urls.trace).toHaveLength(1);

  // Min Δ is a display value: it redraws, writes the URL, and sends nothing.
  await page.getByTestId('trace-min-bps').fill('5000000000');
  await expect(page.getByTestId('trace-filtered-pill')).toBeVisible();
  await expect(page).toHaveURL(/min_bps=5000000000/);
  expect(urls.trace).toHaveLength(1);
  await page.getByTestId('trace-min-bps-clear').click();
  await expect(page.getByTestId('trace-filtered-pill')).toHaveCount(0);
  await expect(page).not.toHaveURL(/min_bps=/);
  expect(urls.trace).toHaveLength(1);
});

test('a deep link with only a hostname sends every default explicitly', async ({ page }) => {
  const urls = await stubConfig(page);
  await page.goto(`/network/sankey?hostname=${HOSTNAME}`);
  await expect(page.getByTestId('trace-empty-awaiting')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Query' }).click();
  await expect.poll(() => urls.trace.length).toBe(1);
  const request = urls.trace[0] ?? '';
  expect(request).toContain('max_hops=7');
  expect(request).toContain('top_n=3');
  expect(request).toContain('threshold=10');
  expect(request).toContain('track_dir=source');
  expect(request).toMatch(/[?&]from_ts=\d{13}(&|$)/);
  expect(request).toMatch(/[?&]to_ts=\d{13}(&|$)/);
  // Defaults are not written back to the address bar.
  await expect(page).toHaveURL(new RegExp(`hostname=${HOSTNAME}`));
  await expect(page).not.toHaveURL(/max_hops=|top_n=|threshold=|track_dir=/);
});

test('Cancel during a slow trace response keeps the previous drawing', async ({ page }) => {
  const urls = await stubConfig(page, { refreshIntervalSeconds: 5 });
  await page.goto(`/network/sankey?${DRAWABLE_SCOPE}`);
  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByTestId('sankey-svg')).toBeVisible({ timeout: 30_000 });
  expect(urls.trace).toHaveLength(1);

  await page.route('**/demo/trace.json**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('sankey-svg')).toBeVisible();
  await expect(page.getByTestId('nav-status-readout')).toContainText('cancelled');
  const afterCancel = urls.trace.length;
  await page.waitForTimeout(6000);
  expect(urls.trace).toHaveLength(afterCancel);
  await expect(page.getByRole('button', { name: 'Query' })).toBeVisible();
});

test('an invalid URL value disables Query with its reason and sends nothing', async ({ page }) => {
  const urls = await stubConfig(page);
  await page.goto('/network/sankey?hostname=x&max_hops=abc');
  await expect(page.getByTestId('trace-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Query' })).toBeDisabled();
  await expect(page.getByTestId('query-disabled-reason')).toHaveText('Max hops must be a positive integer');
  await expect(page.getByTestId('trace-empty-scope')).toBeVisible();
  await expect(page).toHaveURL(/max_hops=abc/);
  expect(urls.trace).toHaveLength(0);
});

test('/network redirects to /network/graph keeping the query', async ({ page }) => {
  await stubConfig(page);
  await page.goto(`/network?hostname=${HOSTNAME}`);
  await expect(page).toHaveURL(/\/network\/graph\?/);
  await expect(page).toHaveURL(new RegExp(`hostname=${HOSTNAME}`));
  await expect(page.getByTestId('trace-controls')).toBeVisible({ timeout: 30_000 });
});

test('demo mode draws the trace fixture on both Network views without a Query control', async ({ page }) => {
  const urls = await stubConfig(page, { demoMode: true });
  await page.goto('/network/sankey');
  await expect(page.getByTestId('sankey-svg')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Query' })).toHaveCount(0);
  await expect(page.getByTestId('trace-legend-back')).toBeVisible();
  await expect(page.getByTestId('trace-legend-own')).toBeVisible();
  await expect(page.getByTestId('trace-legend-lateral')).toBeVisible();
  // The merged sankey-panel samples: the dci-uturn start, and the stitched k8s / client ToRs.
  await expect(page.getByTestId('trace-node-Core 1')).toBeVisible();
  await expect(page.getByTestId('trace-node-ToR k8s (k8s)')).toBeVisible();
  await expect(page.getByTestId('trace-node-kafka-2')).toBeVisible();
  await expect(page.getByTestId('trace-node-網管部 王小明')).toBeVisible();

  // No sample places pods on k8s nodes, so the Node layout draws no frame and the chart stays.
  await page.getByTestId('trace-layout').getByText('Node', { exact: true }).click();
  await expect(page.getByTestId('sankey-svg')).toBeVisible();
  await expect(page.locator('[data-testid^="trace-wrapper-"]')).toHaveCount(0);

  await page.getByTestId('nav-view').getByRole('link', { name: 'Graph' }).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  expect(urls.trace).toHaveLength(0);
});
