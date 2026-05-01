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
  type: 'weapon' | 'armor' | 'accessory' | 'aura';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'ultra';
  level: number;
  color?: string;
  stats: {
    damage?: number;
    defense?: number;
    hp?: number;
    atkSpeed?: number;
    str?: number;
    dex?: number;
    int?: number;
    // New Diablo-like stats
    lifesteal?: number; // percentage (0-100)
    dodge?: number; // percentage (0-100)
    critDamage?: number; // percentage (150 = 150%)
    hpRegen?: number; // flat HP per second/tick
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
  isDungeon?: boolean;
  description?: string;
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
    recipes: Record<string, number>;
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
      lifesteal: number;
      dodge: number;
      critDamage: number;
      hpRegen: number;
    };
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'potion' | 'gem' | 'scroll' | 'elixir' | 'gear';
  icon: string;
  effect?: any;
  item?: Item;
}

export interface OnlinePlayer {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  nickname: string;
  rotation?: number;
  equipment?: any;
  aura?: any;
  skinColor?: string;
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
    recipes: Record<string, number>;
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
      lifesteal: number;
      dodge: number;
      critDamage: number;
      hpRegen: number;
    };
  };
  
  // Equipment
  equipment: {
    weapon: Item | null;
    armor: Item | null;
    accessory: Item | null;
    aura: Item | null;
  };
  
  // Interaction
  currentTargetId: string | null;
  setCurrentTargetId: (id: string | null) => void;
  
  // Inventory
  inventory: Item[];
  
  // World State
  enemies: Enemy[];
  onlinePlayers: OnlinePlayer[];
  isAutoBattle: boolean;
  locations: Location[];
  currentLocationId: string;
  shopItems: ShopItem[];
  
  dungeonState: { bossDefeated: boolean, chestOpened: boolean };
  
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
  openChest: () => void;
}

