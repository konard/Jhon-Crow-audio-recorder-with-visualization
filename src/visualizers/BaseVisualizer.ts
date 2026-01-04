import { Visualizer, VisualizerOptions, VisualizationData } from '../types';

/**
 * Base class for all visualizers
 * Provides common functionality and default implementations
 */
export abstract class BaseVisualizer implements Visualizer {
  abstract readonly id: string;
  abstract readonly name: string;

  protected canvas: HTMLCanvasElement | null = null;
  protected options: VisualizerOptions;
  protected backgroundImageElement: HTMLImageElement | null = null;
  protected foregroundImageElement: HTMLImageElement | null = null;
  protected imageLoadPromises: Promise<void>[] = [];

  constructor(options: VisualizerOptions = {}) {
    this.options = {
      primaryColor: '#00ff88',
      secondaryColor: '#0088ff',
      backgroundColor: '#000000',
      drawBackground: true,
      lineWidth: 2,
      barCount: 64,
      barGap: 0.2,
      mirror: false,
      smoothing: 0.8,
      foregroundAlpha: 1,
      visualizationAlpha: 1,
      offsetX: 0,
      offsetY: 0,
      backgroundSizeMode: 'cover',
      layerEffect: 'none',
      layerEffectIntensity: 50,
      ...options,
    };
  }

  /**
   * Initialize the visualizer
   * @returns Promise that resolves when initialization is complete (including image loading)
   */
  async init(canvas: HTMLCanvasElement, options?: VisualizerOptions): Promise<void> {
    this.canvas = canvas;
    if (options) {
      this.options = { ...this.options, ...options };
    }
    // Always load images if there are any in this.options (from constructor or passed options)
    // This ensures images are loaded whether they came from the constructor or init()
    if (this.options.backgroundImage || this.options.foregroundImage) {
      await this.loadImages();
    }
  }

  /**
   * Load background and foreground images if specified
   */
  protected async loadImages(): Promise<void> {
    this.imageLoadPromises = [];

    if (this.options.backgroundImage) {
      this.imageLoadPromises.push(this.loadImage(this.options.backgroundImage, 'background'));
    }

    if (this.options.foregroundImage) {
      this.imageLoadPromises.push(this.loadImage(this.options.foregroundImage, 'foreground'));
    }

    await Promise.all(this.imageLoadPromises);
  }

  /**
   * Load a single image
   */
  protected loadImage(source: HTMLImageElement | string, type: 'background' | 'foreground'): Promise<void> {
    return new Promise((resolve) => {
      if (source instanceof HTMLImageElement) {
        if (type === 'background') {
          this.backgroundImageElement = source;
        } else {
          this.foregroundImageElement = source;
        }
        resolve();
        return;
      }

      const img = new Image();
      img.onload = () => {
        if (type === 'background') {
          this.backgroundImageElement = img;
        } else {
          this.foregroundImageElement = img;
        }
        resolve();
      };
      img.onerror = () => {
        console.warn(`Failed to load ${type} image:`, source);
        resolve(); // Don't reject, just continue without the image
      };
      img.src = source;
    });
  }

  /**
   * Update visualizer options
   * @returns Promise that resolves when any image loading is complete
   */
  async setOptions(options: Partial<VisualizerOptions>): Promise<void> {
    const needsImageReload =
      options.backgroundImage !== undefined ||
      options.foregroundImage !== undefined;

    this.options = { ...this.options, ...options };

    if (needsImageReload) {
      await this.loadImages();
    }
  }

  /**
   * Draw background (color or image)
   */
  protected drawBackground(ctx: CanvasRenderingContext2D, data: VisualizationData): void {
    if (!this.options.drawBackground) {
      return;
    }

    if (this.backgroundImageElement) {
      // Draw background image based on size mode
      const mode = this.options.backgroundSizeMode || 'cover';
      switch (mode) {
        case 'cover':
          this.drawImageCover(ctx, this.backgroundImageElement, data.width, data.height);
          break;
        case 'contain':
          this.drawImageContain(ctx, this.backgroundImageElement, data.width, data.height);
          break;
        case 'stretch':
          this.drawImageStretch(ctx, this.backgroundImageElement, data.width, data.height);
          break;
        case 'tile':
          this.drawImageTile(ctx, this.backgroundImageElement, data.width, data.height);
          break;
        case 'center':
          this.drawImageCenter(ctx, this.backgroundImageElement, data.width, data.height);
          break;
        case 'custom':
          this.drawImageCustom(ctx, this.backgroundImageElement, data.width, data.height);
          break;
        default:
          this.drawImageCover(ctx, this.backgroundImageElement, data.width, data.height);
      }
    } else {
      ctx.fillStyle = this.options.backgroundColor!;
      ctx.fillRect(0, 0, data.width, data.height);
    }
  }

