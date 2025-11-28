import type { CTFQualitySettings, CTFSettings } from "./ctf_settings";
import type { CTFQualityProfiles, WindowLevelQualityProfiles } from "./quality_profiles";
import type { WindowLevelQualitySettings, WindowLevelRenderSettings } from "./window_level_settings";


export interface RendererContextType {
  // Window/Level pipeline
  wlSettings: WindowLevelRenderSettings;
  wlQualityProfiles: WindowLevelQualityProfiles;
  
  // CTF pipeline
  ctfSettings: CTFSettings;
  ctfQualityProfiles: CTFQualityProfiles; // Fixed typo: was ctfLQProfile
  
  // Pipeline selection
  currentPipeline: "wl" | "ctf";
  
  // HU range (loaded async)
  huRange: { min: number; max: number } | null; // null until loaded
  
  usingCuttingCube: boolean;
  doingTask:boolean;
  // Update functions
  updateWLSettings: (updates: Partial<WindowLevelRenderSettings>) => void;
  updateWLQuality: (quality: 'lq' | 'hq', updates: Partial<WindowLevelQualitySettings>) => void;
  updateCTFSettings: (updates: Partial<CTFSettings>) => void;
  updateCTFQuality: (quality: 'lq' | 'hq', updates: Partial<CTFQualitySettings>) => void;
  setPipeline: (pipeline: "wl" | "ctf") => void;
  setHURange: (min: number, max: number) => void;
  toggleProgressBar:(val:boolean)=>void;
  toggleCuttingCube:(val: boolean)=>void;
}