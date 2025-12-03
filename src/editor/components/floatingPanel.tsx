import React, { useState, useRef, useEffect } from 'react';
import { Minimize2, Maximize2 } from 'lucide-react';

/**
 * Floating panel properties.
 */
interface FloatingPanelProps {
  /**
   * the react components children.
   */
  children?: React.ReactNode;
  /**
   * Where it starts (x)
   */
  initialX?: number;
  /**
   * Where it starts (y)
   */
  initialY?: number;
  /**
   * Width
   */
  width?: number;
  /**
   * Height
   */
  height?: number;
  /**
   * Title
   */
  title?: string;
}

/**
 * The floating panel is to show the editor UI. It has to be floating because the react context
 * lives in a fullscreen div overlaying the renderer canvas that is also fullscreen. 
 */
export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  children,
  initialX = 100,
  initialY = 100,
  width = 300,
  height = 200,
  title = "Panel"
}) => {
  //Position is used to constantly change the style that is defined inline in the div.
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      setPosition({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;

      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStart.current.x,
        y: touch.clientY - dragStart.current.y
      });
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      document.addEventListener('touchcancel', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      dragStart.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      setIsDragging(true);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      dragStart.current = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
      setIsDragging(true);
    }
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };
  
  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${width}px`,
        height: isMinimized ? 'auto' : `${height}px`,
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 1000,
        pointerEvents: 'auto'
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{
          padding: '10px',
          backgroundColor: 'rgba(40, 40, 40, 0.8)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          color: '#fff',
          fontSize: '14px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span>{title}</span>
        <button
          onClick={toggleMinimize}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
        </button>
      </div>
      {!isMinimized && (
        <div
          style={{
            flex: 1,
            padding: '10px',
            overflowY: 'auto',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};