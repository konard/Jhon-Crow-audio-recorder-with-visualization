// ***********************************************
// Custom commands for the audio recorder app
// ***********************************************

/**
 * Wait for the canvas to be drawn with visualization
 */
Cypress.Commands.add('waitForVisualization', (timeout = 3000) => {
  cy.get('#visualizer', { timeout }).should('be.visible');
  // Wait a bit for the visualization to actually render
  cy.wait(500);
});

/**
 * Clear localStorage and reload the page
 */
Cypress.Commands.add('clearStorageAndReload', () => {
  cy.clearLocalStorage();
  cy.reload();
});

/**
 * Load a test image as background
 */
Cypress.Commands.add('loadTestBackgroundImage', () => {
  // Create a small test image (1x1 red pixel PNG data URL)
  const testImageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

  cy.window().then((win) => {
    // Simulate loading the background image by setting it directly
    win.eval(`
      (async () => {
        const recorder = window.recorder;
        if (recorder) {
          await recorder.setVisualizerOptions({
            backgroundImage: '${testImageDataUrl}'
          });
        }
        // Also update the global variable
        window.currentBackgroundImageUrl = '${testImageDataUrl}';
      })();
    `);
  });
});

/**
 * Get the current visualizer options from the recorder
 */
Cypress.Commands.add('getVisualizerOptions', () => {
  return cy.window().then((win) => {
    if (win.recorder && win.recorder.visualizer) {
      return win.recorder.visualizer.options;
    }
    return null;
  });
});

/**
 * Save current settings to localStorage via the app's save function
 */
Cypress.Commands.add('saveAppSettings', () => {
  cy.window().then((win) => {
    if (typeof win.getCurrentSettings === 'function' && typeof win.saveSettings === 'function') {
      const settings = win.getCurrentSettings();
      win.saveSettings(settings);
    }
  });
});
