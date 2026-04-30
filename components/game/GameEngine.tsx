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
  const lastEnemyAttackTime = useRef<number>(0);
  const lastRespawnTime = useRef<number>(0);
  const lastBuffUpdateTime = useRef<number>(0);
  const lastRegenTime = useRef<number>(0);
  const lastAuraTickTime = useRef<number>(0);
  const floatingTexts = useRef<FloatingText[]>([]);
  const particles = useRef<Particle[]>([]);
  const projectiles = useRef<Projectile[]>([]);
  const attackEffect = useRef<{ angle: number, progress: number, type: 'melee' | 'ranged' | 'magic' } | null>(null);

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
          players.push({
            id: d.id,
            x: data.x,
            y: data.y,
            hp: data.hp,
            maxHp: data.maxHp,
            level: data.level,
            nickname: data.nickname,
            equipment: data.equipment,
            aura: data.aura
          });
        }
      });
      useGameStore.setState({ onlinePlayers: players });
    }, (error) => {
        console.error('Multiplayer sync error', error);
    });

    // Write player position every 300 ms
    const interval = setInterval(() => {
      const currentState = useGameStore.getState();
      if (!currentState.user) return;
      try {
        setDoc(doc(db, 'worldPlayers', currentState.user.uid), {
          locationId: currentState.currentLocationId,
          x: currentState.player.x,
          y: currentState.player.y,
          hp: currentState.player.hp,
          maxHp: currentState.player.maxHp,
          level: currentState.player.level,
          nickname: currentState.user.email?.split('@')[0] || currentState.user.uid,
          equipment: {
            weapon: currentState.equipment?.weapon ? { icon: currentState.equipment.weapon.icon, rarity: currentState.equipment.weapon.rarity } : null,
            armor: currentState.equipment?.armor ? { rarity: currentState.equipment.armor.rarity } : null,
            accessory: currentState.equipment?.accessory ? { icon: currentState.equipment.accessory.icon, rarity: currentState.equipment.accessory.rarity } : null,
          },
          aura: currentState.equipment?.aura ? { rarity: currentState.equipment.aura.rarity } : null,
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
  
    // 6. Logic Timers
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
           if (nearbyEnemies.length < 15) {
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
        if (nearbyEnemies.length < 15) {
            const spawnCount = nearbyEnemies.length < 5 ? 5 : 2; 
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

    draw(useGameStore.getState(), time);
    requestRef.current = requestAnimationFrame(update);
  };

  const draw = (state: any, time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { player, enemies, currentLocationId, locations, equipment } = state;
    const currentLocation = locations.find((l: any) => l.id === currentLocationId) || locations[0];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const camX = player.x - canvas.width / 2;
    const camY = player.y - canvas.height / 2;

    // Draw Background Pattern (Procedural)
    if (groundPattern.current) {
        ctx.save();
        ctx.translate(-camX % 512, -camY % 512);
        ctx.fillStyle = groundPattern.current;
        ctx.fillRect(-512, -512, canvas.width + 1024, canvas.height + 1024);
        ctx.restore();
    } else {
      ctx.fillStyle = currentLocation.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
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
      const radius = 20;

      // Target highlight
      if (state.currentTargetId === 'player_' + p.id) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius + 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.stroke();
      }

      // Draw online player body
      ctx.save();
      ctx.translate(p.x, p.y);

      // Aura
      if (p.aura) {
         const auraRadius = p.aura.rarity === 'ultra' ? 200 : p.aura.rarity === 'mythic' ? 150 : p.aura.rarity === 'legendary' ? 120 : p.aura.rarity === 'epic' ? 100 : 80;
         const auraColor = p.aura.color || '#3b82f6';
         ctx.beginPath();
         ctx.ellipse(0, 0, auraRadius, auraRadius * 0.5, 0, 0, Math.PI * 2);
         ctx.strokeStyle = auraColor + '40';
         ctx.lineWidth = 1;
         ctx.stroke();
      }

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(2, 2, radius, 0, Math.PI * 2);
      ctx.fill();

      // Body / Armor
      let bodyColor = '#e5c298';
      let objArmor = p.equipment?.armor;
      if (objArmor) {
         const rarity = objArmor.rarity;
         bodyColor = rarity === 'ultra' ? '#0f172a' : rarity === 'mythic' ? '#111' : rarity === 'legendary' ? '#fbbf24' : rarity === 'epic' ? '#c084fc' : '#64748b';
      }
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Simple Hand / Weapon
      let wp = p.equipment?.weapon;
      if (wp) {
         ctx.save();
         ctx.translate(15, 0); // Position of hand/weapon
         const rarity = wp.rarity;
         const isUltra = rarity === 'ultra';
         const isMythic = rarity === 'mythic';
         const isLegendary = rarity === 'legendary';
         let wpColor = '#cbd5e1';
         if (rarity === 'uncommon') wpColor = '#4ade80';
         if (rarity === 'rare') wpColor = '#60a5fa';
         if (rarity === 'epic') wpColor = '#7e22ce';
         if (isLegendary) wpColor = '#fbbf24';
         if (isMythic) wpColor = '#ef4444';
         if (isUltra) wpColor = '#2dd4bf';

         if (wp.icon === 'bow') {
            ctx.strokeStyle = wpColor;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 20, -Math.PI/2, Math.PI/2);
            ctx.stroke();
         } else if (wp.icon === 'staff') {
            ctx.fillStyle = '#78350f';
            ctx.fillRect(0, -2, 40, 4);
            ctx.fillStyle = wpColor;
            ctx.beginPath();
            ctx.arc(40, 0, 8, 0, Math.PI*2);
            ctx.fill();
         } else {
            ctx.fillStyle = wpColor;
            ctx.fillRect(0, -3, 50, 6);
         }
         ctx.restore();
      }

      ctx.restore();

      // HP Bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x - radius, p.y - radius - 15, radius * 2, 5);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(p.x - radius, p.y - radius - 15, (p.hp / p.maxHp) * (radius * 2), 5);

      // Name
      ctx.font = '12px Cinzel';
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.fillText(`Lv.${p.level} ${p.nickname}`, p.x, p.y - radius - 20);
    });

    // Player
    ctx.save();
    ctx.translate(player.x, player.y);

    const aura = state.equipment.aura;
    if (aura) {
       const auraRadius = aura.rarity === 'ultra' ? 200 : aura.rarity === 'mythic' ? 150 : aura.rarity === 'legendary' ? 120 : aura.rarity === 'epic' ? 100 : 80;
       const numAuras = aura.rarity === 'ultra' ? 4 : (aura.rarity === 'mythic' || aura.rarity === 'legendary') ? 3 : aura.rarity === 'epic' ? 2 : 1;
       const auraColor = aura.rarity === 'ultra' ? '#cfb53b' : aura.rarity === 'mythic' ? '#ef4444' : aura.rarity === 'legendary' ? '#f59e0b' : aura.rarity === 'epic' ? '#a855f7' : '#3b82f6';
       
       ctx.save();
       ctx.rotate(time * 0.002);
       for (let i = 0; i < numAuras; i++) {
          const angleOffset = (i / numAuras) * Math.PI * 2;
          const ax = Math.cos(angleOffset) * auraRadius;
          const ay = Math.sin(angleOffset) * Math.abs(auraRadius * 0.5); // oval orbit
          
          ctx.beginPath();
          ctx.arc(ax, ay, 6, 0, Math.PI * 2);
          ctx.fillStyle = auraColor;
          ctx.shadowColor = auraColor;
          ctx.shadowBlur = 10;
          ctx.fill();
       }
       ctx.restore();
       
       // Draw subtle radius ring
       ctx.beginPath();
       ctx.ellipse(0, 0, auraRadius, auraRadius * 0.5, 0, 0, Math.PI * 2);
       ctx.strokeStyle = auraColor + '40';
       ctx.lineWidth = 1;
       ctx.stroke();
    }
    
    // Calculate facing angle based on movement
    const currentVelocity = velocity.current || { x: 0, y: 0 };
    const facingAngle = currentVelocity.x !== 0 || currentVelocity.y !== 0 
      ? Math.atan2(currentVelocity.y, currentVelocity.x) 
      : 0;
    
    // --- DRAW BODY & HANDS ---
    ctx.save();
    ctx.rotate(facingAngle);
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(2, 2, 20, 0, Math.PI * 2);
    ctx.fill();

    // Hands (EvoWars style separate hands)
    const handX = 14;
    const handY = 12;
    ctx.fillStyle = player.skinColor || '#e5c298'; 
    ctx.strokeStyle = '#8a6d10';
    ctx.lineWidth = 2;
    
    // Left Hand
    ctx.beginPath();
    ctx.arc(handX, -handY, 6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    
    // Right Hand
    ctx.beginPath();
    ctx.arc(handX, handY, 6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Body
    ctx.fillStyle = player.skinColor || '#e5c298';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.stroke();

    // --- ARMOR RENDERING ---
    const armor = equipment.armor;
    if (armor) {
      const rarity = armor.rarity;
      const isUncommon = rarity === 'uncommon';
      const isRare = rarity === 'rare';
      const isEpic = rarity === 'epic';
      const isLegendary = rarity === 'legendary';
      const isMythic = rarity === 'mythic';
      const isUltra = rarity === 'ultra';

      // Wings for Mythic / Ultra
      if (isMythic || isUltra) {
        ctx.fillStyle = isUltra ? '#5b21b6' : '#991b1b';
        ctx.shadowBlur = isUltra ? 30 : 20;
        ctx.shadowColor = isUltra ? '#2dd4bf' : '#ff0000';
        
        ctx.beginPath();
        ctx.moveTo(-15, -15);
        ctx.bezierCurveTo(isUltra ? -70 : -50, isUltra ? -60 : -40, isUltra ? -80 : -60, isUltra ? 10 : 0, -15, -5);
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(-15, 15);
        ctx.bezierCurveTo(isUltra ? -70 : -50, isUltra ? 60 : 40, isUltra ? -80 : -60, isUltra ? -10 : 0, -15, 5);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Shoulder items (Uncommon+)
      if (isUncommon || isRare || isEpic || isLegendary || isMythic || isUltra) {
        ctx.fillStyle = isUltra ? '#2e1065' : isMythic ? '#111' : isLegendary ? '#fbbf24' : isEpic ? '#c084fc' : '#64748b';
        ctx.strokeStyle = isUltra ? '#2dd4bf' : isMythic ? '#ef4444' : '#1e293b';
        ctx.lineWidth = isUltra ? 3 : 2;
        
        const sSize = isUltra ? 18 : (isLegendary || isMythic) ? 14 : 10;
        
        // Left shoulder
        ctx.fillRect(-22, -18, sSize, sSize); ctx.strokeRect(-22, -18, sSize, sSize);
        // Right shoulder
        ctx.fillRect(-22, 10, sSize, sSize); ctx.strokeRect(-22, 10, sSize, sSize);

        if (isLegendary || isMythic || isUltra) {
          // Spikes for Legendary/Mythic/Ultra
          if (isMythic || isUltra) {
            ctx.fillStyle = isUltra ? '#2dd4bf' : '#ef4444';
            ctx.shadowBlur = Date.now() % 1000 < 500 ? (isUltra ? 25 : 15) : (isUltra ? 10 : 5); // Pulse
            ctx.shadowColor = isUltra ? '#8b5cf6' : '#ff0000';
          }
          
          ctx.beginPath();
          ctx.moveTo(-22, -18); ctx.lineTo(isUltra ? -45 : -35, -28); ctx.lineTo(-12, -18); ctx.fill();
          if (isUltra) {
            ctx.beginPath();
            ctx.moveTo(-22, -22); ctx.lineTo(-40, -10); ctx.lineTo(-12, -22); ctx.fill();
          }

          ctx.beginPath();
          ctx.moveTo(-22, 18); ctx.lineTo(isUltra ? -45 : -35, 28); ctx.lineTo(-12, 18); ctx.fill();
          if (isUltra) {
            ctx.beginPath();
            ctx.moveTo(-22, 22); ctx.lineTo(-40, 10); ctx.lineTo(-12, 22); ctx.fill();
          }
          
          // Neon gems
          ctx.fillStyle = isUltra ? '#8b5cf6' : isMythic ? '#ff0000' : '#fef3c7';
          ctx.shadowBlur = isUltra ? 15 : 10;
          ctx.shadowColor = isUltra ? '#2dd4bf' : isMythic ? '#ff0000' : '#fbbf24';
          ctx.fillRect(-18, -14, isUltra ? 6 : 4, isUltra ? 6 : 4);
          ctx.fillRect(-18, 14, isUltra ? 6 : 4, isUltra ? 6 : 4);
          ctx.shadowBlur = 0;
        }
      }

      // Helmet (Epic+)
      if (isEpic || isLegendary || isMythic || isUltra) {
        ctx.fillStyle = isUltra ? '#0f172a' : isMythic ? '#000' : isLegendary ? '#1a1a1a' : '#334155';
        ctx.strokeStyle = isUltra ? '#8b5cf6' : isMythic ? '#ef4444' : '#475569';
        ctx.lineWidth = isUltra ? 3 : 2;
        ctx.beginPath();
        ctx.arc(5, 0, isUltra ? 18 : 15, -Math.PI * (isUltra ? 0.8 : 0.7), Math.PI * (isUltra ? 0.8 : 0.7));
        ctx.fill();
        ctx.stroke();
        
        // Visor glow
        ctx.fillStyle = isUltra ? '#2dd4bf' : isMythic ? '#ff0000' : isLegendary ? '#fbbf24' : '#60a5fa';
        ctx.shadowBlur = (isLegendary || isMythic || isUltra) ? 15 : 5;
        if (isMythic) ctx.shadowBlur = 20 + Math.sin(Date.now() / 100) * 10;
        if (isUltra) ctx.shadowBlur = 30 + Math.sin(Date.now() / 100) * 15;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(10, -8, isUltra ? 4 : 3, 16);
        ctx.shadowBlur = 0;
      }

      // Gloves (Common+)
      ctx.fillStyle = isUltra ? '#1e1b4b' : isMythic ? '#111' : isLegendary ? '#fbbf24' : isEpic ? '#c084fc' : isRare ? '#3b82f6' : '#64748b';
      // Left Hand
      ctx.beginPath(); ctx.arc(15, -20, isUltra ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = isUltra ? '#8b5cf6' : isMythic ? '#ef4444' : '#000'; ctx.stroke();
      // Right Hand
      ctx.beginPath(); ctx.arc(15, 20, isUltra ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = isUltra ? '#8b5cf6' : isMythic ? '#ef4444' : '#000'; ctx.stroke();
      
      if (isLegendary || isMythic || isUltra) {
        // Glowing gems on hands
        ctx.fillStyle = isUltra ? '#2dd4bf' : isMythic ? '#ff0000' : '#ffffff';
        ctx.shadowBlur = isUltra ? 12 : 8;
        ctx.shadowColor = isUltra ? '#2dd4bf' : isMythic ? '#ff0000' : '#fbbf24';
        ctx.fillRect(13, -22, isUltra ? 6 : 4, isUltra ? 6 : 4);
        ctx.fillRect(13, 18, isUltra ? 6 : 4, isUltra ? 6 : 4);
        ctx.shadowBlur = 0;
      }
    } else {
      // Default Hands if no armor
      ctx.fillStyle = player.skinColor || '#e5c298';
      ctx.beginPath(); ctx.arc(15, -20, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(15, 20, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Inner detail (tunic/armor circle)
    ctx.fillStyle = (armor && armor.rarity === 'ultra') ? '#8b5cf6' : '#d4af37';
    ctx.beginPath();
    ctx.arc(0, 0, (armor && armor.rarity === 'ultra') ? 14 : 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // --- DRAW WEAPON ---
    const weaponAngle = attackEffect.current ? attackEffect.current.angle : facingAngle;
    ctx.save();
    ctx.rotate(weaponAngle);
    
    const isAttacking = attackEffect.current !== null;
    const swingProgress = attackEffect.current?.progress || 0;
    const swingOffset = isAttacking ? (Math.sin(swingProgress * Math.PI) * 0.8) - 0.4 : 0;
    
    ctx.rotate(swingOffset);

    // Dynamic Weapon Model based on equipment
    const equippedWeapon = useGameStore.getState().equipment.weapon;
    const wName = (equippedWeapon?.name || '').toLowerCase();
    const isWIconBow = equippedWeapon?.icon === 'bow' || wName.includes('лук');
    const isWIconStaff = equippedWeapon?.icon === 'staff' || wName.includes('посох');
    const weaponIcon = isWIconBow ? 'bow' : isWIconStaff ? 'staff' : (equippedWeapon?.icon || 'sword');
    const rarity = equippedWeapon?.rarity || 'common';

    const drawWeapon = () => {
      const isUltra = rarity === 'ultra';
      const isMythic = rarity === 'mythic';
      const isLegendary = rarity === 'legendary';
      const isEpic = rarity === 'epic';
      const isRare = rarity === 'rare';
      const isUncommon = rarity === 'uncommon';

      ctx.save();
      
      // Glow Effects for high tiers
      if (isUltra) {
        ctx.shadowBlur = 30 + Math.sin(Date.now() / 150) * 15;
        ctx.shadowColor = '#2dd4bf'; // Cyan/teal glow for ultra
      } else if (isMythic) {
        ctx.shadowBlur = 25 + Math.sin(Date.now() / 150) * 10;
        ctx.shadowColor = '#ff0000';
      } else if (isLegendary) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#fbbf24';
      } else if (isEpic) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#c084fc';
      } else if (isRare) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#60a5fa';
      }

      if (weaponIcon === 'bow') {
        // --- EVOLVED BOW DESIGN ---
        let bowColor = '#8b4513';
        let bowSize = 30;
        if (isUncommon) bowColor = '#4ade80';
        if (isRare) { bowColor = '#60a5fa'; bowSize = 35; }
        if (isEpic) { bowColor = '#c084fc'; bowSize = 40; }
        if (isLegendary) { bowColor = '#fbbf24'; bowSize = 45; }
        if (isMythic) { bowColor = '#ef4444'; bowSize = 55; }
        if (isUltra) { bowColor = '#2dd4bf'; bowSize = 65; }

        ctx.strokeStyle = bowColor;
        ctx.lineWidth = (isLegendary || isMythic || isUltra) ? 6 : 4;
        
        // Complex Bow Shape
        ctx.beginPath();
        if (isLegendary || isEpic || isMythic || isUltra) {
          // Double recurve bow
          ctx.moveTo(15, -bowSize);
          ctx.bezierCurveTo(45, -bowSize, 45, -10, 15, 0);
          ctx.bezierCurveTo(45, 10, 45, bowSize, 15, bowSize);
        } else {
          ctx.arc(15, 0, bowSize, -Math.PI/2, Math.PI/2);
        }
        ctx.stroke();

        // Decorative elements
        if (isLegendary || isMythic || isUltra) {
          ctx.fillStyle = isUltra ? '#8b5cf6' : isMythic ? '#000' : '#fef3c7';
          ctx.beginPath(); ctx.arc(40, 0, isUltra ? 6 : 4, 0, Math.PI*2); ctx.fill(); // Core gem
        }

        // String
        ctx.strokeStyle = isUltra ? 'rgba(45, 212, 191, 0.8)' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = isUltra ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(15, -bowSize);
        ctx.lineTo(15, bowSize);
        ctx.stroke();
      } else if (weaponIcon === 'staff') {
        // --- EVOLVED STAFF DESIGN ---
        let staffColor = '#78350f';
        let gemColor = '#3b82f6';
        if (isUncommon) gemColor = '#22c55e';
        if (isRare) gemColor = '#3b82f6';
        if (isEpic) gemColor = '#a855f7';
        if (isLegendary) { gemColor = '#fbbf24'; staffColor = '#451a03'; }
        if (isMythic) { gemColor = '#ff0000'; staffColor = '#000'; }
        if (isUltra) { gemColor = '#8b5cf6'; staffColor = '#111827'; }

        // Staff Body
        ctx.fillStyle = staffColor;
        ctx.fillRect(0, -3, isUltra ? 100 : 80, 6);
        if (isMythic || isUltra) {
          ctx.strokeStyle = isUltra ? '#2dd4bf' : '#ef4444';
          ctx.lineWidth = 1;
          ctx.strokeRect(0, -3, isUltra ? 100 : 80, 6);
        }

        // Staff Head
        ctx.save();
        ctx.translate(isUltra ? 105 : 85, 0);
        ctx.strokeStyle = isUltra ? '#2dd4bf' : isMythic ? '#ef4444' : staffColor;
        ctx.lineWidth = (isMythic || isUltra) ? 6 : 4;
        ctx.beginPath();
        ctx.arc(0, 0, isUltra ? 20 : 15, -Math.PI, Math.PI);
        if (isMythic || isUltra) {
          // Spikes on staff head
          for(let i=0; i<8; i++) {
            ctx.rotate(Math.PI/4);
            ctx.moveTo(isUltra ? 20 : 15, 0); ctx.lineTo(isUltra ? 35 : 25, 0);
          }
        }
        ctx.stroke();

        // Glow Gem
        ctx.shadowBlur = isUltra ? 40 : isMythic ? 30 : isLegendary ? 20 : 10;
        ctx.shadowColor = gemColor;
        ctx.fillStyle = gemColor;
        ctx.beginPath();
        ctx.moveTo(0, isUltra ? -15 : -10);
        ctx.lineTo(isUltra ? 12 : 8, 0);
        ctx.lineTo(0, isUltra ? 15 : 10);
        ctx.lineTo(isUltra ? -12 : -8, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        // --- EVOLVED MELEE DESIGN ---
        let bladeLength = 70;
        let bladeWidth = 4;
        let bladeColor = '#cbd5e1';

        if (isUncommon) { bladeColor = '#4ade80'; bladeLength = 75; }
        if (isRare) { bladeColor = '#60a5fa'; bladeLength = 85; bladeWidth = 6; }
        if (isEpic) { bladeColor = '#7e22ce'; bladeLength = 95; bladeWidth = 8; }
        if (isLegendary) { bladeColor = '#fbbf24'; bladeLength = 110; bladeWidth = 10; }
        if (isMythic) { bladeColor = '#ef4444'; bladeLength = 130; bladeWidth = 12; }
        if (isUltra) { bladeColor = '#2dd4bf'; bladeLength = 160; bladeWidth = 14; }

        // Gradient for Blade
        const grad = ctx.createLinearGradient(15, 0, 15 + bladeLength, 0);
        grad.addColorStop(0, isUltra ? '#4c1d95' : isMythic ? '#1a0000' : '#475569');
        grad.addColorStop(0.2, bladeColor);
        grad.addColorStop(1, isUltra ? '#8b5cf6' : isMythic ? '#ff0000' : '#ffffff');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(15, -bladeWidth);
        
        if (isEpic || isLegendary || isMythic || isUltra) {
          // Serrated/Fantasy Edge
          for(let i=0; i<bladeLength-10; i+=10) {
            ctx.lineTo(15 + i + 5, -bladeWidth - ((i%20===0 || ((isMythic || isUltra) && i%10===0)) ? ((isMythic || isUltra) ? 8 : 4) : 0));
            ctx.lineTo(15 + i + 10, -bladeWidth);
          }
        } else {
          ctx.lineTo(15 + bladeLength - 10, -bladeWidth);
        }
        
        ctx.lineTo(15 + bladeLength, 0); // Tip
        
        if (isEpic || isLegendary || isMythic || isUltra) {
          for(let i=bladeLength-10; i>=0; i-=10) {
            ctx.lineTo(15 + i + 5, bladeWidth + ((i%20===0 || ((isMythic || isUltra) && i%10===0)) ? ((isMythic || isUltra) ? 8 : 4) : 0));
            ctx.lineTo(15 + i, bladeWidth);
          }
        } else {
          ctx.lineTo(15 + bladeLength - 10, bladeWidth);
        }
        
        ctx.lineTo(15, bladeWidth);
        ctx.closePath();
        ctx.fill();

        // Crossguard - grows with rarity
        ctx.fillStyle = isUltra ? '#5b21b6' : isMythic ? '#000' : isLegendary ? '#d97706' : '#1e293b';
        ctx.strokeStyle = isUltra ? '#2dd4bf' : isMythic ? '#ff0000' : 'transparent';
        const guardSize = 10 + (isRare ? 10 : isEpic ? 20 : isLegendary ? 30 : isMythic ? 45 : isUltra ? 60 : 0);
        ctx.fillRect(15, -guardSize/2, isUltra ? 8 : 6, guardSize);
        if (isMythic || isUltra) ctx.strokeRect(15, -guardSize/2, isUltra ? 8 : 6, guardSize);
        
        // Hilt
        ctx.fillStyle = isUltra ? '#2e1065' : isMythic ? '#111' : '#334155';
        ctx.fillRect(0, -3, 15, 6);
        // Pommel
        ctx.fillStyle = isUltra ? '#2dd4bf' : isMythic ? '#ff0000' : isLegendary ? '#fbbf24' : '#475569';
        ctx.beginPath(); ctx.arc(0, 0, isUltra ? 10 : isMythic ? 7 : 5, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    };

    drawWeapon();
    ctx.restore();

    // Attack Effects (Aura, Flashes, Swing)
    if (isAttacking) {
      if (attackEffect.current!.type === 'melee') {
        ctx.save();
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
        ctx.restore();
      } else {
        // Cast or Release effect for staff/bow
        ctx.save();
        const p = attackEffect.current!.progress;
        ctx.beginPath();
        ctx.arc(0, 0, 30 + p * 30, 0, Math.PI * 2);
        ctx.fillStyle = attackEffect.current!.type === 'magic' ? `rgba(139, 92, 246, ${1 - p})` : `rgba(250, 204, 21, ${1 - p})`;
        ctx.fill();
        ctx.restore();
      }
    }
    
    ctx.restore();

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
    const camX = state.player.x - canvas.width / 2;
    const camY = state.player.y - canvas.height / 2;

    const worldX = clickX + camX;
    const worldY = clickY + camY;

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
