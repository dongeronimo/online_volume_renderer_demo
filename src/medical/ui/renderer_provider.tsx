import { createContext, useEffect, useState } from "react";
import type { RendererContextType } from "./renderer_context";
import type { WindowLevelQualitySettings, WindowLevelRenderSettings } from "./window_level_settings";
import type { CTFQualityProfiles, WindowLevelQualityProfiles } from "./quality_profiles";
import type { CTFQualitySettings, CTFSettings } from "./ctf_settings";
import { rootEventsTarget } from "./events";

export const RendererContext = createContext<RendererContextType>(null!);

export const RendererProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  // WL state
  const [wlSettings, setWLSettings] = useState<WindowLevelRenderSettings>({
    window: 300,
    level: 100,
    densityScale: 0.5,
    ambient: 0.3,
  });

  const [wlQualityProfiles, setWLQualityProfiles] = useState<WindowLevelQualityProfiles>({
    lq: {
      stepSize: 0.006,
      offscreenBufferScale: 1.0,
      useGradient: false,
      densityForMarchSpaceSkipping: -500,
      skipMultiplier: 2.0,
      subtleSurfaceThreshold: 0.01,
      surfaceThreshold: 0.1,
      maxSteps: 196,
      minGradientMagnitude: 0.01,
      accumulatedThreshold: 0.95,
      transmittanceThreshold: 0.05,
    },
    hq: {
      stepSize: 0.001,
      offscreenBufferScale: 1.0,
      useGradient: true,
      densityForMarchSpaceSkipping: -500,
      skipMultiplier: 2.0,
      subtleSurfaceThreshold: 0.01,
      surfaceThreshold: 0.1,
      maxSteps: 256,
      minGradientMagnitude: 0.01,
      accumulatedThreshold: 0.95,
      transmittanceThreshold: 0.05,
    },
  });

  // CTF state
  const [ctfSettings, setCTFSettings] = useState<CTFSettings>({
    ambient: 0.3,
  });

  const [ctfQualityProfiles, setCTFQualityProfiles] = useState<CTFQualityProfiles>({
    lq: {
      stepSize: 0.006,
      useGradient: false,
      maxSteps: 4096,
    },
    hq: {
      stepSize: 0.001,
      useGradient: true,
      maxSteps: 4096,
    },
  });

  // Pipeline selection
  const [currentPipeline, setCurrentPipeline] = useState<"wl" | "ctf">("wl");

  const [doingTask, toggleProgressBar] = useState(false);
  // HU range (null until loaded)
  const [huRange, setHURangeState] = useState<{ min: number; max: number } | null>(null);

  // Update functions
  const updateWLSettings = (updates: Partial<WindowLevelRenderSettings>) => {
    setWLSettings(prev => {
      const newSettings = { ...prev, ...updates };
      // Dispatch event for renderer
      rootEventsTarget.dispatchEvent(new CustomEvent('wl-settings-changed', {
        detail: newSettings
      }));
      return newSettings;
    });
  };

  const updateWLQuality = (quality: 'lq' | 'hq', updates: Partial<WindowLevelQualitySettings>) => {
    setWLQualityProfiles(prev => {
      const newProfiles = {
        ...prev,
        [quality]: { ...prev[quality], ...updates }
      };
      // Dispatch event
      rootEventsTarget.dispatchEvent(new CustomEvent('wl-quality-changed', {
        detail: { quality, settings: newProfiles[quality] }
      }));
      return newProfiles;
    });
  };

  const updateCTFSettings = (updates: Partial<CTFSettings>) => {
    setCTFSettings(prev => {
      const newSettings = { ...prev, ...updates };
      rootEventsTarget.dispatchEvent(new CustomEvent('ctf-settings-changed', {
        detail: newSettings
      }));
      return newSettings;
    });
  };

  const updateCTFQuality = (quality: 'lq' | 'hq', updates: Partial<CTFQualitySettings>) => {
    setCTFQualityProfiles(prev => {
      const newProfiles = {
        ...prev,
        [quality]: { ...prev[quality], ...updates }
      };
      rootEventsTarget.dispatchEvent(new CustomEvent('ctf-quality-changed', {
        detail: { quality, settings: newProfiles[quality] }
      }));
      return newProfiles;
    });
  };

  const setPipeline = (pipeline: "wl" | "ctf") => {
    setCurrentPipeline(pipeline);
    rootEventsTarget.dispatchEvent(new CustomEvent('pipeline-changed', {
      detail: { pipeline }
    }));
  };

  const setHURange = (min: number, max: number) => {
    setHURangeState({ min, max });
    // Components using huRange will automatically re-render
  };

  // Listen for external HU range updates (from your existing code)
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setHURange(e.detail.min, e.detail.max);
    };
    rootEventsTarget.addEventListener('minmax-updated', handler as EventListener);
    return () => rootEventsTarget.removeEventListener('minmax-updated', handler as EventListener);
  }, []);

  // Effect #2: Listen for task started
  useEffect(() => {
    const startHandler = (_: Event) => {
      toggleProgressBar(true);
    };
    const endHandler = (_: Event) => {
      toggleProgressBar(false);
    };
    rootEventsTarget.addEventListener('task-started', startHandler);
    rootEventsTarget.addEventListener('task-completed', endHandler);
    
    return () => {
      rootEventsTarget.removeEventListener('task-started', startHandler);
      rootEventsTarget.removeEventListener('task-completed', endHandler);
    };
  }, []); // Empty deps = runs once on mount

  const contextValue: RendererContextType = {
    wlSettings,
    wlQualityProfiles,
    ctfSettings,
    ctfQualityProfiles,
    currentPipeline,
    huRange,
    doingTask, 
    updateWLSettings,
    updateWLQuality,
    updateCTFSettings,
    updateCTFQuality,
    setPipeline,
    setHURange,
    toggleProgressBar
  };

  return (
    <RendererContext.Provider value={contextValue}>
      {children}
    </RendererContext.Provider>
  );
};