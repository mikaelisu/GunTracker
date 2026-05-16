const { test, expect } = require('@playwright/test');

test.describe('New Features', () => {
  test('should show Valuation Dashboard with correct data', async ({ page }) => {
    // Mock the API response with some costs
    await page.route('**/api/data', async (route) => {
      const json = {
        guns: [{ id: '1', manufacturer: 'Glock', model: '19', purchaseCost: 500, type: 'Pistol', caliber: '9mm' }],
        suppressors: [{ id: '2', manufacturer: 'Surefire', model: 'RC2', purchaseCost: 1000 }],
        optics: [{ id: '3', manufacturer: 'Trijicon', model: 'RMR', purchaseCost: 450 }],
        gunManufacturers: ['Glock'],
        suppressorManufacturers: ['Surefire'],
        opticManufacturers: ['Trijicon'],
        units: ['mm'],
        calibers: ['9mm']
      };
      await route.fulfill({ json });
    });

    await page.goto('/');
    await page.click('button:has-text("Valuation Dashboard")');
    
    // Check totals
    await expect(page.locator('#val-total')).toContainText('$1,950.00');
    await expect(page.locator('#val-guns')).toContainText('$500.00');
    await expect(page.locator('#val-sups')).toContainText('$1,000.00');
    await expect(page.locator('#val-optics')).toContainText('$450.00');
  });

  test('should show component replacement warning', async ({ page }) => {
    // Mock gun with a component that exceeds its lifespan
    await page.route('**/api/data', async (route) => {
      const json = {
        guns: [
          {
            id: 'g1',
            manufacturer: 'Glock',
            model: '19',
            type: 'Pistol',
            caliber: '9mm',
            rounds: 6000,
            initialRounds: 0,
            components: [
              { id: 'c1', name: 'Recoil Spring', lifespan: 5000, installedAtRound: 0 }
            ]
          }
        ],
        gunManufacturers: ['Glock'],
        units: ['mm'],
        calibers: ['9mm']
      };
      await route.fulfill({ json });
    });

    await page.goto('/');
    
    // Check for warning on the main inventory card
    const gunCard = page.locator('.item-card.warning');
    await expect(gunCard).toBeVisible();
    await expect(gunCard).toContainText('REPLACE PARTS');
  });
});
