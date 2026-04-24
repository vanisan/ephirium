'use client'

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  limit,
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
  const { player, user, saveGame, equipment } = useGameStore();
  const [rooms, setRooms] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showRating, setShowRating] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(false);
  const rewardedRef = useRef(false);

  const getWeaponType = () => {
    const icon = equipment.weapon?.icon || 'sword';
    if (icon.indexOf('bow') !== -1) return 'bow';
    if (icon.indexOf('staff') !== -1) return 'staff';
    return 'sword';
  };

  // Listen for available rooms
  useEffect(() => {
    const q = query(collection(db, 'rooms'), where('status', '==', 'waiting'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRooms(roomData);
    });
    return () => unsubscribe();
  }, []);

  // Listen for leaderboard
  useEffect(() => {
    if (showRating) {
      const q = query(collection(db, 'users'), orderBy('player.wins', 'desc'), limit(10));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          name: doc.data().player?.name || doc.data().email?.split('@')[0] || 'Аноним',
          wins: doc.data().player?.wins || 0
        }));
        setLeaderboard(data);
      }, (err) => {
        console.error("Leaderboard query failed (likely needs index):", err);
      });
      return () => unsubscribe();
    }
  }, [showRating]);

  const handleVictory = () => {
    useGameStore.setState(state => ({
      player: { 
        ...state.player, 
        gold: state.player.gold + 500,
        shards: state.player.shards + 250,
        wins: (state.player.wins || 0) + 1
      }
    }));
    saveGame();
  };

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
  }, [currentRoom?.id, user?.uid, handleVictory]);

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
          weaponType: getWeaponType(),
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

  const joinRoom = async (roomData: any) => {
    if (!user) return;
    setLoading(true);
    rewardedRef.current = false;
    try {
      await updateDoc(doc(db, 'rooms', roomData.id), {
        status: 'fighting',
        opponent: {
          uid: user.uid,
          name: user.email.split('@')[0],
          hp: player.maxHp,
          maxHp: player.maxHp,
          stats: player.stats,
          skinColor: player.skinColor,
          weaponType: getWeaponType(),
          x: 700,
          y: 200
        },
        updatedAt: serverTimestamp()
      });
      setCurrentRoom(roomData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const leaveRoom = async () => {
    if (!currentRoom || !user) return;
    if (currentRoom.host.uid === user.uid && currentRoom.status === 'waiting') {
      try {
        await deleteDoc(doc(db, 'rooms', currentRoom.id));
      } catch (e) {
        console.error(e);
      }
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
      <div className="bg-black/40 border-2 border-[#d4af37]/20 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-2 opacity-5 translate-x-1/4 translate-y-1/4 -z-10">
          <Sword size={200} />
        </div>
        <div className="relative z-10 w-full md:w-auto">
          <h2 className="text-xl sm:text-2xl font-cinzel font-bold text-[#d4af37] uppercase tracking-widest mb-1 sm:mb-2 italic">Арена Испытаний</h2>
          <p className="text-[#e5d3b3]/60 text-xs sm:text-sm max-w-xs sm:max-w-md">Побеждайте других героев и получайте 500 золота и 250 осколков за триумф.</p>
        </div>
        <div className="flex flex-row md:flex-col gap-2 relative z-10 w-full md:w-auto">
          <button 
            onClick={createRoom}
            disabled={loading}
            className="flex-1 md:flex-none px-4 sm:px-8 py-2 sm:py-3 bg-[#d4af37] text-black font-cinzel font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] text-xs sm:text-base hover:bg-white transition-all active:scale-95 shadow-xl disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'СОЗДАТЬ'}
          </button>
          <button 
            onClick={() => setShowRating(!showRating)}
            className={`flex-1 md:flex-none px-4 sm:px-8 py-2 border-2 font-cinzel font-bold uppercase tracking-widest text-[10px] sm:text-xs transition-all ${showRating ? 'bg-[#d4af37] text-black border-[#d4af37]' : 'border-[#d4af37]/40 text-[#d4af37] hover:bg-[#d4af37]/10'}`}
          >
            {showRating ? 'ВЕРНУТЬСЯ' : 'РЕЙТИНГ'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
        {showRating ? (
          <div className="space-y-2">
            <h3 className="font-cinzel text-xl font-bold text-amber-500 uppercase tracking-widest mb-4 flex items-center gap-3">
              <Trophy size={24} /> РЕЙТИНГ ПОБЕДИТЕЛЕЙ
            </h3>
            {leaderboard.length === 0 ? (
              <div className="text-center py-10 text-[#e5d3b3]/20 font-cinzel tracking-widest animate-pulse">Загрузка рейтинга...</div>
            ) : (
              leaderboard.map((u, idx) => (
                <div key={u.id} className={`p-4 border rounded flex justify-between items-center ${idx === 0 ? 'bg-amber-500/10 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : idx === 1 ? 'bg-slate-400/10 border-slate-400' : idx === 2 ? 'bg-orange-900/10 border-orange-900' : 'bg-black/40 border-[#d4af37]/20 opacity-80'}`}>
                  <div className="flex items-center gap-4">
                    <span className="font-cinzel font-bold text-xl w-6 text-center" style={{ color: idx === 0 ? '#fbbf24' : idx === 1 ? '#cbd5e1' : idx === 2 ? '#b45309' : '#e5d3b344' }}>{idx + 1}</span>
                    <span className={`font-cinzel font-bold tracking-widest ${idx === 0 ? 'text-amber-500 text-lg' : 'text-[#e5d3b3]'}`}>{u.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-spectral text-[#d4af37] font-bold">{u.wins}</span>
                    <span className="text-[10px] font-cinzel text-[#d4af37]/40 uppercase">побед</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : rooms.length === 0 ? (
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
                  <div className="text-[10px] text-[#e5d3b3]/40 uppercase tracking-widest pt-0.5">Класс: {room.host.weaponType?.toUpperCase()}</div>
                </div>
              </div>
              <button 
                onClick={() => joinRoom(room)}
                className="px-6 py-2 bg-[#d4af37]/10 border border-[#d4af37]/40 text-[#d4af37] font-cinzel font-bold hover:bg-[#d4af37] hover:text-black transition-all"
              >
                ВСТУПИТЬ
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const ArenaBattlefield = React.memo(({ room, user, player, velocity, onLeave }: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastSyncTime = useRef<number>(0);
  const lastAttackTime = useRef<number>(0);
  const projectilesRef = useRef<any[]>([]);
  const [damageIndicators, setDamageIndicators] = useState<any[]>([]);

  const isHost = room?.host?.uid === user?.uid;
  const selfData = isHost ? room?.host : room?.opponent;
  const opponentData = isHost ? room?.opponent : room?.host;

  const myPos = useRef({ x: selfData?.x || 100, y: selfData?.y || 200 });
  const oppPos = useRef({ x: opponentData?.x || 400, y: opponentData?.y || 200 });
  
  const getClassConfig = (type: string) => {
    switch (type) {
      case 'bow': return { range: 250, color: '#4ade80', projectileColor: '#4ade80', isRanged: true };
      case 'staff': return { range: 200, color: '#60a5fa', projectileColor: '#fbbf24', isRanged: true, lifesteal: 0.15 };
      default: return { range: 60, color: '#f87171', isRanged: false, defenseBonus: 1.2 };
    }
  };

  const myConfig = getClassConfig(selfData?.weaponType);

  useEffect(() => {
    if (selfData) {
      myPos.current = { x: selfData.x, y: selfData.y };
    }
  }, [selfData?.uid]); 

  useEffect(() => {
    if (opponentData) {
      oppPos.current = { x: opponentData.x, y: opponentData.y };
    }
  }, [opponentData?.x, opponentData?.y, opponentData?.uid]);

  const updateServerState = async (newPos: { x: number, y: number }, attack?: any) => {
    if (!selfData || !user || !room?.id) return;
    const now = Date.now();
    
    // Position updates are throttled, but attacks and HP changes are priority
    if (now - lastSyncTime.current < 100 && !attack) return; 
    lastSyncTime.current = now;

    const roomRef = doc(db, 'rooms', room.id);
    const update: any = {
      updatedAt: serverTimestamp()
    };
    const path = isHost ? 'host' : 'opponent';
    
    update[`${path}.x`] = newPos.x;
    update[`${path}.y`] = newPos.y;
    
    if (attack) {
      update.lastAction = { ...attack, timestamp: now };
      const targetPath = isHost ? 'opponent' : 'host';
      const target = isHost ? room.opponent : room.host;
      if (target) {
        // DAMAGE CALCULATION
        let damage = Math.max(1, Math.floor((player?.stats?.damage || 1) * (0.8 + Math.random() * 0.4)));
        
        // Critical for Bow
        let isCrit = false;
        if (selfData.weaponType === 'bow' && Math.random() < 0.25) {
          damage *= 1.5;
          isCrit = true;
        }
        
        // Defense reduction
        const targetDefense = (target.stats?.defense || 0) * (target.weaponType === 'sword' ? 1.2 : 1);
        damage = Math.max(1, Math.floor(damage - (targetDefense * 0.2)));

        const newHp = Math.max(0, target.hp - damage);
        update[`${targetPath}.hp`] = newHp;
        
        // Lifesteal for Staff
        if (selfData.weaponType === 'staff') {
          const lifesteal = Math.floor(damage * 0.20);
          update[`${path}.hp`] = Math.min(selfData.maxHp, selfData.hp + lifesteal);
        }

        if (newHp <= 0) {
          update.status = 'finished';
          update.winner = user.uid;
        }
      }
    }

    try {
      await updateDoc(roomRef, update);
    } catch (e) {
      console.error('PvP Sync Error:', e);
    }
  };

  // Listen for actions to show damage indicators
  useEffect(() => {
    if (!room || !user) return;
    if (room.lastAction && room.lastAction.uid !== user.uid) {
      const now = Date.now();
      if (now - (room.lastAction.timestamp || 0) < 500) {
        // Someone attacked me or just an action happened
      }
    }
  }, [room?.lastAction?.timestamp, room, user]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !room || !user) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawPlayer = (ctx: CanvasRenderingContext2D, x: number, y: number, data: any, isSelf: boolean) => {
      if (!data) return;
      
      const config = (function(type: string) {
        switch (type) {
          case 'bow': return { range: 250, color: '#4ade80' };
          case 'staff': return { range: 200, color: '#60a5fa' };
          default: return { range: 60, color: '#f87171' };
        }
      })(data.weaponType);

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();ctx.ellipse(x, y + 25, 15, 8, 0, 0, Math.PI * 2);ctx.fill();

      ctx.strokeStyle = config.color + '22';
      ctx.beginPath();ctx.arc(x, y, config.range, 0, Math.PI * 2);ctx.stroke();

      ctx.fillStyle = data.skinColor || '#e5c298';
      ctx.beginPath();ctx.arc(x, y, 15, 0, Math.PI * 2);ctx.fill();
      ctx.strokeStyle = isSelf ? '#d4af37' : '#ff4444';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.strokeStyle = config.color + '88';
      ctx.lineWidth = 1;
      ctx.beginPath();ctx.arc(x, y, 18, 0, Math.PI * 2);ctx.stroke();

      const barWidth = 40;
      const hpRatio = data.hp / data.maxHp;
      ctx.fillStyle = '#111';
      ctx.fillRect(x - barWidth/2, y - 35, barWidth, 4);
      ctx.fillStyle = isSelf ? '#22ff22' : '#ff2222';
      ctx.fillRect(x - barWidth/2, y - 35, barWidth * hpRatio, 4);

      ctx.fillStyle = '#e5d3b3';
      ctx.font = '10px Cinzel';
      ctx.textAlign = 'center';
      ctx.fillText(data.name, x, y - 45);
      
      ctx.fillStyle = config.color;
      ctx.font = '8px Cinzel';
      ctx.fillText(data.weaponType?.toUpperCase(), x, y + 42);
    };

    const gameLoop = () => {
      if (room.status !== 'fighting') return;

      const speed = 5;
      const currentVel = velocity.current || { x: 0, y: 0 };
      
      let nextX = myPos.current.x;
      let nextY = myPos.current.y;

      if (currentVel.x !== 0 || currentVel.y !== 0) {
        nextX = Math.max(20, Math.min(780, myPos.current.x + currentVel.x * speed));
        nextY = Math.max(20, Math.min(380, myPos.current.y + currentVel.y * speed));
      } else if (opponentData && room.status === 'fighting') {
        const dx = oppPos.current.x - myPos.current.x;
        const dy = oppPos.current.y - myPos.current.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const targetDist = myConfig.range * 0.8;
        
        if (myConfig.isRanged) {
          // Better kiting for ranged
          if (dist < targetDist * 0.6) {
            nextX -= (dx/dist) * (speed * 0.6);
            nextY -= (dy/dist) * (speed * 0.6);
          } else if (dist > targetDist) {
            nextX += (dx/dist) * (speed * 0.5);
            nextY += (dy/dist) * (speed * 0.5);
          }
        } else {
          // Melee closes in faster
          if (dist > 35) {
            nextX += (dx/dist) * (speed * 0.85);
            nextY += (dy/dist) * (speed * 0.85);
          }
        }
        nextX = Math.max(20, Math.min(780, nextX));
        nextY = Math.max(20, Math.min(380, nextY));
      }
      
      if (nextX !== myPos.current.x || nextY !== myPos.current.y) {
        myPos.current = { x: nextX, y: nextY };
        updateServerState(myPos.current);
      }

      if (opponentData && room.status === 'fighting') {
        const dx = oppPos.current.x - myPos.current.x;
        const dy = oppPos.current.y - myPos.current.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const now = Date.now();
        
        if (dist < myConfig.range + 10 && now - lastAttackTime.current > 1000 / (player?.stats?.atkSpeed || 1)) {
          lastAttackTime.current = now;
          if (myConfig.isRanged) {
            projectilesRef.current.push({
              x: myPos.current.x,
              y: myPos.current.y,
              targetX: oppPos.current.x,
              targetY: oppPos.current.y,
              startTime: now,
              duration: 250,
              color: getClassConfig(selfData.weaponType).projectileColor
            });
          }
          updateServerState(myPos.current, { uid: user.uid, type: 'attack' });
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // More visible grid
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.08)';
      ctx.lineWidth = 1;
      for(let i=0; i<canvas.width; i+=40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
      for(let i=0; i<canvas.height; i+=40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke(); }

      const now = Date.now();
      // Glowing projectiles
      projectilesRef.current = projectilesRef.current.filter(p => now - p.startTime < p.duration);
      projectilesRef.current.forEach(p => {
        const t = (now - p.startTime) / p.duration;
        const x = p.x + (p.targetX - p.x) * t;
        const y = p.y + (p.targetY - p.y) * t;
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();ctx.arc(x, y, 5, 0, Math.PI * 2);ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.strokeStyle = p.color + '66';
        ctx.lineWidth = 2;
        ctx.beginPath();ctx.moveTo(p.x, p.y);ctx.lineTo(x, y);ctx.stroke();
      });

      if (opponentData) {
        drawPlayer(ctx, oppPos.current.x, oppPos.current.y, opponentData, false);
      }
      drawPlayer(ctx, myPos.current.x, myPos.current.y, selfData, true);

      requestRef.current = requestAnimationFrame(gameLoop);
    };

    requestRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [room?.status, opponentData?.hp, opponentData?.weaponType, myConfig.range, myConfig.isRanged, player?.stats?.atkSpeed, selfData, user?.uid, velocity, room, user]);

  if (!room || !user) return null;

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
                  <div className="flex flex-col gap-2 mb-8">
                    <div className="text-green-500 text-xl font-bold tracking-[0.2em]">+500 ЗОЛОТА</div>
                    <div className="text-blue-400 text-xl font-bold tracking-[0.2em]">+250 ОСКОЛКОВ</div>
                  </div>
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

        <div className="absolute bottom-4 left-4 p-2 bg-black/60 border border-[#d4af37]/20 rounded text-[9px] text-[#d4af37]/40 uppercase tracking-widest font-cinzel">
          Используйте джойстик для перемещения или стойте на месте для автобоя
        </div>
      </div>
    </div>
  );
});
ArenaBattlefield.displayName = 'ArenaBattlefield';
