import React, { useEffect, useState } from 'react';
import { FloatingPanel } from '../editor/components/floatingPanel';
import { FloatEditor } from '../editor/components/floatEditor';
import { CheckboxEditor } from '../editor/components/checkboxEditor';
import { LassoControlsPanel } from './ui/lassoControlsPanel';
import { Minus, Plus } from 'lucide-react';


export interface UiRoot {
    //image window (the width of range of values that'll be shown).
    initialWindow: number,
    //the image level (the center of the window)
    initialLevel:number,
    //a multiplier to make the the image more visible.
    initialDensityScale:number,
    //phong ambient factor
    ambient:number,
    //smallest HU value
    minValue: number,
    //biggest HU value
    maxValue: number,

    onWindowChange: (newValue:number)=>void,
    onLevelChange: (newValue:number)=>void,
    onDensityScaleChange: (newValue:number)=>void,
    onAmbient:(newValue:number)=>void,

    stepSizeLQ: number,
    initialOffscreenBufferScaleLQ: number,
    useGradientLQ: boolean,
    densityForMarchSpaceSkippingLQ: number,
    skipMultiplierLQ: number,
    subtleSurfaceThresholdLQ: number,
    surfaceThresholdLQ: number,
    maxStepsLQ: number,    
    minGradientMagnitudeLQ: number,
    accumulatedThresholdLQ: number,
    transmittanceThresholdLQ: number,
    onStepSizeChangeLQ: (newValue:number)=>void,
    onOffscreenBufferScaleChangeLQ: (v:number)=>void,
    onUseGradientChangeLQ: (v:boolean)=>void,
    onDensityForMarchSpaceSkippingLQ:(newValue:number)=>void,
    onSkipMultiplierLQ:(newValue:number)=>void,
    onSubtleSurfaceThresholdLQ:(newValue:number)=>void,
    onSurfaceThresholdLQ:(newValue:number)=>void,
    onMaxStepsLQ:(newValue:number)=>void,    
    onMinGradientMagnitudeLQ:(newValue:number)=>void,
    onAccumulatedThresholdLQ:(newValue:number)=>void,
    onTransmittanceThresholdLQ:(newValue:number)=>void,