// --- Helper Functions ---
export function generateRandomItem(level: number, rarity: string, forcedType?: string): Item {
    const itemTypes = ['sword', 'bow', 'staff', 'armor', 'accessory', 'aura'];
    const randomType = forcedType || itemTypes[Math.floor(Math.random() * itemTypes.length)];
    const isWeapon = randomType === 'sword' || randomType === 'bow' || randomType === 'staff';
    
    // Level constraints based on rarity
    const reqLevels: Record<string, number> = {
      common: 5, uncommon: 10, rare: 15, epic: 30, legendary: 40, mythic: 50, ultra: 65
    };
    const finalLevel = reqLevels[rarity] || level;

    // Fixed stat ranges per rarity
    const ranges: Record<string, { dmg: [number, number], w_stats: [number, number], a_stats: [number, number] }> = {
      common: { dmg: [10, 15], w_stats: [5, 10], a_stats: [10, 20] },
      uncommon: { dmg: [30, 50], w_stats: [20, 40], a_stats: [25, 50] },
      rare: { dmg: [80, 100], w_stats: [40, 75], a_stats: [40, 80] },
      epic: { dmg: [150, 200], w_stats: [80, 100], a_stats: [60, 125] },
      legendary: { dmg: [300, 500], w_stats: [150, 200], a_stats: [100, 200] },
      mythic: { dmg: [800, 1100], w_stats: [250, 333], a_stats: [165, 333] },
      ultra: { dmg: [1500, 2000], w_stats: [400, 555], a_stats: [275, 555] }
    };
    
    const r = ranges[rarity] || { dmg: [10, 15], w_stats: [5, 10], a_stats: [10, 20] };
    const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    
    const stats: any = {};
    if (isWeapon) {
       stats.damage = getRandomInt(r.dmg[0], r.dmg[1]);
       stats.atkSpeed = Math.random() > 0.5 ? 2 : 1;
    } else if (randomType === 'armor') {
       stats.defense = getRandomInt(r.a_stats[0], r.a_stats[1]);
    } else if (randomType === 'accessory') {
       stats.hp = getRandomInt(r.a_stats[0], r.a_stats[1]) * 10;
    } else if (randomType === 'aura') {
       stats.damage = Math.floor(getRandomInt(r.dmg[0], r.dmg[1]) * 0.5);
    }

    const rarityTiers: Record<string, number> = {
      common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 6, ultra: 10
    };
    const tier = rarityTiers[rarity] || 0;
        
    // Assign Main Stat
    const mainStatList = ['str', 'dex', 'int'];
    const mainStat = mainStatList[Math.floor(Math.random() * mainStatList.length)];
    const statRange = isWeapon ? r.w_stats : r.a_stats;
    stats[mainStat] = getRandomInt(statRange[0], statRange[1] || statRange[0]);

    if (tier >= 2) {
      const affixCount = Math.min(5, tier - 1);
      const possibleAffixes = ['lifesteal', 'dodge', 'critDamage', 'hpRegen', 'str', 'dex', 'int'];
      for (let i = 0; i < affixCount; i++) {
        const affix = possibleAffixes[Math.floor(Math.random() * possibleAffixes.length)];
        const value = Math.floor(Math.random() * Math.max(5, finalLevel * 0.5) * tier) + tier;
        if (affix === 'lifesteal') stats[affix] = (stats[affix] || 0) + Math.min(value, 20); 
        else if (affix === 'dodge') stats[affix] = (stats[affix] || 0) + Math.min(value, 15); 
        else if (affix === 'critDamage') stats[affix] = (stats[affix] || 0) + value * 2;
        else if (affix === 'hpRegen') stats[affix] = (stats[affix] || 0) + value * 5;
        else {
           stats[affix] = (stats[affix] || 0) + getRandomInt(Math.floor(statRange[0] * 0.2), Math.floor(statRange[1] * 0.2));
        }
      }
    }

    const rarityLabels: Record<string, string> = {
      common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный', mythic: 'Мифический', ultra: 'Ультра'
    };

    const typeLabels: Record<string, string> = {
      sword: 'Меч', bow: 'Лук', staff: 'Посох', armor: 'Доспех', accessory: 'Амулет', aura: 'Аура'
    };

    return {
        id: Math.random().toString(),
        name: `${rarityLabels[rarity] || 'Неизвестный'} ${typeLabels[randomType] || 'Предмет'}`,
        type: (randomType === 'armor' || randomType === 'accessory' || randomType === 'aura') ? randomType : 'weapon',
        rarity: rarity as any,
        level: finalLevel,
        icon: randomType,
        stats: stats,
        sockets: rarity === 'ultra' ? 5 : rarity === 'mythic' ? 4 : rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : rarity === 'rare' ? 1 : 0,
        gems: []
    };
}

