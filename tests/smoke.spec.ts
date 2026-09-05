import { expect, test } from '@playwright/test';

test('carga, letra, carrusel y cambio de canción', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Fa');
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('#lyrics-inner .line').first()).toBeVisible();

  const title = page.locator('#title');
  const first = (await title.textContent())?.trim();

  await page.locator('#queue-toggle').click();
  const queue = page.locator('#queue');
  await expect(queue).toBeVisible();
  const items = page.locator('.queue-item');
  expect(await items.count()).toBeGreaterThan(1);

  await items.nth(2).click();
  await expect(queue).toBeHidden();
  await expect(title).not.toHaveText(first ?? '');
});

test('/editor está deshabilitado en el build', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.locator('.ed-off')).toContainText('npm run dev');
});
