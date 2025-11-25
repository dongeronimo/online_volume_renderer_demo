import type { CTFQualitySettings } from "./ctf_settings";
import type { WindowLevelQualitySettings } from "./window_level_settings";

export interface WindowLevelQualityProfiles {
    lq:  WindowLevelQualitySettings;
    hq:  WindowLevelQualitySettings;
}

export interface CTFQualityProfiles {
    lq: CTFQualitySettings;
    hq: CTFQualitySettings;
}
