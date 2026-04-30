'use client'

import React, { useState } from 'react';
import { useGameStore, Item, Location } from '@/lib/store';
import { Shield, Sword, Swords, Package, User, Heart, Zap, Award, Coins, Map as MapIcon, Hammer, Gem, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

interface HUDProps {
  velocity: React.RefObject<{ x: number, y: number }>;
}

export const formatNumber = (num: number): string => {
  if (Number.isNaN(num) || num === undefined || num === null) return '0';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2).replace(/\.00$/, '') + 'm';
  }
  if (num >= 10000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toString();
};

export const HUD: React.FC<HUDProps> = ({ velocity }) => {
  const { player, isAutoBattle, toggleAutoBattle, inventory, equipment, equipItem, sellItem, locations, currentLocationId, teleport, craftItem, usePotion, user, setUser, saveGame, increaseStat, shopItems, buyInShop, applyBuff, isDead, resurrect } = useGameStore();
  const [activeTab, setActiveTab] = useState<'inventory' | 'character' | 'locations' | 'city' | 'arena' | null>(null);
  const [citySubTab, setCitySubTab] = useState<'forge' | 'shop' | 'buffer'>('shop');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedShopItem, setSelectedShopItem] = useState<any>(null);
  const [buyQuantity, setBuyQuantity] = useState(1);
  const [craftCategory, setCraftCategory] = useState<'weapon' | 'armor' | 'accessory'>('weapon');
  const [craftType, setCraftType] = useState<'melee' | 'ranged' | 'staff' | 'armor' | 'accessory'>('melee');

  const hpPercentage = (player.hp / player.maxHp) * 100;
  const expPercentage = (player.exp / player.nextLevelExp) * 100;

  const enemies = useGameStore(state => state.enemies);

  const handleLogout = async () => {
    await saveGame();
    await signOut(auth);
    setUser(null);
    window.location.reload();
  };

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between font-spectral">
      {isDead && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 pointer-events-auto backdrop-blur-md px-4">
          <div className="bg-[#1a1612] border border-red-900/50 p-6 sm:p-10 rounded-2xl max-w-md w-full text-center flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(200,0,0,0.15)] relative overflow-hidden">
             
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-50" />
             
             <div className="text-red-500 scale-150 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.4)]">
               <Sword size={48} className="mx-auto rotate-180" />
             </div>
             
             <div className="space-y-2">
               <h2 className="text-2xl sm:text-4xl font-cinzel text-red-500 font-bold tracking-[0.1em] uppercase">Вы Погибли</h2>
               <p className="text-[#e5d3b3]/60 font-spectral text-sm sm:text-base leading-relaxed px-4">
                 Ваш дух покинул тело. Вы потеряли <span className="text-red-400 font-bold">25% опыта</span>.
               </p>
             </div>
             
             <div className="w-full h-px bg-red-900/20 my-2" />
             
             <div className="w-full flex flex-col gap-3">
               {player.gold >= 200 ? (
                 <button 
                   onClick={() => resurrect()}
                   className="w-full py-4 sm:py-5 bg-red-950/20 border border-red-900/50 hover:bg-red-900/40 hover:border-red-500/50 transition-all rounded-xl cursor-pointer text-[#e5d3b3] group flex items-center justify-center gap-3 relative overflow-hidden active:scale-[0.98]"
                 >
                   <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/10 to-red-600/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                   <span className="font-cinzel text-sm sm:text-base uppercase tracking-widest relative z-10 font-bold">Возродиться за</span>
                   <div className="flex items-center gap-1.5 font-spectral font-bold text-[#d4af37] bg-black/40 px-3 py-1.5 rounded-lg border border-[#d4af37]/20 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] relative z-10">
                     200 <Coins size={16} />
                   </div>
                 </button>
               ) : (
                 <div className="w-full space-y-4">
                   <div className="text-[#e5d3b3]/40 text-xs sm:text-sm font-spectral">
                     Не хватает <span className="text-[#d4af37]">золота</span> (нужно 200)
                   </div>
                   <button 
                     onClick={() => resurrect()}
                     className="w-full py-4 sm:py-5 bg-[#120f0c] border border-gray-800 hover:bg-[#1a1612] hover:border-red-900/50 transition-all rounded-xl cursor-pointer text-gray-500 group relative overflow-hidden active:scale-[0.98]"
                   >
                     <span className="block font-cinzel text-sm sm:text-base uppercase tracking-widest font-bold group-hover:text-red-500 transition-colors">Воскреснуть со штрафом</span>
                     <span className="block text-xs sm:text-sm font-spectral text-red-500/70 normal-case tracking-normal mt-1">-1 Уровень характеристик</span>
                   </button>
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      {/* Mini-Map & Coordinates */}
      <div className="absolute top-24 left-4 w-32 h-32 bg-black/60 border border-[#b8860b]/40 rounded overflow-hidden pointer-events-auto shadow-lg backdrop-blur-sm hidden sm:block">
        <div className="relative w-full h-full">
          {/* Player dot */}
          <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 bg-white rounded-full z-10 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_5px_white]" />
          
          {/* Enemy dots */}
          {enemies.map(enemy => {
            const relX = (enemy.x - player.x) / 10 + 64; // Scale 1:10 for map
            const relY = (enemy.y - player.y) / 10 + 64;
            if (relX < 0 || relX > 128 || relY < 0 || relY > 128) return null;
            return (
              <div 
                key={enemy.id} 
                className="absolute w-1 h-1 bg-red-500 rounded-full"
                style={{ left: relX, top: relY }}
              />
            );
          })}
          
          {/* Online Players dots */}
          {useGameStore(state => state.onlinePlayers)?.map(p => {
            const relX = (p.x - player.x) / 10 + 64;
            const relY = (p.y - player.y) / 10 + 64;
            if (relX < 0 || relX > 128 || relY < 0 || relY > 128) return null;
            return (
              <div 
                key={p.id} 
                className="absolute w-1.5 h-1.5 bg-indigo-500 rounded-full"
                style={{ left: relX, top: relY }}
              />
            );
          })}
        </div>
        <div className="absolute bottom-0 inset-x-0 bg-black/80 text-[10px] sm:text-xs font-cinzel text-center py-1 text-[#d4af37] uppercase tracking-[0.2em] leading-none border-t border-[#d4af37]/20 flex justify-between px-2">
          <span>{locations.find(l => l.id === currentLocationId)?.name}</span>
          <span>{Math.round(player.x)},{Math.round(player.y)}</span>
        </div>
      </div>

      {/* Top Bar: Stats & XP */}
      <div className="flex justify-between items-start pointer-events-auto z-20">
        <div className="flex flex-col gap-1 sm:gap-2 max-w-[160px] sm:max-w-72">
          <div className="flex items-center gap-2 sm:gap-4 bg-black p-1 sm:p-2 border-2 border-[#d4af37] shadow-[0_0_20px_rgba(0,0,0,0.8)] relative group">
            {/* Blade-like underline */}
            <div className="absolute -bottom-1 -right-1 w-full h-1 bg-[#d4af37] clip-path-poly shadow-[0_2px_5px_rgba(212,175,55,0.4)]" />
            
            <div className="w-10 h-10 sm:w-16 sm:h-16 border-2 border-[#d4af37] flex items-center justify-center font-cinzel text-lg sm:text-3xl font-bold text-black/90 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-colors shrink-0"
                 style={{ backgroundColor: player.skinColor || '#e5c298' }}
                 onClick={() => setActiveTab('character')}>
              {player.level}
            </div>
        <div className="flex flex-col gap-2 sm:gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => setActiveTab('character')}>
              <div className="flex justify-between items-center pr-1">
                <div className="font-cinzel text-sm sm:text-2xl font-bold leading-tight uppercase tracking-[0.3em] text-[#d4af37] truncate italic">{user?.email.split('@')[0].toUpperCase() || 'ГЕРОЙ'}</div>
                {player.statPoints > 0 && (
                  <div className="text-sm sm:text-lg font-bold text-amber-400 animate-bounce">+ {player.statPoints} ОЧКОВ</div>
                )}
              </div>
              <div className="relative h-2.5 sm:h-5 bg-gray-900 border border-[#d4af37]/30 overflow-hidden">
                <motion.div 
                  className="absolute inset-y-0 left-0 bg-red-600 shadow-[0_0_10px_rgba(255,0,0,0.3)]"
                  initial={{ width: '100%' }}
                  animate={{ width: `${Number.isNaN(hpPercentage) ? 0 : hpPercentage}%` }}
                  transition={{ duration: 0.3 }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-xs sm:text-base font-bold text-white drop-shadow-md">
                   {formatNumber(Number.isNaN(player.hp) ? 0 : Math.round(player.hp))} / {formatNumber(Number.isNaN(player.maxHp) ? 0 : player.maxHp)}
                </div>
              </div>
              <div className="relative h-2 sm:h-4 bg-gray-900 border border-[#d4af37]/30 overflow-hidden">
                <motion.div 
                  className="absolute inset-y-0 left-0 bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                  animate={{ width: `${Number.isNaN(expPercentage) ? 0 : expPercentage}%` }}
                  transition={{ duration: 0.5 }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-sm font-bold text-white drop-shadow-md font-mono">
                   {formatNumber(Number.isNaN(player.exp) ? 0 : player.exp)} / {formatNumber(Number.isNaN(player.nextLevelExp) ? 1 : player.nextLevelExp)}
                </div>
              </div>
            </div>
          </div>
          
          {/* Buff Slots */}
          <div className="flex gap-1 ml-1 mt-1">
            {Array.from({ length: 4 }).map((_, i) => {
              const buff = player.buffs[i];
              return (
                <div key={i} className="w-6 h-6 sm:w-8 sm:h-8 border border-[#d4af37]/30 bg-black/40 rounded flex items-center justify-center relative overflow-hidden">
                  {buff ? (
                    <>
                      <div className="text-[#d4af37]">
                        {buff.icon === 'zap' ? <Zap size={14} /> : buff.icon === 'award' ? <Award size={14} /> : <Shield size={14} />}
                      </div>
                      <div className="absolute bottom-0 left-0 w-full bg-black/60 text-[7px] sm:text-[9px] font-bold text-center text-amber-500 leading-none py-0.5 border-t border-[#d4af37]/20">
                          {Math.floor(buff.timeLeft / 60)}:{(buff.timeLeft % 60).toString().padStart(2, '0')}
                      </div>
                    </>
                  ) : (
                    <div className="opacity-10 text-[#d4af37]"><Shield size={10} /></div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Gold & Shards */}
            <div className="flex items-center gap-2 bg-[#1a1612]/90 px-3 sm:px-4 py-1 sm:py-2 rounded-full border border-[#b8860b]/30 self-start backdrop-blur-sm ml-1">
            <div className="flex items-center gap-2 text-[#d4af37] font-cinzel font-bold">
              <Coins size={14} className="sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-base tracking-widest">{formatNumber(player.gold)}</span>
            </div>
            <div className="w-px h-3 sm:h-4 bg-[#b8860b]/30 mx-1 sm:mx-2" />
            <div className="flex items-center gap-2 text-blue-400 font-cinzel font-bold">
              <Gem size={14} className="sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-base tracking-widest">{formatNumber(player.shards)}</span>
            </div>
          </div>
        </div>

        {/* Mobile coords & Settings */}
        <div className="flex flex-col items-end gap-2">
            <div className="text-[10px] sm:hidden font-cinzel text-[#d4af37] bg-black/60 px-2 py-1 rounded border border-[#d4af37]/30 backdrop-blur-sm">
                X:{Math.round(player.x)} Y:{Math.round(player.y)}
            </div>
          {/* We removed the general Auto button per user request */}
        </div>
      </div>

      {/* Bottom Navigation: Mobile Action Bar */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-[#0f0d0b]/98 border-t-2 border-[#4a3b2c] pointer-events-auto p-[10px] flex justify-around items-center z-[60] backdrop-blur-xl">
        <NavButton active={activeTab === 'character'} onClick={() => setActiveTab('character')} icon={<User size={24} />} label="ГЕРОЙ" />
        <NavButton active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} icon={<Package size={24} />} label="СУМКА" />
        <NavButton active={activeTab === 'city'} onClick={() => setActiveTab('city')} icon={<Hammer size={24} />} label="ГОРОД" />
        <NavButton active={activeTab === 'locations'} onClick={() => setActiveTab('locations')} icon={<MapIcon size={24} />} label="МИР" />
      </div>

      {/* Quick Potion Bar & Attack (Mobile) */}
      <div className="sm:hidden fixed bottom-[90px] right-4 flex flex-col items-end gap-4 z-50 pointer-events-auto">
        
        <button 
          onClick={toggleAutoBattle}
          disabled={!useGameStore.getState().currentTargetId}
          className={`w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all active:scale-90 shadow-xl ${
            isAutoBattle && useGameStore.getState().currentTargetId 
              ? 'bg-red-700 border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.6)]' 
              : useGameStore.getState().currentTargetId
                ? 'bg-red-950/80 border-red-800'
                : 'bg-gray-900 border-gray-700 opacity-50'
          }`}
        >
          <div className="flex flex-col items-center">
            <Sword size={32} className={`text-white ${isAutoBattle ? 'animate-bounce' : ''}`} />
            <span className="text-[10px] font-bold text-white uppercase mt-1 tracking-widest leading-none">Атака</span>
          </div>
        </button>

        <button 
          onClick={usePotion}
          disabled={player.potions <= 0 || player.potionCooldown > 0}
          className={`w-14 h-14 rounded-full border-2 flex items-center justify-center relative transition-all active:scale-90 ${player.potions > 0 && player.potionCooldown === 0 ? 'bg-red-900/40 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-gray-800 border-gray-600 grayscale'}`}
        >
          <div className="text-red-500"><Heart size={28} fill="currentColor" /></div>
          <div className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-white/20">
            {player.potions}
          </div>
          {player.potionCooldown > 0 && (
            <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center text-white font-bold text-sm">
              {Math.ceil(player.potionCooldown)}
            </div>
          )}
        </button>
        <div className="h-0.5 w-8 bg-[#d4af37]/20 rounded-full" />
      </div>

      {/* Desktop Main Navigation (Fixed on right) */}
      <div className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 flex-col gap-3 pointer-events-auto">
        <button 
          onClick={toggleAutoBattle} 
          disabled={!useGameStore.getState().currentTargetId}
          className={`p-4 rounded-xl border transition-all ${
            isAutoBattle && useGameStore.getState().currentTargetId 
              ? 'bg-red-700 text-white border-red-400 shadow-[0_0_15px_rgba(220,38,38,0.5)]' 
              : useGameStore.getState().currentTargetId
                ? 'bg-red-950/80 border-red-800 text-red-500'
                : 'bg-gray-900 border-gray-700 text-gray-600 opacity-50'
          }`}
        >
          <Sword size={24} className={isAutoBattle ? 'animate-bounce' : ''} />
          <span className="text-[10px] block font-bold mt-1 uppercase">Атака</span>
        </button>
        <button onClick={() => setActiveTab(activeTab === 'character' ? null : 'character')} className={`p-4 rounded-xl border transition-all ${activeTab === 'character' ? 'bg-[#e5d3b3] text-[#1a1612]' : 'bg-[#1a1612]/80 border-[#4a3b2c] text-[#e5d3b3]'}`}><User size={24} /><span className="text-[10px] block font-bold mt-1 uppercase">Герой</span></button>
        <button onClick={() => setActiveTab(activeTab === 'inventory' ? null : 'inventory')} className={`p-4 rounded-xl border transition-all ${activeTab === 'inventory' ? 'bg-[#e5d3b3] text-[#1a1612]' : 'bg-[#1a1612]/80 border-[#4a3b2c] text-[#e5d3b3]'}`}><Package size={24} /><span className="text-[10px] block font-bold mt-1 uppercase">Сумка</span></button>
        <button onClick={() => setActiveTab(activeTab === 'city' ? null : 'city')} className={`p-4 rounded-xl border transition-all ${activeTab === 'city' ? 'bg-amber-600 text-white border-amber-400' : 'bg-[#1a1612]/80 border-[#4a3b2c] text-amber-500'}`}><Hammer size={24} /><span className="text-[10px] block font-bold mt-1 uppercase">Город</span></button>
        <button onClick={() => setActiveTab(activeTab === 'locations' ? null : 'locations')} className={`p-4 rounded-xl border transition-all ${activeTab === 'locations' ? 'bg-[#e5d3b3] text-[#1a1612]' : 'bg-[#1a1612]/80 border-[#4a3b2c] text-[#e5d3b3]'}`}><MapIcon size={24} /><span className="text-[10px] block font-bold mt-1 uppercase">ТП</span></button>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeTab && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-x-0 sm:inset-x-6 top-10 sm:top-16 bottom-[70px] sm:bottom-24 bg-[#0a0806] border-y-2 sm:border-2 border-[#d4af37] pointer-events-auto p-3 sm:p-8 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] z-50"
          >
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(#d4af37 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            
            {/* Corner decorations */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#d4af37] z-20" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#d4af37] z-20" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#d4af37] z-20" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#d4af37] z-20" />
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-8 relative z-10 gap-4">
              <div className="flex flex-col w-full sm:w-auto">
                <h2 className="text-xl sm:text-3xl font-cinzel font-bold text-[#d4af37] uppercase tracking-[0.2em] truncate">
                   {activeTab === 'inventory' ? 'Вещи' : activeTab === 'locations' ? 'Локации' : activeTab === 'city' ? 'Город' : 'Герой'}
                </h2>
                <div className="h-0.5 w-full bg-[#d4af37]/40 mt-1" />
              </div>
              <button 
                onClick={() => setActiveTab(null)} 
                className="w-full sm:w-auto font-cinzel text-xs sm:text-sm text-[#d4af37] border-2 border-[#d4af37] px-6 py-2 hover:bg-[#d4af37] hover:text-black transition-all font-bold tracking-widest"
              >
                ЗАКРЫТЬ
              </button>
            </div>

            {activeTab === 'inventory' ? (
              <div className="flex-1 overflow-y-auto grid gap-2 sm:gap-3 pb-4 [&::-webkit-scrollbar]:hidden content-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(3rem, 1fr))' }}>
                {inventory.length === 0 && (
                  <div className="col-span-full py-10 sm:py-20 text-center text-[#e5d3b3]/20 uppercase font-cinzel font-bold tracking-[0.3em] text-xs sm:text-base">
                    Ваша сумка пуста
                  </div>
                )}
                {inventory.map((item) => (
                  <InventoryItem key={item.id} item={item} onClick={() => setSelectedItem(item)} />
                ))}
              </div>
            ) : activeTab === 'city' ? (
              <div className="flex-1 overflow-y-auto flex flex-col gap-4 [&::-webkit-scrollbar]:hidden">
                 <div className="flex gap-2 mb-4 bg-black/40 p-1 rounded border border-[#d4af37]/20 shrink-0">
                    {['shop', 'forge', 'buffer'].map(t => (
                       <button 
                        key={t}
                        onClick={() => setCitySubTab(t as any)}
                        className={`flex-1 py-3 font-cinzel font-bold text-xs rounded transition-all ${citySubTab === t ? 'bg-[#d4af37] text-black' : 'text-[#d4af37] hover:bg-[#d4af37]/10'}`}
                       >
                          {t === 'shop' ? 'МАГАЗИН' : t === 'forge' ? 'КУЗНЯ' : 'БАФФЕР'}
                       </button>
                    ))}
                 </div>

                 {citySubTab === 'shop' && (
                    <div className="grid grid-cols-4 gap-2 sm:gap-4">
                       {shopItems.map(item => (
                          <div 
                            key={item.id} 
                            onClick={() => { setSelectedShopItem(item); setBuyQuantity(1); }}
                            className="aspect-square bg-black/60 border border-[#d4af37]/30 flex flex-col items-center justify-center p-2 rounded hover:border-[#d4af37] transition-all cursor-pointer group"
                          >
                             <div className="text-[#d4af37] group-hover:scale-110 transition-transform mb-1">
                                {item.icon === 'heart' ? <Heart /> : item.icon === 'gem' ? <Gem /> : item.icon === 'award' ? <Award /> : <Zap />}
                             </div>
                             <div className="text-[8px] sm:text-[10px] text-center font-cinzel font-bold text-[#e5d3b3] leading-none">{item.name}</div>
                             <div className="text-[7px] sm:text-[9px] text-[#d4af37] mt-1">{item.price} G</div>
                          </div>
                       ))}
                    </div>
                 )}

                 {citySubTab === 'forge' && (
                   <div className="space-y-4">
                      {/* Categories */}
                      <div className="flex gap-2 sm:gap-4 mb-2 sticky top-0 bg-[#0f0d0b] py-2 z-30 border-b border-[#4a3b2c]">
                        <button 
                          onClick={() => { setCraftCategory('weapon'); setCraftType('melee'); }}
                          className={`flex-1 py-1.5 sm:py-2 font-cinzel font-bold rounded border transition-all text-[10px] sm:text-xs ${craftCategory === 'weapon' ? 'bg-[#b8860b] border-[#d4af37] text-white' : 'bg-[#1a1612] border-[#4a3b2c] text-[#e5d3b3]/40'}`}
                        >
                          ОРУЖИЕ
                        </button>
                        <button 
                          onClick={() => { setCraftCategory('armor'); setCraftType('armor'); }}
                          className={`flex-1 py-1.5 sm:py-2 font-cinzel font-bold rounded border transition-all text-[10px] sm:text-xs ${craftCategory === 'armor' ? 'bg-[#b8860b] border-[#d4af37] text-white' : 'bg-[#1a1612] border-[#4a3b2c] text-[#e5d3b3]/40'}`}
                        >
                          ДОСПЕХИ
                        </button>
                        <button 
                          onClick={() => { setCraftCategory('accessory'); setCraftType('accessory'); }}
                          className={`flex-1 py-1.5 sm:py-2 font-cinzel font-bold rounded border transition-all text-[10px] sm:text-xs ${craftCategory === 'accessory' ? 'bg-[#b8860b] border-[#d4af37] text-white' : 'bg-[#1a1612] border-[#4a3b2c] text-[#e5d3b3]/40'}`}
                        >
                          АМУЛЕТЫ
                        </button>
                      </div>

                      {craftCategory === 'weapon' && (
                        <div className="flex gap-2 sm:gap-4 mb-2 bg-[#0f0d0b] py-1 z-20">
                          {['melee', 'staff', 'ranged'].map((t) => (
                            <button 
                              key={t}
                              onClick={() => setCraftType(t as any)}
                              className={`flex-1 py-1.5 font-cinzel font-bold rounded border transition-all text-[9px] sm:text-[10px] ${craftType === t ? 'bg-amber-600 border-amber-400 text-white' : 'bg-[#1a1612] border-[#4a3b2c] text-[#e5d3b3]/40'}`}
                            >
                              {t === 'melee' ? 'МЕЧИ' : t === 'staff' ? 'ПОСОХИ' : 'ЛУКИ'}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2 sm:space-y-3 pb-8">
                        {['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'ultra'].map((rarity) => {
                          const cost = {
                            common: { shards: 10, gold: 50, recipes: 0 },
                            uncommon: { shards: 40, gold: 200, recipes: 1 },
                            rare: { shards: 150, gold: 1000, recipes: 3 },
                            epic: { shards: 500, gold: 5000, recipes: 5 },
                            legendary: { shards: 2000, gold: 25000, recipes: 10 },
                            mythic: { shards: 10000, gold: 150000, recipes: 25 },
                            ultra: { shards: 300000, gold: 300000, recipes: 50 }
                          }[rarity]!;
                          
                          const playerRecipesCount = player.recipes ? (player.recipes[rarity] || 0) : 0;
                          const hasEnoughRecipes = playerRecipesCount >= cost.recipes;
                          const canAfford = player.shards >= cost.shards && player.gold >= cost.gold && hasEnoughRecipes;
                          const displayType = craftType === 'melee' ? 'sword' : craftType === 'ranged' ? 'bow' : craftType;

                          return (
                            <div key={rarity} 
                                className={`p-3 sm:p-4 rounded border flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 transition-all ${
                                  hasEnoughRecipes ? 'bg-[#1a2612]/30 border-[#b8860b]/30' : 'bg-[#1a1612]/60 border-gray-800/40 opacity-80'
                                }`}>
                              <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border rounded bg-black/60 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]" style={{ borderColor: getRarityColor(rarity) }}>
                                  <ItemIcon icon={displayType} name="" rarity={rarity} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] sm:text-xs font-cinzel uppercase tracking-[0.1em] mb-0.5 font-bold truncate" style={{ color: getRarityColor(rarity) }}>
                                    {rarity === 'common' ? 'ОБЫЧНЫЙ' : rarity === 'uncommon' ? 'НЕОБЫЧНЫЙ' : rarity === 'rare' ? 'РЕДКИЙ' : rarity === 'epic' ? 'ЭПИЧЕСКИЙ' : rarity === 'legendary' ? 'ЛЕГЕНДАРНЫЙ' : rarity === 'mythic' ? 'МИФИЧЕСКИЙ' : 'УЛЬТРА'} {craftType === 'melee' ? 'МЕЧ' : craftType === 'ranged' ? 'ЛУК' : craftType === 'staff' ? 'ПОСОХ' : craftType === 'armor' ? 'ДОСПЕХ' : 'АМУЛЕТ'}
                                  </div>
                                  <div className="text-[8px] text-amber-500/80 mb-1 font-bold tracking-tight">
                                    {craftType === 'ranged' ? 'Дальний бой | 30% Шанс x2 урона' : craftType === 'melee' ? 'Ближний бой | 25% Урон по области' : craftType === 'staff' ? 'Ср. дистанция | 15% Вампиризм' : craftType === 'armor' ? 'Защита и Здоровье' : 'Доп. Урон'}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8px] sm:text-[9px] font-cinzel uppercase tracking-widest leading-none">
                                    <span className={player.gold >= cost.gold ? 'text-[#d4af37]' : 'text-red-500'}>{cost.gold} золота</span>
                                    <span className={player.shards >= cost.shards ? 'text-blue-400' : 'text-red-500'}>{cost.shards} осколков</span>
                                    {cost.recipes > 0 && (
                                      <span className={hasEnoughRecipes ? 'text-purple-400' : 'text-red-500'}>
                                        Частиц: {playerRecipesCount}/{cost.recipes}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {hasEnoughRecipes || cost.recipes === 0 ? (
                                <button 
                                  disabled={!canAfford}
                                  onClick={() => craftItem(rarity, displayType as any)}
                                  className={`py-2.5 sm:py-2 sm:px-8 rounded font-cinzel font-bold uppercase transition-all text-[10px] sm:text-xs tracking-widest ${
                                    canAfford ? 'bg-amber-600 hover:bg-amber-500 text-[#1a1612] shadow-[0_0_10px_rgba(217,119,6,0.3)]' : 'bg-gray-800 text-gray-500 border border-gray-700'
                                  }`}
                                >
                                  {canAfford ? 'КРАФТ' : 'НЕДОСТАТОЧНО'}
                                </button>
                              ) : (
                                <div className="text-[8px] font-cinzel text-red-500/60 flex flex-col justify-center uppercase tracking-widest px-3 py-1.5 border border-red-500/20 rounded bg-red-950/20 text-center">
                                  <span>Нужны частицы</span>
                                  <span className="text-[7px] text-gray-500 mt-0.5 normal-case">(падают с монстров)</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                   </div>
                 )}

                 {citySubTab === 'buffer' && (
                    <div className="space-y-6">
                       <div className="p-6 bg-black/80 border-2 border-[#d4af37]/40 rounded-xl text-center shadow-[0_0_30px_rgba(212,175,55,0.1)]">
                          <h4 className="text-xl sm:text-3xl font-cinzel text-[#d4af37] font-bold mb-3 tracking-[0.2em]">МАСТЕР БАФФОВ</h4>
                          <p className="text-sm sm:text-lg text-[#e5d3b3]/80 uppercase tracking-widest leading-relaxed italic">&quot;Приветствую, странник. За скромную плату я наделю тебя великой силой.&quot;</p>
                       </div>
                       <div className="grid grid-cols-1 gap-2 sm:gap-4">
                          {[
                             { name: 'Божественный Урон', type: 'damage', value: 0.3, cost: 1000, color: 'text-red-500', icon: <Sword size={20} /> },
                             { name: 'Стальная Кожа', type: 'defense', value: 0.3, cost: 1000, color: 'text-blue-500', icon: <Shield size={20} /> },
                             { name: 'Дар Опыта', type: 'exp', value: 1.0, cost: 2500, color: 'text-amber-500', icon: <Award size={20} /> }
                          ].map(b => (
                             <button 
                                key={b.name}
                                onClick={() => {
                                   if (player.gold >= b.cost) {
                                      useGameStore.getState().buyBuff({ id: Math.random().toString(), name: b.name, type: b.type as any, value: b.value, duration: 300, icon: 'zap' }, b.cost);
                                   }
                                }}
                                className="flex items-center justify-between p-3 sm:p-5 bg-[#1a1612] border border-[#4a3b2c] rounded-xl hover:border-[#d4af37] transition-all group active:scale-[0.98]"
                             >
                                <div className="flex items-center gap-3 sm:gap-4">
                                   <div className={`${b.color} bg-black/40 p-2 rounded-lg`}>{b.icon}</div>
                                   <div className="text-left">
                                      <div className="text-sm sm:text-xl font-cinzel font-bold text-[#d4af37] mb-0.5">{b.name}</div>
                                      <div className="text-[9px] sm:text-[11px] text-[#e5d3b3]/60 uppercase tracking-widest">{b.type === 'exp' ? '+100% ОПЫТ' : '+30% ПАРАМЕТР'} НА 5 МИНУТ</div>
                                   </div>
                                </div>
                                <div className="text-amber-500 font-bold font-spectral text-sm sm:text-xl flex items-center gap-1.5 shrink-0 pl-2">
                                   {b.cost} <Coins size={14} className="sm:w-5 sm:h-5" />
                                </div>
                             </button>
                          ))}
                       </div>
                    </div>
                 )}
              </div>
            ) : activeTab === 'locations' ? (
              <div className="flex-1 space-y-8 overflow-y-auto pb-4 [&::-webkit-scrollbar]:hidden">
                <div className="space-y-4">
                  <h3 className="text-xl font-cinzel font-bold text-[#d4af37] border-b border-[#d4af37]/30 pb-2">Локации</h3>
                  {locations.filter(l => !l.isDungeon).map((loc) => (
                    <div 
                      key={loc.id}
                      className={`p-4 sm:p-6 rounded border transition-all ${
                        currentLocationId === loc.id 
                          ? 'bg-[#d4af37]/20 border-[#d4af37] shadow-[0_0_15px_rgba(212,175,55,0.3)]' 
                          : 'bg-[#1a1612] border-[#4a3b2c] hover:border-[#b8860b]/50'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h4 className="text-lg sm:text-2xl font-cinzel font-bold text-[#e5d3b3]">{loc.name}</h4>
                          <div className="text-xs text-amber-500/80 my-1">{loc.description}</div>
                          <div className="flex gap-4 mt-1">
                            <span className="text-[10px] sm:text-xs font-cinzel text-[#d4af37]/60 uppercase tracking-widest flex items-center gap-1"><User size={12} /> Ур: {loc.minLevel}+</span>
                            <span className="text-[10px] sm:text-xs font-cinzel text-[#d4af37]/60 uppercase tracking-widest flex items-center gap-1"><Swords size={12} /> Враги: {loc.enemyBaseHp} HP</span>
                          </div>
                        </div>
                        
                        {currentLocationId === loc.id ? (
                          <span className="px-4 py-2 bg-[#d4af37]/30 text-[#d4af37] font-cinzel font-bold text-xs rounded border border-[#d4af37]/50 uppercase">ВЫ ТУТ</span>
                        ) : (
                          <button 
                            disabled={player.level < loc.minLevel || player.gold < loc.cost}
                            onClick={() => teleport(loc.id)}
                            className={`px-6 py-2 rounded font-cinzel font-bold text-xs uppercase transition-all whitespace-nowrap ${
                              player.level >= loc.minLevel && player.gold >= loc.cost
                                ? 'bg-[#b8860b] text-[#1a1612] hover:bg-[#d4af37]'
                                : 'bg-black/40 text-gray-600 border border-gray-800 cursor-not-allowed'
                            }`}
                          >
                            ТП ({loc.cost === 0 ? 'БЕСПЛАТНО' : <>{loc.cost} <Coins size={10} className="inline mb-1" /></>})
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-cinzel font-bold text-red-500 border-b border-red-900/30 pb-2">Подземелья</h3>
                  {locations.filter(l => l.isDungeon).map((loc) => (
                    <div 
                      key={loc.id}
                      className={`p-4 sm:p-6 rounded border transition-all ${
                        currentLocationId === loc.id 
                          ? 'bg-red-900/20 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' 
                          : 'bg-[#1a0f0f] border-red-900/40 hover:border-red-500/50'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h4 className="text-lg sm:text-2xl font-cinzel font-bold text-red-400">{loc.name}</h4>
                          <div className="text-xs text-red-500/80 my-1">{loc.description}</div>
                          <div className="flex gap-4 mt-1">
                            <span className="text-[10px] sm:text-xs font-cinzel text-red-400/60 uppercase tracking-widest flex items-center gap-1"><User size={12} /> Ур: {loc.minLevel}+</span>
                            <span className="text-[10px] sm:text-xs font-cinzel text-red-400/60 uppercase tracking-widest flex items-center gap-1"><Swords size={12} /> Враги: {loc.enemyBaseHp} HP</span>
                          </div>
                        </div>
                        
                        {currentLocationId === loc.id ? (
                          <span className="px-4 py-2 bg-red-900/30 text-red-500 font-cinzel font-bold text-xs rounded border border-red-900/50 uppercase">ВЫ ТУТ</span>
                        ) : (
                          <button 
                            disabled={player.level < loc.minLevel || player.gold < loc.cost}
                            onClick={() => teleport(loc.id)}
                            className={`px-6 py-2 rounded font-cinzel font-bold text-xs uppercase transition-all whitespace-nowrap ${
                              player.level >= loc.minLevel && player.gold >= loc.cost
                                ? 'bg-red-700 text-white hover:bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.3)] hover:shadow-[0_0_20px_rgba(220,38,38,0.5)]'
                                : 'bg-black/40 text-gray-600 border border-gray-800 cursor-not-allowed'
                            }`}
                          >
                            ВХОД ({loc.cost} <Coins size={10} className="inline mb-1" />)
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 space-y-6 sm:space-y-10 overflow-y-auto pb-6 [&::-webkit-scrollbar]:hidden">
                {/* Player Profile Header */}
                <div className="flex items-center gap-6 p-4 sm:p-6 bg-black/40 border-2 border-[#d4af37]/20 rounded-lg relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-5">
                    <User size={120} />
                  </div>
                  <div className="w-16 h-16 sm:w-24 sm:h-24 border-2 border-[#d4af37] rounded-full flex items-center justify-center bg-black/80 relative z-10 shadow-[0_0_20px_rgba(212,175,55,0.2)]"
                       style={{ backgroundColor: player.skinColor || '#e5c298' }}>
                    <span className="font-cinzel text-2xl sm:text-4xl font-bold text-black/90">{player.level}</span>
                  </div>
                  <div className="relative z-10">
                    <div className="text-xs sm:text-sm font-cinzel text-[#d4af37]/60 uppercase tracking-[0.3em] mb-1">Никнейм</div>
                    <h3 className="text-xl sm:text-4xl font-cinzel font-bold text-[#d4af37] truncate max-w-[200px] sm:max-w-md tracking-widest italic">{user?.email.split('@')[0]}</h3>
                  </div>
                </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-10">
                <div className="space-y-4">
                  <div className="flex justify-between items-center pr-2">
                    <h3 className="text-xs sm:text-xl font-bold font-cinzel text-[#d4af37] uppercase tracking-[0.2em] border-l-2 sm:border-l-4 border-[#d4af37] pl-3 sm:pl-4">Характеристики</h3>
                    <div className={`text-xs sm:text-lg font-cinzel font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border sm:border-2 ${player.statPoints > 0 ? 'text-amber-400 bg-amber-500/20 border-amber-500/40 animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'text-gray-500 bg-gray-900 border-gray-700'}`}>
                      СВОБОДНО: {player.statPoints}
                    </div>
                  </div>
                  <div className="space-y-2 sm:space-y-4">
                    <StatRowWithActions label="Сила" subtitle="+10 HP, +0.1% Защита" value={player.stats.str} icon={<Heart size={14} className="text-red-500" />} onPlus={() => increaseStat('str')} canPlus={player.statPoints > 0} />
                    <StatRowWithActions label="Ловкость" subtitle="+1% Крит, +0.05% Скор. Атк" value={player.stats.dex} icon={<Zap size={14} className="text-yellow-500" />} onPlus={() => increaseStat('dex')} canPlus={player.statPoints > 0} />
                    <StatRowWithActions label="Интеллект" subtitle="+1% Опыт (каждые 10)" value={player.stats.int} icon={<Award size={14} className="text-blue-500" />} onPlus={() => increaseStat('int')} canPlus={player.statPoints > 0} />
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-xs sm:text-sm font-bold font-cinzel text-[#d4af37] uppercase tracking-[0.2em] border-l-2 border-[#d4af37] pl-3">Боевые показатели</h3>
                  <div className="grid grid-cols-2 gap-2 sm:gap-4">
                    <StatRow label="Урон" value={Math.round(player.stats.damage)} icon={<Sword size={14} className="text-[#d4af37]" />} />
                    <StatRow label="Крит. Шанс" value={`${Math.round(player.stats.critRate || 10)}%`} icon={<Zap size={14} className="text-amber-400" />} />
                    <StatRow label="Крит. Урон" value={`${Math.round(player.stats.critDamage || 150)}%`} icon={<Zap size={14} className="text-orange-400" />} />
                    <StatRow label="Уклонение" value={`${Math.round(player.stats.dodge || 0)}%`} icon={<Shield size={14} className="text-blue-300" />} />
                    <StatRow label="Вампиризм" value={`${Math.round(player.stats.lifesteal || 0)}%`} icon={<Heart size={14} className="text-red-600" />} />
                    <StatRow label="Реген HP" value={`${Math.round(player.stats.hpRegen || 0)}/сек`} icon={<Heart size={14} className="text-green-500" />} />
                    <StatRow label="Порезка Урона" value={`${(player.stats.damageReduction || 0).toFixed(1)}%`} icon={<Shield size={14} className="text-blue-400" />} />
                    <StatRow label="Доп. Опыт" value={`+${(((player.stats.expMultiplier || 1) - 1) * 100).toFixed(0)}%`} icon={<Gem size={14} className="text-purple-400" />} />
                  </div>
                  
                  <button 
                    onClick={() => {
                      const colors = ['#e5c298', '#ffdbac', '#f1c27d', '#e0ac69', '#8d5524', '#c68642', '#34a853', '#4285f4', '#ea4335', '#fabb05'];
                      const randomColor = colors[Math.floor(Math.random() * colors.length)];
                      useGameStore.getState().setSkinColor(randomColor);
                    }}
                    className="w-full mt-2 bg-black border border-[#d4af37]/40 text-[#d4af37] font-cinzel text-[10px] py-3 hover:bg-[#d4af37] hover:text-black transition-all uppercase tracking-widest font-bold rounded"
                  >
                    Сменить Внешность
                  </button>
                </div>
              </div>

                <div className="space-y-4 sm:space-y-6 pt-6 sm:pt-10 border-t border-[#4a3b2c]">
                  <h3 className="text-[10px] sm:text-sm font-bold font-cinzel text-[#d4af37] uppercase tracking-[0.3em] border-l-2 border-[#d4af37] pl-3">Экипировка</h3>
                  <div className="grid grid-cols-4 gap-4 sm:gap-6">
                    <EquipmentSlot label="Оружие" item={equipment.weapon} onClick={(it) => setSelectedItem(it)} />
                    <EquipmentSlot label="Броня" item={equipment.armor} onClick={(it) => setSelectedItem(it)} />
                    <EquipmentSlot label="Аксессуар" item={equipment.accessory} onClick={(it) => setSelectedItem(it)} />
                    <EquipmentSlot label="Аура" item={equipment.aura} onClick={(it) => setSelectedItem(it)} />
                  </div>
                </div>

                {/* Logout Button */}
                <div className="pt-10 mt-6 border-t border-[#4a3b2c] flex justify-center">
                  <button 
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-8 py-4 bg-red-950/20 border-2 border-red-900/50 text-red-500 font-cinzel font-bold uppercase tracking-[0.3em] hover:bg-red-500 hover:text-black transition-all group active:scale-95 shadow-lg"
                  >
                    <LogOut size={20} className="group-hover:rotate-12 transition-transform" />
                    <span>Покинуть мир</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Item Details Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-[#1a1612] border-2 border-[#b8860b]/40 p-6 rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#d4af37]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-20 h-20 bg-[#0f0d0b] border-2 rounded flex items-center justify-center p-2 shrink-0`} 
                     style={{ borderColor: getRarityColor(selectedItem.rarity) }}>
                  <ItemIcon icon={selectedItem.icon} name={selectedItem.name} rarity={selectedItem.rarity} />
                </div>
                <div>
                  <div className="text-[10px] font-cinzel font-bold uppercase tracking-tight opacity-50" style={{ color: getRarityColor(selectedItem.rarity) }}>
                    {selectedItem.rarity}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-cinzel font-bold text-[#e5d3b3]">{selectedItem.name}</h3>
                  <div className={`text-xs font-cinzel uppercase tracking-widest mt-1 ${player.level < selectedItem.level ? 'text-red-500 font-bold' : 'text-[#e5d3b3]/40'}`}>
                    Требуемый Уровень: {selectedItem.level}
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6 bg-black/40 p-4 rounded border border-[#4a3b2c]/30">
                {selectedItem.stats.damage && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Урон</span>
                    <span className="text-lg font-bold text-red-500">+{formatNumber(selectedItem.stats.damage)}</span>
                  </div>
                )}
                {selectedItem.stats.atkSpeed && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Скор. атаки</span>
                    <span className="text-lg font-bold text-yellow-500">{selectedItem.stats.atkSpeed}</span>
                  </div>
                )}
                {selectedItem.stats.defense && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Защита</span>
                    <span className="text-lg font-bold text-blue-500">+{formatNumber(selectedItem.stats.defense)}</span>
                  </div>
                )}
                {selectedItem.stats.hp && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Здоровье</span>
                    <span className="text-lg font-bold text-green-500">+{formatNumber(selectedItem.stats.hp)}</span>
                  </div>
                )}
                {selectedItem.stats.str && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Сила</span>
                    <span className="text-lg font-bold text-red-400">+{formatNumber(selectedItem.stats.str)}</span>
                  </div>
                )}
                {selectedItem.stats.dex && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Ловкость</span>
                    <span className="text-lg font-bold text-yellow-400">+{formatNumber(selectedItem.stats.dex)}</span>
                  </div>
                )}
                {selectedItem.stats.int && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Интеллект</span>
                    <span className="text-lg font-bold text-blue-400">+{formatNumber(selectedItem.stats.int)}</span>
                  </div>
                )}
                {selectedItem.stats.lifesteal && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Вампиризм</span>
                    <span className="text-lg font-bold text-red-600">+{selectedItem.stats.lifesteal}%</span>
                  </div>
                )}
                {selectedItem.stats.dodge && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Уклонение</span>
                    <span className="text-lg font-bold text-blue-300">+{selectedItem.stats.dodge}%</span>
                  </div>
                )}
                {selectedItem.stats.critDamage && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Крит. Урон</span>
                    <span className="text-lg font-bold text-orange-400">+{formatNumber(selectedItem.stats.critDamage)}%</span>
                  </div>
                )}
                {selectedItem.stats.hpRegen && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-cinzel text-[#e5d3b3]/60 uppercase tracking-widest">Реген HP</span>
                    <span className="text-lg font-bold text-green-500">+{formatNumber(selectedItem.stats.hpRegen)}/сек</span>
                  </div>
                )}

                {/* Sockets */}

                {(selectedItem.sockets || 0) > 0 && (
                  <div className="pt-3 mt-3 border-t border-[#4a3b2c]/30">
                    <span className="text-[10px] font-cinzel text-[#e5d3b3]/40 uppercase tracking-widest block mb-2">Гнезда для камней</span>
                    <div className="flex gap-2">
                      {Array.from({ length: selectedItem.sockets || 0 }).map((_, i) => (
                        <div key={i} className="w-8 h-8 rounded-full border border-[#d4af37]/20 bg-black/60 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-[#d4af37]/10" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  disabled={player.level < selectedItem.level}
                  onClick={() => {
                    equipItem(selectedItem);
                    setSelectedItem(null);
                  }}
                  className={`font-cinzel font-bold py-3 rounded uppercase tracking-widest transition-all ${
                     player.level >= selectedItem.level 
                       ? 'bg-[#b8860b] text-[#1a1612] hover:bg-[#d4af37]' 
                       : 'bg-black/40 text-gray-500 border border-gray-700 cursor-not-allowed'
                  }`}
                >
                  ОДЕТЬ
                </button>
                <button 
                  onClick={() => {
                    sellItem(selectedItem);
                    setSelectedItem(null);
                  }}
                  className="bg-red-900/20 text-red-500 border border-red-500/30 font-cinzel font-bold py-3 rounded uppercase tracking-widest hover:bg-red-900/40 transition-all"
                >
                  ПРОДАТЬ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedShopItem && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-auto">
             <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedShopItem(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="relative w-full max-w-xs bg-[#1a1612] border-2 border-[#d4af37] p-6 rounded-lg shadow-2xl"
            >
               <div className="flex flex-col items-center text-center">
                  <div className="text-4xl text-[#d4af37] mb-4">
                     {selectedShopItem.icon === 'heart' ? <Heart size={48} /> : selectedShopItem.icon === 'gem' ? <Gem size={48} /> : selectedShopItem.icon === 'award' ? <Award size={48} /> : <Zap size={48} />}
                  </div>
                  <h3 className="text-xl font-cinzel font-bold text-[#d4af37] mb-2">{selectedShopItem.name}</h3>
                  <p className="text-xs text-[#e5d3b3]/60 mb-6 uppercase tracking-widest leading-relaxed">{selectedShopItem.description}</p>
                  
                  <div className="flex items-center gap-4 mb-6 bg-black/40 p-2 rounded-lg border border-[#d4af37]/20 w-full justify-center">
                     <button onClick={() => setBuyQuantity(Math.max(1, buyQuantity - 1))} className="w-8 h-8 rounded bg-gray-800 text-white font-bold">-</button>
                     <span className="text-xl font-bold font-spectral text-[#d4af37] w-8 text-center">{buyQuantity}</span>
                     <button onClick={() => setBuyQuantity(buyQuantity + 1)} className="w-8 h-8 rounded bg-gray-800 text-white font-bold">+</button>
                  </div>

                  <div className="w-full space-y-3">
                     <div className="flex justify-between items-center px-2">
                        <span className="text-[10px] font-cinzel text-gray-500 uppercase tracking-widest">ИТОГО:</span>
                        <span className="text-lg font-bold text-amber-500">{selectedShopItem.price * buyQuantity} G</span>
                     </div>
                    <button 
                         onClick={() => {
                            if (player.gold >= selectedShopItem.price * buyQuantity) {
                               buyInShop(selectedShopItem.id, buyQuantity);
                               setSelectedShopItem(null);
                               setBuyQuantity(1);
                            }
                         }}
                         className="w-full py-5 bg-[#d4af37] text-black font-cinzel font-bold text-sm sm:text-xl uppercase tracking-[0.2em] rounded-xl hover:bg-amber-400 transition-all active:scale-95 shadow-[0_0_20px_rgba(212,175,55,0.3)]"
                      >
                         КУПИТЬ
                      </button>
                     <button 
                        onClick={() => { setSelectedShopItem(null); setBuyQuantity(1); }}
                        className="w-full py-2 text-gray-500 font-cinzel text-[10px] uppercase tracking-widest"
                     >
                        ОТМЕНА
                     </button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label, color = 'normal' }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, color?: 'normal'|'amber' }) => {
  const getStyles = () => {
    if (active) return 'text-[#d4af37] border-t-2 border-[#d4af37] -mt-[2px] bg-white/5';
    if (color === 'amber') return 'text-amber-500';
    return 'text-[#e5d3b3]/40';
  };
  
  return (
    <button 
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center py-1 transition-all group ${getStyles()}`}
    >
      <div className={`transition-transform group-active:scale-90 ${active ? 'scale-110' : ''}`}>
        {icon}
      </div>
      <span className="text-[8px] font-bold tracking-[0.2em] mt-0.5 leading-none">{label}</span>
    </button>
  );
};

const getRarityColor = (rarity: string) => {
  switch(rarity) {
    case 'common': return '#e5d3b3';
    case 'uncommon': return '#4ade80';
    case 'rare': return '#60a5fa';
    case 'epic': return '#c084fc';
    case 'legendary': return '#fbbf24';
    case 'mythic': return '#ef4444';
    case 'ultra': return '#2dd4bf'; // Base cyan color for UI text elements
    default: return '#e5d3b3';
  }
};

const StatRowWithActions = ({ label, subtitle, value, icon, onPlus, canPlus }: { label: string, subtitle: string, value: number, icon: React.ReactNode, onPlus: () => void, canPlus: boolean }) => {
  const safeValue = Number.isNaN(value) || value === undefined || value === null ? 0 : value;
  const displayValue = formatNumber(safeValue);
  return (
  <div className="flex items-center justify-between bg-[#1a1612] px-3 sm:px-4 py-2 sm:py-3 rounded-xl border border-[#4a3b2c] group hover:border-[#d4af37]/40 transition-all">
    <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
      <div className="shrink-0">{icon}</div>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] sm:text-xs font-bold font-cinzel text-[#e5d3b3] uppercase tracking-widest truncate">{label}</span>
        <span className="text-[8px] sm:text-[10px] font-spectral text-amber-500/70 uppercase tracking-tight mt-0.5 truncate">{subtitle}</span>
      </div>
    </div>
    <div className="flex items-center gap-2 sm:gap-4 shrink-0 pl-2">
      <span className="text-sm sm:text-xl font-bold font-spectral text-[#d4af37]">{displayValue}</span>
      <button 
        onClick={(e) => { e.stopPropagation(); onPlus(); }} 
        disabled={!canPlus}
        className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center border rounded-lg transition-all font-bold text-lg ${canPlus ? 'border-[#d4af37] text-[#d4af37] hover:bg-[#d4af37] hover:text-black active:scale-90 shadow-[0_0_10px_rgba(212,175,55,0.2)]' : 'border-gray-800 text-gray-800 opacity-20'}`}
      >
        +
      </button>
    </div>
  </div>
)};

const StatRow = ({ label, value, icon }: { label: string, value: any, icon: React.ReactNode }) => {
  let displayValue;
  if (typeof value === 'string') {
    let strVal = value.includes('NaN') ? value.replace('NaN', '0') : value;
    const match = strVal.match(/^(\+?-?\d+(?:\.\d+)?)(.*)$/);
    if(match) {
        displayValue = (match[1].startsWith('+') ? '+' : '') + formatNumber(Math.abs(Number(match[1]))) + match[2];
        if (displayValue.startsWith('+0k') || displayValue.startsWith('+0m')) displayValue = displayValue.replace('+0', '0');
    } else {
        displayValue = strVal;
    }
  } else {
    displayValue = formatNumber(Number.isNaN(value) || value === undefined || value === null ? 0 : value);
  }
  return (
  <div className="flex items-center justify-between bg-[#0f0d0b] px-4 sm:px-6 py-3 sm:py-4 rounded-lg border border-[#4a3b2c]/60 group hover:border-[#d4af37]/20 transition-all">
    <div className="flex items-center gap-3 sm:gap-5">
      {icon}
      <span className="text-xs sm:text-sm font-bold font-cinzel text-[#e5d3b3]/70 uppercase tracking-widest">{label}</span>
    </div>
    <span className="text-base sm:text-2xl font-bold font-spectral text-[#e5d3b3]">{displayValue}</span>
  </div>
)};

const ItemIcon = ({ icon, name, rarity = 'common' }: { icon: string, name: string, rarity?: string }) => {
  const color = getRarityColor(rarity);
  const isUltra = rarity === 'ultra';
  const isMythic = rarity === 'mythic' || isUltra;

  if (icon === 'armor') {
    return (
      <div className="relative w-12 h-12 flex items-center justify-center">
        <Shield size={32} color={color} fill={isUltra ? 'url(#ultra-grad)' : color + '33'} />
        {isUltra && (
           <svg width="0" height="0">
             <linearGradient id="ultra-grad" x1="0%" y1="0%" x2="100%" y2="100%">
               <stop offset="0%" stopColor="#8b5cf6" />
               <stop offset="100%" stopColor="#2dd4bf" />
             </linearGradient>
           </svg>
        )}
        {rarity === 'legendary' && <div className="absolute inset-0 border-2 border-yellow-400 rounded-lg animate-pulse" />}
        {isMythic && (
           <div className="absolute inset-0 flex items-center justify-center">
              <div className={`absolute inset-0 border-2 rounded-lg animate-pulse ${isUltra ? 'border-[#2dd4bf] shadow-[0_0_15px_#2dd4bf]' : 'border-red-600 shadow-[0_0_15px_#ff0000]'}`} />
              {/* Mythic/Ultra Wings */}
              <div className={`absolute -left-5 top-0 w-6 h-10 border-l-2 border-t-2 rounded-tl-[80%] rotate-[10deg] animate-pulse ${isUltra ? 'border-[#8b5cf6]/60 shadow-[0_0_10px_#8b5cf6]' : 'border-red-600/40'}`} />
              <div className={`absolute -right-5 top-0 w-6 h-10 border-r-2 border-t-2 rounded-tr-[80%] -rotate-[10deg] animate-pulse ${isUltra ? 'border-[#2dd4bf]/60 shadow-[0_0_10px_#2dd4bf]' : 'border-red-600/40'}`} />
              <div className={`w-16 h-8 absolute -z-10 rounded-[50%] blur-md ${isUltra ? 'bg-gradient-to-r from-violet-600/40 to-teal-400/40' : 'bg-red-900/20'}`} />
           </div>
        )}
      </div>
    );
  }

  if (icon === 'aura') {
    return (
      <div className="relative w-12 h-12 flex items-center justify-center">
        <div className={`absolute border-2 rounded-full animate-spin`} style={{ width: '100%', height: '100%', borderColor: color, animationDuration: '3s' }} />
        <div className={`absolute border-2 border-dashed rounded-full animate-[spin_4s_linear_reverse_infinite]`} style={{ width: '70%', height: '70%', borderColor: color }} />
        <div className={`w-3 h-3 rounded-full animate-pulse shadow-[0_0_10px_${color}]`} style={{ backgroundColor: color }} />
      </div>
    );
  }

  if (icon === 'accessory') {
    return (
      <div className="relative w-12 h-12 flex items-center justify-center">
        <Award size={32} color={color} className={isMythic ? `animate-pulse shadow-[0_0_10px_${color}]` : ''} />
      </div>
    );
  }
  
  if (icon === 'bow') {
    return (
      <div className="relative w-12 h-12 flex items-center justify-center">
        <div 
          className="w-10 h-10 border-4 rounded-full border-r-transparent rotate-45 transition-all duration-500" 
          style={{ 
            borderColor: color,
            boxShadow: (rarity === 'legendary' || rarity === 'epic' || isMythic) ? `0 0 15px ${color}88` : 'none',
          }} 
        />
        <div className="absolute w-10 h-0.5 bg-white/20" />
        {(rarity === 'legendary' || isMythic) && <div className="absolute inset-0 border border-current rounded-full animate-ping opacity-20" style={{ color }} />}
      </div>
    );
  }
  
  if (icon === 'staff') {
    return (
      <div className="relative w-12 h-12 flex items-center justify-center -rotate-45">
        <div 
          className="w-1 h-12 rounded-full absolute" 
          style={{ 
            backgroundColor: isMythic ? '#000' : '#78350f',
            boxShadow: (rarity === 'legendary' || isMythic) ? `0 0 10px ${isMythic ? color : '#78350f'}` : 'none'
          }} 
        />
        <div 
          className="absolute top-0 w-4 h-4 rounded-full border-2 flex items-center justify-center bg-black/40 group-hover:scale-110 transition-transform"
          style={{ borderColor: color, boxShadow: `0 0 10px ${color}` }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        </div>
        {(rarity === 'legendary' || isMythic) && <div className="absolute top-0 w-6 h-6 border border-current rounded-full animate-pulse" style={{ color }} />}
      </div>
    );
  }
  
  // Sword/Melee designs
  return (
    <div className="relative w-14 h-14 flex items-center justify-center rotate-45">
      {/* Blade with complexity */}
      <div 
        className="w-2 h-12 rounded-t-full relative shadow-xl transition-all duration-500 overflow-hidden" 
        style={{ 
          background: isUltra ? 'linear-gradient(to bottom, #8b5cf6 0%, #2dd4bf 100%)' : isMythic ? 'linear-gradient(to bottom, #f00 0%, #000 100%)' : `linear-gradient(to bottom, #fff 0%, ${color} 50%, #475569 100%)`,
          boxShadow: isUltra ? '0 0 20px #8b5cf6, 0 0 20px #2dd4bf' : (rarity === 'legendary' || rarity === 'epic' || isMythic) ? `0 0 20px ${color}` : 'none'
        }} 
      >
      </div>
      
      {/* Crossguard */}
      <div 
        className="absolute bottom-4 h-1.5 rounded-full transition-all"
        style={{ 
          width: isMythic ? '3rem' : rarity === 'legendary' ? '2.5rem' : rarity === 'epic' ? '2rem' : '1.5rem',
          background: isUltra ? 'linear-gradient(to right, #8b5cf6, #2dd4bf)' : isMythic ? '#ff0000' : rarity === 'legendary' ? '#b45309' : '#1e293b'
        }}
      />
      
      {/* Hilt */}
      <div className={`absolute bottom-1 w-2 h-4 border-t rounded-b-sm ${isMythic ? 'bg-black border-current' : 'bg-slate-800 border-slate-700/50'}`} style={{ borderColor: color }} />
    </div>
  );
};

const EquipmentSlot = ({ label, item, onClick }: { label: string, item: Item | null, onClick: (it: Item) => void }) => (
  <div className="flex flex-col gap-1 sm:gap-2 relative pt-2 group">
    <div className="absolute top-0 right-0 left-0 flex justify-center -mt-2 opacity-50 z-10 pointer-events-none">
       <span className="text-[7px] font-cinzel font-bold text-[#d4af37] tracking-[0.2em] bg-[#0a0806] px-1">{label}</span>
    </div>
    <div 
      onClick={() => item && onClick(item)}
      className={`aspect-square rounded border transition-all cursor-pointer ${
        item ? 'bg-[#261e16] border-[#d4af37] shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] hover:border-[#ffcf40]' : 'bg-[#1a1612]/40 border-[#4a3b2c] text-[#e5d3b3]/10'
      }`}
    >
      {item ? (
        <div className="flex items-center justify-center flex-col h-full w-full">
          <ItemIcon icon={item.icon} name={item.name} rarity={item.rarity} />
        </div>
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-[7px] sm:text-[10px] font-cinzel font-bold tracking-[0.1em] sm:tracking-[0.2em] rotate-[-45deg] opacity-20 uppercase whitespace-nowrap">{label}</div>
        </div>
      )}
    </div>
  </div>
);

const InventoryItem = ({ item, onClick }: { item: Item, onClick: () => void }) => {
  const rarityColor = getRarityColor(item.rarity);

  return (
    <motion.div 
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="aspect-square bg-[#1a1612]/80 border border-[#4a3b2c] flex items-center justify-center relative overflow-hidden cursor-pointer hover:bg-[#261e16] hover:border-[#b8860b] transition-all group rounded shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]"
    >
      <div className="absolute top-0 right-0 w-3 h-3 rotate-45 translate-x-1.5 -translate-y-1.5 opacity-80 z-10" 
           style={{ backgroundColor: rarityColor }} />
      <div className="scale-75 sm:scale-90">
        <ItemIcon icon={item.icon} name={item.name} rarity={item.rarity} />
      </div>
    </motion.div>
  );
};
