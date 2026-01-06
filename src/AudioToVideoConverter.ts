import { AudioAnalyzer } from './core/AudioAnalyzer';
import { VideoRecorder } from './core/VideoRecorder';
import {
  ConversionConfig,
  Visualizer,
  VisualizationData,
  VisualizerOptions,
} from './types';
import {
  WaveformVisualizer,
  BarVisualizer,
  CircularVisualizer,
  ParticleVisualizer,
  SpectrumGradientVisualizer,
  GlowWaveformVisualizer,
  VUMeterVisualizer,
  SpectrogramVisualizer,
  SpiralWaveformVisualizer,
  RadialBarsVisualizer,
  FrequencyRingsVisualizer,
} from './visualizers';

/**
 * Built-in visualizer registry
 */
const BUILT_IN_VISUALIZERS: Record<string, new (options?: VisualizerOptions) => Visualizer> = {
  waveform: WaveformVisualizer,
  bars: BarVisualizer,
  circular: CircularVisualizer,
  particles: ParticleVisualizer,
  'spectrum-gradient': SpectrumGradientVisualizer,
  'glow-waveform': GlowWaveformVisualizer,
  'vu-meter': VUMeterVisualizer,
  spectrogram: SpectrogramVisualizer,
  'spiral-waveform': SpiralWaveformVisualizer,
  'radial-bars': RadialBarsVisualizer,
  'frequency-rings': FrequencyRingsVisualizer,
};

/**
 * Converts audio files to video with visualization
 */
export class AudioToVideoConverter {
  private debug: boolean;
  private isCancelled: boolean = false;

  constructor(options: { debug?: boolean } = {}) {
    this.debug = options.debug ?? false;
  }

