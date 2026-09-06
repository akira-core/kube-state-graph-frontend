import { expect, test } from '@playwright/test';

test('sankey deep link reloads into the Sankey view', async ({ page }) => {
  await page.goto('/sankey');
  await expect(page).toHaveURL(/\/sankey/);
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
});

test('demo mode renders the graph and round-trips to sankey', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/graph/);
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

test('Sankey focus mode hides the top nav and restores it on exit; the page never scrolls horizontally', async ({
  page,
}) => {
  await page.goto('/sankey');
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('navigation')).toBeVisible();

  // The node flow summary table's own scroller absorbs overflow — the page itself never
  // gains a horizontal scrollbar (storage-flow-sankey "圖外的數字摘要").
  await expect(page.getByTestId('sankey-summary')).toBeVisible();
  const overflowsPage = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflowsPage).toBe(false);

  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.getByRole('navigation')).toBeHidden();
  await expect(page.getByTestId('sankey-summary')).toBeHidden();
  const zoomBefore = await page.getByTestId('sankey-zoom-controls').textContent();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation')).toBeVisible();
  const zoomAfter = await page.getByTestId('sankey-zoom-controls').textContent();
  expect(zoomAfter).toBe(zoomBefore);
});
