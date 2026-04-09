import React, { useState } from 'react';
import CanvasBoard from './CanvasBoard';

export default function App() {
  const [currentColor, setCurrentColor] = useState(1);
  const [stencilImg, setStencilImg] = useState(null);

  const handleStencilUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setStencilImg(url);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#222' }}>
      {/* UI Overlay */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, color: 'white' }}>
        <h2>WPlace Clone</h2>
        <div style={{ background: 'rgba(0,0,0,0.8)', padding: 10, borderRadius: 5 }}>
          <p>Цвет (1-5): {currentColor}</p>
          <input type="range" min="1" max="5" value={currentColor} onChange={e => setCurrentColor(Number(e.target.value))} />
          <hr />
          <p>Трафарет (Stencil):</p>
          <input type="file" accept="image/*" onChange={handleStencilUpload} />
        </div>
      </div>

      {/* Main part */}
      <CanvasBoard currentColor={currentColor} stencilImg={stencilImg} />
    </div>
  );
}
