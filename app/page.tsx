'use client'

import React, { useState, useEffect } from 'react';
import { GameEngine } from '@/components/game/GameEngine';
import { HUD } from '@/components/game/HUD';
import { Joystick } from '@/components/game/Joystick';
import { Auth } from '@/components/game/Auth';
import { useGameStore } from '@/lib/store';
import { motion, AnimatePresence } from 'motion/react';
import { Sword } from 'lucide-react';

export default function GamePage() {
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const { user } = useGameStore();

  return (
    <main className="fixed inset-0 overflow-hidden bg-black select-none">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div 
            key="auth-landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex flex-col items-center bg-[#0f0d0b] overflow-y-auto pt-10 pb-20 px-4"
          >
            <div className="absolute inset-0 opacity-10 pointer-events-none fixed" 
                 style={{ backgroundImage: 'radial-gradient(#d4af37 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            
            <div className="text-center mb-6 sm:mb-10 relative z-10 w-full max-w-lg">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#2c241c] border-2 border-[#d4af37] rounded-lg flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-2xl">
                <Sword size={32} className="text-[#d4af37] sm:size-[40px]" />
              </div>
              <h1 className="text-3xl sm:text-6xl font-cinzel font-bold text-[#d4af37] uppercase tracking-tighter mb-2 sm:mb-4 italic leading-tight">
                ЭФИРИЯ<br/>ПРОБУЖДЕНИЕ
              </h1>
              <p className="text-[#e5d3b3]/60 font-spectral font-medium max-w-md mx-auto leading-relaxed text-sm sm:text-base">
                Начните свой путь в мире Эфирии. Сохраняйте прогресс и соревнуйтесь с другими героями.
              </p>
            </div>
            
            <div className="relative z-10 w-full max-w-md">
              <Auth isLanding />
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="game-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0"
          >
            {/* The Game World */}
            <GameEngine velocity={velocity} />

            {/* The UI Overlay */}
            <HUD />
            <Auth />

            {/* Control Layer */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Joystick Position (Bottom Left) */}
              <div className="absolute bottom-28 left-6 sm:bottom-12 sm:left-12 pointer-events-auto">
                <Joystick onMove={(dx, dy) => setVelocity({ x: dx, y: dy })} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Decor (Mobile Aesthetic) */}
      <div className="absolute top-0 inset-x-0 h-1 mt-[-1px] bg-gradient-to-r from-red-500 via-blue-500 to-yellow-500 opacity-50 z-[201]" />
    </main>
  );
}
