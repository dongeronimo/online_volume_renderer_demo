import { useContext } from "react"
import { RendererContext } from "./renderer_provider";
import { Loader2 } from "lucide-react";


export const ProgressBar = ()=>{
  const { doingTask } = useContext(RendererContext);
  
  if (!doingTask) {
    return null;
  }
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '8px',
        textAlign: 'center',
      }}>
        <Loader2 
          size={50} 
          style={{
            animation: 'spin 1s linear infinite',
          }}
        />
        <div style={{ marginTop: '15px' }}>Loading...</div>
      </div>
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}