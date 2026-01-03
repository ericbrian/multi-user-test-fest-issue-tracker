const { test, expect } = require('@playwright/test');

test.describe('Happy Path', () => {
  test('should create a room, join it, and report an issue', async ({ page }) => {
    // 1. Navigate to the app
    await page.goto('/');

    // 2. Handle login button if it appears
    const loginBtn = page.locator('#loginCenterBtn');
    if (await loginBtn.isVisible().catch(() => false)) {
      await loginBtn.click();
    }

    // Now wait for the user info header to reflect we are logged in
    await expect(page.locator('#userInfoHeader')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#userInfoHeader')).not.toBeEmpty();
    
    // 3. Create a new room
    const roomChooser = page.locator('#roomChooserCenter');
    if (await roomChooser.isVisible()) {
      await page.click('#roomChooserCreateBtn');
    } else {
      await page.click('#createRoomBtn');
    }

    // 4. Fill in room details in the modal
    await page.waitForSelector('.room-modal', { state: 'visible' });
    const testRoomName = `E2E Test Room ${Date.now()}`;
    await page.fill('#roomName', testRoomName);
    
    // Select a script if available from the library
    const scriptSelect = page.locator('#scriptSelection');
    const optionsCount = await scriptSelect.locator('option').count();
    if (optionsCount > 1) {
      await scriptSelect.selectOption({ index: 1 });
    }

    // 5. Submit room creation
    await page.click('#createRoomForm button[type="submit"]');

    // 6. Verify we joined the room
    await expect(page.locator('#currentRoomName')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#currentRoomName .room-name-text')).toHaveText(testRoomName);

    // 7. Report an issue
    const firstLine = page.locator('.test-script-line').first();
    await expect(firstLine).toBeVisible();
    await firstLine.click();
    
    await expect(page.locator('#selectedScriptBadge')).toBeVisible();
    await page.fill('#description', 'Found a bug during E2E testing');
    await page.click('#issueForm button[type="submit"]');

    // 8. Verify the issue appears in the issues list
    const issuesList = page.locator('#issues');
    await expect(issuesList).toContainText('Found a bug during E2E testing', { timeout: 10000 });
    
    // 9. Verify selection persistence
    await expect(firstLine).toHaveClass(/selected/);
  });
});
