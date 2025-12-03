import React, { useState, useEffect } from 'react';
import { Scissors, Undo2, Redo2 } from 'lucide-react';

/**
 * Interface for the lasso control functions exposed globally
 */
interface LassoControls {
  toggleLassoMode: () => boolean;
  isLassoEnabled: () => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

/**
 * Event fired when lasso state changes (contours added, undo, redo)
 */
export const lassoStateChangeEvent = new EventTarget();

/**
 * Lasso Controls Panel component
 * Provides UI for activating lasso drawing mode and undo/redo functionality
 */
export const LassoControlsPanel: React.FC = () => {
  const [isLassoEnabled, setIsLassoEnabled] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Update state when lasso mode changes or contours change
  useEffect(() => {
    const updateState = () => {
      const controls = (window as any).lassoControls as LassoControls | undefined;
      if (controls) {
        setIsLassoEnabled(controls.isLassoEnabled());
        setCanUndo(controls.canUndo());
        setCanRedo(controls.canRedo());
      }
    };

    // Initial state
    updateState();

    // Listen for state changes
    const handleStateChange = () => {
      updateState();
    };

    lassoStateChangeEvent.addEventListener('change', handleStateChange);

    // Poll for state changes (fallback in case events are missed)
    const interval = setInterval(updateState, 100);

    return () => {
      lassoStateChangeEvent.removeEventListener('change', handleStateChange);
      clearInterval(interval);
    };
  }, []);

  const handleToggleLasso = () => {
    const controls = (window as any).lassoControls as LassoControls | undefined;
    if (controls) {
      const newState = controls.toggleLassoMode();
      setIsLassoEnabled(newState);
      lassoStateChangeEvent.dispatchEvent(new Event('change'));
    }
  };

  const handleUndo = () => {
    const controls = (window as any).lassoControls as LassoControls | undefined;
    if (controls) {
      controls.undo();
      lassoStateChangeEvent.dispatchEvent(new Event('change'));
    }
  };

  const handleRedo = () => {
    const controls = (window as any).lassoControls as LassoControls | undefined;
    if (controls) {
      controls.redo();
      lassoStateChangeEvent.dispatchEvent(new Event('change'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button
        onClick={handleToggleLasso}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: isLassoEnabled ? 'rgba(59, 130, 246, 0.8)' : 'rgba(75, 85, 99, 0.8)',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          transition: 'all 0.2s',
          boxShadow: isLassoEnabled ? '0 0 12px rgba(59, 130, 246, 0.5)' : 'none'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = isLassoEnabled
            ? 'rgba(59, 130, 246, 1)'
            : 'rgba(107, 114, 128, 0.9)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = isLassoEnabled
            ? 'rgba(59, 130, 246, 0.8)'
            : 'rgba(75, 85, 99, 0.8)';
        }}
      >
        <Scissors size={18} />
        <span>{isLassoEnabled ? 'Drawing Active' : 'Activate Drawing'}</span>
      </button>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 12px',
            backgroundColor: canUndo ? 'rgba(75, 85, 99, 0.8)' : 'rgba(55, 65, 81, 0.5)',
            color: canUndo ? '#fff' : 'rgba(255, 255, 255, 0.4)',
            border: 'none',
            borderRadius: '6px',
            cursor: canUndo ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (canUndo) {
              e.currentTarget.style.backgroundColor = 'rgba(107, 114, 128, 0.9)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = canUndo
              ? 'rgba(75, 85, 99, 0.8)'
              : 'rgba(55, 65, 81, 0.5)';
          }}
        >
          <Undo2 size={16} />
          <span>Undo</span>
        </button>

        <button
          onClick={handleRedo}
          disabled={!canRedo}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 12px',
            backgroundColor: canRedo ? 'rgba(75, 85, 99, 0.8)' : 'rgba(55, 65, 81, 0.5)',
            color: canRedo ? '#fff' : 'rgba(255, 255, 255, 0.4)',
            border: 'none',
            borderRadius: '6px',
            cursor: canRedo ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (canRedo) {
              e.currentTarget.style.backgroundColor = 'rgba(107, 114, 128, 0.9)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = canRedo
              ? 'rgba(75, 85, 99, 0.8)'
              : 'rgba(55, 65, 81, 0.5)';
          }}
        >
          <Redo2 size={16} />
          <span>Redo</span>
        </button>
      </div>

      <div style={{
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: '4px',
        textAlign: 'center'
      }}>
        {isLassoEnabled ? 'Draw on canvas to cut volume' : 'Press button or "L" key'}
      </div>
    </div>
  );
};
