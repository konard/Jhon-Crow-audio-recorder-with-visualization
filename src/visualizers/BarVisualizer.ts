import { VisualizationData, VisualizerOptions } from '../types';
import { BaseVisualizer } from './BaseVisualizer';

/**
 * Bar spectrum visualizer
 * Displays frequency data as vertical bars
 */
export class BarVisualizer extends BaseVisualizer {
  readonly id = 'bars';
  readonly name = 'Bars';

  private previousHeights: number[] = [];

  constructor(options: VisualizerOptions = {}) {
    super({
      barCount: 64,
      barGap: 0.2,
      ...options,
    });
  }

  draw(ctx: CanvasRenderingContext2D, data: VisualizationData): void {
    const { width, height, frequencyData } = data;

    // Validate dimensions before drawing
    if (!this.isValidDimensions(width, height)) {
      return;
    }

    // Draw background
    this.drawBackground(ctx, data);

    // Apply layer effects to background
    this.applyLayerEffect(ctx, data);

    // Apply position offset and scale
    this.applyTransform(ctx, data);

    // Apply visualization alpha
    const visualizationAlpha = this.options.visualizationAlpha ?? 1;
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = visualizationAlpha;

    const barCount = this.options.barCount!;
    const barGap = this.options.barGap!;
    const totalBarWidth = width / barCount;
    const barWidth = totalBarWidth * (1 - barGap);
    const gapWidth = totalBarWidth * barGap;

    // Initialize previous heights if needed
    if (this.previousHeights.length !== barCount) {
      this.previousHeights = new Array(barCount).fill(0);
    }

    // Get frequency data slice based on frequencyWidth setting
    // Ensure we have at least barCount bins to prevent division by zero
    const frequencyDataSlice = this.getFrequencyDataSlice(frequencyData, barCount);

    // Calculate bar heights from frequency data
    // Use Math.max(1, ...) to ensure step is never 0
    const step = Math.max(1, Math.floor(frequencyDataSlice.length / barCount));

    for (let i = 0; i < barCount; i++) {
      // Average frequency values for this bar using safe calculation
      const average = this.calculateBandAverage(frequencyDataSlice, i * step, step);

      // Apply sensitivity and normalize to 0-1, then apply ADSR envelope smoothing
      const sensitiveAverage = this.applySensitivity(average);
      const targetHeight = (sensitiveAverage / 255) * height;
      const smoothedHeight = this.applyADSRSmoothing(this.previousHeights[i], targetHeight);
      this.previousHeights[i] = smoothedHeight;

      const x = i * totalBarWidth + gapWidth / 2;
      const barHeight = smoothedHeight;
      const y = this.options.mirror ? (height - barHeight) / 2 : height - barHeight;

      // Create gradient for each bar
      const gradient = ctx.createLinearGradient(x, height, x, y);
      gradient.addColorStop(0, this.options.primaryColor!);
      gradient.addColorStop(1, this.options.secondaryColor!);

      ctx.fillStyle = gradient;

      // Draw rounded bar
      this.drawRoundedRect(ctx, x, y, barWidth, barHeight, barWidth / 4);

      // Draw mirrored bar
      if (this.options.mirror) {
        this.drawRoundedRect(
          ctx,
          x,
          height / 2,
          barWidth,
          barHeight,
          barWidth / 4
        );
      }
    }

    // Restore previous alpha
    ctx.globalAlpha = previousAlpha;

    // Restore transform
    this.restoreTransform(ctx, data);

    // Draw foreground
    this.drawForeground(ctx, data);
  }

  /**
   * Draw a rounded rectangle
   */
  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    if (height < 1) return;

    const r = Math.min(radius, height / 2, width / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }
}
