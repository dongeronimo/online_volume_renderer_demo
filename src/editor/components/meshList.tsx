import { useState, useEffect } from 'react';
import type MeshBufferManager from '../../graphics/meshBufferManager';


function MeshList({ meshManager }: { meshManager: MeshBufferManager }) {
    const [meshes, setMeshes] = useState(meshManager.getAllMeshes());
    
    useEffect(() => {
        const unsubscribe = meshManager.subscribe(() => {
            setMeshes(meshManager.getAllMeshes());
        });
        return unsubscribe;
    }, [meshManager]);
    
    return (
        <ul>
            {meshes.map(({ key }) => (
                <li key={key}>{key}</li>
            ))}
        </ul>
    );
}
export default MeshList;