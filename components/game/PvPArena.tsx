'use client'

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  updateDoc, 
  doc, 
  deleteDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { useGameStore } from '@/lib/store';
import { motion, AnimatePresence } from 'motion/react';
import { Sword, Users, Trophy, Shield, Zap, Heart, Loader2, User } from 'lucide-react';

interface RoomData {
  id: string;
  status: 'waiting' | 'fighting' | 'finished';
  host: any;
  opponent: any;
  winner: string | null;
  lastAction?: any;
}

export const PvPArena: React.FC = () => {
  const { player, user, saveGame } = useGameStore();
  const [rooms, setRooms] = useState<any[]>([]);
  const [currentRoom, setCurrentRoom] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const rewardedRef = React.useRef(false);
  const [battleLog, setBattleLog] = useState<string[]>([]);

  // Listen for available rooms
  useEffect(() => {
    const q = query(collection(db, 'rooms'), where('status', '==', 'waiting'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRooms(roomData);
    });
    return () => unsubscribe();
  }, []);

  // Listen for current room updates
  useEffect(() => {
    if (!currentRoom?.id) return;
    const unsubscribe = onSnapshot(doc(db, 'rooms', currentRoom.id), (snapshot) => {
      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() } as RoomData;
        setCurrentRoom(data);
        
        // Handle battle end
        if (data.status === 'finished' && data.winner) {
          if (data.winner === user?.uid && !rewardedRef.current) {
            rewardedRef.current = true;
            handleVictory();
          }
        }
      } else {
        setCurrentRoom(null);
      }
    });
    return () => unsubscribe();
  }, [currentRoom?.id]);

  // Handle battle logic if we are participant
  useEffect(() => {
    if (!currentRoom || currentRoom.status !== 'fighting' || currentRoom.winner) return;

    const interval = setInterval(() => {
      processCombatStep();
    }, 1500);

    return () => clearInterval(interval);
  }, [currentRoom?.status]);

  const processCombatStep = async () => {
    if (!currentRoom || !user) return;
    
    const isHost = currentRoom.host.uid === user.uid;
    const self = isHost ? currentRoom.host : currentRoom.opponent;
    const target = isHost ? currentRoom.opponent : currentRoom.host;

    if (!target || self.hp <= 0 || target.hp <= 0) return;

    // Calculate damage
    const damage = Math.max(1, Math.floor(self.stats.damage * (0.8 + Math.random() * 0.4)) - Math.floor(target.stats.defense * 0.5));
    const newTargetHp = Math.max(0, target.hp - damage);

    const update: any = {
      updatedAt: serverTimestamp(),
      lastAction: { uid: user.uid, type: 'attack', amount: damage }
    };

    if (isHost) {
      update.opponent = { ...target, hp: newTargetHp };
    } else {
      update.host = { ...target, hp: newTargetHp };
    }

    if (newTargetHp <= 0) {
      update.status = 'finished';
      update.winner = user.uid;
    }

    try {
      await updateDoc(doc(db, 'rooms', currentRoom.id), update);
    } catch (e) {
      console.error("Combat update failed", e);
    }
  };

  const handleVictory = () => {
    // Only add reward once local state detects it
    useGameStore.setState(state => ({
      player: { ...state.player, gold: state.player.gold + 1000 }
    }));
    saveGame();
  };

  const createRoom = async () => {
    if (!user) return;
    setLoading(true);
    rewardedRef.current = false;
    try {
      const room = {
        status: 'waiting',
        host: {
          uid: user.uid,
          name: user.email.split('@')[0],
          hp: player.maxHp,
          maxHp: player.maxHp,
          stats: player.stats,
          skinColor: player.skinColor
        },
        opponent: null,
        winner: null,
        updatedAt: serverTimestamp()
      };
      const roomDoc = await addDoc(collection(db, 'rooms'), room);
      setCurrentRoom({ id: roomDoc.id, ...room });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (room: any) => {
    if (!user) return;
    setLoading(true);
    rewardedRef.current = false;
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        status: 'fighting',
        opponent: {
          uid: user.uid,
          name: user.email.split('@')[0],
          hp: player.maxHp,
          maxHp: player.maxHp,
          stats: player.stats,
          skinColor: player.skinColor
        },
        updatedAt: serverTimestamp()
      });
      setCurrentRoom(room);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const leaveRoom = async () => {
    if (!currentRoom || !user) return;
    if (currentRoom.host.uid === user.uid && currentRoom.status === 'waiting') {
      await deleteDoc(doc(db, 'rooms', currentRoom.id));
    }
    setCurrentRoom(null);
  };

  if (currentRoom) {
    const isHost = currentRoom.host.uid === user?.uid;
    const opponent = isHost ? currentRoom.opponent : currentRoom.host;
    const self = isHost ? currentRoom.host : currentRoom.opponent;

    return (
      <div className="flex-1 flex flex-col pt-4">
        <div className="flex justify-between items-center mb-6 px-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="font-cinzel text-xs text-red-500 font-bold uppercase tracking-widest">Арена Битвы</span>
          </div>
          <button onClick={leaveRoom} className="text-[#d4af37]/60 hover:text-[#d4af37] text-xs font-cinzel">ВЫЙТИ</button>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center gap-8 sm:gap-16">
          {/* Battle Arena View */}
          <div className="w-full flex justify-around items-center px-4 relative">
            {/* Center VS */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-6xl sm:text-8xl font-black italic text-[#d4af37]/10 tracking-widest">VS</div>
            </div>

            {/* Host/Self */}
            <FighterCard fighter={self} isSelf />
            
            <div className="w-12 h-1 bg-[#d4af37]/20 rounded-full hidden sm:block" />

            {/* Target */}
            {opponent ? (
              <FighterCard fighter={opponent} />
            ) : (
              <div className="flex flex-col items-center gap-4 opacity-50">
                <div className="w-20 h-20 sm:w-32 sm:h-32 border-2 border-dashed border-[#d4af37]/40 rounded-full flex items-center justify-center">
                  <Users size={40} className="text-[#d4af37]/40" />
                </div>
                <div className="text-center">
                  <div className="font-cinzel text-[10px] text-[#d4af37] uppercase tracking-widest animate-pulse">Ожидание...</div>
                </div>
              </div>
            )}
          </div>

          {currentRoom.status === 'finished' && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center z-10"
            >
              <div className="inline-flex flex-col items-center p-6 bg-black border-2 border-[#d4af37] shadow-[0_0_50px_rgba(212,175,55,0.3)]">
                <Trophy size={48} className="text-[#d4af37] mb-4" />
                <h3 className="text-3xl font-cinzel font-bold text-[#d4af37] uppercase mb-2">
                  {currentRoom.winner === user?.uid ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}
                </h3>
                {currentRoom.winner === user?.uid && (
                  <div className="text-green-500 font-bold tracking-widest">+1000 ЗОЛОТА</div>
                )}
                <button onClick={leaveRoom} className="mt-6 px-10 py-3 bg-[#d4af37] text-black font-cinzel font-bold tracking-widest hover:bg-white transition-colors">ВЕРНУТЬСЯ</button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-black/40 border-2 border-[#d4af37]/20 rounded-lg p-6 mb-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-2 opacity-5 translate-x-1/4 translate-y-1/4">
          <Sword size={200} />
        </div>
        <div className="relative z-10">
          <h2 className="text-2xl font-cinzel font-bold text-[#d4af37] uppercase tracking-widest mb-2 italic">Арена Испытаний</h2>
          <p className="text-[#e5d3b3]/60 text-sm max-w-xs sm:max-w-md">Побеждайте других героев в реальном времени и получайте 1000 золота за каждый триумф.</p>
        </div>
        <button 
          onClick={createRoom}
          disabled={loading}
          className="relative z-10 px-8 py-4 bg-[#d4af37] text-black font-cinzel font-bold uppercase tracking-[0.2em] hover:bg-white transition-all active:scale-95 shadow-xl disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'СОЗДАТЬ'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
        {rooms.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-[#e5d3b3]/20 uppercase font-cinzel tracking-widest">
            <Users size={48} className="mb-4 opacity-10" />
            <span>Нет доступных комнат</span>
          </div>
        ) : (
          rooms.map(room => (
            <div key={room.id} className="p-4 bg-black/60 border border-[#d4af37]/30 rounded-lg flex justify-between items-center group hover:border-[#d4af37] transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 border border-[#d4af37] rounded-full flex items-center justify-center text-[#d4af37] bg-[#d4af37]/5">
                  <User size={24} />
                </div>
                <div>
                  <h4 className="font-cinzel text-lg font-bold text-[#d4af37] tracking-widest">{room.host.name}</h4>
                  <div className="text-[10px] text-[#e5d3b3]/40 uppercase tracking-widest pt-0.5">Уровнь: {room.host.stats.level}</div>
                </div>
              </div>
              <button 
                onClick={() => joinRoom(room)}
                className="px-6 py-2 bg-[#d4af37]/10 border border-[#d4af37]/40 text-[#d4af37] font-cinzel font-bold hover:bg-[#d4af37] hover:text-black transition-all"
              >
                ПРИСОЕДИНИТЬСЯ
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const FighterCard = ({ fighter, isSelf }: { fighter: any, isSelf?: boolean }) => {
  const hpPercent = (fighter.hp / fighter.maxHp) * 100;

  return (
    <div className="flex flex-col items-center gap-4 relative">
      <div className={`w-24 h-24 sm:w-40 sm:h-40 border-4 border-[#d4af37] rounded-full flex items-center justify-center relative shadow-[0_0_30px_rgba(212,175,55,0.2)] bg-black/80`}
           style={{ backgroundColor: fighter.skinColor }}>
        <div className="absolute -top-4 -right-4 bg-black border border-[#d4af37] px-2 py-1 rounded text-[#d4af37] font-bold text-xs sm:text-sm font-cinzel">HP</div>
      </div>
      
      <div className="w-full max-w-[120px] sm:max-w-[200px] flex flex-col gap-2">
        <div className="text-center">
          <h4 className="font-cinzel font-bold text-[#d4af37] truncate uppercase tracking-widest">{fighter.name}</h4>
          <div className="text-[9px] text-[#e5d3b3]/40 uppercase tracking-tighter">Сила: {fighter.stats.str} | Защита: {fighter.stats.defense}</div>
        </div>
        
        <div className="h-2 sm:h-3 bg-gray-900 border border-[#d4af37]/30 overflow-hidden relative">
          <motion.div 
            className="absolute inset-y-0 left-0 bg-red-600 shadow-[0_0_10px_rgba(255,0,0,0.3)]"
            initial={{ width: '100%' }}
            animate={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
