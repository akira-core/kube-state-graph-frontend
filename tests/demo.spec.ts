import { expect, test } from '@playwright/test';

test('sankey deep link reloads into the Sankey view', async ({ page }) => {
  await page.goto('/sankey');
  await expect(page).toHaveURL(/\/sankey/);
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
});

test('Sankey draws no summary, borders its cards by status and holds its view controls in the scope bar', async ({
  page,
}) => {
  await page.goto('/sankey');
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });

  // No title bar and no summary: every figure is in a tooltip, the cut beside Top pods.
  await expect(page.getByTestId('sankey-summary')).toHaveCount(0);
  await expect(page.getByTestId('sankey-summary-toggle')).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  const bar = page.getByTestId('sankey-controls');
  await expect(bar.getByRole('radiogroup', { name: 'Sankey mode' })).toBeVisible();
  await expect(bar.getByTestId('sankey-layout')).toBeVisible();
  await expect(bar.getByTestId('sankey-svm-display')).toBeVisible();

  // Same field, and therefore the same verdict, as the border Graph view draws.
  await expect(page.getByTestId('sankey-node-aggr1')).toHaveAttribute('data-status', 'warning');
  await expect(page.getByTestId('sankey-node-ontap-prod-02')).toHaveAttribute('data-status', 'critical');
  await expect(bar.getByTestId('sankey-status-swatch-critical')).toBeVisible();

  // Cards print their attributes one per line; ribbons each end in a chevron.
  await expect(page.getByTestId('sankey-node-aggr1').getByTestId('sankey-card-line')).toHaveText([
    'usage 700 GB / 1 TB (70%)',
  ]);
  const ribbons = await page.locator('[data-testid="sankey-link-read"], [data-testid="sankey-link-write"]').count();
  await expect(page.getByTestId('sankey-link-chevron')).toHaveCount(ribbons);
});

test('demo mode renders the graph and round-trips to sankey by Locate and Back', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/graph/);
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('demo-badge')).toBeVisible();
  await expect(page.getByTestId('ingress-toggle')).toBeVisible();
  await expect(page.getByTestId('edge-legend-row-network-hop')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Application' }).getByRole('link')).toHaveCount(0);

  await page.goto('/sankey');
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('navigation', { name: 'Application' }).getByRole('link')).toHaveCount(0);

  await page.getByTestId('sankey-node-aggr1').click();
  await expect(page).toHaveURL(/\/graph/);
  await expect(page.getByTestId('graph-canvas')).toBeVisible();

  await page.getByTestId('legend-collapse').click();
  await expect(page.getByTestId('legend-expand')).toBeVisible();
  await page.getByTestId('legend-expand').click();
  await expect(page.getByTestId('legend-collapse')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/sankey/);
  await expect(page.getByTestId('sankey-view')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Flat' })).toBeChecked();
});

test('Sankey focus mode hides the top nav and restores it on exit; the page never scrolls horizontally', async ({
  page,
}) => {
  await page.goto('/sankey');
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('navigation')).toBeVisible();

  // The scope bar's view controls wrap inside the bar — the page itself never gains a
  // horizontal scrollbar.
  await expect(page.getByTestId('sankey-view-controls')).toBeVisible();
  const overflowsPage = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflowsPage).toBe(false);

  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.getByRole('navigation')).toBeHidden();
  await expect(page.getByTestId('sankey-controls')).toBeHidden();
  const zoomBefore = await page.getByTestId('sankey-zoom-controls').textContent();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByTestId('sankey-controls').getByTestId('sankey-view-controls')).toBeVisible();
  const zoomAfter = await page.getByTestId('sankey-zoom-controls').textContent();
  expect(zoomAfter).toBe(zoomBefore);
});
