const { test, expect } = require('@playwright/test');

test.describe('Ammo Audit & Dashboards', () => {
  test('should show Add Stock and Audit Stock options in ammo modal', async ({ page }) => {
    await page.goto('/');
    
    // Open ammo modal
    await page.click('button:has-text("+ Add Ammo")');
    
    // Check for radio buttons
    const addStockRadio = page.locator('input[name="ammo-mode"][value="add"]');
    const auditStockRadio = page.locator('input[name="ammo-mode"][value="audit"]');
    
    await expect(addStockRadio).toBeVisible();
    await expect(auditStockRadio).toBeVisible();
    
    // Check default state (Add Stock selected, date visible)
    await expect(addStockRadio).toBeChecked();
    await expect(page.locator('#ammo-date-container')).toBeVisible();
    await expect(page.locator('#ammo-qty-label')).toHaveText('Quantity to Add');
    
    // Switch to Audit Stock
    await auditStockRadio.click();
    await expect(page.locator('#ammo-date-container')).not.toBeVisible();
    await expect(page.locator('#ammo-qty-label')).toHaveText('Actual Current Quantity');
  });

  test('should render time-series charts on dashboards', async ({ page }) => {
    await page.goto('/');
    
    // Check Gun Dashboard
    await page.click('button:has-text("Gun Dashboard")');
    await expect(page.locator('#gunUseTimeChart')).toBeVisible();
    await expect(page.locator('#gun-type-filters')).toBeVisible();
    
    // Check Ammo Dashboard
    await page.click('button:has-text("Ammo Dashboard")');
    await expect(page.locator('#ammoTimeChart')).toBeVisible();
    await expect(page.locator('#ammo-time-filters')).toBeVisible();
  });

  test('should filter gun list based on type and caliber filters', async ({ page }) => {
    // Mock the API response with different types and calibers
    await page.route('**/api/data', async (route) => {
      const json = {
        guns: [
          { id: 'g1', manufacturer: 'Glock', model: '17', type: 'Pistol', caliber: '9mm Caliber' },
          { id: 'g2', manufacturer: 'Sig', model: 'M400', type: 'Rifle', caliber: '5.56mm' },
          { id: 'g3', manufacturer: 'Beretta', model: 'M9', type: 'Pistol', caliber: '9mm Caliber' }
        ],
        ammo: {
          '9mm Caliber': { qty: 1000, minStock: 100 },
          '5.56mm': { qty: 1000, minStock: 100 }
        },
        gunManufacturers: ['Glock', 'Sig', 'Beretta'],
        calibers: [
            { name: '9', unit: 'mm' },
            { name: '5.56', unit: 'mm' }
        ],
        units: ['mm', 'Caliber']
      };
      await route.fulfill({ json });
    });

    await page.goto('/');
    await page.click('button:has-text("Gun Dashboard")');
    
    // Initially all 3 guns should be listed in the filters (or all types selected)
    // Wait for filters to render
    await expect(page.locator('#gun-type-filters input[value="Pistol"]')).toBeChecked();
    await expect(page.locator('#gun-type-filters input[value="Rifle"]')).toBeChecked();
    
    // Count firearms in the filter list
    const gunFilters = page.locator('#gun-use-filters label');
    await expect(gunFilters).toHaveCount(3);
    
    // Uncheck "Rifle"
    await page.uncheck('#gun-type-filters input[value="Rifle"]');
    
    // Now only 2 pistols should remain
    await expect(gunFilters).toHaveCount(2);
    await expect(page.locator('#gun-use-filters')).not.toContainText('M400');
    
    // Uncheck "9mm Caliber" in ammo filters
    await page.uncheck('#gun-ammo-filters input[value="9mm Caliber"]');
    
    // Now 0 guns should match (Pistols are 9mm, but 9mm is unchecked. Rifles are checked but Rifle type is unchecked)
    // Wait... if I uncheck 9mm, the 2 pistols disappear.
    await expect(gunFilters).toHaveCount(0);
  });
});