    stepSizeHQ: number,
    initialOffscreenBufferScaleHQ: number,
    useGradientHQ: boolean,
    densityForMarchSpaceSkippingHQ: number,
    skipMultiplierHQ: number,
    subtleSurfaceThresholdHQ: number,
    surfaceThresholdHQ: number,
    maxStepsHQ: number,    
    minGradientMagnitudeHQ: number,
    accumulatedThresholdHQ: number,
    transmittanceThresholdHQ: number,
    onStepSizeChangeHQ: (newValue:number)=>void,
    onOffscreenBufferScaleChangeHQ: (v:number)=>void,
    onUseGradientChangeHQ: (v:boolean)=>void,
    onDensityForMarchSpaceSkippingHQ:(newValue:number)=>void,
    onSkipMultiplierHQ:(newValue:number)=>void,
    onSubtleSurfaceThresholdHQ:(newValue:number)=>void,
    onSurfaceThresholdHQ:(newValue:number)=>void,
    onMaxStepsHQ:(newValue:number)=>void,    
    onMinGradientMagnitudeHQ:(newValue:number)=>void,
    onAccumulatedThresholdHQ:(newValue:number)=>void,
    onTransmittanceThresholdHQ:(newValue:number)=>void,

}
export const uiRootEventsTarget = new EventTarget();
export const UiRoot: React.FC<UiRoot> = 
    ({initialWindow, initialLevel, stepSizeLQ: stepSize, initialDensityScale, 
      initialOffscreenBufferScaleLQ: initialOffscreenBufferScale, useGradientLQ: useGradient,
      ambient: ambient, densityForMarchSpaceSkippingLQ: densityForMarchSpaceSkipping, skipMultiplierLQ: skipMultiplier,
      subtleSurfaceThresholdLQ: subtleSurfaceThreshold, surfaceThresholdLQ: surfaceThreshold, maxStepsLQ: maxSteps,
      minGradientMagnitudeLQ: minGradientMagnitude, accumulatedThresholdLQ: accumulatedThreshold, transmittanceThresholdLQ: transmittanceThreshold,
      maxValue, minValue,
      onWindowChange, onLevelChange, onStepSizeChangeLQ: onStepSizeChange, onDensityScaleChange, 
      onOffscreenBufferScaleChangeLQ: onOffscreenBufferScaleChange, onUseGradientChangeLQ: onUseGradientChange,
      onAmbient, onDensityForMarchSpaceSkippingLQ: onDensityForMarchSpaceSkipping, onSkipMultiplierLQ: onSkipMultiplier,
      onSubtleSurfaceThresholdLQ: onSubtleSurfaceThreshold, onSurfaceThresholdLQ: onSurfaceThreshold, onMaxStepsLQ: onMaxSteps,
      onMinGradientMagnitudeLQ: onMinGradientMagnitude, onAccumulatedThresholdLQ: onAccumulatedThreshold, onTransmittanceThresholdLQ: onTransmittanceThreshold,
    
    stepSizeHQ, initialOffscreenBufferScaleHQ, useGradientHQ, densityForMarchSpaceSkippingHQ, skipMultiplierHQ, 
    subtleSurfaceThresholdHQ, surfaceThresholdHQ, maxStepsHQ, minGradientMagnitudeHQ, accumulatedThresholdHQ, 
    transmittanceThresholdHQ,onStepSizeChangeHQ, onOffscreenBufferScaleChangeHQ, onUseGradientChangeHQ,
    onDensityForMarchSpaceSkippingHQ, onSkipMultiplierHQ, onSubtleSurfaceThresholdHQ,onSurfaceThresholdHQ,
    onMaxStepsHQ, onMinGradientMagnitudeHQ,onAccumulatedThresholdHQ,onTransmittanceThresholdHQ,         
    
    }) => {
    const [_minValue, setMinValue] = useState(minValue);
    const [_maxValue, setMaxValue] = useState(maxValue);
        
    useEffect(() => {
        const handler = (e: CustomEvent) => {
            setMinValue(e.detail.min);
            setMaxValue(e.detail.max);
        };
        uiRootEventsTarget.addEventListener('minmax-updated', handler as EventListener);
        return () => uiRootEventsTarget.removeEventListener('minmax-updated', handler as EventListener);
    }, []);
    
    // const windowWidth = _maxValue - _minValue;
    // const safeWindowWidth = windowWidth > 0 ? windowWidth : 1;
    const [_window, setWindow] = useState(initialWindow);
    const [_level, setLevel] = useState(initialLevel);
    const displayWindow = _window;  // Already in HU units
    const displayLevel = _level;    // Already in HU units
    const [_ambient, setAmbient] = useState(ambient);
    const [_densityScale, setDensityScale] = useState(initialDensityScale);
    
    // LQ State
    const [_StepSizeLQ, setStepSizeLQ] = useState(stepSize);
    const [_offscreenRenderBufferScaleLQ, setOffscreenRenderBufferScaleLQ] = useState(initialOffscreenBufferScale);
    const [_useGradientLQ, setUseGradientLQ] = useState(useGradient);
    const [_densityForMarchSpaceSkippingLQ, setDensityForMarchSpaceSkippingLQ] = useState(densityForMarchSpaceSkipping);
    const [_skipMultiplierLQ, setSkipMultiplierLQ] = useState(skipMultiplier);
    const [_subtleSurfaceThresholdLQ, setSubtleSurfaceThresholdLQ] = useState(subtleSurfaceThreshold);
    const [_surfaceThresholdLQ, setSurfaceThresholdLQ] = useState(surfaceThreshold);
    const [_maxStepsLQ, setMaxStepsLQ] = useState(maxSteps);
    const [_minGradientMagnitudeLQ, setMinGradientMagnitudeLQ] = useState(minGradientMagnitude);
    const [_accumulatedThresholdLQ, setAccumulatedThresholdLQ] = useState(accumulatedThreshold);
    const [_transmittanceThresholdLQ, setTransmittanceThresholdLQ] = useState(transmittanceThreshold);

    // HQ State
    const [_StepSizeHQ, setStepSizeHQ] = useState(stepSizeHQ);
    const [_offscreenRenderBufferScaleHQ, setOffscreenRenderBufferScaleHQ] = useState(initialOffscreenBufferScaleHQ);
    const [_useGradientHQ, setUseGradientHQ] = useState(useGradientHQ);
    const [_densityForMarchSpaceSkippingHQ, setDensityForMarchSpaceSkippingHQ] = useState(densityForMarchSpaceSkippingHQ);
    const [_skipMultiplierHQ, setSkipMultiplierHQ] = useState(skipMultiplierHQ);
    const [_subtleSurfaceThresholdHQ, setSubtleSurfaceThresholdHQ] = useState(subtleSurfaceThresholdHQ);
    const [_surfaceThresholdHQ, setSurfaceThresholdHQ] = useState(surfaceThresholdHQ);
    const [_maxStepsHQ, setMaxStepsHQ] = useState(maxStepsHQ);
    const [_minGradientMagnitudeHQ, setMinGradientMagnitudeHQ] = useState(minGradientMagnitudeHQ);
    const [_accumulatedThresholdHQ, setAccumulatedThresholdHQ] = useState(accumulatedThresholdHQ);
    const [_transmittanceThresholdHQ, setTransmittanceThresholdHQ] = useState(transmittanceThresholdHQ);

    const handleWChange = (newValue: number) => {
        // Window is already in HU units, pass directly
        setWindow(newValue);
        onWindowChange(newValue);
    };

    const handleLChange = (newValue: number) => {
        // Level is already in HU units, pass directly
        setLevel(newValue);
        onLevelChange(newValue);
    };

    const handleStepSizeChange = (newValue: number) => {
        if(newValue == 0) return;
        setStepSizeLQ(newValue);
        onStepSizeChange(newValue);
    };

    const handleDSChange = (newValue:number) => {
        if(newValue == 0) return;
        setDensityScale(newValue);
        onDensityScaleChange(newValue);
    };

    const handleOFSChange = (v:number) => {
        if(v == 0) return;
        setOffscreenRenderBufferScaleLQ(v);
        onOffscreenBufferScaleChange(v);
    };

    const handleUGChange = (v: boolean) => {
        setUseGradientLQ(v);
        onUseGradientChange(v);
    };

    const handleAmbChange = (newValue: number) => {
        setAmbient(newValue);
        onAmbient(newValue);
    };

    const handleDfmssChange = (newValue: number) => {
        setDensityForMarchSpaceSkippingLQ(newValue);
        onDensityForMarchSpaceSkipping(newValue);
    };

    const handleSmChange = (newValue: number) => {
        if(newValue == 0) return;
        setSkipMultiplierLQ(newValue);
        onSkipMultiplier(newValue);
    };

    const handleSstChange = (newValue: number) => {
        setSubtleSurfaceThresholdLQ(newValue);
        onSubtleSurfaceThreshold(newValue);
    };

    const handleStChange = (newValue: number) => {
        setSurfaceThresholdLQ(newValue);
        onSurfaceThreshold(newValue);
    };

    const handleMsChange = (newValue: number) => {
        if(newValue == 0) return;
        setMaxStepsLQ(newValue);
        onMaxSteps(newValue);
    };

    const handleMgmChange = (newValue: number) => {
        setMinGradientMagnitudeLQ(newValue);
        onMinGradientMagnitude(newValue);
    };

    const handleAtChange = (newValue: number) => {
        setAccumulatedThresholdLQ(newValue);
        onAccumulatedThreshold(newValue);
    };

    const handleTtChange = (newValue: number) => {
        setTransmittanceThresholdLQ(newValue);
        onTransmittanceThreshold(newValue);
    };

    // HQ Handlers
    const handleStepSizeChangeHQ = (newValue: number) => {
        if(newValue == 0) return;
        setStepSizeHQ(newValue);
        onStepSizeChangeHQ(newValue);
    };

    const handleOFSChangeHQ = (v:number) => {
        if(v == 0) return;
        setOffscreenRenderBufferScaleHQ(v);
        onOffscreenBufferScaleChangeHQ(v);
    };

    const handleUGChangeHQ = (v: boolean) => {
        setUseGradientHQ(v);
        onUseGradientChangeHQ(v);
    };

    const handleDfmssChangeHQ = (newValue: number) => {
        setDensityForMarchSpaceSkippingHQ(newValue);
        onDensityForMarchSpaceSkippingHQ(newValue);
    };

    const handleSmChangeHQ = (newValue: number) => {
        if(newValue == 0) return;
        setSkipMultiplierHQ(newValue);
        onSkipMultiplierHQ(newValue);
    };

    const handleSstChangeHQ = (newValue: number) => {
        setSubtleSurfaceThresholdHQ(newValue);
        onSubtleSurfaceThresholdHQ(newValue);
    };

    const handleStChangeHQ = (newValue: number) => {
        setSurfaceThresholdHQ(newValue);
        onSurfaceThresholdHQ(newValue);
    };

    const handleMsChangeHQ = (newValue: number) => {
        if(newValue == 0) return;
        setMaxStepsHQ(newValue);
        onMaxStepsHQ(newValue);
    };

    const handleMgmChangeHQ = (newValue: number) => {
        setMinGradientMagnitudeHQ(newValue);
        onMinGradientMagnitudeHQ(newValue);
    };

    const handleAtChangeHQ = (newValue: number) => {
        setAccumulatedThresholdHQ(newValue);
        onAccumulatedThresholdHQ(newValue);
    };

    const handleTtChangeHQ = (newValue: number) => {
        setTransmittanceThresholdHQ(newValue);
        onTransmittanceThresholdHQ(newValue);
    };
    
    const incrementWindow = () => {
        setWindow(prev => {
            const newValue = prev + 1;
            onWindowChange(newValue);
            return newValue;
        });
    };

    const decrementWindow = () => {
        setWindow(prev => {
            const newValue = prev - 1;
            onWindowChange(newValue);
            return newValue;
        });
    };

    const incrementLevel = () => {
        setLevel(prev => {
            const newValue = prev + 1;
            onLevelChange(newValue);
            return newValue;
        });
    };

    const decrementLevel = () => {
        setLevel(prev => {
            const newValue = prev - 1;
            onLevelChange(newValue);
            return newValue;
        });
    };

    const incrementDensityScale = () => {
        setDensityScale(prev => {
            const newValue = prev + + 0.0001;
            onDensityScaleChange(newValue);
            return newValue;
        });
    };

    const decrementDensityScale = () => {
        setDensityScale(prev => {
            const newValue = Math.max(0.0001, prev - 0.0001);
            onDensityScaleChange(newValue);
            return newValue;
        });
    };    
    return (
        <div>
            <FloatingPanel title='Lasso Tools' initialX={0} initialY={0} width={220} height={180}>
                <LassoControlsPanel />
            </FloatingPanel>
            <FloatingPanel title='Render Settings' initialX={0} initialY={200}>
                <div>
                    <label>Window:</label>
                    <button onClick={decrementWindow}><Minus size={14} /></button>
                    <FloatEditor width={45}
                        key={`window-${_minValue}-${_maxValue}-${displayWindow}`}
                        value={displayWindow} onChange={handleWChange}/>
                    <button onClick={incrementWindow}><Plus size={14} /></button>
                </div>
                <div>
                    <label>Level:</label>
                    <button onClick={decrementLevel}><Minus size={14} /></button>
                    <FloatEditor width={45}
                        key={`level-${_minValue}-${_maxValue}-${displayLevel}`}
                        value={displayLevel} onChange={handleLChange}/>
                    <button onClick={incrementLevel}><Plus size={14} /></button>
                </div>
                <div>
                    <label>Density Scale:</label>
                    <button onClick={decrementDensityScale}><Minus size={14} /></button>
                    <FloatEditor width={45} value={_densityScale} onChange={handleDSChange} key={_densityScale}/>
                    <button onClick={incrementDensityScale}><Plus size={14} /></button>
                </div>
                <div>
                    <label>Ambient:</label><FloatEditor width={45} value={_ambient} onChange={handleAmbChange}/>
                </div>
            </FloatingPanel>
            <FloatingPanel title="Quality settings" initialX={240} initialY={0} height={512} width={490}>
                <table style={{width:'100%'}}>
                    <thead>
                    <tr>
                        <td>param</td>
                        <td>low quality</td>
                        <td>high quality</td>

                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td><label>Step Size:</label></td>
                        <td><FloatEditor value={_StepSizeLQ} onChange={handleStepSizeChange} width={35}/></td>
                        <td><FloatEditor value={_StepSizeHQ} onChange={handleStepSizeChangeHQ} width={35}/></td>
                        
                    </tr>
                    <tr>
                        <td><label>Offscreen renderer scale:</label></td>
                        <td><FloatEditor value={_offscreenRenderBufferScaleLQ} onChange={handleOFSChange} width={35}/></td>
                        <td><FloatEditor value={_offscreenRenderBufferScaleHQ} onChange={handleOFSChangeHQ} width={35}/></td>
                        
                    </tr>
                    <tr>
                        <td><label>Gradient Lighting</label></td>
                        <td><CheckboxEditor value={_useGradientLQ} onChange={handleUGChange} label="" /></td>
                        <td><CheckboxEditor value={_useGradientHQ} onChange={handleUGChangeHQ} label="" /></td>
                        
                    </tr>
                    <tr>
                        <td><label>Density Skip Threshold:</label></td>
                        <td><FloatEditor value={_densityForMarchSpaceSkippingLQ} onChange={handleDfmssChange} width={35}/></td>
                        <td><FloatEditor value={_densityForMarchSpaceSkippingHQ} onChange={handleDfmssChangeHQ} width={35}/></td>
                        
                    </tr>
                    <tr>
                        <td><label>Skip Multiplier:</label></td>
                        <td><FloatEditor value={_skipMultiplierLQ} onChange={handleSmChange} width={35}/></td>
                        <td><FloatEditor value={_skipMultiplierHQ} onChange={handleSmChangeHQ} width={35}/></td>
                        
                    </tr>
                    <tr>
                        <td><label>Subtle Surface Threshold:</label></td>
                        <td><FloatEditor value={_subtleSurfaceThresholdLQ} onChange={handleSstChange} width={35}/></td>
                        <td><FloatEditor value={_subtleSurfaceThresholdHQ} onChange={handleSstChangeHQ} width={35}/></td>
                        
                    </tr>   
                    <tr>
                        <td><label>Surface Threshold:</label></td>
                        <td><FloatEditor value={_surfaceThresholdLQ} onChange={handleStChange} width={35}/></td>
                        <td><FloatEditor value={_surfaceThresholdHQ} onChange={handleStChangeHQ} width={35}/></td>
                        
                    </tr>   
                    <tr>
                        <td><label>Max Steps:</label></td>
                        <td><FloatEditor value={_maxStepsLQ} onChange={handleMsChange} width={35}/></td>
                        <td><FloatEditor value={_maxStepsHQ} onChange={handleMsChangeHQ} width={35}/></td>
                        
                    </tr>      
                    <tr>
                        <td><label>Min Gradient Magnitude:</label></td>
                        <td><FloatEditor value={_minGradientMagnitudeLQ} onChange={handleMgmChange} width={35}/></td>
                        <td><FloatEditor value={_minGradientMagnitudeHQ} onChange={handleMgmChangeHQ} width={35}/></td>
                        
                    </tr> 
                    <tr>
                        <td><label>Accumulated Threshold:</label></td>
                        <td><FloatEditor value={_accumulatedThresholdLQ} onChange={handleAtChange} width={35}/></td>
                        <td><FloatEditor value={_accumulatedThresholdHQ} onChange={handleAtChangeHQ} width={35}/></td>
                        
                    </tr>      
                    <tr>
                        <td><label>Transmittance Threshold:</label></td>
                        <td><FloatEditor value={_transmittanceThresholdLQ} onChange={handleTtChange} width={35}/></td>
                        <td><FloatEditor value={_transmittanceThresholdHQ} onChange={handleTtChangeHQ} width={35}/></td>
                        
                    </tr>
                    </tbody>                                                                                                                                     
                </table>

            </FloatingPanel>
        </div>
    );
}