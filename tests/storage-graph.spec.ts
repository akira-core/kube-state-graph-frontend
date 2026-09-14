import { expect, test, type Page } from '@playwright/test';

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
  await expect(page.getByTestId('filter-bar')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  expect(storageUrls).toHaveLength(0);

  await page.getByRole('link', { name: 'Sankey' }).click();
  await expect(page.getByTestId('sankey-view')).toBeVisible();
  expect(storageUrls).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Query' })).toBeDisabled();

  await page.getByRole('button', { name: 'AZ' }).click();
  await page.getByRole('option', { name: 'local-a' }).click();
  await page.getByRole('button', { name: 'Env' }).click();
  await page.getByRole('option', { name: 'demo' }).click();
  expect(storageUrls).toHaveLength(0);
  await page.getByRole('button', { name: 'Root value' }).click();
  await page.getByRole('combobox', { name: 'Search Root value' }).fill('aggr1');
  await page.getByRole('option', { name: 'Use "aggr1"' }).click();
  await page.getByRole('button', { name: 'Query' }).click();
  await expect.poll(() => storageUrls.length).toBe(1);
  await expect(page.getByTestId('sankey-node-aggr1')).toBeVisible();
  await expect(page.getByTestId('sankey-node-svm_shop')).toBeVisible();
  await expect(page.getByTestId('sankey-node-mongo-0')).toBeVisible();
  await expect(page.getByTestId('sankey-node-mongodb')).toBeVisible();
  await expect(page.getByTestId('sankey-node-prod')).toBeVisible();
  await page.getByTestId('sankey-layout').getByText('Node', { exact: true }).click();
  await expect(page.getByTestId('sankey-wrapper-title-worker-0')).toBeVisible();

  await page.getByTestId('sankey-root-kind').click();
  await page.getByRole('option', { name: 'Aggregate' }).click();
  await page.getByTestId('sankey-root-value').click();
  await page.getByRole('option', { name: 'aggr2' }).click();
  await expect(page.getByRole('button', { name: /aggr:aggr2/ })).toBeVisible();
  expect(storageUrls).toHaveLength(1);

  await page.getByTestId('sankey-top-pods').fill('25');
  await expect(page).toHaveURL(/top_pods=25/);
  expect(storageUrls).toHaveLength(1);

  await page.getByTestId('sankey-root-kind').click();
  await page.getByRole('option', { name: 'Pod' }).click();
  await page.getByTestId('sankey-root-value').click();
  await page.getByRole('combobox', { name: 'Search Root value' }).fill('shop/orders-0');
  await page.getByRole('option', { name: 'Use "shop/orders-0"' }).click();
  await expect(page.getByTestId('sankey-top-pods')).toBeDisabled();
});

function fifteenPodStorageGraph(): object {
  const nodes: object[] = [
    { data: { id: 'nn/n1', name: 'n1', type: 'netapp-node' } },
    { data: { id: 'na/a1', name: 'a1', type: 'netapp-aggr' } },
    { data: { id: 'ns/s1', name: 's1', type: 'netapp-svm' } },
  ];
  const edges: object[] = [
    {
      data: {
        id: 'e-na',
        type: 'storage-flow',
        source: 'nn/n1',
        target: 'na/a1',
        labels: { tier: 'node-aggr' },
        metrics: { read_bytes_per_sec: 1000, write_bytes_per_sec: 1 },
      },
    },
    {
      data: {
        id: 'e-as',
        type: 'storage-flow',
        source: 'na/a1',
        target: 'ns/s1',
        labels: { tier: 'aggr-svm' },
        metrics: { read_bytes_per_sec: 1000, write_bytes_per_sec: 1 },
      },
    },
  ];
  for (let i = 0; i < 15; i += 1) {
    nodes.push({ data: { id: `pvc/${String(i)}`, name: `pvc-${String(i)}`, type: 'pvc' } });
    nodes.push({
      data: {
        id: `pod/${String(i)}`,
        name: `pod-${String(i)}`,
        type: 'pod',
        labels: { namespace: 'ns' },
      },
    });
    edges.push({
      data: {
        id: `sp-${String(i)}`,
        type: 'storage-flow',
        source: 'ns/s1',
        target: `pvc/${String(i)}`,
        labels: { tier: 'svm-pvc' },
        metrics: { read_bytes_per_sec: 100 - i, write_bytes_per_sec: 1 },
      },
    });
    edges.push({
      data: {
        id: `pp-${String(i)}`,
        type: 'storage-flow',
        source: `pvc/${String(i)}`,
        target: `pod/${String(i)}`,
        labels: { tier: 'pvc-pod' },
        metrics: { read_bytes_per_sec: 100 - i, write_bytes_per_sec: 1 },
      },
    });
  }
  return { apiVersion: 'v1', elements: { nodes, edges } };
}

/** Points a live config at the fifteen-pod store; returns the storage-graph URLs requested so far. */
async function routeFifteenPodStore(page: Page): Promise<string[]> {
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
          storageGraph: '/demo/large-storage-graph.json',
          labelValues: '/prom',
        },
        theme: 'system',
        defaultLayout: 'fcose',
        refreshIntervalSeconds: 0,
      }),
    });
  });
  await page.route('**/prom/api/v1/label/*/values**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: ['local-a'] }),
    });
  });
  await page.route('**/demo/large-storage-graph.json**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fifteenPodStorageGraph()),
    });
  });
  return storageUrls;
}

test('default Top pods cut draws 10 of 15 and writes top_pods without a request', async ({ page }) => {
  const storageUrls = await routeFifteenPodStore(page);

  await page.goto('/sankey?az=local-a&env=local-a&aggr=a1');
  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByTestId('sankey-svg')).toBeVisible({ timeout: 30_000 });
  expect(storageUrls).toHaveLength(1);
  await expect(page.locator('[data-testid^="sankey-node-"][data-kind="pod"]')).toHaveCount(10);
  await expect(page.getByTestId('sankey-summary')).toContainText('10 of 15 pods');
  await expect(page.getByTestId('sankey-top-pods-label')).toContainText('Top 10 pods');

  await page.getByTestId('sankey-top-pods').fill('25');
  await expect(page).toHaveURL(/top_pods=25/);
  expect(storageUrls).toHaveLength(1);
  await expect(page.locator('[data-testid^="sankey-node-"][data-kind="pod"]')).toHaveCount(15);
  await expect(page.getByTestId('sankey-summary')).not.toContainText('of 15 pods');
});

test('a pod root added to the draft leaves the drawn Top pods cut in place until Query', async ({ page }) => {
  const storageUrls = await routeFifteenPodStore(page);

  await page.goto('/sankey?az=local-a&env=local-a&aggr=a1');
  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByTestId('sankey-svg')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid^="sankey-node-"][data-kind="pod"]')).toHaveCount(10);

  // pod-12 is outside the top 10 — the root a user reaches for when the cut hides it.
  await page.getByTestId('sankey-root-kind').click();
  await page.getByRole('option', { name: 'Pod' }).click();
  await page.getByTestId('sankey-root-value').click();
  await page.getByRole('combobox', { name: 'Search Root value' }).fill('ns/pod-12');
  await page.getByRole('option', { name: 'ns/pod-12', exact: true }).click();
  await expect(page.getByRole('button', { name: /pod:ns\/pod-12/ })).toBeVisible();

  await expect(page.locator('[data-testid^="sankey-node-"][data-kind="pod"]')).toHaveCount(10);
  await expect(page.getByTestId('sankey-summary')).toContainText('10 of 15 pods');
  expect(storageUrls).toHaveLength(1);
});
