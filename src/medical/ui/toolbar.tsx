import { useContext } from "react";
import { FloatingPanel } from "../../editor/components/floatingPanel"
import { RendererContext } from "./renderer_provider";

export const Toolbar = () => {
  const { usingCuttingCube, toggleCuttingCube } = useContext(RendererContext);

  return (
    <FloatingPanel title="Toolbar" initialX={0} initialY={300} height={120}>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={() => toggleCuttingCube(!usingCuttingCube)}
          style={{
            padding: '8px 16px',
            backgroundColor: usingCuttingCube ? '#4CAF50' : '#ddd',
            color: usingCuttingCube ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: usingCuttingCube ? 'bold' : 'normal',
          }}
        >
          Cutting Cube {usingCuttingCube && '✓'}
        </button>
      </div>
      <div>
        <p style={{fontSize:'0.75em'}}>Toggle the cutting cube visualization on/off.</p>
      </div>
    </FloatingPanel>
  );
}
