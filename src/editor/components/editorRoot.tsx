import React from 'react';
import { FloatingPanel } from './floatingPanel';
import type MeshBufferManager from '../../graphics/meshBufferManager';
import MeshList from './meshList';
import type GraphicsContext from '../../graphics/graphicsContext';
import FpsPanel from './fpsPanel';
/**
 * Editor root properties. Nothing for now
 */
export interface EditorRootProps {
    meshBufferManager:MeshBufferManager,
    graphicsContext:GraphicsContext
}
/**
 * Editor root: that's the component that is attached to the .reactContainer
 * div. All editor UI components must have EditorRoot as ultimate parent.
 * @param param0 
 * @returns 
 */
export const EditorRoot: React.FC<EditorRootProps> = ({ meshBufferManager, graphicsContext }) => {
    //TODO: List materials
    //TODO: List shaders
    //TODO: List prefabs
    return (
        <div>
            <FloatingPanel title='Meshes' initialX={0} initialY={0}>
                <MeshList meshManager={meshBufferManager}/>
            </FloatingPanel>
            <FloatingPanel title='Stats' initialX={50} initialY={50}>
                <FpsPanel graphicsContext={graphicsContext}/>
            </FloatingPanel>
        </div>
    );
}