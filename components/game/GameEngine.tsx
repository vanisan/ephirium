'use client'

import React, { useRef, useEffect } from 'react';
import { useGameStore, Enemy, OnlinePlayer } from '@/lib/store';
import { db } from '@/lib/firebase';
import { doc, setDoc, onSnapshot, collection, query, where, deleteDoc, updateDoc, increment, getDocs } from 'firebase/firestore';

interface GameEngineProps {
  velocity: React.RefObject<{ x: number, y: number }>;
}

interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

interface Projectile {
  id: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  targetId?: string;
  progress: number;
  speed: number;
  type: 'arrow' | 'magic';
  color: string;
  damage: number;
  isCrit: boolean;
  isStaff: boolean;
  aoeRadius?: number;
}

export const GameEngine: React.FC<GameEngineProps> = React.memo(({ velocity }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastAttackTime = useRef<number>(0);
  const lastAttackDate = useRef<number>(0);
  const lastLocalHp = useRef<number>(-1);
  const lastEnemyAttackTime = useRef<number>(0);
  const lastRespawnTime = useRef<number>(0);
  const lastBuffUpdateTime = useRef<number>(0);
  const lastRegenTime = useRef<number>(0);
  const lastAuraTickTime = useRef<number>(0);
  const floatingTexts = useRef<FloatingText[]>([]);
  const particles = useRef<Particle[]>([]);
  const projectiles = useRef<Projectile[]>([]);
  const rotationRef = useRef<number>(0);
  const attackEffect = useRef<{ angle: number, progress: number, type: 'melee' | 'ranged' | 'magic' } | null>(null);
  const onlinePlayersCache = useRef<Map<string, { x: number, y: number, r: number, tx: number, ty: number, tr: number, vx?: number, vy?: number, lastUpdate?: number, lastAction?: number, effect?: { progress: number, type: 'melee' | 'ranged' | 'magic', angle: number } | null }>>(new Map());
  const mobCache = useRef<Map<string, { x: number, y: number, tx: number, ty: number, lastUpdate: number, updatedAt: number }>>(new Map());
  const updateRef = useRef<(time: number) => void>(null);

  // Constants
  const PLAYER_SPEED = 4.5;
  const ATTACK_RANGE = 100;
  const ENEMY_DETECTION_RANGE = 350;

  // 1. Procedural Ground Pattern
  const groundPattern = useRef<CanvasPattern | null>(null);

  useEffect(() => {
    const loc = useGameStore.getState().locations.find(l => l.id === useGameStore.getState().currentLocationId);
    if (!loc) return;

    const size = 512;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tctx = tempCanvas.getContext('2d')!;
    tctx.fillStyle = loc.color;
    tctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const s = 1 + Math.random() * 3;
        
        if (loc.groundTheme === 'forest') {
            tctx.fillStyle = Math.random() > 0.5 ? '#1a2e1a' : '#2d1e12';
            tctx.fillRect(x, y, s, s);
        } else if (loc.groundTheme === 'cave') {
            tctx.fillStyle = Math.random() > 0.5 ? '#1c1c24' : '#0a0a0f';
            tctx.fillRect(x, y, s, s);
        } else if (loc.groundTheme === 'dungeon_corridor') {
            tctx.fillStyle = '#100a16';
            tctx.fillRect(x, y, s, s);
            if (i % 64 === 0) {
               tctx.strokeStyle = '#221133'; tctx.strokeRect(Math.floor(x/64)*64, Math.floor(y/64)*64, 64, 64);
            }
        } else {
            tctx.fillStyle = '#0a0505';
            tctx.fillRect(x, y, s, s);
        }
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    groundPattern.current = ctx.createPattern(tempCanvas, 'repeat');
  }, [useGameStore.getState().currentLocationId]);

  // 2. Multiplayer Listeners
  useEffect(() => {
    const state = useGameStore.getState();
    const user = state.user;
    if (!user) return;

    let unsubList: (() => void)[] = [];

    // Listen for players in current location
    const q = query(collection(db, 'worldPlayers'), where('locationId', '==', state.currentLocationId));
    const unsubscribePlayers = onSnapshot(q, (snapshot) => {
      const players: OnlinePlayer[] = [];
      const now = Date.now();
      const currentState = useGameStore.getState();
      
      snapshot.forEach(d => {
        const data = d.data();
        if (d.id === user.uid) {
           if (data.hp < currentState.player.hp - 1) {
              currentState.damagePlayer(currentState.player.hp - data.hp);
              lastLocalHp.current = data.hp;
           }
        } else if (now - (data.updatedAt || 0) < 10000) { 
          const id = d.id;
          if (!onlinePlayersCache.current.has(id)) {
            onlinePlayersCache.current.set(id, { 
                x: data.x, y: data.y, r: data.rotation || 0, 
                tx: data.x, ty: data.y, tr: data.rotation || 0, 
                vx: 0, vy: 0, lastUpdate: now, 
                lastAction: data.actionTime || 0, effect: null 
            });
          } else {
            const entry = onlinePlayersCache.current.get(id)!;
            const dt = now - (entry.lastUpdate || now);
            if (dt > 1 && (data.updatedAt || 0) > (entry.lastUpdate || 0)) {
               const frameTime = dt / 16.66;
               entry.vx = (data.x - entry.tx) / frameTime;
               entry.vy = (data.y - entry.ty) / frameTime;
               entry.tx = data.x;
               entry.ty = data.y;
               entry.tr = data.rotation || 0;
               entry.lastUpdate = now;
            }
            
            if (data.actionTime > (entry.lastAction || 0)) {
               entry.lastAction = data.actionTime;
               entry.effect = { 
                  progress: 0, 
                  type: (data.equipment?.weapon?.icon === 'bow' ? 'ranged' : data.equipment?.weapon?.icon === 'staff' ? 'magic' : 'melee'), 
                  angle: data.rotation || 0 
               };
            }
          }
          players.push({ id, ...data as any });
        }
      });
      useGameStore.setState({ onlinePlayers: players });
    });

    const mobsCol = collection(db, 'worldMobs', state.currentLocationId, 'mobs');
    const unsubscribeMobs = onSnapshot(mobsCol, (snapshot) => {
       const sharedEnemies: Enemy[] = [];
       const now = Date.now();
       const amIMaster = determineIfMaster();

       snapshot.forEach(d => {
          const data = d.data();
          const id = d.id;
          
          if (!mobCache.current.has(id)) {
            mobCache.current.set(id, { 
                x: data.x, y: data.y, 
                tx: data.x, ty: data.y, 
                lastUpdate: now, updatedAt: data.updatedAt || 0 
            });
          } else {
            const entry = mobCache.current.get(id)!;
            if (!amIMaster && (data.updatedAt || 0) > entry.updatedAt) {
                entry.tx = data.x;
                entry.ty = data.y;
                entry.updatedAt = data.updatedAt || 0;
                if (Math.hypot(entry.x - data.x, entry.y - data.y) > 250) {
                    entry.x = data.x;
                    entry.y = data.y;
                }
            } else if (amIMaster) {
               entry.updatedAt = Math.max(entry.updatedAt, data.updatedAt || 0);
            }
          }

          sharedEnemies.push({ 
              id, 
              x: mobCache.current.get(id)!.x, 
              y: mobCache.current.get(id)!.y, 
              hp: data.hp, maxHp: data.maxHp, 
              level: data.level, type: data.type 
          });
       });
       
       mobCache.current.forEach((_, id) => {
          if (!sharedEnemies.find(e => e.id === id)) mobCache.current.delete(id);
       });
       
       useGameStore.getState().setEnemies(sharedEnemies);
    });

    unsubList.push(unsubscribePlayers, unsubscribeMobs);

    const interval = setInterval(() => {
      const currentState = useGameStore.getState();
      if (!currentState.user) return;
      const payload: any = {
          locationId: currentState.currentLocationId, x: currentState.player.x, y: currentState.player.y,
          hp: currentState.player.hp, maxHp: currentState.player.maxHp,
          level: currentState.player.level,
          nickname: currentState.user.email?.split('@')[0], skinColor: currentState.player.skinColor,
          rotation: rotationRef.current, updatedAt: Date.now(), actionTime: lastAttackDate.current,
          equipment: { weapon: currentState.equipment.weapon ? { icon: currentState.equipment.weapon.icon } : null }
      };
      setDoc(doc(db, 'worldPlayers', currentState.user.uid), payload, { merge: true }).catch(() => {});
    }, 100);

    return () => { unsubList.forEach(u => u()); clearInterval(interval); };
  }, [useGameStore.getState().currentLocationId, useGameStore.getState().user?.uid]);

  const determineIfMaster = () => {
      const s = useGameStore.getState();
      if (!s.user) return false;
      const ids = [s.user.uid, ...s.onlinePlayers.map(p => p.id)].sort();
      return ids[0] === s.user.uid;
  };


  useEffect(() => {
    updateRef.current = (time: number) => {
      const deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;

      const state = useGameStore.getState();
      const { player, enemies, isAutoBattle, updatePlayerPos, damageEnemy, spawnEnemy, damagePlayer, gainExp, healPlayer } = state;
      
      // HP Regen
      if (!state.isDead) {
        if (player.stats.hpRegen && player.stats.hpRegen > 0) {
           if (time - lastRegenTime.current > 1000) {
              healPlayer(player.stats.hpRegen);
              lastRegenTime.current = time;
           }
        }
        
        // Aura Damage
        const aura = state.equipment.aura;
        if (aura && time - lastAuraTickTime.current > 1000) {
           const auraRadius = aura.rarity === 'ultra' ? 200 : aura.rarity === 'mythic' ? 150 : aura.rarity === 'legendary' ? 120 : aura.rarity === 'epic' ? 100 : 80;
           const auraDamage = aura.stats?.damage || player.stats.damage * 0.1;
           enemies.forEach(e => {
              const d = Math.hypot(e.x - player.x, e.y - player.y);
              if (d <= auraRadius) {
                 damageEnemy(e.id, Math.floor(auraDamage));
                 floatingTexts.current.push({
                   id: Math.random().toString(),
                   x: e.x,
                   y: e.y - 15,
                   text: `-${Math.floor(auraDamage)}`,
                   color: '#eab308',
                   life: 1.0
                 });
              }
           });
           lastAuraTickTime.current = time;
        }
      }

      // Movement
      if (!state.isDead) {
        const currentVelocity = velocity.current || { x: 0, y: 0 };
        let newX = player.x + currentVelocity.x * PLAYER_SPEED;
        let newY = player.y + currentVelocity.y * PLAYER_SPEED;

        // Auto Attack / Targeting
        if (isAutoBattle || state.currentTargetId) {
          const weapon = state.equipment.weapon;
          const wName = (weapon?.name || '').toLowerCase();
          const wIcon = weapon?.icon || '';
          const isBow = wIcon === 'bow' || wName.includes('лук');
          const isStaff = wIcon === 'staff' || wName.includes('посох');
          const dynamicAttackRange = isBow ? 350 : isStaff ? 225 : ATTACK_RANGE;

          if (!state.currentTargetId && isAutoBattle) {
             const nearest = enemies.reduce((prev, curr) => {
                const d1 = Math.hypot(prev.x - player.x, prev.y - player.y);
                const d2 = Math.hypot(curr.x - player.x, curr.y - player.y);
                return d2 < d1 ? curr : prev;
             }, enemies[0]);
             if (nearest && Math.hypot(nearest.x - player.x, nearest.y - player.y) < ENEMY_DETECTION_RANGE) {
                state.setCurrentTargetId(nearest.id);
             }
          }

          let target: { id: string, x: number, y: number, isPlayer?: boolean } | null = null;
          if (state.currentTargetId) {
            if (state.currentTargetId.startsWith('player_')) {
              const p = state.onlinePlayers.find(op => op.id === state.currentTargetId!.replace('player_', ''));
              if (p) target = { ...p, isPlayer: true };
            } else {
              const e = enemies.find(en => en.id === state.currentTargetId);
              if (e) target = e;
            }
          }

          if (target) {
            const dist = Math.hypot(target.x - player.x, target.y - player.y);
            if (dist < dynamicAttackRange) {
               if (time - lastAttackTime.current > 1000 / player.stats.atkSpeed) {
                  const angle = Math.atan2(target.y - player.y, target.x - player.x);
                  let finalDmg = player.stats.damage;
                  let isCrit = Math.random() * 100 < (player.stats.critRate || 5);
                  if (isCrit) finalDmg = Math.floor(finalDmg * ((player.stats.critDamage || 150) / 100));

                  if (isBow || isStaff) {
                    projectiles.current.push({
                      id: Math.random().toString(),
                      x: player.x, y: player.y, startX: player.x, startY: player.y,
                      targetX: target.x, targetY: target.y, targetId: target.id,
                      progress: 0, speed: isBow ? 0.08 : 0.05, type: isBow ? 'arrow' : 'magic',
                      color: isBow ? (isCrit ? '#fbbf24' : '#e5e7eb') : '#8b5cf6',
                      damage: finalDmg, isCrit, isStaff
                    });
                    attackEffect.current = { angle, progress: 0, type: isBow ? 'ranged' : 'magic' };
                  } else {
                    if (target.isPlayer) {
                        updateDoc(doc(db, 'worldPlayers', target.id.replace('player_', '')), { hp: increment(-finalDmg) }).catch(() => {});
                    } else {
                        updateDoc(doc(db, 'worldMobs', state.currentLocationId, 'mobs', target.id), { hp: increment(-finalDmg) }).catch(() => {});
                        damageEnemy(target.id, finalDmg);
                    }
                    if (player.stats.lifesteal > 0) healPlayer(Math.floor(finalDmg * (player.stats.lifesteal / 100)));
                    attackEffect.current = { angle, progress: 0, type: 'melee' };
                    floatingTexts.current.push({ id: Math.random().toString(), x: target.x, y: target.y - 20, text: isCrit ? `КРИТ -${finalDmg}` : `-${finalDmg}`, color: isCrit ? '#fbbf24' : '#facc15', life: 1.0 });
                  }
                  lastAttackTime.current = time;
                  lastAttackDate.current = Date.now();
               }
            } else if (isAutoBattle && currentVelocity.x === 0 && currentVelocity.y === 0) {
               const angle = Math.atan2(target.y - player.y, target.x - player.x);
               newX += Math.cos(angle) * (PLAYER_SPEED * 0.7);
               newY += Math.sin(angle) * (PLAYER_SPEED * 0.7);
            }
          }
        }
        
        const currentLoc = state.locations.find(l => l.id === state.currentLocationId);
        if (currentLoc?.groundTheme === 'dungeon_corridor') {
            newY = Math.max(200, Math.min(newY, 800));
            newX = Math.max(0, Math.min(newX, 8500));
            if (state.dungeonState.bossDefeated && !state.dungeonState.chestOpened && Math.hypot(7500 - newX, 500 - newY) < 100) {
              state.openChest();
            }
        }
        updatePlayerPos(newX, newY);
      }

      if (attackEffect.current) {
        attackEffect.current.progress += (attackEffect.current.type === 'melee' ? 0.15 : 0.25);
        if (attackEffect.current.progress >= 1.0) attackEffect.current = null;
      }
      projectiles.current.forEach(p => {
        p.progress += p.speed;
        p.x = p.startX + (p.targetX - p.startX) * p.progress;
        p.y = p.startY + (p.targetY - p.startY) * p.progress;
      });
      const removedP = projectiles.current.filter(p => p.progress >= 1.0);
      projectiles.current = projectiles.current.filter(p => p.progress < 1.0);
      removedP.forEach(p => {
        if (p.targetId) {
          if (p.targetId.startsWith('player_')) {
              updateDoc(doc(db, 'worldPlayers', p.targetId.replace('player_', '')), { hp: increment(-p.damage) }).catch(() => {});
          } else {
              updateDoc(doc(db, 'worldMobs', state.currentLocationId, 'mobs', p.targetId), { hp: increment(-p.damage) }).catch(() => {});
              damageEnemy(p.targetId, p.damage);
          }
        }
      });
      particles.current.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.05; });
      particles.current = particles.current.filter(p => p.life > 0);
      floatingTexts.current.forEach(t => t.life -= 0.02);
      floatingTexts.current = floatingTexts.current.filter(t => t.life > 0);

      const LERP_FACTOR = 0.2;
      onlinePlayersCache.current.forEach(val => {
        val.tx += (val.vx || 0) * 0.7; 
        val.ty += (val.vy || 0) * 0.7;
        val.x += (val.tx - val.x) * LERP_FACTOR;
        val.y += (val.ty - val.y) * LERP_FACTOR;
        let diff = val.tr - val.r;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        val.r += diff * 0.15;
        if (val.effect) {
           val.effect.progress += (val.effect.type === 'melee' ? 0.15 : 0.2);
           if (val.effect.progress >= 1.0) val.effect = null;
        }
      });

      const currentMaster = determineIfMaster();
      state.enemies.forEach(enemy => {
        const cache = mobCache.current.get(enemy.id);
        if (cache) {
          cache.x += (cache.tx - cache.x) * 0.15;
          cache.y += (cache.ty - cache.y) * 0.15;
          enemy.x = cache.x; 
          enemy.y = cache.y;
        }
      });

      if (!state.isDead && currentMaster) {
        state.enemies.forEach(e => { 
           if (e.hp <= 0) deleteDoc(doc(db, 'worldMobs', state.currentLocationId, 'mobs', e.id)).catch(() => {}); 
        });
        const timeSinceSpawn = time - lastRespawnTime.current;
        if (timeSinceSpawn > 2000 && state.enemies.length < 12) {
            const loc = state.locations.find(l => l.id === state.currentLocationId) || state.locations[0];
            const mobId = Math.random().toString().slice(2, 10);
            const angle = Math.random() * Math.PI*2;
            const dist = 350 + Math.random()*300;
            const enemyLevel = Math.max(player.level, loc.minLevel);
            setDoc(doc(db, 'worldMobs', state.currentLocationId, 'mobs', mobId), {
                x: player.x + Math.cos(angle)*dist, 
                y: player.y + Math.sin(angle)*dist,
                hp: loc.enemyBaseHp + enemyLevel*15, 
                maxHp: loc.enemyBaseHp + enemyLevel*15,
                level: enemyLevel, 
                type: Math.random() > 0.7 ? 'Титан' : 'Демон', 
                updatedAt: Date.now()
            });
            lastRespawnTime.current = time;
        }

        const allP = [{ id: state.user!.uid, x: player.x, y: player.y }, ...state.onlinePlayers];
        state.enemies.forEach(en => {
           let nearestIdx = 0;
           let minD = Math.hypot(allP[0].x - en.x, allP[0].y - en.y);
           for (let i = 1; i < allP.length; i++) {
              const d = Math.hypot(allP[i].x - en.x, allP[i].y - en.y);
              if (d < minD) { minD = d; nearestIdx = i; }
           }
           const nearest = allP[nearestIdx];
           const cache = mobCache.current.get(en.id);
           if (minD > 45 && minD < 400 && cache) {
              const ang = Math.atan2(nearest.y - en.y, nearest.x - en.x);
              cache.tx += Math.cos(ang) * 1.6;
              cache.ty += Math.sin(ang) * 1.6;
              if (Math.random() < 0.15) {
                 updateDoc(doc(db, 'worldMobs', state.currentLocationId, 'mobs', en.id), { 
                    x: cache.tx, y: cache.ty, updatedAt: Date.now() 
                 }).catch(() => {});
              }
           }
        });
      }

      draw(state, time);
      if (updateRef.current) requestRef.current = requestAnimationFrame(updateRef.current);
    };

    if (updateRef.current) requestRef.current = requestAnimationFrame(updateRef.current);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []);

  const drawCharacter = (
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    rotation: number,
    hp: number, maxHp: number,
    equipment: any, aura: any,
    nickname: string, level: number,
    isMain: boolean, skinColor: string,
    time: number
  ) => {
    const radius = 20;
    const armor = equipment?.armor;
    const weapon = equipment?.weapon;
    const rarityA = armor?.rarity || 'common';
    const isEpicA = rarityA === 'epic';
    const isLegendaryA = rarityA === 'legendary';
    const isMythicA = rarityA === 'mythic';
    const isUltraA = rarityA === 'ultra';
    
    ctx.save();
    ctx.translate(x, y);

    if (hp <= 0) ctx.globalAlpha = 0.4;

    if (aura) {
      const rarity = aura.rarity;
      const auraRadius = rarity === 'ultra' ? 200 : rarity === 'mythic' ? 150 : rarity === 'legendary' ? 120 : rarity === 'epic' ? 100 : 80;
      const numAuras = rarity === 'ultra' ? 4 : (rarity === 'mythic' || rarity === 'legendary') ? 3 : rarity === 'epic' ? 2 : 1;
      const auraColor = rarity === 'ultra' ? '#cfb53b' : rarity === 'mythic' ? '#ef4444' : rarity === 'legendary' ? '#f59e0b' : rarity === 'epic' ? '#a855f7' : '#3b82f6';
      
      ctx.save();
      ctx.rotate(time * 0.002);
      for (let i = 0; i < numAuras; i++) {
         const angleOffset = (i / numAuras) * Math.PI * 2;
         const ax = Math.cos(angleOffset) * auraRadius;
         const ay = Math.sin(angleOffset) * Math.abs(auraRadius * 0.5);
         ctx.beginPath();
         ctx.arc(ax, ay, isMain ? 6 : 5, 0, Math.PI * 2);
         ctx.fillStyle = auraColor;
         ctx.shadowColor = auraColor;
         ctx.shadowBlur = isMain ? 10 : 8;
         ctx.fill();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(0, 0, auraRadius, auraRadius * 0.5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = auraColor + '30';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.save();
    ctx.rotate(rotation);
    const scale = 1 + (level * 0.001);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(3, 3, radius, 0, Math.PI * 2); ctx.fill();

    if (armor && (isMythicA || isUltraA)) {
      const wingColor = isUltraA ? '#8b5cf6' : '#ef4444';
      const wingGlow = isUltraA ? '#2dd4bf' : '#ff0000';
      ctx.save();
      ctx.fillStyle = wingColor;
      ctx.shadowBlur = isUltraA ? 40 : 25;
      ctx.shadowColor = wingGlow;
      const wingFlap = Math.sin(time * 0.01) * 0.15;
      const wx = -10;
      const spread = wingFlap * 40;
      ctx.beginPath();
      ctx.moveTo(wx, -5); ctx.lineTo(wx - 25 - spread, -25); ctx.lineTo(wx - 35 - spread * 1.5, -60); ctx.lineTo(wx - 30 - spread, -30); ctx.lineTo(wx - 55 - spread * 1.2, -40); ctx.lineTo(wx - 35 - spread, -15); ctx.lineTo(wx - 45 - spread, -5); ctx.lineTo(wx, -2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(wx, 5); ctx.lineTo(wx - 25 - spread, 25); ctx.lineTo(wx - 35 - spread * 1.5, 60); ctx.lineTo(wx - 30 - spread, 30); ctx.lineTo(wx - 55 - spread * 1.2, 40); ctx.lineTo(wx - 35 - spread, 15); ctx.lineTo(wx - 45 - spread, 5); ctx.lineTo(wx, 2); ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = skinColor;
    if (armor) {
      const colors: any = { common: '#475569', uncommon: '#166534', rare: '#1e3a8a', epic: '#4c1d95', legendary: '#854d0e', mythic: '#7f1d1d', ultra: '#bae6fd' };
      ctx.fillStyle = colors[rarityA] || skinColor;
    }
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.stroke();

    if (armor) {
      let base = '#64748b'; let trim = '#94a3b8'; let glow = '#ffffff';
      if (rarityA === 'uncommon') { base = '#22c55e'; trim = '#4ade80'; glow = '#86efac'; }
      if (rarityA === 'rare') { base = '#3b82f6'; trim = '#60a5fa'; glow = '#93c5fd'; }
      if (rarityA === 'epic') { base = '#a855f7'; trim = '#c084fc'; glow = '#e9d5ff'; }
      if (rarityA === 'legendary') { base = '#eab308'; trim = '#facc15'; glow = '#fef08a'; }
      if (rarityA === 'mythic') { base = '#ef4444'; trim = '#f87171'; glow = '#fca5a5'; }
      if (rarityA === 'ultra') { base = '#e0f2fe'; trim = '#ffffff'; glow = '#38bdf8'; }

      ctx.strokeStyle = trim; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(10, 0); ctx.lineTo(-8, 14); ctx.stroke();
      if (rarityA !== 'common') {
        ctx.fillStyle = glow; ctx.shadowBlur = 10; ctx.shadowColor = glow;
        ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-8, -5); ctx.lineTo(-14, 0); ctx.lineTo(-8, 5); ctx.fill(); ctx.shadowBlur = 0;
      }
      ctx.save();
      ctx.fillStyle = base; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5;
      const sWidth = ['epic', 'legendary', 'mythic', 'ultra'].includes(rarityA) ? 16 : 12;
      const sExt = rarityA === 'mythic' ? 42 : rarityA === 'legendary' ? 38 : rarityA === 'ultra' ? 45 : 30;
      ctx.beginPath(); ctx.moveTo(-10, -18); ctx.quadraticCurveTo(0, -sExt, sWidth, -16); ctx.lineTo(2, -18); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, 18); ctx.quadraticCurveTo(0, sExt, sWidth, 16); ctx.lineTo(2, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = base; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(4, 0, 15, -Math.PI*0.65, Math.PI*0.65); ctx.lineTo(-6, 12); ctx.lineTo(-6, -12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = glow; ctx.shadowBlur = 12; ctx.shadowColor = glow;
      ctx.fillRect(10, -6, 3, 12); ctx.shadowBlur = 0;
      ctx.restore();
    }

    let hColor = skinColor;
    if (armor) {
      const hColors: any = { common: '#94a3b8', uncommon: '#4ade80', rare: '#60a5fa', epic: '#c084fc', legendary: '#facc15', mythic: '#f87171', ultra: '#ffffff' };
      hColor = hColors[rarityA] || skinColor;
    }
    ctx.fillStyle = hColor; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(16, -14, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(16, 14, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    if (weapon) {
      const r = weapon.rarity || 'common';
      const wColors: any = { common: '#cbd5e1', uncommon: '#4ade80', rare: '#60a5fa', epic: '#7e22ce', legendary: '#fbbf24', mythic: '#ef4444', ultra: '#2dd4bf' };
      const wpColor = wColors[r];
      ctx.save();
      ctx.translate(16, 14);
      ctx.rotate(Math.sin(time * 0.005) * 0.05);
      if (['legendary', 'mythic', 'ultra'].includes(r)) { ctx.shadowBlur = 20; ctx.shadowColor = wpColor; }
      ctx.fillStyle = wpColor; ctx.fillRect(0, -2, 30, 4);
      ctx.restore();
    }
    ctx.restore();

    if (hp > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-22, -42, 44, 8);
      ctx.fillStyle = isMain ? '#10b981' : '#3b82f6'; ctx.fillRect(-22, -42, (hp / maxHp) * 44, 8);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(-22, -42, 44, 8);
      ctx.font = 'bold 12px Cinzel'; ctx.fillStyle = isMain ? '#fff' : '#fef3c7'; ctx.textAlign = 'center';
      ctx.fillText(`Lv.${level} ${nickname}`, 0, -48);
    }
    ctx.restore();
  };

  const draw = (state: any, time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { player, enemies, currentLocationId, locations } = state;
    const currentLocation = locations.find((l: any) => l.id === currentLocationId) || locations[0];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleFactor = canvas.width < 600 ? 0.65 : 1.0;
    const camX = player.x - (canvas.width / scaleFactor) / 2;
    const camY = player.y - (canvas.height / scaleFactor) / 2;

    ctx.save();
    ctx.scale(scaleFactor, scaleFactor);
    if (groundPattern.current) {
        ctx.save();
        ctx.translate(-camX % 512, -camY % 512);
        ctx.fillStyle = groundPattern.current;
        ctx.fillRect(-512, -512, (canvas.width / scaleFactor) + 1024, (canvas.height / scaleFactor) + 1024);
        ctx.restore();
    } else {
      ctx.fillStyle = currentLocation.color;
      ctx.fillRect(camX, camY, canvas.width / scaleFactor, canvas.height / scaleFactor);
    }
    ctx.translate(-camX, -camY);

    enemies.forEach((enemy: any) => {
      const radius = enemy.type === 'boss' ? 45 : 15;
      if (state.currentTargetId === enemy.id) {
          ctx.beginPath(); ctx.arc(enemy.x, enemy.y, radius + 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; ctx.fill();
          ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.fillStyle = enemy.type === 'boss' ? '#991b1b' : '#b83333';
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2); ctx.fill();
    });

    state.onlinePlayers?.forEach((p: any) => {
      const interp = onlinePlayersCache.current.get(p.id);
      drawCharacter(ctx, interp?.x ?? p.x, interp?.y ?? p.y, interp?.r ?? p.rotation, p.hp, p.maxHp, p.equipment, p.aura, p.nickname, p.level, false, p.skinColor || '#e5c298', time);
    });

    drawCharacter(ctx, player.x, player.y, rotationRef.current, player.hp, player.maxHp, state.equipment, state.equipment.aura, state.user.email?.split('@')[0] || state.user.uid, player.level, true, player.skinColor || '#e5c298', time);

    floatingTexts.current.forEach(t => { ctx.globalAlpha = t.life; ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y - (1.0 - t.life) * 50); });
    ctx.globalAlpha = 1.0;
    
    projectiles.current.forEach(p => {
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.targetY - p.startY, p.targetX - p.startX));
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    
    ctx.restore();
  };

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => { window.removeEventListener('resize', handleResize); };
  }, []); 

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const state = useGameStore.getState();
    const scaleFactor = canvas.width < 600 ? 0.65 : 1.0;
    const camX = state.player.x - (canvas.width / scaleFactor) / 2;
    const camY = state.player.y - (canvas.height / scaleFactor) / 2;
    const worldX = (clickX / scaleFactor) + camX;
    const worldY = (clickY / scaleFactor) + camY;
    let targetFound = false;
    for (const en of state.enemies) {
      if (Math.hypot(en.x - worldX, en.y - worldY) < 40) {
        state.setCurrentTargetId(en.id);
        targetFound = true;
        break;
      }
    }
    if (!targetFound) {
      for (const p of state.onlinePlayers || []) {
        if (Math.hypot(p.x - worldX, p.y - worldY) < 35) {
          state.setCurrentTargetId('player_' + p.id);
          targetFound = true;
          break;
        }
      }
    }
    if (!targetFound) state.setCurrentTargetId(null);
  };

  return <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair touch-none" onPointerDown={handlePointerDown} />;
});
GameEngine.displayName = 'GameEngine';
