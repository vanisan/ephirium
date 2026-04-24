import { create } from 'zustand';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface Buff {
  id: string;
  name: string;
  type: 'damage' | 'defense' | 'exp' | 'atkSpeed';
  value: number;
  duration: number;
  timeLeft: number;
  icon: string;
}

export interface Item {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  level: number;
  stats: {
    damage?: number;
    defense?: number;
    hp?: number;
    atkSpeed?: number;
  };
  icon: string;
  sockets?: number;
  gems?: any[];
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
  groundTheme: string;
}

export interface Player {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    level: number;
    exp: number;
    nextLevelExp: number;
    gold: number;
    shards: number;
    wins: number;
    statPoints: number;
    potions: number;
    potionCooldown: number;
    recipes: string[];
    avatarUrl: string;
    skinColor: string;
    buffs: Buff[];
    stats: {
      str: number;
      dex: number;
      int: number;
      damage: number;
      defense: number;
      atkSpeed: number;
      critRate: number;
      damageReduction: number;
      expMultiplier: number;
    };
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'potion' | 'gem' | 'scroll' | 'elixir';
  icon: string;
  effect?: any;
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
    wins: number;
    statPoints: number;
    potions: number;
    potionCooldown: number;
    recipes: string[];
    avatarUrl: string;
    skinColor: string;
    buffs: Buff[];
    stats: {
      str: number;
      dex: number;
      int: number;
      damage: number;
      defense: number;
      atkSpeed: number;
      critRate: number;
      damageReduction: number;
      expMultiplier: number;
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
  shopItems: ShopItem[];
  
  // User
  user: { uid: string, email: string } | null;
  
  // Death State
  isDead: boolean;

  // Actions
  setUser: (user: { uid: string, email: string } | null) => void;
  saveGame: () => Promise<void>;
  loadGame: (uid: string) => Promise<void>;
  updatePlayerPos: (x: number, y: number) => void;
  damagePlayer: (amount: number) => void;
  healPlayer: (amount: number) => void;
  gainExp: (amount: number) => void;
  toggleAutoBattle: () => void;
  resurrect: () => void;
  spawnEnemy: (enemy: Enemy) => void;
  damageEnemy: (id: string, amount: number) => void;
  equipItem: (item: Item) => void;
  sellItem: (item: Item) => void;
  craftItem: (rarity: string, itemType: 'sword' | 'bow' | 'staff' | 'armor' | 'accessory') => void;
  usePotion: () => void;
  addItemToInventory: (item: Item) => void;
  increaseStat: (stat: 'str' | 'dex' | 'int') => void;
  setAvatarUrl: (url: string) => void;
  setSkinColor: (color: string) => void;
  teleport: (locationId: string) => void;
  buyInShop: (itemId: string, quantity: number) => void;
  buyBuff: (buff: Omit<Buff, 'timeLeft'>, cost: number) => void;
  applyBuff: (buff: Omit<Buff, 'timeLeft'>) => void;
  updateBuffs: () => void;
}

// --- Helper Functions ---
function recalculatePlayerStats(player: Player, equipment: { weapon: Item | null, armor: Item | null, accessory: Item | null }): Player {
  const damageBuff = player.buffs?.filter(b => b.type === 'damage').reduce((acc, b) => acc + b.value, 0) || 0;
  const speedBuff = player.buffs?.filter(b => b.type === 'atkSpeed').reduce((acc, b) => acc + b.value, 0) || 0;
  const expBuff = player.buffs?.filter(b => b.type === 'exp').reduce((acc, b) => acc + b.value, 0) || 0;
  const defenseBuff = player.buffs?.filter(b => b.type === 'defense').reduce((acc, b) => acc + b.value, 0) || 0;

  const baseDamage = 10 + (player.level - 1) * 2 + (player.stats.str - 10) * 1;
  const equipDamage = (equipment.weapon?.stats.damage || 0) + (equipment.accessory?.stats.damage || 0);
  const newDamage = (baseDamage + equipDamage) * (1 + damageBuff);

  const hpFromStr = player.stats.str * 10;
  const baseMaxHp = 100 + (player.level - 1) * 25 + hpFromStr;
  const armorHp = (equipment.armor?.stats.hp || 0);
  const newMaxHp = baseMaxHp + armorHp;

  const drFromStr = player.stats.str * 0.1;
  const baseDefense = 5 + (player.level - 1) * 1.5;
  const equipDefense = (equipment.armor?.stats.defense || 0);
  const newDefense = (baseDefense + equipDefense) * (1 + defenseBuff);

  const critFromDex = player.stats.dex * 1.0;
  const speedFromDex = player.stats.dex * 0.0005; 
  const expFromInt = Math.floor(player.stats.int / 10) * 0.01;

  return {
    ...player,
    maxHp: newMaxHp,
    hp: Math.min(newMaxHp, player.hp),
    stats: {
      ...player.stats,
      damage: newDamage,
      defense: newDefense,
      atkSpeed: ((equipment.weapon?.stats.atkSpeed || 1) + speedFromDex) * (1 + speedBuff),
      critRate: 5 + critFromDex,
      damageReduction: drFromStr,
      expMultiplier: (1 + expFromInt) * (1 + expBuff)
    }
  };
}

export const useGameStore = create<GameState>((set, get) => ({
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
    wins: 0,
    statPoints: 0,
    potions: 3,
    potionCooldown: 0,
    recipes: ['common'],
    avatarUrl: 'https://picsum.photos/seed/hero_top_down/256/256',
    skinColor: '#e5c298',
    buffs: [],
    stats: {
      str: 10,
      dex: 10,
      int: 10,
      damage: 10,
      defense: 5,
      atkSpeed: 1,
      critRate: 10,
      damageReduction: 1,
      expMultiplier: 1,
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
    { id: 'forest', name: 'Окраина Леса', minLevel: 1, cost: 0, enemyBaseHp: 30, color: '#0a1a10', groundTheme: 'forest' },
    { id: 'deep_forest', name: 'Глубины Леса', minLevel: 5, cost: 200, enemyBaseHp: 80, color: '#051008', groundTheme: 'forest' },
    { id: 'caves', name: 'Пещеры Эха', minLevel: 10, cost: 750, enemyBaseHp: 200, color: '#111116', groundTheme: 'cave' },
    { id: 'abyss', name: 'Бездна', minLevel: 20, cost: 3000, enemyBaseHp: 550, color: '#09090b', groundTheme: 'cave' },
    { id: 'citadel', name: 'Проклятая Цитадель', minLevel: 35, cost: 10000, enemyBaseHp: 1500, color: '#160808', groundTheme: 'citadel' },
    { id: 'inferno', name: 'Пекло', minLevel: 50, cost: 50000, enemyBaseHp: 4000, color: '#2a0505', groundTheme: 'citadel' },
  ],
  currentLocationId: 'forest',
  shopItems: [
    { id: 'hp_potion', name: 'Эликсир ОЗ', description: 'Восстанавливает 25% здоровья', price: 100, type: 'potion', icon: 'heart' },
    { id: 'mana_potion', name: 'Эликсир Маны', description: 'Восстанавливает 25% маны', price: 100, type: 'potion', icon: 'zap' },
    { id: 'str_scroll', name: 'Свиток Силы', description: 'Урон +20% на 2 минуты', price: 500, type: 'elixir', icon: 'zap', effect: { type: 'damage', value: 0.2, duration: 120 } },
    { id: 'dex_scroll', name: 'Свиток Ветра', description: 'Скор. Атк +15% на 2 минуты', price: 500, type: 'elixir', icon: 'zap', effect: { type: 'atkSpeed', value: 0.15, duration: 120 } },
    { id: 'int_scroll', name: 'Свиток Ума', description: 'Опыт +20% на 2 минуты', price: 500, type: 'elixir', icon: 'zap', effect: { type: 'exp', value: 0.2, duration: 120 } },
    { id: 'exp_elixir', name: 'Настой Мудрости', description: 'Опыт +50% на 5 минут', price: 1200, type: 'elixir', icon: 'award', effect: { type: 'exp', value: 0.5, duration: 300 } },
    { id: 'ruby_gem', name: 'Рубин', description: 'Редкий камень для крафта (50 осколков)', price: 2000, type: 'gem', icon: 'gem', effect: { shards: 50 } },
    { id: 'sapphire_gem', name: 'Сапфир', description: 'Ценный камень для крафта (200 осколков)', price: 7500, type: 'gem', icon: 'gem', effect: { shards: 200 } },
    { id: 'emerald_gem', name: 'Изумруд', description: 'Элитный камень для крафта (500 осколков)', price: 15000, type: 'gem', icon: 'gem', effect: { shards: 500 } },
    { id: 'diamond_gem', name: 'Алмаз', description: 'Легендарный камень для крафта (2000 осколков)', price: 50000, type: 'gem', icon: 'gem', effect: { shards: 2000 } },
  ],
  user: null,
  isDead: false,

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
        const defaultState = useGameStore.getState();
        
        // Merge player stats to handle missing new fields in old saves
        const loadedPlayer = data.player || defaultState.player;
        const mergedStats = { ...defaultState.player.stats, ...(loadedPlayer.stats || {}) };
        const statPoints = loadedPlayer.statPoints ?? (loadedPlayer.level > 1 ? (loadedPlayer.level - 1) * 5 : 0);
        let correctedNextLevelExp = loadedPlayer.nextLevelExp;
        const expectedExp = Math.floor(100 * Math.pow(loadedPlayer.level, 1.5));
        if (correctedNextLevelExp > expectedExp * 2 || correctedNextLevelExp < Math.floor(100 * Math.pow(loadedPlayer.level, 1.2))) {
           correctedNextLevelExp = expectedExp;
        }
        if (loadedPlayer.exp > correctedNextLevelExp) loadedPlayer.exp = 0; // Prevent instant level up loops
        
        set({
          player: { ...loadedPlayer, statPoints, nextLevelExp: correctedNextLevelExp, buffs: loadedPlayer.buffs || [], stats: mergedStats },
          equipment: data.equipment || defaultState.equipment,
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
    if (state.isDead) return state;
    const newHp = state.player.hp - amount;
    if (newHp <= 0) {
      // Player died
      return {
        isDead: true,
        player: { 
          ...state.player, 
          hp: 0,
        },
        isAutoBattle: false
      };
    }
    return { player: { ...state.player, hp: newHp } };
  }),
  healPlayer: (amount) => set((state) => ({ 
    player: { ...state.player, hp: Math.min(state.player.maxHp, state.player.hp + amount) } 
  })),
  gainExp: (amount) => set((state) => {
    const expGain = Math.floor(amount * (state.player.stats.expMultiplier));
    let newExp = state.player.exp + expGain;
    let newLevel = state.player.level;
    let newNextLevelExp = state.player.nextLevelExp;
    
    if (newExp >= newNextLevelExp) {
      newExp -= newNextLevelExp;
      newLevel += 1;
      newNextLevelExp = Math.floor(100 * Math.pow(newLevel, 1.5));
      
      const newState = {
        player: { 
          ...state.player, 
          level: newLevel, 
          exp: newExp, 
          nextLevelExp: newNextLevelExp,
          statPoints: state.player.statPoints + 5,
          hp: state.player.maxHp, // Full heal on level up
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
  resurrect: () => set((state) => {
    let newLevel = state.player.level;
    let newExp = Math.max(0, state.player.exp - Math.floor(state.player.nextLevelExp * 0.25));
    let newGold = state.player.gold;
    let newStatPoints = state.player.statPoints;
    let newNextLevelExp = state.player.nextLevelExp;
    let newStats = { ...state.player.stats };

    if (newGold >= 200) {
      newGold -= 200;
    } else {
      if (newLevel > 1) {
        newLevel -= 1;
        newStatPoints = Math.max(0, newStatPoints - 5);
        newNextLevelExp = Math.floor(100 * Math.pow(newLevel, 1.5));
      }
      newExp = 0;
    }

    let updatedPlayer = recalculatePlayerStats({
      ...state.player,
      level: newLevel,
      exp: newExp,
      gold: newGold,
      statPoints: newStatPoints,
      nextLevelExp: newNextLevelExp,
      stats: newStats,
      hp: 1 
    }, state.equipment);
    
    updatedPlayer.hp = updatedPlayer.maxHp;

    setTimeout(() => useGameStore.getState().saveGame(), 100);

    return {
      isDead: false,
      player: updatedPlayer,
      currentLocationId: 'forest',
      isAutoBattle: false,
      enemies: []
    };
  }),
  damageEnemy: (id, amount) => set((state) => {
    const enemy = state.enemies.find(e => e.id === id);
    if (!enemy) return state;
    
    const newHp = enemy.hp - amount;
    if (newHp <= 0) {
      // Enemy died
      const currentLocation = state.locations.find(l => l.id === state.currentLocationId) || state.locations[0];
      const difficultyMultiplier = currentLocation.minLevel / 5 + 1; // 1 to 11
      
      const shardAmount = Math.floor(Math.random() * 5 * enemy.level * difficultyMultiplier) + 1;
      const goldAmount = Math.floor(enemy.level * 5 * difficultyMultiplier) + Math.floor(Math.random() * 10);
      
      const recipeRoll = Math.random() * 100;
      const potionRoll = Math.random() * 100;
      let newRecipe: string | null = null;
      let newPotionCount = state.player.potions;

      if (potionRoll < (10 + difficultyMultiplier)) {
        newPotionCount += 1;
      }
      
      // Better recipes drop more frequently in higher levels
      if (recipeRoll < 0.1 * difficultyMultiplier) newRecipe = 'mythic';
      else if (recipeRoll < 0.5 * difficultyMultiplier) newRecipe = 'legendary';
      else if (recipeRoll < 1.5 * difficultyMultiplier) newRecipe = 'epic';
      else if (recipeRoll < 3 * difficultyMultiplier) newRecipe = 'rare';
      else if (recipeRoll < 10) newRecipe = 'uncommon';

      const updatedRecipes = [...state.player.recipes];
      if (newRecipe && !updatedRecipes.includes(newRecipe)) {
        updatedRecipes.push(newRecipe);
      }
      
      const expGain = Math.floor(enemy.level * 20 * state.player.stats.expMultiplier);
      let newExp = state.player.exp + expGain;
      let newLevel = state.player.level;
      let newNextLevelExp = state.player.nextLevelExp;
      let newStatPoints = state.player.statPoints;
      let newPlayerHp = state.player.hp;

      if (newExp >= newNextLevelExp) {
        newExp -= newNextLevelExp;
        newLevel += 1;
        newNextLevelExp = Math.floor(100 * Math.pow(newLevel, 1.5));
        newStatPoints += 5;
        newPlayerHp = state.player.maxHp; // Full heal on level up
      }

      return {
        enemies: state.enemies.filter(e => e.id !== id),
        player: { 
          ...state.player, 
          exp: newExp,
          level: newLevel,
          nextLevelExp: newNextLevelExp,
          statPoints: newStatPoints,
          hp: newPlayerHp,
          gold: state.player.gold + goldAmount,
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
    
    const newEquipment = { ...state.equipment, [type]: item };
    const updatedPlayer = recalculatePlayerStats(state.player, newEquipment);

    setTimeout(() => get().saveGame(), 100);

    return {
      equipment: newEquipment,
      inventory: newInventory,
      player: updatedPlayer
    };
  }),
  sellItem: (item) => set((state) => {
    const rarityMultipliers = { common: 10, uncommon: 50, rare: 200, epic: 1000, legendary: 5000, mythic: 25000 };
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
      legendary: { shards: 2000, gold: 25000, value: 250, speed: 2 },
      mythic: { shards: 10000, gold: 150000, value: 600, speed: 2.5 }
    };

    const cost = costs[rarity];
    if (!cost || state.player.shards < cost.shards || state.player.gold < cost.gold) return state;

    const rarityLabels: Record<string, string> = {
      common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный', mythic: 'Мифический'
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
      sockets: rarity === 'mythic' ? 4 : rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : rarity === 'rare' ? 1 : 0,
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
    
    const healAmount = Math.floor(state.player.maxHp * 0.25);
    
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
  increaseStat: (stat) => set((state) => {
    if (state.player.statPoints <= 0) return state;
    
    const newStats = { ...state.player.stats };
    newStats[stat] = (newStats[stat] || 10) + 1;
    
    const updatedPlayer = recalculatePlayerStats({
      ...state.player,
      statPoints: state.player.statPoints - 1,
      stats: newStats
    }, state.equipment);

    setTimeout(() => get().saveGame(), 100);

    return {
      player: updatedPlayer
    };
  }),
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
  buyInShop: (itemId, quantity) => set((state) => {
    const item = state.shopItems.find(i => i.id === itemId);
    if (!item) return state;
    const totalCost = item.price * quantity;
    if (state.player.gold < totalCost) return state;

    let playerUpdate = { ...state.player, gold: state.player.gold - totalCost };

    if (item.type === 'potion') {
      playerUpdate.potions += quantity;
    } else if (item.type === 'elixir' || item.type === 'gem' || item.type === 'scroll') {
      if (item.effect?.shards) {
        playerUpdate.shards += item.effect.shards * quantity;
      } else if (item.effect?.type) {
        const buff: Buff = {
          id: Math.random().toString(),
          name: item.name,
          type: item.effect.type,
          value: item.effect.value,
          duration: item.effect.duration,
          timeLeft: item.effect.duration,
          icon: item.icon
        };
        playerUpdate.buffs = [...playerUpdate.buffs, buff];
      }
    }

    const updatedPlayer = recalculatePlayerStats(playerUpdate, state.equipment);
    return { player: updatedPlayer };
  }),
  buyBuff: (buffData, cost) => set((state) => {
    if (state.player.gold < cost) return state;
    const buff = { ...buffData, timeLeft: buffData.duration };
    const playerUpdate = { 
      ...state.player, 
      gold: state.player.gold - cost,
      buffs: [...state.player.buffs, buff] 
    };
    const updatedPlayer = recalculatePlayerStats(playerUpdate, state.equipment);
    setTimeout(() => get().saveGame(), 100);
    return { player: updatedPlayer };
  }),
  applyBuff: (buffData) => set((state) => {
    const buff = { ...buffData, timeLeft: buffData.duration };
    const updatedPlayer = recalculatePlayerStats({
      ...state.player,
      buffs: [...state.player.buffs, buff]
    }, state.equipment);
    return { player: updatedPlayer };
  }),
  updateBuffs: () => set((state) => {
    const newBuffs = state.player.buffs
      .map(b => ({ ...b, timeLeft: b.timeLeft - 1 }))
      .filter(b => b.timeLeft > 0);
    
    const updatedPlayer = recalculatePlayerStats({
      ...state.player,
      buffs: newBuffs
    }, state.equipment);

    return { player: updatedPlayer };
  }),
}));
