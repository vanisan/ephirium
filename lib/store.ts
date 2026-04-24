import { create } from 'zustand';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface Item {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'potion' | 'accessory';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  level?: number;
  stats: {
    damage?: number;
    defense?: number;
    hp?: number;
    atkSpeed?: number;
  };
  sockets?: number;
  gems?: string[];
  icon: string;
}

export interface Enemy {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  type: string;
}

export interface Location {
  id: string;
  name: string;
  minLevel: number;
  cost: number;
  enemyBaseHp: number;
  color: string;
  groundTheme: 'forest' | 'cave' | 'citadel';
}

interface GameState {
  // Player Stats
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    level: number;
    exp: number;
    nextLevelExp: number;
    gold: number;
    shards: number;
    potions: number;
    potionCooldown: number;
    recipes: string[];
    avatarUrl: string;
    skinColor: string;
    stats: {
      str: number;
      dex: number;
      int: number;
      damage: number;
      defense: number;
      atkSpeed: number;
    };
  };
  
  // Equipment
  equipment: {
    weapon: Item | null;
    armor: Item | null;
    accessory: Item | null;
  };
  
  // Inventory
  inventory: Item[];
  
  // World State
  enemies: Enemy[];
  isAutoBattle: boolean;
  locations: Location[];
  currentLocationId: string;
  
  // User
  user: { uid: string, email: string } | null;
  
  // Actions
  setUser: (user: { uid: string, email: string } | null) => void;
  saveGame: () => Promise<void>;
  loadGame: (uid: string) => Promise<void>;
  updatePlayerPos: (x: number, y: number) => void;
  damagePlayer: (amount: number) => void;
  healPlayer: (amount: number) => void;
  gainExp: (amount: number) => void;
  toggleAutoBattle: () => void;
  spawnEnemy: (enemy: Enemy) => void;
  damageEnemy: (id: string, amount: number) => void;
  equipItem: (item: Item) => void;
  sellItem: (item: Item) => void;
  craftItem: (rarity: string, itemType: 'sword' | 'bow' | 'staff' | 'armor' | 'accessory') => void;
  usePotion: () => void;
  addItemToInventory: (item: Item) => void;
  setAvatarUrl: (url: string) => void;
  setSkinColor: (color: string) => void;
  teleport: (locationId: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
  player: {
    x: 500,
    y: 500,
    hp: 100,
    maxHp: 100,
    level: 1,
    exp: 0,
    nextLevelExp: 100,
    gold: 100,
    shards: 0,
    potions: 3,
    potionCooldown: 0,
    recipes: ['common'],
    avatarUrl: 'https://picsum.photos/seed/hero_top_down/256/256',
    skinColor: '#e5c298',
    stats: {
      str: 10,
      dex: 10,
      int: 10,
      damage: 10,
      defense: 5,
      atkSpeed: 1,
    },
  },
  equipment: {
    weapon: null,
    armor: null,
    accessory: null,
  },
  inventory: [],
  enemies: [],
  isAutoBattle: true,
  locations: [
    { id: 'forest', name: 'Вечный Лес', minLevel: 1, cost: 0, enemyBaseHp: 40, color: '#0f1712', groundTheme: 'forest' },
    { id: 'caves', name: 'Пещеры Эха', minLevel: 5, cost: 500, enemyBaseHp: 150, color: '#111116', groundTheme: 'cave' },
    { id: 'citadel', name: 'Проклятая Цитадель', minLevel: 15, cost: 2500, enemyBaseHp: 600, color: '#160808', groundTheme: 'citadel' },
  ],
  currentLocationId: 'forest',
  user: null,

  setUser: (user) => set({ user }),

  saveGame: async () => {
    const state = useGameStore.getState();
    if (!state.user) return;
    try {
      const userRef = doc(db, 'users', state.user.uid);
      await setDoc(userRef, {
        player: state.player,
        equipment: state.equipment,
        inventory: state.inventory,
        currentLocationId: state.currentLocationId,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error('Error saving game:', e);
    }
  },

  loadGame: async (uid) => {
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        set({
          player: data.player || useGameStore.getState().player,
          equipment: data.equipment || useGameStore.getState().equipment,
          inventory: data.inventory || [],
          currentLocationId: data.currentLocationId || 'forest'
        });
      }
    } catch (e) {
      console.error('Error loading game:', e);
    }
  },
  
  updatePlayerPos: (x, y) => set((state) => ({ player: { ...state.player, x, y } })),
  damagePlayer: (amount) => set((state) => {
    const newHp = state.player.hp - amount;
    if (newHp <= 0) {
      // Player died
      return {
        player: { 
          ...state.player, 
          hp: state.player.maxHp,
          exp: Math.max(0, state.player.exp - Math.floor(state.player.nextLevelExp * 0.1))
        },
        currentLocationId: 'forest',
        isAutoBattle: false,
        enemies: []
      };
    }
    return { player: { ...state.player, hp: newHp } };
  }),
  healPlayer: (amount) => set((state) => ({ 
    player: { ...state.player, hp: Math.min(state.player.maxHp, state.player.hp + amount) } 
  })),
  gainExp: (amount) => set((state) => {
    let newExp = state.player.exp + amount;
    let newLevel = state.player.level;
    let newNextLevelExp = state.player.nextLevelExp;
    
    if (newExp >= newNextLevelExp) {
      newExp -= newNextLevelExp;
      newLevel += 1;
      newNextLevelExp = Math.floor(newNextLevelExp * 1.5);
      // Boost stats on level up
      const newState = {
        player: { 
          ...state.player, 
          level: newLevel, 
          exp: newExp, 
          nextLevelExp: newNextLevelExp,
          maxHp: state.player.maxHp + 20,
          hp: state.player.maxHp + 20,
          stats: {
            ...state.player.stats,
            damage: state.player.stats.damage + 2,
            defense: state.player.stats.defense + 1,
          }
        }
      };
      
      // Auto-save on level up
      setTimeout(() => useGameStore.getState().saveGame(), 100);
      
      return newState;
    }
    return { player: { ...state.player, exp: newExp } };
  }),
  toggleAutoBattle: () => set((state) => ({ isAutoBattle: !state.isAutoBattle })),
  spawnEnemy: (enemy) => set((state) => ({ enemies: [...state.enemies, enemy] })),
  damageEnemy: (id, amount) => set((state) => {
    const enemy = state.enemies.find(e => e.id === id);
    if (!enemy) return state;
    
    const newHp = enemy.hp - amount;
    if (newHp <= 0) {
      // Enemy died - shards and recipes drop only
      const shardAmount = Math.floor(Math.random() * 5 * enemy.level) + 1;
      const recipeRoll = Math.random() * 100;
      const potionRoll = Math.random() * 100;
      let newRecipe: string | null = null;
      let newPotionCount = state.player.potions;

      if (potionRoll < 10) {
        newPotionCount += 1;
      }
      
      if (recipeRoll < 0.5) newRecipe = 'legendary';
      else if (recipeRoll < 1.5) newRecipe = 'epic';
      else if (recipeRoll < 5) newRecipe = 'rare';
      else if (recipeRoll < 12) newRecipe = 'uncommon';

      const updatedRecipes = [...state.player.recipes];
      if (newRecipe && !updatedRecipes.includes(newRecipe)) {
        updatedRecipes.push(newRecipe);
      }
      
      return {
        enemies: state.enemies.filter(e => e.id !== id),
        player: { 
          ...state.player, 
          exp: state.player.exp + enemy.level * 20,
          gold: state.player.gold + enemy.level * 5,
          shards: state.player.shards + shardAmount,
          potions: newPotionCount,
          recipes: updatedRecipes
        }
      };
    }
    
    return {
      enemies: state.enemies.map(e => e.id === id ? { ...e, hp: newHp } : e)
    };
  }),
  equipItem: (item) => set((state) => {
    const type = item.type === 'weapon' ? 'weapon' : item.type === 'armor' ? 'armor' : 'accessory';
    const oldItem = state.equipment[type as keyof typeof state.equipment];
    const newInventory = [...state.inventory.filter(i => i.id !== item.id)];
    if (oldItem) newInventory.push(oldItem);
    
    // Recalculate stats based on level and equipment
    const weapon = type === 'weapon' ? item : state.equipment.weapon;
    const armor = type === 'armor' ? item : state.equipment.armor;
    const accessory = type === 'accessory' ? item : state.equipment.accessory;

    const baseDamage = 10 + (state.player.level - 1) * 2;
    const equipDamage = (weapon?.stats.damage || 0) + (accessory?.stats.damage || 0);
    const newDamage = baseDamage + equipDamage;

    const baseMaxHp = 100 + (state.player.level - 1) * 20;
    const armorHp = (armor?.stats.hp || 0);
    const newMaxHp = baseMaxHp + armorHp;

    const baseDefense = 5 + (state.player.level - 1);
    const equipDefense = (armor?.stats.defense || 0);
    const newDefense = baseDefense + equipDefense;

    setTimeout(() => useGameStore.getState().saveGame(), 100);

    return {
      equipment: { ...state.equipment, [type]: item },
      inventory: newInventory,
      player: {
        ...state.player,
        maxHp: newMaxHp,
        hp: Math.min(newMaxHp, state.player.hp),
        stats: {
          ...state.player.stats,
          damage: newDamage,
          defense: newDefense,
          atkSpeed: weapon?.stats.atkSpeed || 1
        }
      }
    };
  }),
  sellItem: (item) => set((state) => {
    const rarityMultipliers = { common: 10, uncommon: 50, rare: 200, epic: 1000, legendary: 5000 };
    const price = rarityMultipliers[item.rarity as keyof typeof rarityMultipliers] * (item.level || 1);
    setTimeout(() => useGameStore.getState().saveGame(), 100);

    return {
      inventory: state.inventory.filter(i => i.id !== item.id),
      player: { ...state.player, gold: state.player.gold + price }
    };
  }),
  craftItem: (rarity, itemType) => set((state) => {
    const costs: Record<string, { shards: number, gold: number, value: number, speed?: number }> = {
      common: { shards: 10, gold: 50, value: 10 },
      uncommon: { shards: 40, gold: 200, value: 25 },
      rare: { shards: 150, gold: 1000, value: 60 },
      epic: { shards: 500, gold: 5000, value: 125 },
      legendary: { shards: 2000, gold: 25000, value: 250, speed: 2 }
    };

    const cost = costs[rarity];
    if (!cost || state.player.shards < cost.shards || state.player.gold < cost.gold) return state;

    const rarityLabels: Record<string, string> = {
      common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный'
    };

    const typeLabels: Record<string, string> = {
      sword: 'Меч', bow: 'Лук', staff: 'Посох', armor: 'Доспех', accessory: 'Амулет'
    };

    const weaponTypes = ['sword', 'bow', 'staff'];
    const isWeapon = weaponTypes.includes(itemType);

    const newItem: Item = {
      id: Math.random().toString(),
      name: `${rarityLabels[rarity]} ${typeLabels[itemType]}`,
      type: isWeapon ? 'weapon' : itemType as any,
      rarity: rarity as any,
      stats: isWeapon 
        ? { damage: cost.value, atkSpeed: cost.speed || 1 }
        : (itemType as string) === 'armor' 
          ? { hp: cost.value * 5, defense: Math.floor(cost.value / 2) }
          : { damage: Math.floor(cost.value * 0.4) },
      icon: isWeapon ? itemType : itemType,
      level: state.player.level,
      sockets: rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : rarity === 'rare' ? 1 : 0,
      gems: []
    };

    setTimeout(() => useGameStore.getState().saveGame(), 100);

    return {
      player: { 
        ...state.player, 
        shards: state.player.shards - cost.shards, 
        gold: state.player.gold - cost.gold 
      },
      inventory: [...state.inventory, newItem]
    };
  }),
  usePotion: () => set((state) => {
    if (state.player.potions <= 0 || state.player.potionCooldown > 0) return state;
    
    const healAmount = Math.floor(state.player.maxHp * 0.1);
    
    // Set a timer to clear the cooldown if needed or just use timestamp
    // For simplicity with this current structure, we'll set it to 10 and assume game loop tiks it down
    
    return {
      player: {
        ...state.player,
        potions: state.player.potions - 1,
        hp: Math.min(state.player.maxHp, state.player.hp + healAmount),
        potionCooldown: 10
      }
    };
  }),
  addItemToInventory: (item) => set((state) => ({ inventory: [...state.inventory, item] })),
  setAvatarUrl: (url) => set((state) => ({ player: { ...state.player, avatarUrl: url } })),
  setSkinColor: (color) => set((state) => ({ player: { ...state.player, skinColor: color } })),
  teleport: (locationId) => set((state) => {
    const loc = state.locations.find(l => l.id === locationId);
    if (!loc) return state;
    if (state.player.level < loc.minLevel) return state;
    if (state.player.gold < loc.cost) return state;

    setTimeout(() => useGameStore.getState().saveGame(), 100);

    return {
      currentLocationId: locationId,
      enemies: [], // Clear enemies on teleport
      player: { ...state.player, gold: state.player.gold - loc.cost, x: 500, y: 500 }
    };
  }),
}));
