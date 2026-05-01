'use client'

import React, { useRef, useEffect } from 'react';
import { useGameStore, Enemy, OnlinePlayer } from '@/lib/store';
import { db } from '@/lib/firebase';
import { doc, setDoc, onSnapshot, collection, query, where } from 'firebase/firestore';

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
  const onlinePlayersCache = useRef<Map<string, { x: number, y: number, r: number, tx: number, ty: number, tr: number, lastAction?: number, effect?: { progress: number, type: 'melee' | 'ranged' | 'magic', angle: number } | null }>>(new Map());

  // Constants
  const PLAYER_SPEED = 4.5;
  const ATTACK_RANGE = 100;
  const ENEMY_DETECTION_RANGE = 350;

  useEffect(() => {
    // Initial spawn
    const { enemies, spawnEnemy } = useGameStore.getState();
    if (enemies.length === 0) {
      for (let i = 0; i < 8; i++) {
        spawnEnemy({
          id: Math.random().toString(),
          x: Math.random() * 2000 - 1000,
          y: Math.random() * 2000 - 1000,
          hp: 50,
          maxHp: 50,
          level: 1,
          type: 'Слизень'
        });
      }
    }
  }, []);

  const groundPattern = useRef<CanvasPattern | null>(null);

  useEffect(() => {
    const loc = useGameStore.getState().locations.find(l => l.id === useGameStore.getState().currentLocationId);
    if (!loc) return;

    // Procedural Ground Generation
    const size = 512;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tctx = tempCanvas.getContext('2d')!;

    // Base color
    tctx.fillStyle = loc.color;
    tctx.fillRect(0, 0, size, size);

    // Add noise/details
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const s = 1 + Math.random() * 3;
        
        if (loc.groundTheme === 'forest') {
            tctx.fillStyle = Math.random() > 0.5 ? '#1a2e1a' : '#2d1e12';
            tctx.fillRect(x, y, s, s);
            if (i % 50 === 0) { // Leaves
                tctx.fillStyle = '#3a4d24';
                tctx.beginPath(); tctx.ellipse(x, y, 4, 2, Math.random()*Math.PI, 0, Math.PI*2); tctx.fill();
            }
        } else if (loc.groundTheme === 'cave') {
            tctx.fillStyle = Math.random() > 0.5 ? '#1c1c24' : '#0a0a0f';
            tctx.fillRect(x, y, s, s);
            if (i % 40 === 0) { // Stones
                tctx.fillStyle = '#333344';
                tctx.beginPath(); tctx.arc(x, y, 2 + Math.random()*3, 0, Math.PI*2); tctx.fill();
            }
        } else if (loc.groundTheme === 'dungeon_corridor') {
            tctx.fillStyle = '#100a16';
            tctx.fillRect(x, y, s, s);
            if (i % 100 === 0) { // Cracks/Tiles
                tctx.strokeStyle = '#221133'; tctx.lineWidth = 1;
                tctx.strokeRect(Math.floor(x/32)*32, Math.floor(y/32)*32, 32, 32);
            }
        } else { // Citadel
            tctx.fillStyle = '#0a0505';
            tctx.fillRect(x, y, s, s);
            if (i % 100 === 0) { // Cracks/Tiles
                tctx.strokeStyle = '#2a1a1a'; tctx.lineWidth = 1;
                tctx.strokeRect(Math.floor(x/64)*64, Math.floor(y/64)*64, 64, 64);
            }
        }
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    groundPattern.current = ctx.createPattern(tempCanvas, 'repeat');
  }, [useGameStore.getState().currentLocationId]);

  useEffect(() => {
    // Multiplayer Listeners
    const state = useGameStore.getState();
    const user = state.user;
    if (!user) return;

    let unsubList: (() => void)[] = [];

    // Listen for players in current location
    const q = query(collection(db, 'worldPlayers'), where('locationId', '==', state.currentLocationId));
    let skipFirst = true; // wait for next tick? Actually just listen

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const players: OnlinePlayer[] = [];
      const now = Date.now();
      const currentState = useGameStore.getState();
      
      snapshot.forEach(d => {
        const data = d.data();
        if (d.id === user.uid) {
           // It's me. Check if my HP on server is lower than my local HP (meaning I was attacked!)
           if (data.hp < currentState.player.hp) {
              const dmg = currentState.player.hp - data.hp;
              currentState.damagePlayer(dmg);
           }
        } else if (now - data.updatedAt < 5000) { // Only show active players
          const id = d.id;
          const tx = data.x;
          const ty = data.y;
          const tr = data.rotation || 0;
          
          let lastAction = data.actionTime || 0;

          if (!onlinePlayersCache.current.has(id)) {
            onlinePlayersCache.current.set(id, { x: tx, y: ty, r: tr, tx, ty, tr, lastAction, effect: null });
          } else {
            const entry = onlinePlayersCache.current.get(id)!;
            entry.tx = tx;
            entry.ty = ty;
            entry.tr = tr;
            if (lastAction > (entry.lastAction || 0)) {
               entry.lastAction = lastAction;
               entry.effect = {
                  progress: 0,
                  type: (data.equipment?.weapon?.icon === 'bow' || data.equipment?.weapon?.icon === 'staff') ? (data.equipment.weapon.icon === 'bow' ? 'ranged' : 'magic') : 'melee',
                  angle: tr
               };
            }
          }

          players.push({
            id: id,
            x: tx,
            y: ty,
            hp: data.hp,
            maxHp: data.maxHp,
            level: data.level,
            nickname: data.nickname,
            rotation: tr,
            equipment: data.equipment,
            aura: data.aura,
            skinColor: data.skinColor
          });
        }
      });
      
      // Cleanup cache for players no longer in list
      const playerIds = new Set(players.map(p => p.id));
      onlinePlayersCache.current.forEach((_, id) => {
        if (!playerIds.has(id)) onlinePlayersCache.current.delete(id);
      });

      useGameStore.setState({ onlinePlayers: players });
    }, (error) => {
        console.error('Multiplayer sync error', error);
    });

    // Write player position every 300 ms
    const interval = setInterval(() => {
      const currentState = useGameStore.getState();
      if (!currentState.user) return;

      const equip = currentState.equipment || {};
      const aura = equip.aura;
      
      const sanitizedEquipment: any = {};
      if (equip.weapon) sanitizedEquipment.weapon = { icon: equip.weapon.icon || 'sword', rarity: equip.weapon.rarity || 'common' };
      if (equip.armor) sanitizedEquipment.armor = { rarity: equip.armor.rarity || 'common' };
      if (equip.accessory) sanitizedEquipment.accessory = { icon: equip.accessory.icon || 'ring', rarity: equip.accessory.rarity || 'common' };

      const sanitizedAura = aura ? { 
        rarity: aura.rarity || 'common', 
        color: aura.color || '#3b82f6' 
      } : null;

      try {
        setDoc(doc(db, 'worldPlayers', currentState.user.uid), {
          locationId: currentState.currentLocationId || 'forest',
          x: currentState.player.x || 0,
          y: currentState.player.y || 0,
          hp: currentState.player.hp || 0,
          maxHp: currentState.player.maxHp || 100,
          level: currentState.player.level || 1,
          nickname: currentState.user.email?.split('@')[0] || currentState.user.uid,
          skinColor: currentState.player.skinColor || '#e5c298',
          rotation: rotationRef.current || 0,
          equipment: sanitizedEquipment,
          aura: sanitizedAura,
          actionTime: lastAttackDate.current || 0,
          updatedAt: Date.now()
        }, { merge: true });
      } catch (e) {
          console.error(e);
      }
    }, 300);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [useGameStore.getState().currentLocationId, useGameStore.getState().user?.uid]);

  const update = (time: number) => {
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

    // 1. Move Player (Manual)
    const currentVelocity = velocity.current || { x: 0, y: 0 };
    let newX = player.x + currentVelocity.x * PLAYER_SPEED;
    let newY = player.y + currentVelocity.y * PLAYER_SPEED;

    // 2. Auto Battle Logic
    if (state.player.potionCooldown > 0) {
      useGameStore.setState(prev => ({ 
        player: { ...prev.player, potionCooldown: Math.max(0, prev.player.potionCooldown - 1/60) } 
      }));
    }

    if (isAutoBattle || state.currentTargetId) {
      const weapon = state.equipment.weapon;
      const wName = (weapon?.name || '').toLowerCase();
      const wIcon = weapon?.icon || '';
      const isBow = wIcon === 'bow' || wName.includes('лук');
      const isStaff = wIcon === 'staff' || wName.includes('посох');
      const dynamicAttackRange = isBow ? 350 : isStaff ? 225 : ATTACK_RANGE;

      // Find target only by currentTargetId
      let target: { id: string, x: number, y: number, isPlayer?: boolean } | null = null;
      
      if (state.currentTargetId) {
        if (state.currentTargetId.startsWith('player_')) {
          const pid = state.currentTargetId.replace('player_', '');
          const p = state.onlinePlayers?.find(p => p.id === pid);
          if (p) target = { ...p, isPlayer: true };
        } else {
          const e = state.enemies.find(e => e.id === state.currentTargetId);
          if (e) target = e;
        }
      }

      if (target) {
        const dist = Math.hypot(target.x - player.x, target.y - player.y);
        
        if (dist < dynamicAttackRange) {
          // Attack
          if (time - lastAttackTime.current > 1000 / player.stats.atkSpeed) {
            let finalDmg = player.stats.damage;
            let isCrit = false;

            if (Math.random() * 100 < (player.stats.critRate || 5)) {
              finalDmg = Math.floor(finalDmg * ((player.stats.critDamage || 150) / 100));
              isCrit = true;
            }
            
            const angle = Math.atan2(target.y - player.y, target.x - player.x);

            if (isBow || isStaff) {
              // Ranged attack - spawn projectile
              projectiles.current.push({
                id: Math.random().toString(),
                x: player.x,
                y: player.y,
                startX: player.x,
                startY: player.y,
                targetX: target.x,
                targetY: target.y,
                targetId: target.id,
                progress: 0,
                speed: isBow ? 0.08 : 0.05,
                type: isBow ? 'arrow' : 'magic',
                color: isBow ? (isCrit ? '#fbbf24' : '#e5e7eb') : '#8b5cf6',
                damage: finalDmg,
                isCrit,
                isStaff
              });
              
              attackEffect.current = { angle, progress: 0, type: isBow ? 'ranged' : 'magic' };
            } else {
              // Melee attack logic -> handled in the condition
              let realTargetId = target.id;
              if (target.isPlayer) {
                  realTargetId = realTargetId.replace('player_', '');
                  const targetRef = doc(db, 'worldPlayers', realTargetId);
                  // Read and update their HP
                  import('firebase/firestore').then(({ getDoc, updateDoc }) => {
                      getDoc(targetRef).then(snap => {
                         if (snap.exists()) {
                             const thp = snap.data().hp;
                             updateDoc(targetRef, { hp: Math.max(0, thp - finalDmg) });
                         }
                      });
                  });
              } else {
                  damageEnemy(target.id, finalDmg);
              }
              
              if (player.stats.lifesteal && player.stats.lifesteal > 0) {
                const heal = Math.floor(finalDmg * (player.stats.lifesteal / 100));
                if (heal > 0) healPlayer(heal);
              }
              
              attackEffect.current = { angle, progress: 0, type: 'melee' };

              floatingTexts.current.push({
                id: Math.random().toString(),
                x: target.x,
                y: target.y - 20,
                text: isCrit ? `КРИТ -${finalDmg}` : `-${finalDmg}`,
                color: isCrit ? '#fbbf24' : '#facc15',
                life: 1.0
              });
              
              for (let i = 0; i < 5; i++) {
                particles.current.push({
                  id: Math.random().toString(),
                  x: target.x,
                  y: target.y,
                  vx: (Math.random() - 0.5) * 10,
                  vy: (Math.random() - 0.5) * 10,
                  color: '#ffffff',
                  life: 1.0,
                  maxLife: 1.0,
                  size: 3
                });
              }
            }

            lastAttackTime.current = time;
             lastAttackDate.current = Date.now();
          }
        } else if (isAutoBattle && (velocity.current?.x || 0) === 0 && (velocity.current?.y || 0) === 0) {
          // Auto-move towards target
          const angle = Math.atan2(target.y - player.y, target.x - player.x);
          newX += Math.cos(angle) * (PLAYER_SPEED * 0.7);
          newY += Math.sin(angle) * (PLAYER_SPEED * 0.7);
        }
      } else {
         if (state.currentTargetId) {
             state.setCurrentTargetId(null); // Clear invalid target
             if (state.isAutoBattle) {
                useGameStore.setState({ isAutoBattle: false });
             }
         }
         const loc = state.locations.find(l => l.id === state.currentLocationId);
         if (loc?.groundTheme === 'dungeon_corridor' && isAutoBattle && (velocity.current?.x || 0) === 0 && (velocity.current?.y || 0) === 0) {
            if (!state.dungeonState.bossDefeated) {
               newX += PLAYER_SPEED * 0.7; // run forward
            } else if (!state.dungeonState.chestOpened) {
               // move to chest
               const distToChest = Math.hypot(7500 - player.x, 500 - player.y);
               if (distToChest > 50) {
                 const angle = Math.atan2(500 - player.y, 7500 - player.x);
                 newX += Math.cos(angle) * (PLAYER_SPEED * 0.7);
                 newY += Math.sin(angle) * (PLAYER_SPEED * 0.7);
               } else {
                 state.openChest();
               }
            }
         }
      }
    }

    const currentLoc = state.locations.find(l => l.id === state.currentLocationId);
    if (currentLoc?.groundTheme === 'dungeon_corridor') {
        newY = Math.max(200, Math.min(newY, 800)); // boundaries
        newX = Math.max(0, Math.min(newX, 8500));
        
        // Manual player reaching chest check
        if (state.dungeonState.bossDefeated && !state.dungeonState.chestOpened) {
           const distToChest = Math.hypot(7500 - newX, 500 - newY);
           if (distToChest < 100) {
              state.openChest();
           }
        }
    }

    updatePlayerPos(newX, newY);
  
    // 3. Enemy Logic
    // Cleanup distant enemies (more than 1000 units away) to allow new spawns near player
    const MAX_ENEMY_DIST = 1000;
    const nearbyEnemies = enemies.filter(enemy => {
      const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      return dist < MAX_ENEMY_DIST;
    });
    
    if (nearbyEnemies.length !== enemies.length) {
      useGameStore.setState({ enemies: nearbyEnemies });
    }

    nearbyEnemies.forEach(enemy => {
      const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (dist < 40) {
        if (time - lastEnemyAttackTime.current > 1500) {
            if (player.stats.dodge && Math.random() * 100 < player.stats.dodge) {
                // Dodged!
                lastEnemyAttackTime.current = time;
                floatingTexts.current.push({
                  id: Math.random().toString(),
                  x: player.x,
                  y: player.y - 20,
                  text: 'УКЛОНЕНИЕ',
                  color: '#93c5fd',
                  life: 1.0
                });
            } else {
                const baseDmg = (10 + enemy.level * 4) - (player.stats.defense / 5);
                const dr = player.stats.damageReduction || 0;
                const reducedDmg = Math.max(1, baseDmg * (1 - (dr / 100)));
                damagePlayer(Math.round(reducedDmg));
                lastEnemyAttackTime.current = time;
                
                floatingTexts.current.push({
                  id: Math.random().toString(),
                  x: player.x,
                  y: player.y - 20,
                  text: `-${Math.round(reducedDmg)}`,
                  color: '#ef4444',
                  life: 1.0
                });
            }
          }
        } else if (dist < 310) {
          // Simple AI: Move towards player
          const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
          enemy.x += Math.cos(angle) * 2.8;
          enemy.y += Math.sin(angle) * 2.8;
        }
      });
    }

    // 4. Update Animations & Effects
      if (attackEffect.current) {
        attackEffect.current.progress += (attackEffect.current.type === 'melee' ? 0.15 : 0.25);
        if (attackEffect.current.progress >= 1.0) {
          attackEffect.current = null;
        }
      }
      
      // Update Projectiles
      projectiles.current.forEach(p => {
        p.progress += p.speed;
        p.x = p.startX + (p.targetX - p.startX) * p.progress;
        p.y = p.startY + (p.targetY - p.startY) * p.progress;
        
        // Add trail particle
        if (Math.random() < 0.5) {
          particles.current.push({
            id: Math.random().toString(),
            x: p.x + (Math.random() - 0.5) * 10,
            y: p.y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            color: p.color,
            life: 1.0,
            maxLife: 1.0,
            size: p.type === 'magic' ? 4 : 2
          });
        }
      });
      
      const removedProjectiles = projectiles.current.filter(p => p.progress >= 1.0);
      projectiles.current = projectiles.current.filter(p => p.progress < 1.0);
      
      removedProjectiles.forEach(p => {
        if (p.targetId) {
          if (p.targetId.startsWith('player_')) {
              const pid = p.targetId.replace('player_', '');
              const targetRef = doc(db, 'worldPlayers', pid);
              import('firebase/firestore').then(({ getDoc, updateDoc }) => {
                  getDoc(targetRef).then(snap => {
                     if (snap.exists()) {
                         const thp = snap.data().hp;
                         updateDoc(targetRef, { hp: Math.max(0, thp - p.damage) });
                     }
                  });
              });
          } else {
              damageEnemy(p.targetId, p.damage);
          }
          
          if (player.stats.lifesteal && player.stats.lifesteal > 0) {
             const heal = Math.floor(p.damage * (player.stats.lifesteal / 100));
             if (heal > 0) healPlayer(heal);
          } else if (p.isStaff) {
             const heal = Math.floor(p.damage * 0.15);
             if (heal > 0) healPlayer(heal);
          }
          
          floatingTexts.current.push({
            id: Math.random().toString(),
            x: p.targetX,
            y: p.targetY - 20,
            text: p.isCrit ? `КРИТ -${p.damage}` : `-${p.damage}`,
            color: p.isCrit ? '#fbbf24' : '#facc15',
            life: 1.0
          });
          
          // Hit explosion particles
          for (let i = 0; i < 8; i++) {
            particles.current.push({
              id: Math.random().toString(),
              x: p.targetX,
              y: p.targetY,
              vx: (Math.random() - 0.5) * 15,
              vy: (Math.random() - 0.5) * 15,
              color: p.color,
              life: 1.0,
              maxLife: 1.0,
              size: p.type === 'magic' ? 5 : 3
            });
          }
        }
      });
      
      // Update Particles
      particles.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
      });
      particles.current = particles.current.filter(p => p.life > 0);
  
      // 5. Update Floating Texts
      floatingTexts.current.forEach(t => t.life -= 0.02);
      floatingTexts.current = floatingTexts.current.filter(t => t.life > 0);
  
      // 5.1 Interpolate Online Players
      onlinePlayersCache.current.forEach((val) => {
        val.x += (val.tx - val.x) * 0.15; // smooth interpolation over 300ms
        val.y += (val.ty - val.y) * 0.15;
        
        // Shortest path rotation interpolation
        let diff = val.tr - val.r;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        val.r += diff * 0.2;

        if (val.effect) {
           val.effect.progress += (val.effect.type === 'melee' ? 0.15 : 0.25);
           if (val.effect.progress >= 1.0) val.effect = null;
        }
      });

    // 6. Logic Timers
    if (!state.isDead) {
      const timeSinceLastSpawn = time - lastRespawnTime.current;
      const timeSinceLastBuffUpdate = time - (lastBuffUpdateTime.current || 0);

      if (timeSinceLastBuffUpdate > 1000) {
        state.updateBuffs();
        lastBuffUpdateTime.current = time;
      }

      if (timeSinceLastSpawn > 2000) {
      const location = state.locations.find(l => l.id === state.currentLocationId) || state.locations[0];
      const isDungeon = location.isDungeon;
      
      if (isDungeon) {
        if (!state.dungeonState.bossDefeated) {
           const bossExists = state.enemies.some(e => e.type === 'boss');
           if (!bossExists) {
              spawnEnemy({
                id: 'dungeon_boss_' + Math.random().toString(),
                x: 7000,
                y: 500,
                hp: location.enemyBaseHp * 50,
                maxHp: location.enemyBaseHp * 50,
                level: location.minLevel + 10,
                type: 'boss'
              });
           }
           if (enemies.length < 15) {
              for (let i = 0; i < 5; i++) {
                const spawnX = Math.max(player.x + 300, Math.min(8000, player.x + 300 + Math.random() * 800));
                const spawnY = Math.max(200, Math.min(800, player.y + (Math.random() - 0.5) * 400));
                
                spawnEnemy({
                  id: Math.random().toString(),
                  x: spawnX,
                  y: spawnY,
                  hp: location.enemyBaseHp * 2,
                  maxHp: location.enemyBaseHp * 2,
                  level: Math.max(player.level, location.minLevel),
                  type: 'Демон'
                });
              }
           }
        }
      } else {
        if (enemies.length < 15) {
            const spawnCount = enemies.length < 5 ? 5 : 2; 
            for (let i = 0; i < spawnCount; i++) {
              const angle = Math.random() * Math.PI * 2;
              const dist = 300 + Math.random() * 400; // Even closer spawn range
              const enemyLevel = Math.max(player.level, location.minLevel);
              spawnEnemy({
                id: Math.random().toString(),
                x: player.x + Math.cos(angle) * dist,
                y: player.y + Math.sin(angle) * dist,
                hp: (location.enemyBaseHp) + enemyLevel * 15,
                maxHp: (location.enemyBaseHp) + enemyLevel * 15,
                level: enemyLevel,
                type: Math.random() > 0.7 ? 'Титан' : 'Демон'
              });
            }
          }
      }
      lastRespawnTime.current = time;
      }
    }

    draw(useGameStore.getState(), time);
    requestRef.current = requestAnimationFrame(update);
  };

  const drawCharacter = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rotation: number,
    hp: number,
    maxHp: number,
    equipment: any,
    aura: any,
    nickname: string,
    level: number,
    isMain: boolean,
    skinColor: string,
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

    if (hp <= 0) {
      ctx.globalAlpha = 0.4;
    }

    // 1. AURA RENDERING (Subtle layer)
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

    // 2. CHARACTER BODY LAYER (Rotated)
    ctx.save();
    ctx.rotate(rotation);

    // Dynamic scale based on level (slightly)
    const scale = 1 + (level * 0.001);
    ctx.scale(scale, scale);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(3, 3, radius, 0, Math.PI * 2);
    ctx.fill();

    // 2.1 ADVANCED ARMOR VISUALS
    const isCommonA = rarityA === 'common' || !rarityA;
    const isUncommonA = rarityA === 'uncommon';
    const isRareA = rarityA === 'rare';

    // A. Wings Layer (Below body)
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
      
      // Left Wing (Top)
      ctx.beginPath();
      ctx.moveTo(wx, -5); 
      ctx.lineTo(wx - 25 - spread, -25); 
      ctx.lineTo(wx - 35 - spread * 1.5, -60); // tip 1
      ctx.lineTo(wx - 30 - spread, -30); 
      ctx.lineTo(wx - 55 - spread * 1.2, -40); // tip 2
      ctx.lineTo(wx - 35 - spread, -15); 
      ctx.lineTo(wx - 45 - spread, -5);  // tip 3
      ctx.lineTo(wx, -2); 
      ctx.fill();

      // Right Wing (Bottom)
      ctx.beginPath();
      ctx.moveTo(wx, 5);
      ctx.lineTo(wx - 25 - spread, 25);
      ctx.lineTo(wx - 35 - spread * 1.5, 60); // tip 1
      ctx.lineTo(wx - 30 - spread, 30);
      ctx.lineTo(wx - 55 - spread * 1.2, 40); // tip 2
      ctx.lineTo(wx - 35 - spread, 15);
      ctx.lineTo(wx - 45 - spread, 5);  // tip 3
      ctx.lineTo(wx, 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = isUltraA ? '#4c1d95' : '#7f1d1d';
      
      // Inner Left Wing
      ctx.beginPath();
      ctx.moveTo(wx, -5); 
      ctx.lineTo(wx - 15 - spread * 0.8, -15); 
      ctx.lineTo(wx - 20 - spread * 1.2, -40); 
      ctx.lineTo(wx - 20 - spread * 0.8, -20); 
      ctx.lineTo(wx - 35 - spread, -25); 
      ctx.lineTo(wx - 22 - spread * 0.8, -10); 
      ctx.lineTo(wx - 25 - spread, -2); 
      ctx.lineTo(wx, -2); 
      ctx.fill();

      // Inner Right Wing
      ctx.beginPath();
      ctx.moveTo(wx, 5); 
      ctx.lineTo(wx - 15 - spread * 0.8, 15); 
      ctx.lineTo(wx - 20 - spread * 1.2, 40); 
      ctx.lineTo(wx - 20 - spread * 0.8, 20); 
      ctx.lineTo(wx - 35 - spread, 25); 
      ctx.lineTo(wx - 22 - spread * 0.8, 10); 
      ctx.lineTo(wx - 25 - spread, 2); 
      ctx.lineTo(wx, 2); 
      ctx.fill();
      ctx.restore();
    }

    // B. Body Base
    ctx.fillStyle = skinColor;
    if (armor) {
      if (isCommonA) ctx.fillStyle = '#475569';
      else if (isUncommonA) ctx.fillStyle = '#166534';
      else if (isRareA) ctx.fillStyle = '#1e3a8a';
      else if (isEpicA) ctx.fillStyle = '#4c1d95';
      else if (isLegendaryA) ctx.fillStyle = '#854d0e';
      else if (isMythicA) ctx.fillStyle = '#7f1d1d';
      else if (isUltraA) ctx.fillStyle = '#bae6fd';
    }
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // C. Detailed Armor
    if (armor) {
      let base = '#64748b'; let trim = '#94a3b8'; let glow = '#ffffff';
      if (isUncommonA) { base = '#22c55e'; trim = '#4ade80'; glow = '#86efac'; }
      if (isRareA) { base = '#3b82f6'; trim = '#60a5fa'; glow = '#93c5fd'; }
      if (isEpicA) { base = '#a855f7'; trim = '#c084fc'; glow = '#e9d5ff'; }
      if (isLegendaryA) { base = '#eab308'; trim = '#facc15'; glow = '#fef08a'; }
      if (isMythicA) { base = '#ef4444'; trim = '#f87171'; glow = '#fca5a5'; }
      if (isUltraA) { base = '#e0f2fe'; trim = '#ffffff'; glow = '#38bdf8'; }

      // Chest details
      ctx.strokeStyle = trim; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(10, 0); ctx.lineTo(-8, 14); ctx.stroke();
      
      // Core Gem / Belt
      if (!isCommonA) {
        ctx.fillStyle = glow;
        ctx.shadowBlur = 10; ctx.shadowColor = glow;
        ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-8, -5); ctx.lineTo(-14, 0); ctx.lineTo(-8, 5); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Shoulders
      ctx.save();
      ctx.fillStyle = base; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5;
      
      const sWidth = isEpicA || isLegendaryA || isMythicA || isUltraA ? 16 : 12;
      const sExt = isMythicA ? 42 : isLegendaryA ? 38 : isUltraA ? 45 : 30;

      // Left Shoulder
      ctx.beginPath(); 
      ctx.moveTo(-10, -18); 
      ctx.quadraticCurveTo(0, -sExt, sWidth, -16); 
      ctx.lineTo(2, -18); ctx.closePath();
      ctx.fill(); ctx.stroke();
      
      // Right Shoulder
      ctx.beginPath(); 
      ctx.moveTo(-10, 18); 
      ctx.quadraticCurveTo(0, sExt, sWidth, 16); 
      ctx.lineTo(2, 18); ctx.closePath();
      ctx.fill(); ctx.stroke();

      // Shoulder trims
      ctx.strokeStyle = trim; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, -20); ctx.lineTo(sWidth-4, -18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, 20); ctx.lineTo(sWidth-4, 18); ctx.stroke();
      
      if (isMythicA || isUltraA) {
         // Extra Spikes
         ctx.fillStyle = trim;
         ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(15, -35); ctx.lineTo(10, -20); ctx.fill();
         ctx.beginPath(); ctx.moveTo(0, 25); ctx.lineTo(15, 35); ctx.lineTo(10, 20); ctx.fill();
      }
      ctx.restore();

      // Helmet
      ctx.save();
      ctx.fillStyle = base; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.arc(4, 0, 15, -Math.PI*0.65, Math.PI*0.65);
      ctx.lineTo(-6, 12); ctx.lineTo(-6, -12); ctx.closePath();
      ctx.fill(); ctx.stroke();

      // Helmet Trim
      ctx.strokeStyle = trim; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(4, 0, 12, -Math.PI*0.5, Math.PI*0.5); ctx.stroke();

      // Plume / Ridge (backwards in top-down)
      if (!isCommonA) {
        ctx.fillStyle = isUltraA ? '#ffffff' : trim;
        ctx.beginPath();
        if (isMythicA || isUltraA) {
           ctx.moveTo(0, -4); ctx.lineTo(-18, -10); ctx.lineTo(-12, 0); ctx.lineTo(-18, 10); ctx.lineTo(0, 4); ctx.fill();
        } else {
           ctx.moveTo(2, -3); ctx.lineTo(-15, -5); ctx.lineTo(-15, 5); ctx.lineTo(2, 3); ctx.fill();
        }
      }

      // Visor / Eyes
      ctx.fillStyle = glow;
      ctx.shadowBlur = 12; ctx.shadowColor = glow;
      if (isCommonA || isUncommonA) {
          ctx.fillRect(10, -6, 3, 12);
      } else if (isRareA || isEpicA) { // T-Visor
          ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(12, -8); ctx.lineTo(12, -2); ctx.lineTo(16, -2); ctx.lineTo(16, 2); ctx.lineTo(12, 2); ctx.lineTo(12, 8); ctx.lineTo(6, 8); ctx.fill();
      } else { // V-Visor
          ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(16, -4); ctx.lineTo(18, 0); ctx.lineTo(16, 4); ctx.lineTo(8, 8); ctx.lineTo(12, 0); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // D. Hands (Gauntlets)
    let hColor = skinColor;
    if (armor) {
       if (isCommonA) hColor = '#94a3b8';
       else if (isUncommonA) hColor = '#4ade80';
       else if (isRareA) hColor = '#60a5fa';
       else if (isEpicA) hColor = '#c084fc';
       else if (isLegendaryA) hColor = '#facc15';
       else if (isMythicA) hColor = '#f87171';
       else if (isUltraA) hColor = '#ffffff';
    }
    ctx.fillStyle = hColor;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(16, -14, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(16, 14, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // 2.2 WEAPON RENDERING
    if (weapon) {
      const r = weapon.rarity;
      const isUltraW = r === 'ultra';
      const isMythicW = r === 'mythic';
      const isLegendaryW = r === 'legendary';
      const isEpicW = r === 'epic';
      const isRareW = r === 'rare';
      const isUncommonW = r === 'uncommon';
      const isCommonW = !r || r === 'common';
      
      let wpColor = '#cbd5e1';
      if (isUncommonW) wpColor = '#4ade80';
      if (isRareW) wpColor = '#60a5fa';
      if (r === 'epic') wpColor = '#7e22ce';
      if (isLegendaryW) wpColor = '#fbbf24';
      if (isMythicW) wpColor = '#ef4444';
      if (isUltraW) wpColor = '#2dd4bf';

      ctx.save();
      ctx.translate(16, 14);
      
      // Weapon animation
      const weaponSwing = Math.sin(time * 0.005) * 0.05;
      ctx.rotate(weaponSwing);
      
      if (isUltraW || isMythicW || isLegendaryW) {
        ctx.shadowBlur = isUltraW ? 45 : 20;
        ctx.shadowColor = wpColor;
      }

      const wIcon = weapon.icon || 'sword';
      if (wIcon === 'bow') {
        ctx.save();
        
        let bSize = 18;
        if (isUncommonW) bSize = 20;
        if (isRareW) bSize = 24;
        if (isEpicW) bSize = 28;
        if (isLegendaryW) bSize = 34;
        if (isMythicW) bSize = 40;
        if (isUltraW) bSize = 48;

        ctx.strokeStyle = wpColor;
        
        // Custom Bow Shapes
        if (isCommonW || isUncommonW) {
          ctx.lineWidth = isUncommonW ? 4 : 3;
          ctx.lineJoin = 'miter';
          ctx.beginPath();
          ctx.moveTo(10, -bSize); ctx.lineTo(25, -bSize/2); ctx.lineTo(15, 0); ctx.lineTo(25, bSize/2); ctx.lineTo(10, bSize);
          ctx.stroke();
          
          if (isUncommonW) {
             // Spikes
             ctx.fillStyle = '#22c55e';
             ctx.beginPath(); ctx.moveTo(20, -bSize/2 - 5); ctx.lineTo(35, -bSize/2); ctx.lineTo(20, -bSize/2 + 5); ctx.fill();
             ctx.beginPath(); ctx.moveTo(20, bSize/2 - 5); ctx.lineTo(35, bSize/2); ctx.lineTo(20, bSize/2 + 5); ctx.fill();
          }
        } 
        else if (isRareW) {
          ctx.lineWidth = 5; ctx.lineJoin = 'miter';
          ctx.shadowBlur = 10; ctx.shadowColor = '#60a5fa';
          ctx.beginPath();
          ctx.moveTo(10, -bSize); ctx.lineTo(35, -bSize*0.6); ctx.lineTo(45, -10); ctx.lineTo(20, 0);
          ctx.lineTo(45, 10); ctx.lineTo(35, bSize*0.6); ctx.lineTo(10, bSize);
          ctx.stroke();
          // Ice spikes
          ctx.fillStyle = '#bfdbfe';
          ctx.beginPath(); ctx.moveTo(35, -bSize/2); ctx.lineTo(60, -bSize/2 + 5); ctx.lineTo(40, -bSize/2 + 15); ctx.fill();
          ctx.beginPath(); ctx.moveTo(35, bSize/2); ctx.lineTo(60, bSize/2 - 5); ctx.lineTo(40, bSize/2 - 15); ctx.fill();
          ctx.shadowBlur = 0;
        }
        else if (isEpicW) {
          ctx.lineWidth = 6; ctx.lineJoin = 'miter';
          ctx.shadowBlur = 15; ctx.shadowColor = '#d8b4fe';
          ctx.beginPath();
          ctx.moveTo(10, -bSize); ctx.lineTo(40, -bSize*0.8); ctx.lineTo(60, -20); ctx.lineTo(30, -5); ctx.lineTo(15, 0);
          ctx.lineTo(30, 5); ctx.lineTo(60, 20); ctx.lineTo(40, bSize*0.8); ctx.lineTo(10, bSize);
          ctx.stroke();
          // Dark crystals
          ctx.fillStyle = '#a855f7';
          ctx.beginPath(); ctx.moveTo(40, -bSize*0.8); ctx.lineTo(65, -bSize*0.6); ctx.lineTo(50, -bSize*0.4); ctx.fill();
          ctx.beginPath(); ctx.moveTo(40, bSize*0.8); ctx.lineTo(65, bSize*0.6); ctx.lineTo(50, bSize*0.4); ctx.fill();
          ctx.shadowBlur = 0;
        }
        else if (isLegendaryW) {
          ctx.lineWidth = 8; ctx.lineJoin = 'miter';
          ctx.shadowBlur = 20; ctx.shadowColor = '#fde047';
          ctx.strokeStyle = '#fef08a';
          ctx.beginPath();
          ctx.moveTo(10, -bSize); ctx.lineTo(50, -bSize*0.9); ctx.lineTo(75, -25); ctx.lineTo(35, -10); ctx.lineTo(20, 0);
          ctx.lineTo(35, 10); ctx.lineTo(75, 25); ctx.lineTo(50, bSize*0.9); ctx.lineTo(10, bSize);
          ctx.stroke();
          
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#eab308';
          ctx.stroke(); // inner line
          
          // Ornaments
          ctx.fillStyle = '#fde047';
          ctx.beginPath(); ctx.moveTo(50, -bSize*0.8); ctx.lineTo(80, -bSize*0.7); ctx.lineTo(60, -bSize*0.5); ctx.fill();
          ctx.beginPath(); ctx.moveTo(50, bSize*0.8); ctx.lineTo(80, bSize*0.7); ctx.lineTo(60, bSize*0.5); ctx.fill();
          ctx.shadowBlur = 0;
        }
        else if (isMythicW) {
          ctx.lineWidth = 10; ctx.lineJoin = 'miter';
          ctx.shadowBlur = 25; ctx.shadowColor = '#ef4444';
          ctx.strokeStyle = '#7f1d1d';
          ctx.beginPath();
          ctx.moveTo(10, -bSize); ctx.lineTo(65, -bSize); ctx.lineTo(95, -30); ctx.lineTo(40, -10); ctx.lineTo(15, 0);
          ctx.lineTo(40, 10); ctx.lineTo(95, 30); ctx.lineTo(65, bSize); ctx.lineTo(10, bSize);
          ctx.stroke();
          
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#ef4444';
          ctx.stroke(); // inner fiery line

          ctx.fillStyle = '#fca5a5';
          for(let i=0; i<3; i++) {
             ctx.beginPath(); ctx.moveTo(30+i*20, -bSize/2+i*10); ctx.lineTo(70+i*15, -bSize/2+i*5); ctx.lineTo(50+i*20, -bSize/2+25+i*5); ctx.fill();
             ctx.beginPath(); ctx.moveTo(30+i*20, bSize/2-i*10); ctx.lineTo(70+i*15, bSize/2-i*5); ctx.lineTo(50+i*20, bSize/2-25-i*5); ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
        else if (isUltraW) {
          ctx.save();
          ctx.rotate(-time * 0.003);
          ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(10, -bSize); ctx.lineTo(40, 0); ctx.lineTo(10, bSize); ctx.lineTo(-20, 0); ctx.closePath(); ctx.stroke();
          ctx.rotate(Math.PI/2);
          ctx.strokeStyle = 'rgba(45, 212, 191, 0.4)';
          ctx.beginPath(); ctx.moveTo(10, -bSize); ctx.lineTo(40, 0); ctx.lineTo(10, bSize); ctx.lineTo(-20, 0); ctx.closePath(); ctx.stroke();
          ctx.restore();

          ctx.lineWidth = 12; ctx.lineJoin = 'miter';
          ctx.shadowBlur = 30; ctx.shadowColor = '#a855f7';
          const grad = ctx.createLinearGradient(10, -bSize, 10, bSize);
          grad.addColorStop(0, '#2dd4bf'); grad.addColorStop(0.3, '#3b82f6'); grad.addColorStop(0.7, '#a855f7'); grad.addColorStop(1, '#f43f5e');
          ctx.strokeStyle = grad;
          ctx.beginPath();
          ctx.moveTo(10, -bSize); ctx.lineTo(75, -bSize); ctx.lineTo(110, -40); ctx.lineTo(50, -15); ctx.lineTo(20, 0);
          ctx.lineTo(50, 15); ctx.lineTo(110, 40); ctx.lineTo(75, bSize); ctx.lineTo(10, bSize);
          ctx.stroke();
          
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke(); // inner white core
          ctx.shadowBlur = 0;
        }
        
        // Bow string
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = isUltraW ? 2 : 1;
        ctx.beginPath(); 
        const yOffset = (isCommonW || isUncommonW) ? bSize * 0.9 : bSize;
        ctx.moveTo(10, -yOffset); 
        ctx.lineTo(8, -yOffset/2); ctx.lineTo(5, 0); ctx.lineTo(8, yOffset/2); 
        ctx.lineTo(10, yOffset); 
        ctx.stroke();
        
        // Glowing gems in middle
        if (isEpicW || isLegendaryW || isMythicW || isUltraW) {
           ctx.shadowBlur = 15; ctx.shadowColor = wpColor;
           ctx.fillStyle = isUltraW ? '#ffffff' : wpColor;
           ctx.beginPath(); 
           ctx.moveTo(25, 0); ctx.lineTo(15, -10); ctx.lineTo(5, 0); ctx.lineTo(15, 10);
           ctx.fill();
           ctx.shadowBlur = 0;
        }
        ctx.restore();

      } else if (wIcon === 'staff') {
        ctx.save();
        
        let staffLen = 35;
        if (isUncommonW) staffLen = 40;
        if (isRareW) staffLen = 48;
        if (isEpicW) staffLen = 55;
        if (isLegendaryW) staffLen = 65;
        if (isMythicW) staffLen = 75;
        if (isUltraW) staffLen = 85;

        // Base rod
        ctx.fillStyle = (isRareW || isEpicW || isLegendaryW || isMythicW || isUltraW) ? '#0f172a' : '#451a03';
        ctx.fillRect(-10, -3, staffLen + 10, 6);
        
        // Rod wrap
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        for (let i = 0; i < staffLen; i += 10) {
           ctx.beginPath(); ctx.moveTo(i, -3); ctx.lineTo(i+5, 3); ctx.stroke();
        }

        ctx.translate(staffLen + 5, 0);
        ctx.fillStyle = wpColor;
        
        // Head / Crystal Design
        if (isCommonW) {
          ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0); ctx.fill();
          // Simple angular crescent
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.lineJoin = 'miter';
          ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(15, -10); ctx.lineTo(20, 0); ctx.lineTo(15, 10); ctx.lineTo(0, 15); ctx.stroke();
        }
        else if (isUncommonW) {
          // Sharp leaves/crystals
          ctx.fillStyle = '#22c55e';
          ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(12, 0); ctx.lineTo(0, 15); ctx.lineTo(-12, 0); ctx.fill();
          ctx.fillStyle = '#14532d';
          ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, -20); ctx.lineTo(25, -5); ctx.lineTo(15, -2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 20); ctx.lineTo(25, 5); ctx.lineTo(15, 2); ctx.fill();
        }
        else if (isRareW) {
          // Ice shards
          ctx.shadowBlur = 10; ctx.shadowColor = '#60a5fa';
          ctx.fillStyle = '#bfdbfe';
          ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(15, 0); ctx.lineTo(0, 18); ctx.lineTo(-15, 0); ctx.fill();
          ctx.fillStyle = '#2563eb';
          ctx.beginPath(); ctx.moveTo(-10, 25); ctx.lineTo(15, 10); ctx.lineTo(40, 25); ctx.lineTo(20, 0); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-10, -25); ctx.lineTo(15, -10); ctx.lineTo(40, -25); ctx.lineTo(20, 0); ctx.fill();
          ctx.shadowBlur = 0;
        }
        else if (isEpicW) {
          // Floating crystal & dark claws (polygonal)
          ctx.rotate(time * 0.002);
          ctx.shadowBlur = 15; ctx.shadowColor = '#d8b4fe';
          ctx.fillStyle = '#e9d5ff';
          ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(15, 0); ctx.lineTo(0, 22); ctx.lineTo(-15, 0); ctx.fill();
          ctx.rotate(-time * 0.002);

          ctx.fillStyle = '#581c87';
          // Top claw
          ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(15, -25); ctx.lineTo(35, -20); ctx.lineTo(20, -5); ctx.fill();
          // Bottom claw
          ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(15, 25); ctx.lineTo(35, 20); ctx.lineTo(20, 5); ctx.fill();
          ctx.shadowBlur = 0;
        }
        else if (isLegendaryW) {
          // Angular rings and huge gem
          ctx.rotate(time * 0.001);
          ctx.shadowBlur = 20; ctx.shadowColor = '#fde047';
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(18, 0); ctx.lineTo(0, 25); ctx.lineTo(-18, 0); ctx.fill();
          
          ctx.fillStyle = '#ca8a04';
          for (let i = 0; i < 4; i++) {
             ctx.beginPath(); ctx.moveTo(25, -5); ctx.lineTo(45, 0); ctx.lineTo(25, 5); ctx.fill();
             ctx.rotate(Math.PI/2);
          }
          ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 3; ctx.lineJoin = 'miter';
          ctx.beginPath();
          ctx.moveTo(30, 0); ctx.lineTo(21, 21); ctx.lineTo(0, 30); ctx.lineTo(-21, 21);
          ctx.lineTo(-30, 0); ctx.lineTo(-21, -21); ctx.lineTo(0, -30); ctx.lineTo(21, -21); ctx.closePath();
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        else if (isMythicW) {
          // Fiery twisting head -> Spiky fire
          ctx.shadowBlur = 25; ctx.shadowColor = '#ef4444';
          ctx.fillStyle = '#fca5a5';
          ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(20, 0); ctx.lineTo(0, 30); ctx.lineTo(-20, 0); ctx.fill();
          
          ctx.fillStyle = '#7f1d1d';
          for(let i=0; i<3; i++) {
             ctx.beginPath(); 
             ctx.moveTo(-15, 0); ctx.lineTo(20, -25); ctx.lineTo(45, 10); ctx.lineTo(35, 0); ctx.lineTo(10, 25); ctx.fill();
             ctx.rotate(Math.PI * 2 / 3);
          }
          // Extra floating red sparks -> angular sparks
          ctx.rotate(time * 0.005);
          ctx.fillStyle = '#ef4444';
          for (let i=0; i<6; i++) {
             ctx.beginPath(); ctx.moveTo(35, -4); ctx.lineTo(39, 0); ctx.lineTo(35, 4); ctx.lineTo(31, 0); ctx.fill();
             ctx.rotate(Math.PI / 3);
          }
          ctx.shadowBlur = 0;
        }
        else if (isUltraW) {
          // Rainbow floating orb with massive aura rings
          ctx.rotate(-time * 0.003);
          // Sparkle rings
          ctx.strokeStyle = 'rgba(236, 72, 153, 0.5)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(0, 0, 50, 20, 0, 0, Math.PI*2); ctx.stroke();
          ctx.rotate(Math.PI/3);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
          ctx.beginPath(); ctx.ellipse(0, 0, 50, 20, 0, 0, Math.PI*2); ctx.stroke();
          ctx.rotate(Math.PI/3);
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
          ctx.beginPath(); ctx.ellipse(0, 0, 50, 20, 0, 0, Math.PI*2); ctx.stroke();
          
          ctx.shadowBlur = 30; ctx.shadowColor = '#a855f7';
          // Multi-layer crystal
          const grad = ctx.createLinearGradient(-20, -35, 20, 35);
          grad.addColorStop(0, '#2dd4bf'); grad.addColorStop(0.5, '#a855f7'); grad.addColorStop(1, '#f43f5e');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.moveTo(0, -35); ctx.lineTo(25, 0); ctx.lineTo(0, 35); ctx.lineTo(-25, 0); ctx.fill();
          
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(10, 0); ctx.lineTo(0, 15); ctx.lineTo(-10, 0); ctx.fill();
          
          // Surrounding golden abstract shapes
          ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 4;
          for (let i=0; i<2; i++) {
             ctx.beginPath();
             ctx.moveTo(-30, -30); ctx.bezierCurveTo(20, -50, 50, 20, 30, 30); ctx.stroke();
             ctx.rotate(Math.PI);
          }
          ctx.shadowBlur = 0;
        }

        ctx.restore();
      } else {
        // Melee Blade (SWORD) - Custom per Rarity
        ctx.save();
        
        let bLen = 40;
        if (isUncommonW) bLen = 48;
        if (isRareW) bLen = 55;
        if (isEpicW) bLen = 65;
        if (isLegendaryW) bLen = 75;
        if (isMythicW) bLen = 88;
        if (isUltraW) bLen = 100;

        // --- Handle ---
        ctx.fillStyle = '#1e293b'; 
        if (isLegendaryW) ctx.fillStyle = '#b45309';
        if (isMythicW) ctx.fillStyle = '#450a0a';
        if (isUltraW) ctx.fillStyle = '#a855f7';
        // handle wrap
        ctx.fillRect(-22, -3, 22, 6);
        // Pommel
        ctx.fillStyle = wpColor;
        ctx.beginPath();
        if (isEpicW || isLegendaryW || isMythicW || isUltraW) {
          ctx.moveTo(-22, 0); ctx.lineTo(-27, -5); ctx.lineTo(-32, 0); ctx.lineTo(-27, 5); ctx.fill();
        } else {
          ctx.moveTo(-18, 0); ctx.lineTo(-22, -4); ctx.lineTo(-26, 0); ctx.lineTo(-22, 4); ctx.fill();
        }

        // --- Blade & Crossguard ---
        if (isCommonW) {
          // Gray blade, simple
          ctx.fillStyle = '#94a3b8';
          ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(bLen, 0); ctx.lineTo(0, 5); ctx.fill();
          // Crossguard
          ctx.fillStyle = '#64748b';
          ctx.beginPath(); ctx.moveTo(-5, -15); ctx.lineTo(5, -15); ctx.lineTo(5, 15); ctx.lineTo(-5, 15); ctx.fill();
        } 
        else if (isUncommonW) {
          // Green, wide base, simple guard
          ctx.fillStyle = '#4ade80';
          ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(15, -6); ctx.lineTo(bLen, 0); ctx.lineTo(15, 6); ctx.lineTo(0, 8); ctx.fill();
          // Inner core
          ctx.fillStyle = '#86efac';
          ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(bLen - 5, 0); ctx.lineTo(0, 4); ctx.fill();
          // Guard
          ctx.fillStyle = '#22c55e';
          ctx.beginPath(); ctx.moveTo(-5, -20); ctx.lineTo(5, -20); ctx.lineTo(8, -10); ctx.lineTo(8, 10); ctx.lineTo(5, 20); ctx.lineTo(-5, 20); ctx.fill();
        }
        else if (isRareW) {
          // Blue, complex guard, thicker blade
          const grad = ctx.createLinearGradient(0, 0, bLen, 0);
          grad.addColorStop(0, '#3b82f6'); grad.addColorStop(1, '#93c5fd');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(20, -10); ctx.lineTo(bLen, 0); ctx.lineTo(20, 10); ctx.lineTo(0, 10); ctx.fill();
          ctx.fillStyle = '#bfdbfe';
          ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(bLen - 8, 0); ctx.lineTo(0, 3); ctx.fill();
          // Guard
          ctx.fillStyle = '#2563eb';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, -25); ctx.lineTo(-5, -25); ctx.lineTo(-10, -15);
          ctx.lineTo(-10, 15); ctx.lineTo(-5, 25); ctx.lineTo(10, 25); ctx.fill();
        }
        else if (isEpicW) {
          // Purple, evil sharp guard, magical
          ctx.shadowBlur = 10; ctx.shadowColor = '#d8b4fe';
          const grad = ctx.createLinearGradient(0, 0, bLen, 0);
          grad.addColorStop(0, '#9333ea'); grad.addColorStop(1, '#f3e8ff');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(25, -12); ctx.lineTo(bLen, 0); ctx.lineTo(25, 12); ctx.lineTo(0, 12); ctx.fill();
          // Inner core
          ctx.fillStyle = '#e9d5ff';
          ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(bLen - 15, 0); ctx.lineTo(0, 4); ctx.fill();
          ctx.shadowBlur = 0;
          // Guard
          ctx.fillStyle = '#7e22ce';
          ctx.beginPath(); ctx.moveTo(0, 0); 
          ctx.lineTo(20, -25); ctx.lineTo(0, -35); ctx.lineTo(-5, -20);
          ctx.lineTo(-10, 0); ctx.lineTo(-5, 20); ctx.lineTo(0, 35);
          ctx.lineTo(20, 25); ctx.fill();
          // Gem
          ctx.fillStyle = '#f3e8ff'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0); ctx.fill();
        }
        else if (isLegendaryW) {
          // Gold, wide flared guard, glowing
          ctx.shadowBlur = 15; ctx.shadowColor = '#fde047';
          const grad = ctx.createLinearGradient(0, 0, bLen, 0);
          grad.addColorStop(0, '#ca8a04'); grad.addColorStop(0.5, '#fef08a'); grad.addColorStop(1, '#ffffff');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(30, -10); ctx.lineTo(bLen, 0); ctx.lineTo(30, 10); ctx.lineTo(0, 15); ctx.fill();
          ctx.shadowBlur = 0;
          // Guard
          ctx.fillStyle = '#eab308';
          ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(20, -35); ctx.lineTo(0, -30); ctx.lineTo(-10, -20);
          ctx.lineTo(-10, 20); ctx.lineTo(0, 30); ctx.lineTo(20, 35); ctx.fill();
          ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0); ctx.fill();
        }
        else if (isMythicW) {
          // Red/Fiery, serrated, dark core
          ctx.shadowBlur = 20; ctx.shadowColor = '#ef4444';
          const grad = ctx.createLinearGradient(0, -15, 0, 15);
          grad.addColorStop(0, '#f87171'); grad.addColorStop(0.5, '#450a0a'); grad.addColorStop(1, '#f87171');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.moveTo(0, -14); 
          for(let i=0; i<bLen-20; i+=15) { ctx.lineTo(i+8, -16); ctx.lineTo(i+15, -10); }
          ctx.lineTo(bLen, 0); 
          for(let i=bLen-20; i>=0; i-=15) { ctx.lineTo(i+8, 16); ctx.lineTo(i, 10); }
          ctx.fill();
          // Inner core bright red
          ctx.fillStyle = '#ef4444';
          ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(bLen-15, 0); ctx.lineTo(0, 2); ctx.fill();
          ctx.shadowBlur = 0;
          // Guard
          ctx.fillStyle = '#7f1d1d';
          ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(25, -40); ctx.lineTo(-5, -25); ctx.lineTo(-15, -15);
          ctx.lineTo(-15, 15); ctx.lineTo(-5, 25); ctx.lineTo(25, 40); ctx.fill();
          ctx.fillStyle = '#fca5a5'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0); ctx.fill();
        }
        else if (isUltraW) {
          // Ultra Rainbow sword, glowing white center
          // Sparkle aura rings
          ctx.save();
          ctx.rotate(-time * 0.002);
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(0, 40); ctx.lineTo(40, 0); ctx.lineTo(0, -40); ctx.closePath(); ctx.stroke();
          ctx.rotate(Math.PI/3);
          ctx.strokeStyle = 'rgba(45, 212, 191, 0.4)';
          ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(0, 15); ctx.lineTo(50, 0); ctx.lineTo(0, -15); ctx.closePath(); ctx.stroke();
          ctx.rotate(Math.PI/3);
          ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
          ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(0, 10); ctx.lineTo(60, 0); ctx.lineTo(0, -10); ctx.closePath(); ctx.stroke();
          ctx.restore();
          
          ctx.shadowBlur = 25; ctx.shadowColor = '#a855f7';
          // Outline layer
          ctx.fillStyle = '#c084fc'; // purple outer edge
          ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(35, -14); ctx.lineTo(bLen, 0); ctx.lineTo(35, 14); ctx.lineTo(0, 18); ctx.fill();
          // Inner rainbow layer
          const grad = ctx.createLinearGradient(0, 0, bLen, 0);
          grad.addColorStop(0, '#2dd4bf'); grad.addColorStop(0.3, '#3b82f6'); grad.addColorStop(0.6, '#a855f7'); grad.addColorStop(1, '#f43f5e');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(30, -10); ctx.lineTo(bLen-5, 0); ctx.lineTo(30, 10); ctx.lineTo(0, 12); ctx.fill();
          // Pure white core
          ctx.shadowColor = '#ffffff';
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(bLen-15, 0); ctx.lineTo(0, 4); ctx.fill();
          
          ctx.shadowBlur = 0;
          
          // Epic Guard
          ctx.fillStyle = '#5b21b6'; // dark purple
          ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(30, -45); ctx.lineTo(-10, -30); ctx.lineTo(-20, -15);
          ctx.lineTo(-20, 15); ctx.lineTo(-10, 30); ctx.lineTo(30, 45); ctx.fill();
          
          // Guard inner trim
          ctx.fillStyle = '#d8b4fe';
          ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(15, -30); ctx.lineTo(-5, -20); ctx.lineTo(-10, -10);
          ctx.lineTo(-10, 10); ctx.lineTo(-5, 20); ctx.lineTo(15, 30); ctx.fill();
          
          // Giant Gem
          ctx.shadowBlur = 10; ctx.shadowColor = '#2dd4bf';
          ctx.fillStyle = '#ccfbf1'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(12, 0); ctx.lineTo(0, 12); ctx.lineTo(-12, 0); ctx.fill();
          ctx.shadowBlur = 0;
        }
        
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore(); // End char rotated layer

    // 3. HUD LAYER (Name & HP)
    if (hp > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-22, -42, 44, 8);
      ctx.fillStyle = isMain ? '#10b981' : '#3b82f6';
      ctx.fillRect(-22, -42, (hp / maxHp) * 44, 8);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(-22, -42, 44, 8);
      
      ctx.font = 'bold 12px Cinzel';
      ctx.fillStyle = isMain ? '#fff' : '#fef3c7';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 4; ctx.shadowColor = 'black';
      ctx.fillText(`Lv.${level} ${nickname}`, 0, -48);
      ctx.shadowBlur = 0;
    } else {
      ctx.font = 'bold 14px Cinzel';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 4; ctx.shadowColor = 'black';
      ctx.fillText(`M.I.A.`, 0, -28);
      ctx.shadowBlur = 0;
    }

    ctx.restore(); // End translate
  };

  const draw = (state: any, time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { player, enemies, currentLocationId, locations, equipment } = state;
    const currentLocation = locations.find((l: any) => l.id === currentLocationId) || locations[0];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Scale for mobile to see more of the world
    const scaleFactor = canvas.width < 600 ? 0.65 : 1.0;
    
    const camX = player.x - (canvas.width / scaleFactor) / 2;
    const camY = player.y - (canvas.height / scaleFactor) / 2;

    ctx.save();
    ctx.scale(scaleFactor, scaleFactor);

    // Draw Background Pattern (Procedural)
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

    // Grid
    ctx.strokeStyle = '#1a1612';
    ctx.lineWidth = 1;
    const step = 100;
    const startX = Math.floor(camX / step) * step;
    const startY = Math.floor(camY / step) * step;
    for (let x = startX; x < camX + canvas.width + step; x += step) {
      ctx.beginPath(); ctx.moveTo(x, camY); ctx.lineTo(x, camY + canvas.height); ctx.stroke();
    }
    for (let y = startY; y < camY + canvas.height + step; y += step) {
      ctx.beginPath(); ctx.moveTo(camX, y); ctx.lineTo(camX + canvas.width, y); ctx.stroke();
    }

    // Environment items
    if (state.locations.find((l:any) => l.id === currentLocationId)?.groundTheme === 'dungeon_corridor') {
       ctx.fillStyle = '#05020a';
       // top wall
       ctx.fillRect(0, -1000, 9000, 1200); // 1200 high chunk above y=200
       // bottom wall
       ctx.fillRect(0, 800, 9000, 1200); // chunk below y=800

       // draw chest if present
       if (state.dungeonState.bossDefeated && !state.dungeonState.chestOpened) {
          ctx.font = '30px Arial';
          ctx.fillText('🎁', 7500 - 15, 500 + 10);
       }
    }

    // Enemies
    enemies.forEach((enemy: any) => {
      const isBoss = enemy.type === 'boss';
      const radius = isBoss ? 45 : 15;
      
      // Target highlight
      if (state.currentTargetId === enemy.id) {
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y, radius + 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.stroke();
      }

      ctx.fillStyle = isBoss ? '#991b1b' : '#b83333';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isBoss ? '#f59e0b' : '#4a1111';
      ctx.lineWidth = isBoss ? 4 : 2;
      ctx.stroke();

      // HP Bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(enemy.x - radius, enemy.y - radius - 10, radius * 2, 5);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(enemy.x - radius, enemy.y - radius - 10, (enemy.hp / enemy.maxHp) * (radius * 2), 5);
    });

    // Online Players
    state.onlinePlayers?.forEach((p: any) => {
      const interp = onlinePlayersCache.current.get(p.id);
      const drawX = interp?.x ?? p.x;
      const drawY = interp?.y ?? p.y;
      const drawR = interp?.r ?? p.rotation;

      // Target highlight
      if (state.currentTargetId === 'player_' + p.id) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, 35, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.stroke();
      }
      
      const pSkin = p.skinColor || '#e5c298';

      drawCharacter(
        ctx,
        drawX,
        drawY,
        drawR || 0,
        p.hp,
        p.maxHp,
        p.equipment,
        p.aura,
        p.nickname,
        p.level,
        false,
        pSkin,
        time
      );

      // Render their attack effect if exists
      if (interp?.effect) {
         ctx.save();
         ctx.translate(drawX, drawY);
         if (interp.effect.type === 'melee') {
            ctx.rotate(interp.effect.angle);
            const pr = interp.effect.progress;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 220, 100, ${Math.max(0, 1.0 - pr)})`;
            ctx.lineWidth = 15 * (1 - pr);
            ctx.arc(0, 0, 60, -0.8 + 1.2 * pr, -0.4 + 1.2 * pr);
            ctx.stroke();

            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 50, 50, ${Math.max(0, 0.5 - pr * 0.5)})`;
            ctx.lineWidth = 30 * (1 - pr);
            ctx.arc(0, 0, 70, -0.8 + 1.2 * pr, -0.2 + 1.2 * pr);
            ctx.stroke();
         } else {
            const pr = interp.effect.progress;
            ctx.beginPath();
            ctx.arc(0, 0, 30 + pr * 30, 0, Math.PI * 2);
            ctx.fillStyle = interp.effect.type === 'magic' ? `rgba(139, 92, 246, ${1 - pr})` : `rgba(250, 204, 21, ${1 - pr})`;
            ctx.fill();
         }
         ctx.restore();
      }

    });

    // Player
    // Calculate facing angle based on movement
    const currentVelocity = velocity.current || { x: 0, y: 0 };
    const facingAngle = currentVelocity.x !== 0 || currentVelocity.y !== 0 
      ? Math.atan2(currentVelocity.y, currentVelocity.x) 
      : rotationRef.current;
    
    rotationRef.current = facingAngle;

    drawCharacter(
      ctx,
      player.x,
      player.y,
      facingAngle,
      player.hp,
      player.maxHp,
      state.equipment,
      state.equipment.aura,
      state.user.email?.split('@')[0] || state.user.uid,
      player.level,
      true,
      player.skinColor || '#e5c298',
      time
    );

    // Player Aura (Combat indicator - just a subtle ring for main player)
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.1)';
    ctx.beginPath();
    ctx.arc(player.x, player.y, ATTACK_RANGE, 0, Math.PI * 2);
    ctx.stroke();

    // Attack Effects (Aura, Flashes, Swing)
    if (attackEffect.current) {
      ctx.save();
      ctx.translate(player.x, player.y);
      if (attackEffect.current!.type === 'melee') {
        ctx.rotate(attackEffect.current!.angle);
        const p = attackEffect.current!.progress;
        
        ctx.beginPath();
        // Inner bright arc
        ctx.strokeStyle = `rgba(255, 220, 100, ${Math.max(0, 1.0 - p)})`;
        ctx.lineWidth = 15 * (1 - p);
        ctx.arc(0, 0, 60, -0.8 + 1.2 * p, -0.4 + 1.2 * p);
        ctx.stroke();

        ctx.beginPath();
        // Outer glow arc
        ctx.strokeStyle = `rgba(255, 50, 50, ${Math.max(0, 0.5 - p * 0.5)})`;
        ctx.lineWidth = 30 * (1 - p);
        ctx.arc(0, 0, 70, -0.8 + 1.2 * p, -0.2 + 1.2 * p);
        ctx.stroke();
      } else {
        // Cast or Release effect for staff/bow
        const p = attackEffect.current!.progress;
        ctx.beginPath();
        ctx.arc(0, 0, 30 + p * 30, 0, Math.PI * 2);
        ctx.fillStyle = attackEffect.current!.type === 'magic' ? `rgba(139, 92, 246, ${1 - p})` : `rgba(250, 204, 21, ${1 - p})`;
        ctx.fill();
      }
      ctx.restore();
    }

    // Player Aura (Combat indicator)
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.1)';
    ctx.beginPath();
    ctx.arc(player.x, player.y, ATTACK_RANGE, 0, Math.PI * 2);
    ctx.stroke();

    // Floating Text
    ctx.font = 'bold 16px Spectral';
    ctx.textAlign = 'center';
    floatingTexts.current.forEach(t => {
      ctx.globalAlpha = t.life;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y - (1.0 - t.life) * 50);
    });
    ctx.globalAlpha = 1.0;
    
    // Projectiles
    projectiles.current.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      const angle = Math.atan2(p.targetY - p.startY, p.targetX - p.startX);
      ctx.rotate(angle);
      
      if (p.type === 'arrow') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-15, 0);
        ctx.lineTo(15, 0);
        ctx.moveTo(5, -5);
        ctx.lineTo(15, 0);
        ctx.lineTo(5, 5);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
      ctx.restore();
    });
    
    // Particles
    particles.current.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

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

    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []); // Remove velocity dependency

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

    // Check enemies
    for (const en of state.enemies) {
      const dist = Math.hypot(en.x - worldX, en.y - worldY);
      const radius = en.type === 'boss' ? 45 : 25; // slightly larger hit area
      if (dist <= radius + 15) {
        state.setCurrentTargetId(en.id);
        targetFound = true;
        break;
      }
    }

    if (!targetFound) {
      // Check online players
      for (const p of state.onlinePlayers || []) {
        if (p.hp <= 0) continue;
        const dist = Math.hypot(p.x - worldX, p.y - worldY);
        // players radius is around 20 for body + buffer
        if (dist <= 35) {
          state.setCurrentTargetId('player_' + p.id);
          targetFound = true;
          break;
        }
      }
    }

    if (!targetFound) {
      state.setCurrentTargetId(null);
    }
  };

  return (
    <canvas 
      ref={canvasRef}
      className="block w-full h-full cursor-crosshair touch-none"
      onPointerDown={handlePointerDown}
    />
  );
});
GameEngine.displayName = 'GameEngine';
