import { test, expect } from '@playwright/test';

test('home keeps the title and illustrations inside the screen at small and tablet sizes', async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [768, 1024],
    [844, 390],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto('/');
    await expect(page.locator('#mobile-home-title')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const selector of [
      '#mobile-home-title',
      '.mobile-game-toys',
      '.mobile-home-brand',
      '.mobile-quick-actions',
    ]) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width!);
      expect(box!.height).toBeGreaterThan(40);
    }
    const title = page.locator('#mobile-home-title');
    expect(
      await title.evaluate(
        (e) => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight + 1,
      ),
    ).toBe(true);
  }
});
