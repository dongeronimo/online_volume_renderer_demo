import { useState, useEffect } from 'react';
import type { FpsData } from '../../graphics/graphicsContext';
import type GraphicsContext from '../../graphics/graphicsContext';

export default function FpsPanel({ graphicsContext }: { graphicsContext: GraphicsContext }) {
    const [fpsData, setFpsData] = useState<FpsData | null>(null);
    
    useEffect(() => {
        const unsubscribe = graphicsContext.subscribeFPS((fps: FpsData) => {
            setFpsData(fps);
        });
        return unsubscribe;
    }, [graphicsContext]);
    
    if (!fpsData) return <div>Loading...</div>;
    
    return (
        <div>
            <div>FPS: {fpsData.fps}</div>
            <div>Scene Update: {fpsData.sceneUpdate}ms</div>
            <div>Graphics: {fpsData.graphics}ms</div>
        </div>
    );
}
