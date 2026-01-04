# Cypress E2E Tests

This directory contains end-to-end tests for the Audio Recorder with Visualization application.

## Running Tests

### Prerequisites

1. Build the project:
   ```bash
   npm run build
   ```

2. Start the development server in a separate terminal:
   ```bash
   npm run serve
   ```
   This will start a server at `http://localhost:8080`

### Run Tests

**Headless mode (CI):**
```bash
npm run test:e2e
```

**Interactive mode (with Cypress Test Runner):**
```bash
npm run test:e2e:open
```

**Headed mode (watch tests run in browser):**
```bash
npm run test:e2e:headed
```

## Test Structure

### `e2e/background-size-preservation.cy.js`
Tests for Issue #29 - Background size mode preservation after reload:
- Verifies background size modes (cover, contain, stretch, tile, center) are saved to localStorage
- Tests that modes are correctly restored after page reload
- Validates that background images are rendered with the correct size mode
- Takes screenshots for visual regression testing

### `e2e/large-file-handling.cy.js`
Tests for Issue #29 - Large file save handling:
- Verifies the fix for "Invalid array length" error with large files (200MB+)
- Tests Uint8Array usage instead of Array.from()
- Validates blob to ArrayBuffer conversion for various file sizes
- Documents the limitation of Array.from() for large arrays

## Custom Commands

See `support/commands.js` for custom Cypress commands:
- `cy.waitForVisualization()` - Wait for canvas to render
- `cy.clearStorageAndReload()` - Clear localStorage and reload
- `cy.loadTestBackgroundImage()` - Load a test background image
- `cy.getVisualizerOptions()` - Get current visualizer options
- `cy.saveAppSettings()` - Save current settings to localStorage

## Fixtures

Test data is stored in `fixtures/`:
- `test-image.json` - Contains a small test image as base64 data URL

## Screenshots and Videos

- Screenshots: `cypress/screenshots/`
- Videos: `cypress/videos/`

These are automatically generated during test runs and can be used for debugging and visual regression testing.
