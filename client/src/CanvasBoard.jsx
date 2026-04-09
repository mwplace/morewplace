import React, { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { PALETTE } from './colors';

const CHUNK_SIZE = 1000;
const TILE_PIXEL_SIZE = 1; // Pixel size, lol

export default function CanvasBoard({ currentColor, stencilImg }) {
  const canvasRef = useRef(null);
  const stencilRef = useRef(null);
  const [socket, setSocket] = useState(null);
  
  // "Camera"
  const camera = useRef({ x: 0, y: 0, zoom: 1 });
  const chunksCache = useRef({}); // Loaded chunk's ArrayBuffer in cache

  useEffect(() => {
    const s = io("http://localhost:3000");
    setSocket(s);

    s.on('pixel_update', ({ globalX, globalY, colorId }) => {
      const chunkX = Math.floor(globalX / CHUNK_SIZE);
      const chunkY = Math.floor(globalY / CHUNK_SIZE);
      const key = `${chunkX}:${chunkY}`;
      
      if (chunksCache.current[key]) {
        const localX = globalX % CHUNK_SIZE;
        const localY = globalY % CHUNK_SIZE;
        const offset = (localY * CHUNK_SIZE) + localX;
        chunksCache.current[key][offset] = colorId;
        draw(); // Render
      }
    });

    return () => s.disconnect();
  }, []);

  // Chunk loading
  const fetchChunk = async (cx, cy) => {
    const key = `${cx}:${cy}`;
    if (chunksCache.current[key]) return; // Loaded or still loads
    
    chunksCache.current[key] = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    
    try {
      const res = await fetch(`http://localhost:3000/api/chunk/${cx}/${cy}`);
      const buffer = await res.arrayBuffer();
      chunksCache.current[key] = new Uint8Array(buffer);
      draw();
    } catch (e) {
      console.error("Ошибка загрузки чанка", e);
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.current.zoom, camera.current.zoom);
    ctx.translate(-camera.current.x, -camera.current.y);

    // Stencil showing
    if (stencilRef.current) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(stencilRef.current, 0, 0);
        ctx.globalAlpha = 1.0;
    }

    // Visible chunks
    const visibleChunks = [{ x: 0, y: 0 }];
    
    for (let chunk of visibleChunks) {
      const key = `${chunk.x}:${chunk.y}`;
      if (!chunksCache.current[key]) {
        fetchChunk(chunk.x, chunk.y);
        continue;
      }
      
      // Convert 1D Uint8Array (of color) to ImageData
      const imgData = ctx.createImageData(CHUNK_SIZE, CHUNK_SIZE);
      const data = chunksCache.current[key];
      
      for (let i = 0; i < data.length; i++) {
        const colorIdx = data[i];
        const [r, g, b, a] = PALETTE[colorIdx] || PALETTE[0];
        const pixelIdx = i * 4;
        imgData.data[pixelIdx] = r;
        imgData.data[pixelIdx + 1] = g;
        imgData.data[pixelIdx + 2] = b;
        imgData.data[pixelIdx + 3] = a;
      }
      
      // Zoom
      const offCanvas = document.createElement('canvas');
      offCanvas.width = CHUNK_SIZE;
      offCanvas.height = CHUNK_SIZE;
      offCanvas.getContext('2d').putImageData(imgData, 0, 0);
      
      ctx.drawImage(offCanvas, chunk.x * CHUNK_SIZE, chunk.y * CHUNK_SIZE);
    }
    
    ctx.restore();
  };

  // Mouse Tracking
  const handleMouseDown = (e) => {
    if (e.button === 0) { // LBM - Paint
      if (!socket) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Transform matrix
      const worldX = Math.floor((mouseX - canvasRef.current.width / 2) / camera.current.zoom + camera.current.x);
      const worldY = Math.floor((mouseY - canvasRef.current.height / 2) / camera.current.zoom + camera.current.y);

      socket.emit('place_pixel', { userId: 1, globalX: worldX, globalY: worldY, colorId: currentColor });
    }
  };

  useEffect(() => {
    if (stencilImg) {
      const img = new Image();
      img.src = stencilImg;
      img.onload = () => {
        stencilRef.current = img;
        draw();
      };
    }
  }, [stencilImg]);

  useEffect(() => {
    const handleResize = () => {
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
      draw();
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <canvas ref={canvasRef} onMouseDown={handleMouseDown} style={{ cursor: 'crosshair' }} />;
}