function recalculatePlayerStats(player: Player, equipment: { weapon: Item | null, armor: Item | null, accessory: Item | null, aura: Item | null }): Player {
  const damageBuff = player.buffs?.filter(b => b.type === 'damage').reduce((acc, b) => acc + b.value, 0) || 0;
  const speedBuff = player.buffs?.filter(b => b.type === 'atkSpeed').reduce((acc, b) => acc + b.value, 0) || 0;
  const expBuff = player.buffs?.filter(b => b.type === 'exp').reduce((acc, b) => acc + b.value, 0) || 0;
  const defenseBuff = player.buffs?.filter(b => b.type === 'defense').reduce((acc, b) => acc + b.value, 0) || 0;

  const totalStr = player.stats.str + (equipment.weapon?.stats.str || 0) + (equipment.armor?.stats.str || 0) + (equipment.accessory?.stats.str || 0) + (equipment.aura?.stats.str || 0);
  const totalDex = player.stats.dex + (equipment.weapon?.stats.dex || 0) + (equipment.armor?.stats.dex || 0) + (equipment.accessory?.stats.dex || 0) + (equipment.aura?.stats.dex || 0);
  const totalInt = player.stats.int + (equipment.weapon?.stats.int || 0) + (equipment.armor?.stats.int || 0) + (equipment.accessory?.stats.int || 0) + (equipment.aura?.stats.int || 0);

  const baseDamage = 10 + (player.level - 1) * 2 + (totalStr - 10) * 1;
  const equipDamage = (equipment.weapon?.stats.damage || 0) + (equipment.accessory?.stats.damage || 0) + (equipment.aura?.stats.damage || 0);
  const newDamage = (baseDamage + equipDamage) * (1 + damageBuff);

  const hpFromStr = totalStr * 10;
  const baseMaxHp = 100 + (player.level - 1) * 25 + hpFromStr;
  const itemHp = (equipment.armor?.stats.hp || 0) + (equipment.accessory?.stats.hp || 0) + (equipment.aura?.stats.hp || 0);
  const newMaxHp = baseMaxHp + itemHp;

  const drFromStr = totalStr * 0.1;
  const baseDefense = 5 + (player.level - 1) * 1.5;
  const equipDefense = (equipment.armor?.stats.defense || 0) + (equipment.aura?.stats.defense || 0);
  const newDefense = (baseDefense + equipDefense) * (1 + defenseBuff);

  const critFromDex = totalDex * 1.0;
  const speedFromDex = totalDex * 0.0005; 
  const expFromInt = Math.floor(totalInt / 10) * 0.01;

  // New Affixes
  const totalLifesteal = (equipment.weapon?.stats.lifesteal || 0) + (equipment.armor?.stats.lifesteal || 0) + (equipment.accessory?.stats.lifesteal || 0) + (equipment.aura?.stats.lifesteal || 0);
  const totalDodge = (equipment.weapon?.stats.dodge || 0) + (equipment.armor?.stats.dodge || 0) + (equipment.accessory?.stats.dodge || 0) + (equipment.aura?.stats.dodge || 0) + (totalDex * 0.2); // Dex gives a little dodge
  const totalCritDamage = 150 + (equipment.weapon?.stats.critDamage || 0) + (equipment.armor?.stats.critDamage || 0) + (equipment.accessory?.stats.critDamage || 0) + (equipment.aura?.stats.critDamage || 0);
  const totalHpRegen = (equipment.weapon?.stats.hpRegen || 0) + (equipment.armor?.stats.hpRegen || 0) + (equipment.accessory?.stats.hpRegen || 0) + (equipment.aura?.stats.hpRegen || 0);

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
      expMultiplier: (1 + expFromInt) * (1 + expBuff),
      lifesteal: totalLifesteal,
      dodge: totalDodge,
      critDamage: totalCritDamage,
      hpRegen: totalHpRegen
    }
  };
}

