'use client'

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';

interface JoystickProps {
  onMove: (dx: number, dy: number) => void;
}

export const Joystick: React.FC<JoystickProps> = ({ onMove }) => {
  const [isPressed, setIsPressed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const touchId = useRef<number | null>(null);

  const [radius, setRadius] = useState(40);

  useEffect(() => {
    const updateRadius = () => {
      if (containerRef.current) {
        setRadius(containerRef.current.offsetWidth / 2);
      }
    };
    updateRadius();
    window.addEventListener('resize', updateRadius);
    return () => window.removeEventListener('resize', updateRadius);
  }, []);

  const handleStart = (clientX: number, clientY: number, id: number | null) => {
    setIsPressed(true);
    touchId.current = id;
    handleMove(clientX, clientY);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < radius) {
      setPosition({ x: dx, y: dy });
      onMove(dx / radius, dy / radius);
    } else {
      const angle = Math.atan2(dy, dx);
      const limitedX = Math.cos(angle) * radius;
      const limitedY = Math.sin(angle) * radius;
      setPosition({ x: limitedX, y: limitedY });
      onMove(limitedX / radius, limitedY / radius);
    }
  };

  const handleEnd = () => {
    setIsPressed(false);
    setPosition({ x: 0, y: 0 });
    onMove(0, 0);
    touchId.current = null;
  };

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (isPressed && touchId.current !== null) {
        const touch = Array.from(e.touches).find(t => t.identifier === touchId.current);
        if (touch) {
          handleMove(touch.clientX, touch.clientY);
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isPressed && touchId.current === null) {
        handleMove(e.clientX, e.clientY);
      }
    };

    const onGlobalEnd = () => handleEnd();

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchend', onGlobalEnd);
    window.addEventListener('mouseup', onGlobalEnd);

    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchend', onGlobalEnd);
      window.removeEventListener('mouseup', onGlobalEnd);
    };
  }, [isPressed, handleEnd, handleMove]);

  return (
    <div 
      ref={containerRef}
      className="relative w-32 h-32 sm:w-32 sm:h-32 rounded-full bg-black/40 backdrop-blur-md border-2 border-[#d4af37] flex items-center justify-center select-none touch-none shadow-[0_0_20px_rgba(0,0,0,0.5)]"
      onMouseDown={(e) => handleStart(e.clientX, e.clientY, null)}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        handleStart(touch.clientX, touch.clientY, touch.identifier);
      }}
    >
      <motion.div 
        className="w-14 h-14 sm:w-14 sm:h-14 rounded-full bg-[#d4af37] border-2 border-white/20 shadow-[0_0_20px_rgba(212,175,55,0.6)] pointer-events-none"
        animate={{ x: position.x, y: position.y }}
        transition={{ type: 'spring', damping: 12, stiffness: 450 }}
      />
    </div>
  );
};
