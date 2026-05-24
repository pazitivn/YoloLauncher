import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, RotateCcw, Maximize2, X } from 'lucide-react';
import { SkinViewer, IdleAnimation, WalkingAnimation, RunningAnimation } from 'skinview3d';

export function SkinViewer3D({ skinUrl, username, fullscreen, onCloseFullscreen }) {
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const [animMode, setAnimMode] = useState('idle');
  const [paused, setPaused] = useState(false);

  // Helper to generate a default skin data URL
  const getDefaultSkin = (name) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#5a4fc4';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((name || '?')[0].toUpperCase(), 32, 32);
    return canvas.toDataURL();
  };

  // Setup WebGL (runs on mount and on fullscreen toggle since canvasRef changes)
  useEffect(() => {
    if (!canvasRef.current) return;

    let w = 200;
    let h = 260;
    if (fullscreen) {
      w = Math.min(window.innerWidth, window.innerHeight) * 0.8;
      h = w;
    }

    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width: w,
      height: h,
    });
    
    viewer.controls.enableZoom = true;
    
    // Restore animation state
    if (animMode === 'walk') viewer.animation = new WalkingAnimation();
    else if (animMode === 'run') viewer.animation = new RunningAnimation();
    else viewer.animation = new IdleAnimation();
    
    if (viewer.animation) viewer.animation.paused = paused;

    viewerRef.current = viewer;

    if (skinUrl) {
      viewer.loadSkin(skinUrl).catch(() => {});
    } else {
      viewer.loadSkin(getDefaultSkin(username));
    }

    const handleResize = () => {
      if (!viewerRef.current) return;
      if (fullscreen) {
        const size = Math.min(window.innerWidth, window.innerHeight) * 0.8;
        viewerRef.current.setSize(size, size);
      } else {
        viewerRef.current.setSize(200, 260);
      }
      viewerRef.current.resetCameraPose();
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      viewer.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]); // Re-create completely on fullscreen toggle

  // Update skinUrl when it changes dynamically
  useEffect(() => {
    if (!viewerRef.current) return;
    if (skinUrl) {
      viewerRef.current.loadSkin(skinUrl).catch(e => console.error(e));
    } else {
      viewerRef.current.loadSkin(getDefaultSkin(username));
    }
  }, [skinUrl, username]);

  function cycleAnim() {
    const next = animMode === 'idle' ? 'walk' : animMode === 'walk' ? 'run' : 'idle';
    setAnimMode(next);
    if (viewerRef.current) {
      if (next === 'idle') viewerRef.current.animation = new IdleAnimation();
      else if (next === 'walk') viewerRef.current.animation = new WalkingAnimation();
      else if (next === 'run') viewerRef.current.animation = new RunningAnimation();
      
      // Preserve paused state
      if (viewerRef.current.animation) {
         viewerRef.current.animation.paused = paused;
      }
    }
  }

  function togglePause() {
    setPaused(p => {
      const next = !p;
      if (viewerRef.current && viewerRef.current.animation) {
        viewerRef.current.animation.paused = next;
      }
      return next;
    });
  }

  function resetRot() {
    if (viewerRef.current) {
      viewerRef.current.resetCameraPose();
      viewerRef.current.playerObject.rotation.set(0, 0, 0);
    }
  }

  const animLabel = animMode === 'idle' ? 'Idle' : animMode === 'walk' ? 'Walk' : 'Run';

  const viewer = (
    <div className="skin3d-wrap" style={fullscreen ? { 
      position: 'fixed', 
      inset: 0, 
      zIndex: 99999, 
      background: 'rgba(0, 0, 0, 0.5)', 
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center'
    } : {}}>
      
      <canvas
        ref={canvasRef}
        className="skin3d-canvas"
        style={{ cursor: 'grab', touchAction: 'none' }}
      />

      <div className="skin3d-controls" style={fullscreen ? { marginTop: 20 } : {}}>
        <button className="skin3d-btn" onClick={togglePause} title={paused ? 'Resume' : 'Pause'}>
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>
        <button className="skin3d-btn skin3d-anim-btn" onClick={cycleAnim} title="Change animation">
          {animLabel}
        </button>
        <button className="skin3d-btn" onClick={resetRot} title="Reset rotation">
          <RotateCcw size={12} />
        </button>
        {fullscreen && (
          <button className="skin3d-btn" onClick={onCloseFullscreen} title="Close">
            <X size={12} />
          </button>
        )}
      </div>
      {fullscreen && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>
          Перетащите для вращения
        </div>
      )}
    </div>
  );

  return fullscreen ? createPortal(viewer, document.body) : viewer;
}
