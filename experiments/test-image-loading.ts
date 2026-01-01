/**
 * Experiment to test image loading during visualizer initialization
 * This test verifies that images are properly loaded before rendering starts
 */
import { BarVisualizer } from '../src/visualizers/BarVisualizer';

// Mock HTMLCanvasElement
const mockCanvas = {
  width: 800,
  height: 600,
  getContext: () => ({
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    drawImage: () => {},
    clearRect: () => {},
  }),
} as unknown as HTMLCanvasElement;

async function testImageLoadingScenarios() {
  console.log('Testing image loading scenarios...\n');

  // Scenario 1: Image passed in constructor, init called without options
  console.log('Scenario 1: Image in constructor, init() without options');
  const visualizer1 = new BarVisualizer({
    backgroundImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  });

  // Check that init awaits image loading
  const startTime1 = Date.now();
  await visualizer1.init(mockCanvas);
  const elapsed1 = Date.now() - startTime1;
  console.log(`  - init() completed in ${elapsed1}ms`);
  console.log(`  - Background image loaded: ${visualizer1['backgroundImageElement'] !== null}`);
  visualizer1.destroy();

  // Scenario 2: Image passed in constructor, init called with other options
  console.log('\nScenario 2: Image in constructor, init() with other options');
  const visualizer2 = new BarVisualizer({
    backgroundImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  });

  const startTime2 = Date.now();
  await visualizer2.init(mockCanvas, { primaryColor: '#ff0000' });
  const elapsed2 = Date.now() - startTime2;
  console.log(`  - init() completed in ${elapsed2}ms`);
  console.log(`  - Background image loaded: ${visualizer2['backgroundImageElement'] !== null}`);
  visualizer2.destroy();

  // Scenario 3: Image passed only in init options
  console.log('\nScenario 3: No image in constructor, image in init() options');
  const visualizer3 = new BarVisualizer();

  const startTime3 = Date.now();
  await visualizer3.init(mockCanvas, {
    backgroundImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  });
  const elapsed3 = Date.now() - startTime3;
  console.log(`  - init() completed in ${elapsed3}ms`);
  console.log(`  - Background image loaded: ${visualizer3['backgroundImageElement'] !== null}`);
  visualizer3.destroy();

  console.log('\n✓ All scenarios completed');
}

testImageLoadingScenarios().catch(console.error);
