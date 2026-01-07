import { VisualizationData, VisualizerOptions } from '../types';
import { BaseVisualizer } from './BaseVisualizer';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  hue: number;
}

/**
 * Particle-based visualizer
 * Creates particles that react to audio
 */
export class ParticleVisualizer extends BaseVisualizer {
  readonly id = 'particles';
  readonly name = 'Particles';

  private particles: Particle[] = [];
  private maxParticles = 200;

  constructor(options: VisualizerOptions = {}) {
    super({
      ...options,
      custom: {
        maxParticles: 200,
        particleBaseSize: 3,
        particleSpeedFactor: 2,
        spawnRate: 15, // Particles per frame based on audio level (higher for noticeable difference)
        useCustomColors: false, // Use primary/secondary colors instead of rainbow
        ...options.custom,
      },
    });
    this.maxParticles = (this.options.custom?.maxParticles as number) ?? 200;
  }

  draw(ctx: CanvasRenderingContext2D, data: VisualizationData): void {
    const { width, height, frequencyData, timeDomainData } = data;
    // Validate dimensions before drawing
    if (!this.isValidDimensions(width, height)) {
      return;
    }


    // Clear background completely (no trail/darkening effect)
    ctx.fillStyle = this.options.backgroundColor!;
    ctx.fillRect(0, 0, width, height);

    // Draw background image if present
    if (this.backgroundImageElement) {
      ctx.globalAlpha = 0.3;
      this.drawImageCover(ctx, this.backgroundImageElement, width, height);
      ctx.globalAlpha = 1;
    }

    // Apply layer effects to background
    this.applyLayerEffect(ctx, data);

    // Calculate audio intensity across multiple frequency bands for better coverage
    // Divide spectrum into 8 bands for more detailed frequency response
    const numBands = 8;
    const bandIntensities: number[] = [];
    const bandSize = Math.floor(frequencyData.length / numBands);

    for (let band = 0; band < numBands; band++) {
      let bandSum = 0;
      const startIdx = band * bandSize;
      const endIdx = band === numBands - 1 ? frequencyData.length : (band + 1) * bandSize;
      for (let i = startIdx; i < endIdx; i++) {
        bandSum += frequencyData[i];
      }
      bandIntensities.push(bandSum / ((endIdx - startIdx) * 255));
    }

    // Calculate waveform deviation
    let waveformDeviation = 0;
    for (let i = 0; i < timeDomainData.length; i++) {
      waveformDeviation += Math.abs(timeDomainData[i] - 128);
    }
    waveformDeviation /= timeDomainData.length * 128;

    // Spawn new particles based on audio - using per-band spawning for full frequency coverage
    const spawnRate = this.options.custom?.spawnRate as number;
    const speedFactor = this.options.custom?.particleSpeedFactor as number;
    const baseSize = this.options.custom?.particleBaseSize as number;
    const useCustomColors = this.options.custom?.useCustomColors as boolean;

    const offsetX = this.options.offsetX ?? 0;
    const offsetY = this.options.offsetY ?? 0;

    // Spawn particles for each frequency band that has significant intensity
    // This ensures all frequencies contribute to the visualization
    for (let band = 0; band < numBands; band++) {
      const bandIntensity = bandIntensities[band];
      // Skip bands with very low intensity
      if (bandIntensity < 0.05) continue;

      // Calculate spawn count for this band based on its intensity
      // Higher max particles = more particles per band
      const bandSpawnRate = (spawnRate / numBands) * (1 + bandIntensity * 2);
      const particlesToSpawn = Math.floor(bandIntensity * bandSpawnRate);

      for (
        let i = 0;
        i < particlesToSpawn && this.particles.length < this.maxParticles;
        i++
      ) {
        const angle = Math.random() * Math.PI * 2;
        const speed =
          (0.5 + Math.random() * 1.5) * speedFactor * (0.5 + bandIntensity);

        let hue: number;

        if (useCustomColors) {
          // Alternate between primary and secondary color hues
          const primaryHue = this.getHueFromColor(this.options.primaryColor!);
          const secondaryHue = this.getHueFromColor(this.options.secondaryColor!);
          hue = Math.random() > 0.5 ? primaryHue : secondaryHue;
        } else {
          // Map frequency band to hue (0-360 degrees)
          // Low frequencies (bass) = red/orange, mid = green/cyan, high = blue/purple
          hue = (band / numBands) * 300;
        }

        // Spread spawn positions across the screen based on frequency band
        const bandOffsetX = ((band / numBands) - 0.5) * width * 0.3;

        this.particles.push({
          x: width / 2 + offsetX + bandOffsetX + (Math.random() - 0.5) * 100,
          y: height / 2 + offsetY + (Math.random() - 0.5) * 50,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: baseSize + Math.random() * baseSize * bandIntensity * 3,
          life: 1,
          maxLife: 60 + Math.random() * 60,
          hue,
        });
      }
    }

    // Update and draw particles
    const gravity = 0.02;
    const friction = 0.99;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Update position
      p.vy += gravity;
      p.vx *= friction;
      p.vy *= friction;
      p.x += p.vx;
      p.y += p.vy;

      // Add some reaction to audio
      p.vx += (Math.random() - 0.5) * waveformDeviation * 2;
      p.vy += (Math.random() - 0.5) * waveformDeviation * 2;

      // Update life
      p.life -= 1 / p.maxLife;

      // Remove dead particles
      if (p.life <= 0 || p.x < -50 || p.x > width + 50 || p.y > height + 50) {
        this.particles.splice(i, 1);
        continue;
      }

      // Draw particle
      const visualizationAlpha = this.options.visualizationAlpha ?? 1;
      const alpha = p.life * visualizationAlpha;
      const radius = p.radius * (0.5 + p.life * 0.5);

      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${alpha})`;
      ctx.fill();

      // Add glow effect
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${alpha * 0.2})`;
      ctx.fill();
    }

    // Draw foreground
    this.drawForeground(ctx, data);
  }

  /**
   * Extract hue value from hex color
   */
  private getHueFromColor(color: string): number {
    // Simple hex to HSL conversion for hue extraction
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let hue = 0;
    if (delta !== 0) {
      if (max === r) {
        hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      } else if (max === g) {
        hue = ((b - r) / delta + 2) / 6;
      } else {
        hue = ((r - g) / delta + 4) / 6;
      }
    }

    return hue * 360;
  }

  destroy(): void {
    this.particles = [];
    super.destroy();
  }
}
