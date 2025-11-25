// ErrorOverlay.tsx
import { useState, useEffect } from 'react';

let errorCallbacks: ((msg: string) => void)[] = [];

export function showErrorOverlay(message: string) {
  errorCallbacks.forEach(cb => cb(message));
}

export const ErrorOverlay = () => {
  const [errors, setErrors] = useState<string[]>([]);
  
  useEffect(() => {
    const handler = (msg: string) => {
      setErrors(prev => [...prev, msg]);
    };
    errorCallbacks.push(handler);
    
    // Also capture console errors
    const originalError = console.error;
    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      handler(args.join(' '));
    };
    
    return () => {
      errorCallbacks = errorCallbacks.filter(cb => cb !== handler);
      console.error = originalError;
    };
  }, []);
  
  if (errors.length === 0) return null;
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: '300px',
      backgroundColor: '#ff5555',
      color: 'white',
      padding: '10px',
      overflowY: 'auto',
      zIndex: 10000,
      fontFamily: 'monospace',
      fontSize: '12px',
    }}>
      <button 
        onClick={() => setErrors([])}
        style={{
          position: 'absolute',
          top: '5px',
          right: '5px',
          background: 'white',
          color: 'black',
          border: 'none',
          padding: '5px 10px',
          cursor: 'pointer',
        }}
      >
        Clear
      </button>
      <h3>Errors:</h3>
      {errors.map((err, i) => (
        <div key={i} style={{ marginBottom: '5px', borderBottom: '1px solid #fff3' }}>
          {err}
        </div>
      ))}
    </div>
  );
};