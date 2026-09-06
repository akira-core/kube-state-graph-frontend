import { expect, test } from '@playwright/test';

test('storage-graph is lazy and draws fixture tiers after az/env are selected', async ({ page }) => {
  const storageUrls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('storage-graph')) {
      storageUrls.push(request.url());
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
        refreshIntervalSeconds: 0,
      }),
    });
  });
  await page.route('**/prom/api/v1/label/*/values**', async (route) => {
    const url = route.request().url();
    const data = url.includes('/label/az/')
      ? ['local-a', 'zone-b']
      : url.includes('/label/env/')
        ? ['demo', 'prod']
        : ['prod'];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data }),
    });
  });

  await page.goto('/graph');
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  expect(storageUrls).toHaveLength(0);

  await page.getByRole('link', { name: 'Sankey' }).click();
  await expect(page.getByTestId('sankey-view')).toBeVisible();
  expect(storageUrls).toHaveLength(0);

  await page.getByRole('button', { name: 'AZ' }).click();
  await page.getByRole('option', { name: 'local-a' }).click();
  await page.getByRole('button', { name: 'Env' }).click();
  await page.getByRole('option', { name: 'demo' }).click();
  await expect.poll(() => storageUrls.length).toBe(1);
  await expect(page.getByTestId('sankey-node-aggr1')).toBeVisible();
  await expect(page.getByTestId('sankey-node-svm_shop')).toBeVisible();
  await expect(page.getByTestId('sankey-node-mongo-0')).toBeVisible();
  await expect(page.getByTestId('sankey-node-mongodb')).toBeVisible();
  await expect(page.getByTestId('sankey-node-prod')).toBeVisible();
  await page.getByTestId('sankey-layout').getByText('Node', { exact: true }).click();
  await expect(page.getByTestId('sankey-wrapper-title-worker-0')).toBeVisible();
});
