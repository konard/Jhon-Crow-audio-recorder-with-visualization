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
      mirrorHorizontal: false,
      smoothing: 0.8,
      foregroundAlpha: 1,
      visualizationAlpha: 1,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
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
      // Deep merge the custom options to preserve existing custom settings from constructor
      if (options.custom && this.options.custom) {
        options = {
          ...options,
          custom: { ...this.options.custom, ...options.custom },
        };
      }
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

    // Invalidate background cache after loading new images
    this._backgroundNeedsRedraw = true;
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

    // Check if background-related options changed (need to invalidate background cache)
    const needsBackgroundRedraw =
      options.backgroundColor !== undefined ||
      options.backgroundImage !== undefined ||
      options.backgroundSizeMode !== undefined ||
      options.backgroundWidth !== undefined ||
      options.backgroundHeight !== undefined ||
      options.drawBackground !== undefined ||
      options.layerEffect !== undefined ||
      options.layerEffectIntensity !== undefined;

    // Deep merge the custom options to preserve existing custom settings
    if (options.custom && this.options.custom) {
      options = {
        ...options,
        custom: { ...this.options.custom, ...options.custom },
      };
    }

    this.options = { ...this.options, ...options };

    if (needsImageReload) {
      await this.loadImages();
    }

    // Invalidate background cache for mirror horizontal mode
    if (needsBackgroundRedraw) {
      this._backgroundNeedsRedraw = true;
    }
  }

  /**
   * Validate that dimensions are valid for drawing
   */
  protected isValidDimensions(width: number, height: number): boolean {
    return width > 0 && height > 0 && isFinite(width) && isFinite(height);
  }

  /**
   * Internal method to draw background without mirror horizontal check
   */
  private _drawBackgroundInternal(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.backgroundImageElement) {
      // Draw background image based on size mode
      const mode = this.options.backgroundSizeMode || 'cover';
      switch (mode) {
        case 'cover':
          this.drawImageCover(ctx, this.backgroundImageElement, width, height);
          break;
        case 'contain':
          this.drawImageContain(ctx, this.backgroundImageElement, width, height);
          break;
        case 'stretch':
          this.drawImageStretch(ctx, this.backgroundImageElement, width, height);
          break;
        case 'tile':
          this.drawImageTile(ctx, this.backgroundImageElement, width, height);
          break;
        case 'center':
          this.drawImageCenter(ctx, this.backgroundImageElement, width, height);
          break;
        case 'custom':
          this.drawImageCustom(ctx, this.backgroundImageElement, width, height);
          break;
        default:
          this.drawImageCover(ctx, this.backgroundImageElement, width, height);
      }
    } else {
      ctx.fillStyle = this.options.backgroundColor!;
      ctx.fillRect(0, 0, width, height);
    }
  }

  /**
   * Draw background (color or image)
   */
  protected drawBackground(ctx: CanvasRenderingContext2D, data: VisualizationData): void {
    // Skip background if mirror horizontal is enabled - it will be added in restoreTransform
    // after visualization is extracted, to avoid background flickering and duplication
    const mirrorHorizontal = this.options.mirrorHorizontal ?? false;
    if (!this.options.drawBackground || mirrorHorizontal) {
      return;
    }

    this._drawBackgroundInternal(ctx, data.width, data.height);
  }

  /**
   * Apply layer effects to the background (between background and visualization)
   * This should be called AFTER drawBackground to apply effect to background only
   */
  protected applyLayerEffect(ctx: CanvasRenderingContext2D, data: VisualizationData): void {
    const effect = this.options.layerEffect ?? 'none';
    if (effect === 'none') {
      return;
    }

    const intensity = this.options.layerEffectIntensity ?? 50;
    const { width, height } = data;

    // Create a temporary canvas to capture current background
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Copy current canvas content (background) to temp canvas
    tempCtx.drawImage(ctx.canvas, 0, 0);

    // Build the CSS filter value
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
      // Clear the main canvas
      ctx.clearRect(0, 0, width, height);
      // Draw the background with the filter effect applied
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

  // Temporary canvas for horizontal mirror mode (reused to avoid allocation overhead)
  private _mirrorTempCanvas: HTMLCanvasElement | null = null;

  // Background canvas for persistent background in mirror mode (prevents flickering)
  private _backgroundCanvas: HTMLCanvasElement | null = null;
  private _backgroundNeedsRedraw = true;

  /**
   * Apply position offset and scale transformation to context
   * Call this before drawing visualization, and call restoreTransform() after
   *
   * For mirrorHorizontal mode:
   * - No clipping is applied here
   * - The visualizer draws normally to the full canvas
   * - restoreTransform() will extract the LEFT half and mirror it to the RIGHT half
   * - This creates the "diverge from center" effect (visualization starts at center, goes outward)
   */
  protected applyTransform(ctx: CanvasRenderingContext2D, data?: { width: number; height: number }): void {
    const offsetX = this.options.offsetX ?? 0;
    const offsetY = this.options.offsetY ?? 0;
    const scale = this.options.scale ?? 1;
    const mirrorHorizontal = this.options.mirrorHorizontal ?? false;
    const needsTransform = offsetX !== 0 || offsetY !== 0 || scale !== 1 || mirrorHorizontal;

    if (needsTransform) {
      ctx.save();

      // For horizontal mirror mode, we don't clip here anymore
      // Instead, we let the visualizer draw normally, then in restoreTransform():
      // 1. Extract the LEFT half (0 to center)
      // 2. Draw it on the LEFT side
      // 3. Mirror it to the RIGHT side
      // This creates the "diverge from center" effect
      if (mirrorHorizontal && data) {
        // No clipping - let visualizer draw normally
        // The mirroring will happen in restoreTransform()
      } else if (scale !== 1 && data) {
        // If we have scale and dimensions, scale around center
        const centerX = data.width / 2;
        const centerY = data.height / 2;

        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        ctx.translate(-centerX + offsetX / scale, -centerY + offsetY / scale);
      } else if (offsetX !== 0 || offsetY !== 0) {
        ctx.translate(offsetX, offsetY);
      }
    }
  }

  /**
   * Restore context transformation state and draw mirrored copy if horizontal mirror is enabled
   * Call this after drawing visualization if applyTransform() was called
   *
   * For mirrorHorizontal mode:
   * - Background is drawn normally (not mirrored, no flickering) using cached background canvas
   * - Visualization from LEFT half is kept on LEFT side (starts from left edge, goes to center)
   * - Visualization from LEFT half is mirrored to RIGHT side (from center to right edge)
   * - Result: visualization appears to diverge from center outward
   */
  protected restoreTransform(ctx: CanvasRenderingContext2D, data?: { width: number; height: number }): void {
    const offsetX = this.options.offsetX ?? 0;
    const offsetY = this.options.offsetY ?? 0;
    const scale = this.options.scale ?? 1;
    const mirrorHorizontal = this.options.mirrorHorizontal ?? false;
    const needsTransform = offsetX !== 0 || offsetY !== 0 || scale !== 1 || mirrorHorizontal;

    if (needsTransform) {
      ctx.restore();

      // For horizontal mirror:
      // 1. Save the LEFT half of the visualization
      // 2. Clear the canvas
      // 3. Draw background (cached, not mirrored)
      // 4. Draw LEFT half visualization on LEFT side
      // 5. Mirror LEFT half to RIGHT side
      if (mirrorHorizontal && data) {
        const { width, height } = data;
        const halfWidth = Math.floor(width / 2);

        // Create/update persistent background canvas (drawn once, reused every frame)
        if (!this._backgroundCanvas) {
          this._backgroundCanvas = document.createElement('canvas');
          this._backgroundNeedsRedraw = true;
        }
        if (this._backgroundCanvas.width !== width || this._backgroundCanvas.height !== height) {
          this._backgroundCanvas.width = width;
          this._backgroundCanvas.height = height;
          this._backgroundNeedsRedraw = true;
        }

        // Redraw background only when needed (first time, size change, or explicit flag)
        if (this._backgroundNeedsRedraw) {
          const bgCtx = this._backgroundCanvas.getContext('2d');
          if (bgCtx) {
            bgCtx.clearRect(0, 0, width, height);
            if (this.options.drawBackground) {
              this._drawBackgroundInternal(bgCtx, width, height);
            }
            // Apply layer effects to background
            const visualizationData = data as VisualizationData;
            this.applyLayerEffect(bgCtx, visualizationData);
          }
          this._backgroundNeedsRedraw = false;
        }

        // Create temp canvas for the LEFT half visualization
        if (!this._mirrorTempCanvas) {
          this._mirrorTempCanvas = document.createElement('canvas');
        }
        if (this._mirrorTempCanvas.width !== halfWidth || this._mirrorTempCanvas.height !== height) {
          this._mirrorTempCanvas.width = halfWidth;
          this._mirrorTempCanvas.height = height;
        }
        const tempCtx = this._mirrorTempCanvas.getContext('2d');
        if (!tempCtx) return;

        // Copy LEFT half of current canvas (visualization only, from 0 to center)
        tempCtx.clearRect(0, 0, halfWidth, height);
        tempCtx.drawImage(
          ctx.canvas,
          0, 0, halfWidth, height,   // source: LEFT half of main canvas
          0, 0, halfWidth, height    // dest: temp canvas
        );

        // Clear canvas and composite: background + visualizations
        ctx.clearRect(0, 0, width, height);

        // Draw persistent background (no expensive redraw - prevents flickering)
        if (this._backgroundCanvas) {
          ctx.drawImage(this._backgroundCanvas, 0, 0);
        }

        // Draw visualization on LEFT half (from left edge to center)
        ctx.drawImage(
          this._mirrorTempCanvas,
          0, 0, halfWidth, height,  // source: temp canvas (visualization only)
          0, 0, halfWidth, height   // dest: LEFT half of main canvas
        );

        // Draw mirrored visualization on RIGHT half (from center to right edge)
        // The mirror transformation: translate to right edge, scale -1 horizontally
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(this._mirrorTempCanvas, 0, 0); // Mirrored visualization on RIGHT side
        ctx.restore();
      }
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
    this._mirrorTempCanvas = null;
    this._backgroundCanvas = null;
  }
}
