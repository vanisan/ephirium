'use client'

import React, { useState, useEffect, useRef } from 'react';
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

interface PvPArenaProps {
  velocity: React.RefObject<{ x: number, y: number }>;
}

export const PvPArena: React.FC<PvPArenaProps> = ({ velocity }) => {
  const { player, user, saveGame } = useGameStore();
  const [rooms, setRooms] = useState<any[]>([]);
  const [currentRoom, setCurrentRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(false);
  const rewardedRef = useRef(false);

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

  const handleVictory = () => {
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
          skinColor: player.skinColor,
          x: 100,
          y: 200
        },
        opponent: null,
        winner: null,
        updatedAt: serverTimestamp()
      };
      const roomDoc = await addDoc(collection(db, 'rooms'), room);
      setCurrentRoom({ id: roomDoc.id, ...room } as RoomData);
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
          skinColor: player.skinColor,
          x: 700,
          y: 200
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
    return (
      <ArenaBattlefield 
        room={currentRoom} 
        user={user} 
        player={player} 
        velocity={velocity}
        onLeave={leaveRoom}
      />
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
                  <div className="text-[10px] text-[#e5d3b3]/40 uppercase tracking-widest pt-0.5">Уровень: {room.host.stats.level}</div>
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

const ArenaBattlefield = React.memo(({ room, user, player, velocity, onLeave }: any) => {
  if (!room || !user) return null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastSyncTime = useRef<number>(0);
  const lastAttackTime = useRef<number>(0);
  const [floatingTexts, setFloatingTexts] = useState<any[]>([]);
  const floatingTextsRef = useRef<any[]>([]);

  const isHost = room?.host?.uid === user?.uid;
  const selfData = isHost ? room?.host : room?.opponent;
  const opponentData = isHost ? room?.opponent : room?.host;

  // Local state for smooth movement
  const myPos = useRef({ x: selfData?.x || 100, y: selfData?.y || 200 });
  const oppPos = useRef({ x: opponentData?.x || 400, y: opponentData?.y || 200 });
  

  useEffect(() => {
    if (selfData) {
      myPos.current = { x: selfData.x, y: selfData.y };
    }
  }, [selfData?.uid]); 

  useEffect(() => {
    if (opponentData) {
      oppPos.current = { x: opponentData.x, y: opponentData.y };
    }
  }, [opponentData?.x, opponentData?.y]);

  const updateServerState = async (newPos: { x: number, y: number }, attack?: any) => {
    if (!selfData || !user || !room?.id) return;
    const now = Date.now();
    if (now - lastSyncTime.current < 100 && !attack) return; // Throttle position updates
    lastSyncTime.current = now;

    const roomRef = doc(db, 'rooms', room.id);
    const update: any = {};
    const path = isHost ? 'host' : 'opponent';
    
    update[`${path}.x`] = newPos.x;
    update[`${path}.y`] = newPos.y;
    
    if (attack) {
      update.lastAction = attack;
      // Handle damage calculation (simple version)
      const targetPath = isHost ? 'opponent' : 'host';
      const target = isHost ? room.opponent : room.host;
      if (target) {
        const damage = Math.max(1, Math.floor((player?.stats?.damage || 1) * (0.8 + Math.random() * 0.4)));
        const newHp = Math.max(0, target.hp - damage);
        update[`${targetPath}.hp`] = newHp;
        if (newHp <= 0) {
          update.status = 'finished';
          update.winner = user.uid;
        }
      }
    }

    try {
      await updateDoc(roomRef, update);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = () => {
      if (room.status !== 'fighting') return;

      // 1. UPDATE SELF POSITION
      const speed = 5;
      const currentVel = velocity.current || { x: 0, y: 0 };
      const nextX = Math.max(20, Math.min(780, myPos.current.x + currentVel.x * speed));
      const nextY = Math.max(20, Math.min(380, myPos.current.y + currentVel.y * speed));
      
      if (nextX !== myPos.current.x || nextY !== myPos.current.y) {
        myPos.current = { x: nextX, y: nextY };
        updateServerState(myPos.current);
      }

      // 2. CHECK ATTACK RANGE
      if (opponentData && room.status === 'fighting') {
        const dx = oppPos.current.x - myPos.current.x;
        const dy = oppPos.current.y - myPos.current.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const now = Date.now();
        
        if (dist < 60 && now - lastAttackTime.current > 1000 / (player?.stats?.atkSpeed || 1)) {
          lastAttackTime.current = now;
          updateServerState(myPos.current, { uid: user.uid, type: 'attack' });
        }
      }

      // 3. RENDER
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Grid
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.05)';
      ctx.lineWidth = 1;
      for(let i=0; i<canvas.width; i+=40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
      for(let i=0; i<canvas.height; i+=40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke(); }

      // Draw Opponent
      if (opponentData) {
        drawPlayer(ctx, oppPos.current.x, oppPos.current.y, opponentData, false);
      }

      // Draw Self
      drawPlayer(ctx, myPos.current.x, myPos.current.y, selfData, true);

      requestRef.current = requestAnimationFrame(gameLoop);
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D, x: number, y: number, data: any, isSelf: boolean) => {
      if (!data) return;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();ctx.ellipse(x, y + 25, 15, 8, 0, 0, Math.PI * 2);ctx.fill();

      // Body
      ctx.fillStyle = data.skinColor || '#e5c298';
      ctx.beginPath();ctx.arc(x, y, 15, 0, Math.PI * 2);ctx.fill();
      ctx.strokeStyle = isSelf ? '#d4af37' : '#ff4444';
      ctx.lineWidth = 2;
      ctx.stroke();

      // HP Bar
      const barWidth = 40;
      const hpRatio = data.hp / data.maxHp;
      ctx.fillStyle = '#111';
      ctx.fillRect(x - barWidth/2, y - 35, barWidth, 4);
      ctx.fillStyle = isSelf ? '#22ff22' : '#ff2222';
      ctx.fillRect(x - barWidth/2, y - 35, barWidth * hpRatio, 4);

      // Name
      ctx.fillStyle = '#e5d3b3';
      ctx.font = '10px Cinzel';
      ctx.textAlign = 'center';
      ctx.fillText(data.name, x, y - 45);
    };

    requestRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [room.status, opponentData?.hp]); // Remove velocity dependency

  return (
    <div className="flex-1 flex flex-col pt-4">
      <div className="flex justify-between items-center mb-4 px-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span className="font-cinzel text-xs text-red-500 font-bold uppercase tracking-widest">Арена Битвы</span>
        </div>
        <button onClick={onLeave} className="text-[#d4af37] border border-[#d4af37] px-4 py-1 text-xs font-cinzel font-bold hover:bg-[#d4af37] hover:text-black transition-all">ВЫЙТИ</button>
      </div>

      <div className="relative flex-1 bg-black border-2 border-[#d4af37]/40 overflow-hidden rounded shadow-[inset_0_0_100px_rgba(0,0,0,1)]">
        <canvas 
          ref={canvasRef}
          width={800}
          height={400}
          className="w-full h-full object-contain"
        />

        {room.status === 'waiting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10">
            <Loader2 className="animate-spin text-[#d4af37] mb-4" size={48} />
            <div className="font-cinzel text-xl text-[#d4af37] animate-pulse uppercase tracking-[0.3em]">Ожидание противника...</div>
          </div>
        )}

        <AnimatePresence>
          {room.status === 'finished' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center bg-black/80 z-20"
            >
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="text-center bg-black p-8 border-4 border-[#d4af37] shadow-[0_0_100px_rgba(212,175,55,0.4)]"
              >
                <Trophy size={64} className="text-[#d4af37] mx-auto mb-6" />
                <h3 className="text-4xl font-cinzel font-bold text-[#d4af37] uppercase mb-2">
                  {room.winner === user?.uid ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}
                </h3>
                {room.winner === user?.uid && (
                  <div className="text-green-500 text-xl font-bold tracking-[0.2em] mb-8">+1000 ЗОЛОТА</div>
                )}
                <button 
                  onClick={onLeave} 
                  className="px-12 py-4 bg-[#d4af37] text-black font-cinzel font-bold text-lg tracking-widest hover:bg-white transition-all shadow-xl"
                >
                  ВЕРНУТЬСЯ
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Joystick Tip */}
        <div className="absolute bottom-4 left-4 p-2 bg-black/60 border border-[#d4af37]/20 rounded text-[9px] text-[#d4af37]/40 uppercase tracking-widest font-cinzel">
          Используйте джойстик для перемещения
        </div>
      </div>
    </div>
  );
});

