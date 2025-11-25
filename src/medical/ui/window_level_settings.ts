    export interface WindowLevelRenderSettings {
        window: number;
        level: number;
        densityScale: number;
        ambient: number;
    }
    export interface WindowLevelQualitySettings {
      stepSize: number;
      offscreenBufferScale: number;
      useGradient: boolean;
      densityForMarchSpaceSkipping: number;
      skipMultiplier: number;
      subtleSurfaceThreshold: number;
      surfaceThreshold: number;
      maxSteps: number;
      minGradientMagnitude: number;
      accumulatedThreshold: number;
      transmittanceThreshold: number;
    }
