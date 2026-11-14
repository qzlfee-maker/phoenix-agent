import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Image as ImageIcon, AlertCircle } from 'lucide-react';

interface ImageViewerProps {
  src: string;
  filePath: string;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ src, filePath }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset view when switching image file or reloading raw version
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setDimensions(null);
    setLoadError(false);
  }, [filePath, src]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.12 : 0.89;
    setScale((prev) => Math.min(8, Math.max(0.1, Number((prev * delta).toFixed(3)))));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(8, Number((prev * 1.25).toFixed(3))));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.1, Number((prev * 0.8).toFixed(3))));
  };

  return (
    <div className="flex-1 min-h-0 w-full relative overflow-hidden select-none bg-[#0d0d10]">
      {/* Photoshop/Figma Checkerboard Background */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`absolute inset-0 flex items-center justify-center overflow-hidden ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage: `
            linear-gradient(45deg, rgba(255, 255, 255, 0.045) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255, 255, 255, 0.045) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.045) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.045) 75%)
          `,
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
        }}
      >
        {loadError ? (
          <div className="flex flex-col items-center gap-2 p-6 rounded-2xl liquid-glass text-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-xs text-zinc-300">Не удалось загрузить изображение</p>
            <p className="text-[11px] font-mono text-zinc-500">{filePath}</p>
          </div>
        ) : (
          <img
            src={src}
            alt={filePath}
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            onError={() => setLoadError(true)}
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
              transition: isDragging ? 'none' : 'transform 0.08s ease-out',
            }}
            className="max-w-[82%] max-h-[82%] object-contain shadow-2xl shadow-black/70 rounded-sm pointer-events-none"
          />
        )}
      </div>

      {/* Floating Liquid Glass Image Controls */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl liquid-glass-dark shadow-2xl shadow-black/70 z-10">
        {dimensions && (
          <div className="hidden sm:flex items-center gap-1.5 pr-2.5 mr-1 border-r border-white/10 text-[11px] font-mono text-zinc-400">
            <ImageIcon className="w-3.5 h-3.5 text-orange-400" />
            <span>
              {dimensions.w} × {dimensions.h}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={handleZoomOut}
          title="Уменьшить"
          className="p-1.5 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 spring-press cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <span className="min-w-[48px] text-center text-xs font-mono text-zinc-200">
          {Math.round(scale * 100)}%
        </span>

        <button
          type="button"
          onClick={handleZoomIn}
          title="Увеличить"
          className="p-1.5 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 spring-press cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-white/10 mx-0.5" />

        <button
          type="button"
          onClick={handleReset}
          title="Сбросить масштаб и позицию"
          className="flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-white/10 spring-press cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>100%</span>
        </button>
      </div>
    </div>
  );
};
