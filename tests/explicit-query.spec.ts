import { expect, test, type Page } from '@playwright/test';

async function stubLiveConfig(page: Page, refreshIntervalSeconds = 0): Promise<{ graph: string[]; storage: string[] }> {
  const graph: string[] = [];
  const storage: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/demo/graph.json')) {
      graph.push(url);
    }
    if (url.includes('/demo/storage-graph.json')) {
      storage.push(url);
    }
  });
  await page.route('**/config.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        demoMode: false,
        endpoints: {
          graph: '/demo/graph.json',
          storageGraph: '/demo/storage-graph.json',
          labelValues: '/prom',
        },
        theme: 'system',
        defaultLayout: 'fcose',
        refreshIntervalSeconds,
      }),
    });
  });
  await page.route('**/prom/api/v1/label/*/values**', async (route) => {
    const url = route.request().url();
    const data = url.includes('/label/az/')
      ? ['local-a', 'zone-b']
      : url.includes('/label/env/')
        ? ['demo', 'prod']
        : url.includes('/label/namespace/')
          ? ['shop', 'infra']
          : ['prod'];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data }),
    });
  });
  return { graph, storage };
}

test('graph mount with a complete URL scope issues 0 requests until Query', async ({ page }) => {
  const urls = await stubLiveConfig(page);
  await page.goto('/graph?namespace=shop&from=now-1h&to=now');
  await expect(page.getByTestId('graph-awaiting-query')).toBeVisible({ timeout: 30_000 });
  expect(urls.graph).toHaveLength(0);
  expect(page.getByRole('button', { name: 'Reload data' })).toBeDisabled();
  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  expect(urls.graph).toHaveLength(1);
  expect(urls.graph[0]).toContain('namespace=shop');
  await expect(page).toHaveURL(/namespace=shop/);
  await page.getByTestId('filter-namespace').click();
  await page.getByRole('option', { name: 'infra' }).click();
  expect(urls.graph).toHaveLength(1);
  await expect(page.getByTestId('query-button')).toHaveAttribute('data-dirty', 'true');
});

test('Cancel during a slow response keeps the previous drawing', async ({ page }) => {
  const urls = await stubLiveConfig(page, 5);
  await page.goto('/graph');
  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  const afterFirst = urls.graph.length;
  expect(afterFirst).toBe(1);

  await page.route('**/demo/graph.json**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
  await expect(page.getByTestId('nav-status-readout')).toContainText('cancelled');
  const afterCancel = urls.graph.length;
  await page.waitForTimeout(6000);
  expect(urls.graph).toHaveLength(afterCancel);
  await expect(page.getByRole('button', { name: 'Query' })).toBeVisible();
});

test('sankey mount with a complete URL scope issues 0 requests until Query', async ({ page }) => {
  const urls = await stubLiveConfig(page);
  await page.goto('/sankey?az=local-a&env=demo&aggr=aggr1');
  await expect(page.getByTestId('sankey-empty-awaiting')).toBeVisible({ timeout: 30_000 });
  expect(urls.storage).toHaveLength(0);
  expect(page.getByRole('button', { name: 'Reload data' })).toBeDisabled();
  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByTestId('sankey-svg')).toBeVisible({ timeout: 30_000 });
  expect(urls.storage).toHaveLength(1);
  expect(urls.storage[0]).toContain('az=local-a');
  expect(urls.storage[0]).toContain('env=demo');
  expect(urls.storage[0]).toContain('aggr=aggr1');
});
