import { expect, test } from '@playwright/test';

test('sankey deep link reloads into the Sankey view', async ({ page }) => {
  await page.goto('/sankey');
  await expect(page).toHaveURL(/\/sankey/);
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });
});

test('Sankey opens with the summary folded and borders its cards by status', async ({ page }) => {
  await page.goto('/sankey');
  await expect(page.getByTestId('sankey-view')).toBeVisible({ timeout: 30_000 });

  // Folded on arrival: the chart is what the page is for, and six tiers of tables took half
  // the column. The strip stays drawn so a folded panel is not mistaken for an absent one.
  const toggle = page.getByTestId('sankey-summary-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('table')).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(await page.getByRole('table').count()).toBeGreaterThan(0);

  // Same field, and therefore the same verdict, as the border Graph view draws.
  await expect(page.getByTestId('sankey-node-aggr1')).toHaveAttribute('data-status', 'warning');
  await expect(page.getByTestId('sankey-node-ontap-prod-02')).toHaveAttribute('data-status', 'critical');
  await expect(page.getByTestId('sankey-status-swatch-critical')).toBeVisible();
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
