import { expect, test } from '@playwright/test';

test('sankey deep link reloads into the Sankey view', async ({ page }) => {
  await page.goto('/sankey');
  await expect(page).toHaveURL(/\/sankey\/?$/);
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
});

test('demo mode renders the graph and round-trips to sankey', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/graph\/?$/);
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('demo-badge')).toBeVisible();
  await expect(page.getByTestId('ingress-toggle')).toBeVisible();
  await expect(page.getByTestId('edge-legend-row-network-hop')).toBeVisible();

  await page.getByRole('link', { name: 'Sankey' }).click();
  await expect(page).toHaveURL(/\/sankey/);
  await expect(page.getByTestId('sankey-view')).toBeVisible();

  await page.getByRole('link', { name: 'Graph' }).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible();

  await page.getByTestId('legend-collapse').click();
  await expect(page.getByTestId('legend-expand')).toBeVisible();
  await page.getByTestId('legend-expand').click();
  await expect(page.getByTestId('legend-collapse')).toBeVisible();

  await page.getByRole('link', { name: 'Sankey' }).click();
  await page.getByTestId('sankey-node-aggr1').click();
  await expect(page).toHaveURL(/\/graph/);
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
});