  /**
   * Apply layer effects between background and visualization
   */
  protected applyLayerEffect(ctx: CanvasRenderingContext2D, data: VisualizationData): void {
    const effect = this.options.layerEffect ?? 'none';
    if (effect === 'none') {
      return;
    }

    const intensity = this.options.layerEffectIntensity ?? 50;
    const { width, height } = data;

    // Create a temporary canvas to apply effects
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Copy current canvas content to temp canvas
    tempCtx.drawImage(ctx.canvas, 0, 0);

    // Apply CSS filter-based effects
    let filterValue = '';
    switch (effect) {
      case 'blur':
        filterValue = `blur(${(intensity / 100) * 10}px)`;
        break;
      case 'brightness':
        filterValue = `brightness(${50 + (intensity / 100) * 150}%)`;
        break;
      case 'contrast':
        filterValue = `contrast(${50 + (intensity / 100) * 150}%)`;
        break;
      case 'grayscale':
        filterValue = `grayscale(${intensity}%)`;
        break;
      case 'invert':
        filterValue = `invert(${intensity}%)`;
        break;
      case 'sepia':
        filterValue = `sepia(${intensity}%)`;
        break;
      case 'saturate':
        filterValue = `saturate(${intensity * 2}%)`;
        break;
      case 'hue-rotate':
        filterValue = `hue-rotate(${(intensity / 100) * 360}deg)`;
        break;
    }

    if (filterValue) {
      ctx.filter = filterValue;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.filter = 'none';
    }
  }

  /**
   * Draw foreground image if specified
   */
  protected drawForeground(ctx: CanvasRenderingContext2D, data: VisualizationData): void {
    if (this.foregroundImageElement) {
      const alpha = this.options.foregroundAlpha ?? 1;
      const previousAlpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha;
      this.drawImageCover(ctx, this.foregroundImageElement, data.width, data.height);
      ctx.globalAlpha = previousAlpha;
    }
  }

  /**
   * Draw an image to cover the canvas (like CSS background-size: cover)
   */
  protected drawImageCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    width: number,
    height: number
  ): void {
    const imgRatio = img.width / img.height;
    const canvasRatio = width / height;

    let drawWidth: number;
    let drawHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (imgRatio > canvasRatio) {
      // Image is wider than canvas
      drawHeight = height;
      drawWidth = height * imgRatio;
      offsetX = (width - drawWidth) / 2;
      offsetY = 0;
    } else {
      // Image is taller than canvas
      drawWidth = width;
      drawHeight = width / imgRatio;
      offsetX = 0;
      offsetY = (height - drawHeight) / 2;
    }

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  /**
   * Draw an image to fit within the canvas (like CSS background-size: contain)
   */
  protected drawImageContain(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    width: number,
    height: number
  ): void {
    const imgRatio = img.width / img.height;
    const canvasRatio = width / height;

    let drawWidth: number;
    let drawHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (imgRatio > canvasRatio) {
      // Image is wider than canvas
      drawWidth = width;
      drawHeight = width / imgRatio;
      offsetX = 0;
      offsetY = (height - drawHeight) / 2;
    } else {
      // Image is taller than canvas
      drawHeight = height;
      drawWidth = height * imgRatio;
      offsetX = (width - drawWidth) / 2;
      offsetY = 0;
    }

    // Fill background first
    ctx.fillStyle = this.options.backgroundColor!;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  /**
   * Draw an image stretched to fill the canvas
   */
  protected drawImageStretch(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    width: number,
    height: number
  ): void {
    ctx.drawImage(img, 0, 0, width, height);
  }

  /**
   * Draw an image tiled across the canvas
   */
  protected drawImageTile(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    width: number,
    height: number
  ): void {
    const pattern = ctx.createPattern(img, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
  }

  /**
   * Draw an image centered (actual size) on the canvas
   */
  protected drawImageCenter(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    width: number,
    height: number
  ): void {
    // Fill background first
    ctx.fillStyle = this.options.backgroundColor!;
    ctx.fillRect(0, 0, width, height);

    const offsetX = (width - img.width) / 2;
    const offsetY = (height - img.height) / 2;
    ctx.drawImage(img, offsetX, offsetY);
  }

  /**
   * Draw an image with custom dimensions
   */
  protected drawImageCustom(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    width: number,
    height: number
  ): void {
    // Fill background first
    ctx.fillStyle = this.options.backgroundColor!;
    ctx.fillRect(0, 0, width, height);

    const customWidth = this.options.backgroundWidth ?? img.width;
    const customHeight = this.options.backgroundHeight ?? img.height;
    const offsetX = (width - customWidth) / 2;
    const offsetY = (height - customHeight) / 2;
    ctx.drawImage(img, offsetX, offsetY, customWidth, customHeight);
  }

  /**
   * Create a gradient
   */
  protected createGradient(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, this.options.primaryColor!);
    gradient.addColorStop(1, this.options.secondaryColor!);
    return gradient;
  }

  /**
   * Apply position offset transformation to context
   * Call this before drawing visualization, and call restoreTransform() after
   */
  protected applyTransform(ctx: CanvasRenderingContext2D): void {
    const offsetX = this.options.offsetX ?? 0;
    const offsetY = this.options.offsetY ?? 0;

    if (offsetX !== 0 || offsetY !== 0) {
      ctx.save();
      ctx.translate(offsetX, offsetY);
    }
  }

  /**
   * Restore context transformation state
   * Call this after drawing visualization if applyTransform() was called
   */
  protected restoreTransform(ctx: CanvasRenderingContext2D): void {
    const offsetX = this.options.offsetX ?? 0;
    const offsetY = this.options.offsetY ?? 0;

    if (offsetX !== 0 || offsetY !== 0) {
      ctx.restore();
    }
  }

  /**
   * Abstract draw method - must be implemented by subclasses
   */
  abstract draw(ctx: CanvasRenderingContext2D, data: VisualizationData): void;

  /**
   * Clean up resources
   */
  destroy(): void {
    this.canvas = null;
    this.backgroundImageElement = null;
    this.foregroundImageElement = null;
    this.imageLoadPromises = [];
  }
}
