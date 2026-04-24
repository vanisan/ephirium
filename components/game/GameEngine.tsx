'use client'

import React, { useRef, useEffect } from 'react';
import { useGameStore, Enemy } from '@/lib/store';

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

export const GameEngine: React.FC<GameEngineProps> = React.memo(({ velocity }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastAttackTime = useRef<number>(0);
  const lastEnemyAttackTime = useRef<number>(0);
  const lastRespawnTime = useRef<number>(0);
  const floatingTexts = useRef<FloatingText[]>([]);
  const attackEffect = useRef<{ angle: number, progress: number } | null>(null);

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

  const update = (time: number) => {
    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    const state = useGameStore.getState();
    const { player, enemies, isAutoBattle, updatePlayerPos, damageEnemy, spawnEnemy, damagePlayer, gainExp } = state;

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

    if (isAutoBattle) {
      const weapon = state.equipment.weapon;
      const isBow = weapon?.icon === 'bow';
      const isStaff = weapon?.icon === 'staff';
      const dynamicAttackRange = isBow ? 350 : isStaff ? 225 : ATTACK_RANGE;

      const nearestEnemy = enemies.reduce((prev: Enemy | null, current: Enemy) => {
        const distCurrent = Math.hypot(current.x - player.x, current.y - player.y);
        const distPrev = prev ? Math.hypot(prev.x - player.x, prev.y - player.y) : Infinity;
        return distCurrent < distPrev ? current : prev;
      }, null);

      if (nearestEnemy) {
        const dist = Math.hypot(nearestEnemy.x - player.x, nearestEnemy.y - player.y);
        
        if (dist < dynamicAttackRange) {
          // Attack
          if (time - lastAttackTime.current > 1000 / player.stats.atkSpeed) {
            let finalDmg = player.stats.damage;
            let isCrit = false;

            if (isBow) {
              // Bow: 30% double damage
              if (Math.random() < 0.3) {
                finalDmg *= 2;
                isCrit = true;
              }
            }

            damageEnemy(nearestEnemy.id, finalDmg);

            // Staff: 15% Vampirism
            if (isStaff) {
              const heal = Math.floor(finalDmg * 0.15);
              if (heal > 0) {
                state.healPlayer(heal);
              }
            }
            
            // Melee: AOE 25% damage to nearby
            if (!isBow && !isStaff) {
              const AOE_RADIUS = 100;
              enemies.forEach(e => {
                if (e.id !== nearestEnemy.id) {
                  const d = Math.hypot(e.x - nearestEnemy.x, e.y - nearestEnemy.y);
                  if (d < AOE_RADIUS) {
                    damageEnemy(e.id, Math.floor(finalDmg * 0.25));
                  }
                }
              });
            }

            lastAttackTime.current = time;
            
            // Trigger swing animation
            const angle = Math.atan2(nearestEnemy.y - player.y, nearestEnemy.x - player.x);
            attackEffect.current = { angle, progress: 0 };

            // Add floating text
            floatingTexts.current.push({
              id: Math.random().toString(),
              x: nearestEnemy.x,
              y: nearestEnemy.y - 20,
              text: isCrit ? `КРИТ -${finalDmg}` : `-${finalDmg}`,
              color: isCrit ? '#fbbf24' : '#facc15',
              life: 1.0
            });
            
            if (nearestEnemy.hp <= finalDmg) {
              gainExp(25);
            }
          }
        } else if (dist < ENEMY_DETECTION_RANGE && (velocity.current?.x || 0) === 0 && (velocity.current?.y || 0) === 0) {
          // Auto-move towards enemy if not controlled manually
          const angle = Math.atan2(nearestEnemy.y - player.y, nearestEnemy.x - player.x);
          newX += Math.cos(angle) * (PLAYER_SPEED * 0.7);
          newY += Math.sin(angle) * (PLAYER_SPEED * 0.7);
        }
      }
    }

    updatePlayerPos(newX, newY);

    // 3. Enemy Logic
    enemies.forEach(enemy => {
      const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (dist < 40) {
        if (time - lastEnemyAttackTime.current > 1500) {
          const dmg = Math.max(1, 5 + enemy.level * 2 - player.stats.defense / 5);
          damagePlayer(dmg);
          lastEnemyAttackTime.current = time;
          
          floatingTexts.current.push({
            id: Math.random().toString(),
            x: player.x,
            y: player.y - 20,
            text: `-${Math.round(dmg)}`,
            color: '#ef4444',
            life: 1.0
          });
        }
      } else if (dist < 300) {
        // Simple AI: Move towards player
        const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        enemy.x += Math.cos(angle) * 1.5;
        enemy.y += Math.sin(angle) * 1.5;
      }
    });

    // 4. Update Animations
    if (attackEffect.current) {
      attackEffect.current.progress += 0.15;
      if (attackEffect.current.progress >= 1.0) {
        attackEffect.current = null;
      }
    }

    // 5. Update Floating Texts
    floatingTexts.current.forEach(t => t.life -= 0.02);
    floatingTexts.current = floatingTexts.current.filter(t => t.life > 0);

    // 6. Respawn Logic (Every 10 seconds)
    const timeSinceLastSpawn = time - lastRespawnTime.current;
    if (timeSinceLastSpawn > 10000) { // 10 seconds
      const location = state.locations.find(l => l.id === state.currentLocationId) || state.locations[0];
      if (enemies.length < 32) {
        const spawnCount = 5; 
        for (let i = 0; i < spawnCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 500 + Math.random() * 400;
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
      lastRespawnTime.current = time;
    }

    draw(state);
    requestRef.current = requestAnimationFrame(update);
  };

  const draw = (state: any) => {
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

    // Enemies
    enemies.forEach((enemy: any) => {
      ctx.fillStyle = '#b83333';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4a1111';
      ctx.lineWidth = 2;
      ctx.stroke();

      // HP Bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(enemy.x - 15, enemy.y - 25, 30, 3);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(enemy.x - 15, enemy.y - 25, (enemy.hp / enemy.maxHp) * 30, 3);
    });

    // Player
    ctx.save();
    ctx.translate(player.x, player.y);
    
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

      // Shoulder items (Uncommon+)
      if (isUncommon || isRare || isEpic || isLegendary) {
        ctx.fillStyle = isLegendary ? '#fbbf24' : isEpic ? '#c084fc' : '#64748b';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        
        const sSize = isLegendary ? 14 : 10;
        
        // Left shoulder
        ctx.fillRect(-22, -18, sSize, sSize); ctx.strokeRect(-22, -18, sSize, sSize);
        // Right shoulder
        ctx.fillRect(-22, 10, sSize, sSize); ctx.strokeRect(-22, 10, sSize, sSize);

        if (isLegendary) {
          // Spikes for Legendary
          ctx.beginPath();
          ctx.moveTo(-22, -18); ctx.lineTo(-35, -28); ctx.lineTo(-12, -18); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-22, 18); ctx.lineTo(-35, 28); ctx.lineTo(-12, 18); ctx.fill();
          
          // Neon gems
          ctx.fillStyle = '#fef3c7';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#fbbf24';
          ctx.fillRect(-18, -14, 4, 4);
          ctx.fillRect(-18, 14, 4, 4);
          ctx.shadowBlur = 0;
        }
      }

      // Helmet (Epic+)
      if (isEpic || isLegendary) {
        ctx.fillStyle = isLegendary ? '#1a1a1a' : '#334155';
        ctx.beginPath();
        ctx.arc(5, 0, 15, -Math.PI * 0.7, Math.PI * 0.7);
        ctx.fill();
        ctx.stroke();
        
        // Visor glow
        ctx.fillStyle = isLegendary ? '#fbbf24' : '#60a5fa';
        ctx.shadowBlur = isLegendary ? 15 : 5;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(10, -8, 3, 16);
        ctx.shadowBlur = 0;
      }

      // Gloves (Common+) - added as part of armor visuals
      ctx.fillStyle = isLegendary ? '#fbbf24' : isEpic ? '#c084fc' : isRare ? '#3b82f6' : '#64748b';
      // Left Hand
      ctx.beginPath(); ctx.arc(15, -20, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Right Hand
      ctx.beginPath(); ctx.arc(15, 20, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      
      if (isLegendary) {
        // Glowing gems on hands
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#fbbf24';
        ctx.fillRect(13, -22, 4, 4);
        ctx.fillRect(13, 18, 4, 4);
        ctx.shadowBlur = 0;
      }
    } else {
      // Default Hands if no armor
      ctx.fillStyle = player.skinColor || '#e5c298';
      ctx.beginPath(); ctx.arc(15, -20, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(15, 20, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Inner detail (tunic/armor circle)
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
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
    const weaponIcon = equippedWeapon?.icon || 'sword';
    const rarity = equippedWeapon?.rarity || 'common';

    const drawWeapon = () => {
      const isLegendary = rarity === 'legendary';
      const isEpic = rarity === 'epic';
      const isRare = rarity === 'rare';
      const isUncommon = rarity === 'uncommon';

      ctx.save();
      
      // Glow Effects for high tiers
      if (isLegendary) {
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

        ctx.strokeStyle = bowColor;
        ctx.lineWidth = isLegendary ? 6 : 4;
        
        // Complex Bow Shape
        ctx.beginPath();
        if (isLegendary || isEpic) {
          // Double recurve bow
          ctx.moveTo(15, -bowSize);
          ctx.bezierCurveTo(45, -bowSize, 45, -10, 15, 0);
          ctx.bezierCurveTo(45, 10, 45, bowSize, 15, bowSize);
        } else {
          ctx.arc(15, 0, bowSize, -Math.PI/2, Math.PI/2);
        }
        ctx.stroke();

        // Decorative elements
        if (isLegendary) {
          ctx.fillStyle = '#fef3c7';
          ctx.beginPath(); ctx.arc(40, 0, 4, 0, Math.PI*2); ctx.fill(); // Core gem
        }

        // String
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
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

        // Staff Body
        ctx.fillStyle = staffColor;
        ctx.fillRect(0, -3, 80, 6);

        // Staff Head
        ctx.save();
        ctx.translate(85, 0);
        ctx.strokeStyle = staffColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 15, -Math.PI, Math.PI);
        ctx.stroke();

        // Glow Gem
        ctx.shadowBlur = isLegendary ? 20 : 10;
        ctx.shadowColor = gemColor;
        ctx.fillStyle = gemColor;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(8, 0);
        ctx.lineTo(0, 10);
        ctx.lineTo(-8, 0);
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

        // Gradient for Blade
        const grad = ctx.createLinearGradient(15, 0, 15 + bladeLength, 0);
        grad.addColorStop(0, '#475569');
        grad.addColorStop(0.2, bladeColor);
        grad.addColorStop(1, '#ffffff');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(15, -bladeWidth);
        
        if (isEpic || isLegendary) {
          // Serrated/Fantasy Edge
          for(let i=0; i<bladeLength-10; i+=10) {
            ctx.lineTo(15 + i + 5, -bladeWidth - (i%20===0 ? 4 : 0));
            ctx.lineTo(15 + i + 10, -bladeWidth);
          }
        } else {
          ctx.lineTo(15 + bladeLength - 10, -bladeWidth);
        }
        
        ctx.lineTo(15 + bladeLength, 0); // Tip
        
        if (isEpic || isLegendary) {
          for(let i=bladeLength-10; i>=0; i-=10) {
            ctx.lineTo(15 + i + 5, bladeWidth + (i%20===0 ? 4 : 0));
            ctx.lineTo(15 + i, bladeWidth);
          }
        } else {
          ctx.lineTo(15 + bladeLength - 10, bladeWidth);
        }
        
        ctx.lineTo(15, bladeWidth);
        ctx.closePath();
        ctx.fill();

        // Crossguard - grows with rarity
        ctx.fillStyle = isLegendary ? '#d97706' : '#1e293b';
        const guardSize = 10 + (isRare ? 10 : isEpic ? 20 : isLegendary ? 30 : 0);
        ctx.fillRect(15, -guardSize/2, 6, guardSize);
        
        // Hilt
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, -3, 15, 6);
        // Pommel
        ctx.fillStyle = isLegendary ? '#fbbf24' : '#475569';
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    };

    drawWeapon();
    ctx.restore();

    // Attack Swing Arc
    if (isAttacking) {
      ctx.save();
      ctx.rotate(attackEffect.current!.angle);
      const p = attackEffect.current!.progress;
      const arcStart = -0.8;
      const arcEnd = 0.8;
      const currentArc = arcStart + (arcEnd - arcStart) * p;
      
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, 0.8 - p)})`;
      ctx.lineWidth = 4;
      ctx.arc(0, 0, 55, currentArc - 0.4, currentArc + 0.4);
      ctx.stroke();
      ctx.restore();
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

  return (
    <canvas 
      ref={canvasRef}
      className="block w-full h-full"
    />
  );
});
