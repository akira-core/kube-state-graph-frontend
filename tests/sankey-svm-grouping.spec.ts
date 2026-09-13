import { expect, test, type Page } from '@playwright/test';

test('demo mode: SVM display Group draws frames straight from each aggregate, no request, resets on refresh', async ({
  page,
}) => {
  const storageUrls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('storage-graph')) {
      storageUrls.push(request.url());
    }
  });

  await page.goto('/sankey');
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
  expect(storageUrls).toHaveLength(0);

  await expect(page.getByRole('radio', { name: /^column$/i })).toBeChecked();
  await page.getByTestId('sankey-svm-display').getByText('Group', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /^group$/i })).toBeChecked();

  // The svm_shop frame holds its three PVCs; the SVM column and header are gone.
  await expect(page.getByTestId('sankey-wrapper-title-svm_shop')).toBeVisible();
  await expect(page.getByTestId('sankey-wrapper-title-svm_shop')).toHaveAttribute('data-locatable', 'false');
  await expect(page.getByTestId('sankey-node-data-mongo-0')).toBeVisible();
  await expect(page.getByTestId('sankey-node-data-mongo-1')).toBeVisible();
  await expect(page.getByTestId('sankey-node-data-scratch')).toBeVisible();
  await expect(page.getByTestId('sankey-node-svm_shop')).toHaveCount(0);

  const headers = await page.getByTestId('sankey-column-header').allTextContents();
  expect(headers).not.toContain('SVM');
  expect(headers).toContain('SVM / PVC');

  // aggr1 -> data-mongo-0 is a direct ribbon: hovering aggr1 lights data-mongo-0's own
  // claim and fades the other aggregate's, exactly as a direct ribbon (not a shared SVM
  // fan-out) would.
  await page.getByTestId('sankey-node-aggr1').hover();
  await expect(page.getByTestId('sankey-node-data-mongo-0')).toHaveCSS('opacity', '1');
  await expect(page.getByTestId('sankey-node-data-mongo-1')).toHaveCSS('opacity', '0.3');
  await page.mouse.move(0, 0);

  await page.getByTestId('sankey-node-aggr2').hover();
  await expect(page.getByTestId('sankey-node-data-mongo-1')).toHaveCSS('opacity', '1');
  await expect(page.getByTestId('sankey-node-data-mongo-0')).toHaveCSS('opacity', '0.3');
  await page.mouse.move(0, 0);

  // Transient view state: switching drew no request, and a refresh returns to Column.
  expect(storageUrls).toHaveLength(0);
  await page.reload();
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('radio', { name: /^column$/i })).toBeChecked();
  await expect(page.getByTestId('sankey-node-svm_shop')).toBeVisible();
});

/** A live body whose PVC carries no `labels.aggr` — the shape a backend without
 *  `expose-claim-aggregate` produces. */
function bodyWithoutClaimAggregates(): object {
  return {
    apiVersion: 'v1',
    elements: {
      nodes: [
        { data: { id: 'nn/n1', name: 'n1', type: 'netapp-node' } },
        { data: { id: 'na/a1', name: 'a1', type: 'netapp-aggr' } },
        { data: { id: 'ns/s1', name: 's1', type: 'netapp-svm' } },
        { data: { id: 'pvc/p1', name: 'p1', type: 'pvc', labels: { namespace: 'ns', svm: 's1' } } },
        { data: { id: 'pod/p1', name: 'pod1', type: 'pod', labels: { namespace: 'ns' } } },
      ],
      edges: [
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
        {
          data: {
            id: 'e-sp',
            type: 'storage-flow',
            source: 'ns/s1',
            target: 'pvc/p1',
            labels: { tier: 'svm-pvc' },
            metrics: { read_bytes_per_sec: 1000, write_bytes_per_sec: 1 },
          },
        },
        {
          data: {
            id: 'e-pp',
            type: 'storage-flow',
            source: 'pvc/p1',
            target: 'pod/p1',
            labels: { tier: 'pvc-pod' },
            metrics: { read_bytes_per_sec: 1000, write_bytes_per_sec: 1 },
          },
        },
      ],
    },
  };
}

/** Points a live config at a store whose PVCs carry no `labels.aggr`. */
async function routeNoClaimAggregateStore(page: Page): Promise<void> {
  await page.route('**/config.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        demoMode: false,
        endpoints: {
          graph: '/demo/graph.json',
          storageGraph: '/demo/no-claim-aggr.json',
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
  await page.route('**/demo/no-claim-aggr.json**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bodyWithoutClaimAggregates()),
    });
  });
}

test('live mode: Group is disabled without claim aggregates, and the chart draws as Column', async ({ page }) => {
  await routeNoClaimAggregateStore(page);

  await page.goto('/sankey?az=local-a&env=local-a&aggr=a1');
  await page.getByRole('button', { name: 'Query' }).click();
  await expect(page.getByTestId('sankey-svg')).toBeVisible({ timeout: 30_000 });

  const group = page.getByRole('radio', { name: /^group$/i });
  await expect(group).toBeDisabled();
  await expect(page.getByTestId('sankey-svm-display-reason')).toContainText('no claim aggregates');
  await expect(page.getByRole('radio', { name: /^column$/i })).toBeChecked();
  await expect(page.getByTestId('sankey-node-s1')).toBeVisible();
  await expect(page.getByTestId('sankey-node-p1')).toBeVisible();
});
