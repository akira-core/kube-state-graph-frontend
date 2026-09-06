import { expect, test, type Page } from '@playwright/test';

async function stubLiveConfig(page: Page): Promise<string[]> {
  const graphUrls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/demo/graph.json')) {
      graphUrls.push(request.url());
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
        : url.includes('/label/namespace/')
          ? ['shop', 'infra']
          : ['prod'];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data }),
    });
  });
  return graphUrls;
}

test('graph deep link populates the dropdown and the request', async ({ page }) => {
  const graphUrls = await stubLiveConfig(page);
  await page.goto('/graph?namespace=shop&from=now-1h&to=now');
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('filter-namespace')).toContainText('shop');
  await expect.poll(() => graphUrls.some((url) => url.includes('namespace=shop'))).toBe(true);
  await expect.poll(() => graphUrls.some((url) => url.includes('start='))).toBe(true);
});

test('Sankey locate then Back restores the Sankey scope', async ({ page }) => {
  await stubLiveConfig(page);
  await page.goto('/sankey?az=local-a&env=demo&aggr=aggr1');
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('sankey-az')).toContainText('local-a');
  await page.getByTestId('sankey-node-aggr1').click();
  await expect(page).toHaveURL(/\/graph/);
  await page.goBack();
  await expect(page).toHaveURL(/\/sankey\?.*az=local-a.*env=demo.*aggr=aggr1/);
  await expect(page.getByTestId('sankey-az')).toContainText('local-a');
});

test('refresh on Sankey keeps scope and write mode', async ({ page }) => {
  await stubLiveConfig(page);
  await page.goto('/sankey?az=local-a&env=demo&mode=write');
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('radio', { name: /write/i })).toBeChecked();
  await page.reload();
  await expect(page).toHaveURL(/mode=write/);
  await expect(page.getByRole('radio', { name: /write/i })).toBeChecked();
  await expect(page.getByTestId('sankey-az')).toContainText('local-a');
});

test('dropdown keyboard: open, search, toggle, Escape returns focus', async ({ page }) => {
  await stubLiveConfig(page);
  await page.goto('/graph');
  await expect(page.getByTestId('filter-bar')).toBeVisible({ timeout: 30_000 });
  const trigger = page.getByTestId('filter-namespace');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const search = page.getByRole('combobox', { name: 'Search Namespace' });
  await expect(search).toBeFocused();
  await search.fill('sh');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('shop');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