  /**
   * Cancel the current conversion
   */
  cancel(): void {
    this.isCancelled = true;
    this.log('Conversion cancelled by user');
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[AudioToVideoConverter]', ...args);
    }
  }

  /**
   * Create a built-in visualizer by name
   */
  private createBuiltInVisualizer(
    name: string,
    options?: VisualizerOptions
  ): Visualizer {
    const VisualizerClass = BUILT_IN_VISUALIZERS[name];
    if (!VisualizerClass) {
      throw new Error(
        `Unknown visualizer: ${name}. Available: ${Object.keys(BUILT_IN_VISUALIZERS).join(', ')}`
      );
    }
    return new VisualizerClass(options);
  }

  /**
   * Convert an audio file to video with visualization
   * @param config - Conversion configuration
   * @returns Promise resolving to the video blob
   */
  async convert(config: ConversionConfig): Promise<Blob> {
    // Reset cancellation flag
    this.isCancelled = false;

    const {
      canvas: canvasConfig,
      visualizer: visualizerConfig,
      visualizerOptions,
      videoWidth = 1920,
      videoHeight = 1080,
      offlineRender = false,
    } = config;

    // Get canvas element
    let canvas: HTMLCanvasElement;
    if (typeof canvasConfig === 'string') {
      const element = document.querySelector(canvasConfig);
      if (!element || !(element instanceof HTMLCanvasElement)) {
        throw new Error(`Canvas element not found: ${canvasConfig}`);
      }
      canvas = element;
    } else {
      canvas = canvasConfig;
    }

    // Set canvas size
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    // Get 2D context with color space settings for better color accuracy
    const ctx = canvas.getContext('2d', {
      alpha: true,
      colorSpace: 'srgb',
      willReadFrequently: false,
    });
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas');
    }

    // Set image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Create visualizer
    let visualizer: Visualizer;
    if (visualizerConfig) {
      if (typeof visualizerConfig === 'string') {
        visualizer = this.createBuiltInVisualizer(visualizerConfig, visualizerOptions);
      } else {
        visualizer = visualizerConfig;
      }
    } else {
      visualizer = new BarVisualizer(visualizerOptions);
    }
    // Wait for visualizer initialization (including image loading) to prevent flickering
    await visualizer.init(canvas, visualizerOptions);

    // Use offline rendering if requested
    if (offlineRender) {
      return this.convertOffline(config, canvas, ctx, visualizer);
    }

    // Real-time rendering (original implementation)
    return this.convertRealtime(config, canvas, ctx, visualizer);
  }

  /**
   * Convert audio to video using real-time rendering (with audio playback)
   */
  private async convertRealtime(
    config: ConversionConfig,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    visualizer: Visualizer
  ): Promise<Blob> {
    const {
      audioSource,
      fps = 30,
      videoBitrate = 8000000,
      audioBitrate = 192000,
      format = 'webm',
      onProgress,
    } = config;

    // Create audio element
    const audioElement = new Audio();
    audioElement.crossOrigin = 'anonymous';

    if (audioSource instanceof File) {
      audioElement.src = URL.createObjectURL(audioSource);
    } else {
      audioElement.src = audioSource;
    }

    // Wait for audio metadata to load
    await new Promise<void>((resolve, reject) => {
      audioElement.onloadedmetadata = () => resolve();
      audioElement.onerror = () => reject(new Error('Failed to load audio'));
    });

    const duration = audioElement.duration;
    this.log('Audio duration:', duration, 'seconds');

    // Create audio analyzer
    const analyzer = new AudioAnalyzer({
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      debug: this.debug,
    });

    await analyzer.connectAudioElement(audioElement);

    // Create video recorder
    const videoRecorder = new VideoRecorder({ debug: this.debug });

    // Since we've already connected the audio element, we'll capture from it differently
    // Create a new stream from the audio element for recording
    let audioStream: MediaStream | undefined;

    try {
      // Try to capture audio using captureStream if available
      if ('captureStream' in audioElement) {
        audioStream = (audioElement as HTMLMediaElement & { captureStream(): MediaStream }).captureStream();
      } else if ('mozCaptureStream' in audioElement) {
        audioStream = (audioElement as HTMLMediaElement & { mozCaptureStream(): MediaStream }).mozCaptureStream();
      }
    } catch (e) {
      this.log('Could not capture stream from audio element, video will have no audio');
    }

    // Start recording
    videoRecorder.start(canvas, audioStream, {
      format,
      fps,
      videoBitrate,
      audioBitrate,
    });

    // Start playback
    audioElement.play();
    this.log('Started playback and recording');

    // Render loop with improved timing and reliability
    const frameInterval = 1000 / fps;
    let lastFrameTime = 0;
    let frameCount = 0;

    return new Promise((resolve, reject) => {
      let hasErrored = false;

      const cleanup = (): void => {
        visualizer.destroy();
        analyzer.destroy();
        if (audioSource instanceof File) {
          URL.revokeObjectURL(audioElement.src);
        }
      };

      const renderFrame = (): void => {
        if (hasErrored) return;

        // Check for cancellation
        if (this.isCancelled) {
          hasErrored = true;
          videoRecorder.cancel();
          cleanup();
          reject(new Error('Conversion cancelled by user'));
          return;
        }

        try {
          const now = performance.now();

          if (now - lastFrameTime >= frameInterval) {
            lastFrameTime = now;
            frameCount++;

            const data: VisualizationData = {
              timeDomainData: analyzer.getTimeDomainData(),
              frequencyData: analyzer.getFrequencyData(),
              timestamp: now,
              width: canvas.width,
              height: canvas.height,
              sampleRate: analyzer.sampleRate,
              fftSize: analyzer.fftSize,
            };

            visualizer.draw(ctx, data);

            // Report progress
            if (onProgress && duration > 0) {
              const progress = Math.min(audioElement.currentTime / duration, 1);
              onProgress(progress);
            }
          }

          // Continue until audio ends or cancelled
          if (!audioElement.ended && !audioElement.paused && !this.isCancelled) {
            requestAnimationFrame(renderFrame);
          } else {
            // Audio ended, stop recording
            this.log('Audio playback ended after', frameCount, 'frames');

            // Wait longer to ensure all frames are captured by MediaRecorder
            setTimeout(async () => {
              if (hasErrored) return;

              try {
                const blob = await videoRecorder.stop();

                // Cleanup
                cleanup();

                if (onProgress) {
                  onProgress(1);
                }

                this.log('Conversion complete, blob size:', blob.size, 'bytes');

                // Verify blob is valid
                if (blob.size === 0) {
                  reject(new Error('Export failed: video blob is empty'));
                  return;
                }

                resolve(blob);
              } catch (error) {
                hasErrored = true;
                cleanup();
                reject(error);
              }
            }, 1000); // Increased from 500ms to 1000ms for better reliability
          }
        } catch (error) {
          hasErrored = true;
          videoRecorder.cancel();
          cleanup();
          reject(error);
        }
      };

      audioElement.onerror = () => {
        hasErrored = true;
        videoRecorder.cancel();
        cleanup();
        reject(new Error('Audio playback error'));
      };

      // Render first frame immediately to ensure recording starts with content
      requestAnimationFrame(renderFrame);
    });
  }

  /**
   * Convert audio to video using synchronized real-time rendering
   *
   * IMPORTANT: MediaRecorder with captureStream(0) + requestFrame() does NOT work
   * for offline/faster-than-realtime rendering. See:
   * - https://github.com/w3c/mediacapture-record/issues/213
   * - https://bugzilla.mozilla.org/show_bug.cgi?id=1344524
   *
   * MediaRecorder operates on wall-clock time, and frames rendered faster than
   * real-time are dropped. The only reliable solution is real-time synchronized
   * rendering where frames are rendered in sync with audio playback.
   *
   * This method pre-analyzes the entire audio file for visualization data,
   * then plays the audio at normal speed while rendering synchronized frames.
   * The audio volume is set to 0 to avoid hearing it during conversion.
   */
  private async convertOffline(
    config: ConversionConfig,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    visualizer: Visualizer
  ): Promise<Blob> {
    const {
      audioSource,
      fps = 30,
      videoBitrate = 8000000,
      audioBitrate = 192000,
      format = 'webm',
      onProgress,
    } = config;

    this.log('Starting audio-to-video conversion (synchronized real-time rendering)');

    // Load audio file as ArrayBuffer for pre-analysis
    let audioArrayBuffer: ArrayBuffer;
    let audioSourceBlob: Blob | null = null;

    if (audioSource instanceof File) {
      audioArrayBuffer = await audioSource.arrayBuffer();
      audioSourceBlob = audioSource;
    } else {
      // Fetch audio from URL
      const response = await fetch(audioSource);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }
      audioArrayBuffer = await response.arrayBuffer();
      audioSourceBlob = await response.blob();
    }

    // Decode audio using Web Audio API for visualization analysis
    const audioContext = new AudioContext();
    let audioContextClosed = false;
    const audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer.slice(0));

    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const fftSize = 2048;

    this.log('Conversion config:', {
      duration: duration.toFixed(2) + 's',
      sampleRate,
      fps,
      format,
    });

    // Get raw audio data for visualization analysis
    const channelData = audioBuffer.getChannelData(0); // Use first channel for analysis

    // Create audio element for playback and audio capture
    const audioBlobUrl = URL.createObjectURL(audioSourceBlob);
    const audioElement = new Audio(audioBlobUrl);
    audioElement.crossOrigin = 'anonymous';

    // Wait for audio to be ready
    await new Promise<void>((resolve, reject) => {
      audioElement.oncanplaythrough = () => resolve();
      audioElement.onerror = () => reject(new Error('Failed to load audio for recording'));
      audioElement.load();
    });

    // Get audio stream for recording
    let audioStream: MediaStream | undefined;
    try {
      if ('captureStream' in audioElement) {
        audioStream = (audioElement as HTMLMediaElement & { captureStream(): MediaStream }).captureStream();
      } else if ('mozCaptureStream' in audioElement) {
        audioStream = (audioElement as HTMLMediaElement & { mozCaptureStream(): MediaStream }).mozCaptureStream();
      }
    } catch (e) {
      this.log('Could not capture stream from audio element, video will have no audio');
    }

    // Create video recorder with automatic canvas capture at specified FPS
    // Using captureStream(fps) for automatic frame capture synced to wall-clock time
    const videoRecorder = new VideoRecorder({ debug: this.debug });

    // Draw initial frame to ensure canvas has content before capture starts
    const { timeDomainData: initialTimeDomain, frequencyData: initialFrequency } = this.analyzeAudioFrame(
      channelData,
      0,
      fftSize,
      sampleRate
    );
    visualizer.draw(ctx, {
      timeDomainData: initialTimeDomain,
      frequencyData: initialFrequency,
      timestamp: 0,
      width: canvas.width,
      height: canvas.height,
      sampleRate,
      fftSize,
    });

    // Wait a frame to ensure the canvas has rendered
    await new Promise(resolve => setTimeout(resolve, 16));

    // Start recording with automatic frame capture
    videoRecorder.start(canvas, audioStream, {
      format,
      fps,
      videoBitrate,
      audioBitrate,
    });

    // Set volume to 0 to avoid hearing audio during conversion
    // Note: Audio must NOT be muted (muted=true stops audio capture)
    audioElement.volume = 0;

    // Try to start audio playback
    const playPromise = audioElement.play();
    if (playPromise) {
      await playPromise
        .then(() => {
          this.log('Audio playback started successfully');
        })
        .catch((error) => {
          this.log('Audio autoplay blocked:', error.message);
          this.log('Continuing with video-only output');
        });
    }

    const cleanup = (): void => {
      visualizer.destroy();
      if (!audioContextClosed) {
        audioContext.close().catch(() => {});
        audioContextClosed = true;
      }
      audioElement.pause();
      URL.revokeObjectURL(audioBlobUrl);
    };

    try {
      // Render frames synchronized with audio playback using requestAnimationFrame
      // This ensures frames are rendered at wall-clock time for proper MediaRecorder capture
      const frameInterval = 1000 / fps;
      let lastFrameTime = 0;
      let frameCount = 0;

      this.log(`Starting synchronized rendering at ${fps} fps`);

      await new Promise<void>((resolve, reject) => {
        let hasErrored = false;

        const renderFrame = (): void => {
          if (hasErrored) return;

          // Check for cancellation
          if (this.isCancelled) {
            hasErrored = true;
            this.log(`Rendering cancelled at frame ${frameCount}`);
            reject(new Error('Conversion cancelled by user'));
            return;
          }

          try {
            const now = performance.now();

            // Only render at target frame rate
            if (now - lastFrameTime >= frameInterval) {
              lastFrameTime = now;
              frameCount++;

              // Get current audio time for visualization analysis
              const audioTime = audioElement.currentTime;
              const sampleIndex = Math.floor(audioTime * sampleRate);

              // Generate visualization data from pre-analyzed audio buffer
              const { timeDomainData, frequencyData } = this.analyzeAudioFrame(
                channelData,
                sampleIndex,
                fftSize,
                sampleRate
              );

              const data: VisualizationData = {
                timeDomainData,
                frequencyData,
                timestamp: audioTime * 1000,
                width: canvas.width,
                height: canvas.height,
                sampleRate,
                fftSize,
              };

              // Draw the frame
              visualizer.draw(ctx, data);

              // Report progress
              if (onProgress && duration > 0) {
                const progress = Math.min(audioTime / duration, 1);
                onProgress(progress);
              }
            }

            // Continue until audio ends or cancelled
            if (!audioElement.ended && !audioElement.paused && !this.isCancelled) {
              requestAnimationFrame(renderFrame);
            } else {
              // Audio ended, finalize
              this.log(`Audio playback ended after ${frameCount} frames`);
              resolve();
            }
          } catch (error) {
            hasErrored = true;
            this.log(`Error in rendering loop at frame ${frameCount}:`, error);
            reject(error);
          }
        };

        // Handle audio errors
        audioElement.onerror = () => {
          hasErrored = true;
          reject(new Error('Audio playback error'));
        };

        // Start the rendering loop
        requestAnimationFrame(renderFrame);
      });

      // Give MediaRecorder extra time to process final frames
      this.log('Finalizing recording...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Stop recording and get blob
      this.log('Stopping MediaRecorder...');
      const blob = await videoRecorder.stop();

      this.log(`MediaRecorder stopped. Blob type: ${blob.type}, size: ${blob.size} bytes`);

      cleanup();

      if (onProgress) {
        onProgress(1);
      }

      this.log('Conversion complete, blob size:', blob.size, 'bytes');

      if (blob.size === 0) {
        throw new Error('Export failed: video blob is empty (0 bytes). Possible causes:\n' +
          '1. MediaRecorder did not receive any data from canvas or audio streams\n' +
          '2. Browser autoplay policy blocked audio playback\n' +
          '3. Canvas rendering failed or was empty\n' +
          '4. MediaRecorder encoding failed\n' +
          'Check console logs above for more details.');
      }

      return blob;
    } catch (error) {
      videoRecorder.cancel();
      cleanup();
      throw error;
    }
  }

  /**
   * Analyze a frame of audio data to extract time domain and frequency data
   * This is a simplified FFT analysis for offline rendering
   */
  private analyzeAudioFrame(
    channelData: Float32Array,
    startSample: number,
    fftSize: number,
    _sampleRate: number
  ): { timeDomainData: Uint8Array; frequencyData: Uint8Array } {
    const timeDomainData = new Uint8Array(fftSize);
    const frequencyData = new Uint8Array(fftSize / 2);

    // Extract time domain data (convert from Float32 to Uint8)
    for (let i = 0; i < fftSize; i++) {
      const sampleIndex = startSample + i;
      if (sampleIndex < channelData.length) {
        // Convert from -1..1 to 0..255 (with 128 being silence)
        timeDomainData[i] = Math.round((channelData[sampleIndex] + 1) * 127.5);
      } else {
        timeDomainData[i] = 128; // Silence
      }
    }

    // Simple frequency analysis using DFT approximation
    // This is a simplified version - we calculate magnitude for each frequency bin
    const halfFFT = fftSize / 2;
    for (let k = 0; k < halfFFT; k++) {
      let real = 0;
      let imag = 0;

      // Use a smaller window for faster computation (every 4th sample)
      const step = 4;
      for (let n = 0; n < fftSize; n += step) {
        const sampleIndex = startSample + n;
        if (sampleIndex < channelData.length) {
          const sample = channelData[sampleIndex];
          const angle = (2 * Math.PI * k * n) / fftSize;
          real += sample * Math.cos(angle);
          imag -= sample * Math.sin(angle);
        }
      }

      // Calculate magnitude and scale to 0-255
      const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize / step);
      // Apply log scale for better visualization (similar to Web Audio API)
      const db = 20 * Math.log10(Math.max(magnitude, 0.00001));
      // Scale from -100dB to 0dB to 0-255
      const normalized = Math.max(0, Math.min(255, ((db + 100) / 100) * 255));
      frequencyData[k] = Math.round(normalized);
    }

    return { timeDomainData, frequencyData };
  }

  /**
   * Get list of available built-in visualizers
   */
  static getAvailableVisualizers(): string[] {
    return Object.keys(BUILT_IN_VISUALIZERS);
  }

  /**
   * Get supported output formats
   */
  static getSupportedFormats(): string[] {
    return VideoRecorder.getSupportedFormats();
  }
}
