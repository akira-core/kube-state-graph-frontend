import { expect, test } from '@playwright/test';

test('fetch path loads /demo/graph.json through normalize', async ({ page }) => {
  await page.route('**/config.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        demoMode: false,
        endpoints: { graph: '/demo/graph.json' },
        theme: 'system',
        defaultLayout: 'fcose',
        refreshIntervalSeconds: 0,
      }),
    });
  });
  await page.goto('/graph');
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('demo-badge')).toHaveCount(0);
  await expect(page.getByTestId('ingress-toggle')).toBeVisible();
  await expect(page.getByTestId('edge-legend-row-network-hop')).toBeVisible();
});