export const useGameStore = create<GameState>((set, get) => ({
  currentTargetId: null,
  setCurrentTargetId: (id) => set({ currentTargetId: id }),
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
    recipes: { common: 999 }, // Infinite common recipes
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
      lifesteal: 0,
      dodge: 0,
      critDamage: 150,
      hpRegen: 0
    },
  },
  equipment: {
    weapon: null,
    armor: null,
    accessory: null,
    aura: null,
  },
  inventory: [],
  onlinePlayers: [],
  enemies: [],
  isAutoBattle: false,
  locations: [
    { id: 'forest', name: 'Окраина Леса', minLevel: 1, cost: 0, enemyBaseHp: 30, color: '#0a1a10', groundTheme: 'forest', description: 'Обычные и необычные вещи' },
    { id: 'deep_forest', name: 'Глубины Леса', minLevel: 5, cost: 200, enemyBaseHp: 80, color: '#051008', groundTheme: 'forest', description: 'Необычные вещи, шанс на редкие' },
    { id: 'caves', name: 'Пещеры Эха', minLevel: 10, cost: 750, enemyBaseHp: 200, color: '#111116', groundTheme: 'cave', description: 'Редкие вещи, шанс на частицы' },
    { id: 'abyss', name: 'Бездна', minLevel: 20, cost: 3000, enemyBaseHp: 550, color: '#09090b', groundTheme: 'cave', description: 'Эпические вещи, осколки' },
    { id: 'citadel', name: 'Проклятая Цитадель', minLevel: 35, cost: 10000, enemyBaseHp: 1500, color: '#160808', groundTheme: 'citadel', description: 'Легендарные вещи, море осколков и частиц' },
    { id: 'inferno', name: 'Пекло', minLevel: 50, cost: 50000, enemyBaseHp: 4000, color: '#2a0505', groundTheme: 'citadel', description: 'Мифические вещи, ценные материалы' },
    { id: 'dungeon_1', name: 'Лабиринт Забвения', minLevel: 10, cost: 500, enemyBaseHp: 300, color: '#1a1020', groundTheme: 'dungeon_corridor', isDungeon: true, description: 'Шанс на Ультра вещи (Босс), много осколков' },
    { id: 'dungeon_2', name: 'Разлом Бездны', minLevel: 30, cost: 5000, enemyBaseHp: 1200, color: '#0f0514', groundTheme: 'dungeon_corridor', isDungeon: true, description: 'Высокий шанс на Мифические и Ультра, осколки' },
    { id: 'dungeon_3', name: 'Чертоги Хаоса', minLevel: 60, cost: 100000, enemyBaseHp: 8000, color: '#200505', groundTheme: 'citadel', isDungeon: true, description: 'Только Легендарные, Мифические и Ультра!' },
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
  dungeonState: { bossDefeated: false, chestOpened: false },
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
        
        let parsedRecipes = loadedPlayer.recipes || { common: 999 };
        if (Array.isArray(parsedRecipes)) {
           const migrated: Record<string, number> = { common: 999 };
           parsedRecipes.forEach(r => { migrated[r] = 999; }); // Give enough fragments if they previously unlocked it
           parsedRecipes = migrated;
        }

        let parsedGold = Number(loadedPlayer.gold);
        if (isNaN(parsedGold)) parsedGold = 100;
        let parsedShards = Number(loadedPlayer.shards);
        if (isNaN(parsedShards)) parsedShards = 0;

        let initialPlayer = { ...loadedPlayer, gold: parsedGold, shards: parsedShards, recipes: parsedRecipes, statPoints, nextLevelExp: correctedNextLevelExp, buffs: loadedPlayer.buffs || [], stats: mergedStats };
        const loadedEquipment = data.equipment || defaultState.equipment;
        // Recalculate stats based on real equipment to fix any legacy missing stats (like damage or atkSpeed)
        initialPlayer = recalculatePlayerStats(initialPlayer, loadedEquipment);
        
        const testUser = defaultState.user?.email?.toLowerCase().includes('aresik') || defaultState.user?.email === 'sfsf434433@gmail.com';
        if (testUser) {
           initialPlayer.gold = Math.max(initialPlayer.gold, 1100000);
           initialPlayer.shards = Math.max(initialPlayer.shards, 1100000);
           initialPlayer.recipes['ultra'] = Math.max(initialPlayer.recipes['ultra'] || 0, 1000);
           initialPlayer.recipes['mythic'] = Math.max(initialPlayer.recipes['mythic'] || 0, 1000);
           initialPlayer.recipes['legendary'] = Math.max(initialPlayer.recipes['legendary'] || 0, 1000);
        }

        // Deduplicate inventory by ID
        let uniqueInventory = (data.inventory || []).reduce((acc: Item[], current: Item) => {
          const x = acc.find(item => item.id === current.id);
          if (!x) {
            return acc.concat([current]);
          } else {
            // Give duplicate items a new unique ID
            return acc.concat([{ ...current, id: Math.random().toString() }]);
          }
        }, []);

        if (testUser) {
            const hasAura = uniqueInventory.some((i: Item) => i.type === 'aura');
            if (!hasAura) {
               uniqueInventory.push(generateRandomItem(50, 'epic', 'aura'));
               uniqueInventory.push(generateRandomItem(60, 'legendary', 'aura'));
               uniqueInventory.push(generateRandomItem(70, 'mythic', 'aura'));
               uniqueInventory.push(generateRandomItem(80, 'ultra', 'aura'));
            }
        }

        set({
          player: initialPlayer,
          equipment: loadedEquipment,
          inventory: uniqueInventory,
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
      
      const isBoss = enemy.type === 'boss';
      
      const shardAmount = isBoss ? Math.floor(Math.random() * 50 * enemy.level * difficultyMultiplier) + 100 : Math.floor(Math.random() * 5 * enemy.level * difficultyMultiplier) + 1;
      const goldAmount = isBoss ? Math.floor(enemy.level * 50 * difficultyMultiplier) + Math.floor(Math.random() * 1000) : Math.floor(enemy.level * 5 * difficultyMultiplier) + Math.floor(Math.random() * 10);
      
      const recipeRoll = Math.random() * 100;
      const potionRoll = Math.random() * 100;
      let newRecipe: string | null = null;
      let newPotionCount = state.player.potions;

      if (potionRoll < (10 + difficultyMultiplier)) {
        newPotionCount += 1;
      }
      
      // Better recipes drop more frequently in higher levels
      if (recipeRoll < 1.0 * difficultyMultiplier || isBoss) newRecipe = 'ultra';
      else if (recipeRoll < 3.0 * difficultyMultiplier) newRecipe = 'mythic';
      else if (recipeRoll < 7.0 * difficultyMultiplier) newRecipe = 'legendary';
      else if (recipeRoll < 12.0 * difficultyMultiplier) newRecipe = 'epic';
      else if (recipeRoll < 20.0 * difficultyMultiplier) newRecipe = 'rare';
      else if (recipeRoll < 35.0) newRecipe = 'uncommon';

      const updatedRecipes = { ...state.player.recipes };
      if (newRecipe) {
        updatedRecipes[newRecipe] = (updatedRecipes[newRecipe] || 0) + 1;
      }
      if (isBoss) {
        // give additional drops
        updatedRecipes['mythic'] = (updatedRecipes['mythic'] || 0) + 1;
      }
      
      const expGain = Math.floor(enemy.level * 20 * state.player.stats.expMultiplier) * (isBoss ? 10 : 1);
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
      
      const droppedItems: Item[] = [];
      if (Math.random() < 0.03 || isBoss) {
         let dropRarity = 'uncommon';
         if (isBoss) dropRarity = Math.random() > 0.8 ? 'ultra' : Math.random() > 0.2 ? 'mythic' : 'legendary';
         else if (Math.random() < 0.01) dropRarity = 'mythic';
         else if (Math.random() < 0.05) dropRarity = 'legendary';
         else if (Math.random() < 0.2) dropRarity = 'epic';
         else if (Math.random() < 0.5) dropRarity = 'rare';
         
         droppedItems.push(generateRandomItem(enemy.level, dropRarity));
      }

      return {
        enemies: state.enemies.filter(e => e.id !== id),
        ...(isBoss ? { dungeonState: { ...state.dungeonState, bossDefeated: true } } : {}),
        inventory: [...state.inventory, ...droppedItems],
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
    const type = item.type;
    const reqLevels: Record<string, number> = {
      common: 5, uncommon: 10, rare: 15, epic: 30, legendary: 40, mythic: 50, ultra: 65
    };
    if (state.player.level < (reqLevels[item.rarity] || 0)) {
       return state;
    }
    
    // To prevent duplicate keys bug
    const itemExists = state.inventory.some(i => i.id === item.id);
    if (!itemExists) return state;

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
    // Check if the item is indeed in the inventory
    const itemExists = state.inventory.some(i => i.id === item.id);
    if (!itemExists) return state;

    const rarityMultipliers = { common: 10, uncommon: 50, rare: 200, epic: 1000, legendary: 5000, mythic: 25000 };
    const price = rarityMultipliers[item.rarity as keyof typeof rarityMultipliers] * (item.level || 1);
    setTimeout(() => useGameStore.getState().saveGame(), 100);

    return {
      inventory: state.inventory.filter(i => i.id !== item.id),
      player: { ...state.player, gold: state.player.gold + price }
    };
  }),
  craftItem: (rarity, itemType) => set((state) => {
    const costs: Record<string, { shards: number, gold: number, recipes: number, value: number, speed?: number }> = {
      common: { shards: 10, gold: 50, recipes: 0, value: 10 },
      uncommon: { shards: 40, gold: 200, recipes: 1, value: 25 },
      rare: { shards: 150, gold: 1000, recipes: 3, value: 60 },
      epic: { shards: 500, gold: 5000, recipes: 5, value: 125 },
      legendary: { shards: 2000, gold: 25000, recipes: 10, value: 250, speed: 2 },
      mythic: { shards: 10000, gold: 150000, recipes: 25, value: 600, speed: 2.5 },
      ultra: { shards: 300000, gold: 300000, recipes: 50, value: 2000, speed: 3.5 }
    };

    const cost = costs[rarity];
    const playerRecipes = state.player.recipes[rarity] || 0;
    
    if (!cost || state.player.shards < cost.shards || state.player.gold < cost.gold || playerRecipes < cost.recipes) return state;

    const rarityLabels: Record<string, string> = {
      common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный', mythic: 'Мифический', ultra: 'Ультра'
    };

    const typeLabels: Record<string, string> = {
      sword: 'Меч', bow: 'Лук', staff: 'Посох', armor: 'Доспех', accessory: 'Амулет'
    };

    const weaponTypes = ['sword', 'bow', 'staff'];
    const isWeapon = weaponTypes.includes(itemType);

    const stats: any = {};
    if (isWeapon) {
      stats.damage = cost.value;
      stats.atkSpeed = cost.speed || 1;
      if (rarity === 'ultra') {
        if (itemType === 'sword') stats.str = 100;
        if (itemType === 'bow') stats.dex = 100;
        if (itemType === 'staff') stats.int = 100;
      }
    } else if (itemType === 'armor') {
      stats.hp = cost.value * 5;
      stats.defense = Math.floor(cost.value / 2);
      if (rarity === 'ultra') {
        stats.hp += 500;
        stats.defense += 200;
      }
    } else if (itemType === 'accessory') {
      stats.damage = Math.floor(cost.value * 0.4);
      if (rarity === 'ultra') {
        stats.str = 50;
        stats.dex = 50;
        stats.int = 50;
      }
    }

    // Diablo-like Affix randomizer
    const rarityTiers: Record<string, number> = {
      common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 6, ultra: 10
    };
    const tier = rarityTiers[rarity];
    
    if (tier >= 2) {
      const affixCount = Math.min(5, tier - 1);
      const possibleAffixes = ['lifesteal', 'dodge', 'critDamage', 'hpRegen', 'str', 'dex', 'int'];
      for (let i = 0; i < affixCount; i++) {
        const affix = possibleAffixes[Math.floor(Math.random() * possibleAffixes.length)];
        const value = Math.floor(Math.random() * 10 * tier) + tier;
        if (affix === 'lifesteal') stats[affix] = (stats[affix] || 0) + Math.min(value, 20); // Max 20% lifesteal per roll
        else if (affix === 'dodge') stats[affix] = (stats[affix] || 0) + Math.min(value, 15); // Max 15% dodge per roll
        else if (affix === 'critDamage') stats[affix] = (stats[affix] || 0) + value * 2;
        else if (affix === 'hpRegen') stats[affix] = (stats[affix] || 0) + value * 5;
        else stats[affix] = (stats[affix] || 0) + value * 3;
      }
    }

    const newItem: Item = {
      id: Math.random().toString(),
      name: `${rarityLabels[rarity]} ${typeLabels[itemType]}`,
      type: isWeapon ? 'weapon' : itemType as any,
      rarity: rarity as any,
      stats,
      icon: isWeapon ? itemType : itemType,
      level: state.player.level,
      sockets: rarity === 'ultra' ? 5 : rarity === 'mythic' ? 4 : rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : rarity === 'rare' ? 1 : 0,
      gems: []
    };

    setTimeout(() => useGameStore.getState().saveGame(), 100);

    return {
      player: { 
        ...state.player, 
        shards: state.player.shards - cost.shards, 
        gold: state.player.gold - cost.gold,
        recipes: {
          ...state.player.recipes,
          [rarity]: (state.player.recipes[rarity] || 0) - cost.recipes
        }
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
  openChest: () => set((state) => {
    if (state.dungeonState.chestOpened) return state;
    const shardsReward = 5000 + Math.floor(Math.random() * 5000);
    const goldReward = 50000 + Math.floor(Math.random() * 50000);
    
    // Give random legendary/mythic/ultra recipes
    const newRecipes = { ...state.player.recipes };
    newRecipes['legendary'] = (newRecipes['legendary'] || 0) + 1;
    if (Math.random() > 0.5) newRecipes['mythic'] = (newRecipes['mythic'] || 0) + 1;
    if (Math.random() > 0.3) newRecipes['ultra'] = (newRecipes['ultra'] || 0) + 1;
    
    // Random legendary/mythic item generator
    const randomRarity = Math.random() > 0.8 ? 'ultra' : Math.random() > 0.5 ? 'mythic' : 'legendary';
    const loc = state.locations.find(l => l.id === state.currentLocationId);
    
    const newItem = generateRandomItem(loc?.minLevel || 10, randomRarity);
    newItem.name = `Трофей Подземелья (${randomRarity})`;
    
    return {
      dungeonState: { ...state.dungeonState, chestOpened: true },
      inventory: [...state.inventory, newItem],
      player: {
        ...state.player,
        shards: state.player.shards + shardsReward,
        gold: state.player.gold + goldReward,
        recipes: newRecipes
      }
    };
  }),
  teleport: (locationId) => set((state) => {
    const loc = state.locations.find(l => l.id === locationId);
    if (!loc) return state;
    if (state.player.level < loc.minLevel) return state;
    if (state.player.gold < loc.cost) return state;

    setTimeout(() => useGameStore.getState().saveGame(), 100);

    return {
      currentLocationId: locationId,
      enemies: [], // Clear enemies on teleport
      dungeonState: { bossDefeated: false, chestOpened: false },
      player: { ...state.player, gold: state.player.gold - loc.cost, x: 50, y: 500 } // Start at x=50 to make walking the corridor easy
    };
  }),
  buyInShop: (itemId, quantity) => set((state) => {
    const item = state.shopItems.find(i => i.id === itemId);
    if (!item) return state;
    const totalCost = item.price * quantity;
    if (state.player.gold < totalCost) return state;

    let playerUpdate = { ...state.player, gold: state.player.gold - totalCost };
    let newInventory = [...state.inventory];

    if (item.type === 'potion') {
      playerUpdate.potions += quantity;
    } else if (item.type === 'gear' && item.item) {
        for (let i = 0; i < quantity; i++) {
           newInventory.push({ ...item.item, id: Math.random().toString() });
        }
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
    return { player: updatedPlayer, inventory: newInventory };
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
    const existingBuffIndex = state.player.buffs?.findIndex(b => b.type === buff.type) ?? -1;
    let newBuffs = [...(state.player.buffs || [])];
    if (existingBuffIndex >= 0) {
       newBuffs[existingBuffIndex] = buff;
    } else {
       newBuffs.push(buff);
    }
    const updatedPlayer = recalculatePlayerStats({
      ...state.player,
      buffs: newBuffs
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
