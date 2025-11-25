import { useContext } from "react";
import { FloatingPanel } from "../../editor/components/floatingPanel"
import { RendererContext } from "./renderer_provider";

export const PipelineSwitcher = ()=> {
    const { currentPipeline, setPipeline } = useContext(RendererContext);
  return (
    <FloatingPanel title="Render Type" initialX={0} initialY={500} height={170}>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button 
          onClick={() => setPipeline('wl')}
          style={{
            padding: '8px 16px',
            backgroundColor: currentPipeline === 'wl' ? '#4CAF50' : '#ddd',
            color: currentPipeline === 'wl' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: currentPipeline === 'wl' ? 'bold' : 'normal',
          }}
        >
          Window/Level {currentPipeline === 'wl' && '✓'}
        </button>
        <button 
          onClick={() => setPipeline('ctf')}
          style={{
            padding: '8px 16px',
            backgroundColor: currentPipeline === 'ctf' ? '#4CAF50' : '#ddd',
            color: currentPipeline === 'ctf' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: currentPipeline === 'ctf' ? 'bold' : 'normal',
          }}
        >
          Color Transfer {currentPipeline === 'ctf' && '✓'}
        </button>
      </div>
        <div>
          <p style={{fontSize:'0.75em'}}>Switches between the render types: Colour Transfer Function or Window/Level. Each render type has it's own pipeline.</p>
        </div>       
    </FloatingPanel>
  );
}