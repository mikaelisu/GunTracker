const { test, expect } = require('@playwright/test');

test.describe('ArmorLog App', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ArmorLog/);
    await expect(page.locator('h1')).toContainText('ArmorLog');
  });

  test('should switch tabs correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check Inventory tab (default)
    await expect(page.locator('#inventory')).toBeVisible();
    
    // Switch to History
    await page.click('button:has-text("History")');
    await expect(page.locator('#history')).toBeVisible();
    await expect(page.locator('#inventory')).not.toBeVisible();
    
    // Switch to Settings
    await page.click('button:has-text("Settings")');
    await expect(page.locator('#settings')).toBeVisible();
  });

  test('should render gun list from API', async ({ page }) => {
    // Mock the API response
    await page.route('**/api/data', async (route) => {
      const json = {
        guns: [
          {
            id: 1,
            manufacturer: 'Glock',
            model: '19',
            type: 'Pistol',
            caliber: '9mm',
            serial: 'ABC123',
            rounds: 500,
            status: 'Ready'
          }
        ],
        ammo: {
          '9mm': { quantity: 1000, minStock: 100 }
        },
        gunManufacturers: ['Glock'],
        suppressorManufacturers: [],
        opticManufacturers: [],
        calibers: ['9mm'],
        units: ['mm']
      };
      await route.fulfill({ json });
    });

    await page.goto('/');
    
    // Wait for the gun list to render
    const gunItem = page.locator('#gun-list');
    await expect(gunItem).toContainText('Glock');
    await expect(gunItem).toContainText('19');
  });
});
