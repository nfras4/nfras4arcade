export interface WordEntry {
  word: string;
  hints: string[];
}

export interface Category {
  name: string;
  words: WordEntry[];
}

export const categories: Category[] = [
  {
    name: 'Clash Royale Cards',
    words: [
      { word: 'Knight', hints: ['sword', 'mustache', 'cheap elixir'] },
      { word: 'Hog Rider', hints: ['pig', 'hammer', 'bridge spam'] },
      { word: 'Musketeer', hints: ['gun', 'single target', 'french hat'] },
      { word: 'Giant', hints: ['big guy', 'slow walker', 'only hits buildings'] },
      { word: 'Skeleton Army', hints: ['bones', 'swarm', 'fragile'] },
      { word: 'Baby Dragon', hints: ['flying', 'splash damage', 'purple'] },
      { word: 'Prince', hints: ['horse', 'lance', 'charge attack'] },
      { word: 'Wizard', hints: ['fireball', 'splash damage', 'beard'] },
      { word: 'Mini P.E.K.K.A', hints: ['pancakes', 'butterfly', 'heavy hitter'] },
      { word: 'Valkyrie', hints: ['axe', 'spin attack', 'orange hair'] },
      { word: 'Goblin Barrel', hints: ['thrown', 'three goblins', 'spell'] },
      { word: 'Fireball', hints: ['explosion', 'orange spell', 'area damage'] },
      { word: 'Witch', hints: ['skeletons', 'splash', 'spawner'] },
      { word: 'Balloon', hints: ['flying', 'bombs', 'death damage'] },
      { word: 'Golem', hints: ['rock', 'splits', 'expensive'] },
      { word: 'P.E.K.K.A', hints: ['armor', 'butterfly', 'seven elixir'] },
      { word: 'Electro Wizard', hints: ['zap', 'spawn damage', 'dual target'] },
      { word: 'Bandit', hints: ['dash', 'invincible', 'mask'] },
      { word: 'Royal Giant', hints: ['cannon', 'ranged building targeter', 'big'] },
      { word: 'Sparky', hints: ['electricity', 'slow charge', 'trash can'] },
      { word: 'Inferno Tower', hints: ['building', 'increasing damage', 'melts tanks'] },
      { word: 'Freeze', hints: ['ice', 'spell', 'stops movement'] },
      { word: 'Lumberjack', hints: ['axe', 'fast', 'drops rage'] },
      { word: 'Mega Knight', hints: ['jump', 'heavy armor', 'splash landing'] },
      { word: 'Ram Rider', hints: ['mount', 'snare', 'charges buildings'] },
      { word: 'Archer Queen', hints: ['cloak', 'bow', 'invisible'] },
      { word: 'Golden Knight', hints: ['dash chain', 'gold armor', 'melee'] },
      { word: 'Skeleton King', hints: ['crown', 'soul summoner', 'undead'] },
      { word: 'Elixir Golem', hints: ['blob', 'splits twice', 'gives elixir'] },
      { word: 'Tornado', hints: ['pull', 'wind', 'king tower activation'] },
    ]
  },
  {
    name: 'Animals',
    words: [
      { word: 'Elephant', hints: ['trunk', 'gray', 'big ears'] },
      { word: 'Penguin', hints: ['tuxedo', 'ice', 'waddle'] },
      { word: 'Giraffe', hints: ['long neck', 'spots', 'tall'] },
      { word: 'Octopus', hints: ['tentacles', 'ink', 'ocean'] },
      { word: 'Eagle', hints: ['bald', 'talons', 'soaring'] },
      { word: 'Chameleon', hints: ['color change', 'tongue', 'eyes'] },
      { word: 'Dolphin', hints: ['smart', 'ocean', 'jumping'] },
      { word: 'Kangaroo', hints: ['pouch', 'jumping', 'australia'] },
      { word: 'Panda', hints: ['bamboo', 'black and white', 'china'] },
      { word: 'Shark', hints: ['fins', 'teeth', 'ocean predator'] },
      { word: 'Owl', hints: ['nocturnal', 'wise', 'head rotation'] },
      { word: 'Flamingo', hints: ['pink', 'one leg', 'shrimp diet'] },
      { word: 'Sloth', hints: ['slow', 'tree', 'claws'] },
      { word: 'Cheetah', hints: ['fast', 'spots', 'sprint'] },
      { word: 'Platypus', hints: ['bill', 'venomous', 'egg-laying mammal'] },
    ]
  },
  {
    name: 'Food & Drinks',
    words: [
      { word: 'Pizza', hints: ['cheese', 'triangle slice', 'italian'] },
      { word: 'Sushi', hints: ['rice', 'raw fish', 'japanese'] },
      { word: 'Taco', hints: ['shell', 'mexican', 'filling'] },
      { word: 'Ice Cream', hints: ['cold', 'cone', 'scoops'] },
      { word: 'Burger', hints: ['bun', 'patty', 'fast food'] },
      { word: 'Pancake', hints: ['flat', 'syrup', 'breakfast'] },
      { word: 'Ramen', hints: ['noodle soup', 'broth', 'japanese'] },
      { word: 'Chocolate', hints: ['cocoa', 'sweet', 'brown bar'] },
      { word: 'Avocado', hints: ['green', 'toast', 'pit'] },
      { word: 'Popcorn', hints: ['kernels', 'movies', 'butter'] },
      { word: 'Boba Tea', hints: ['pearls', 'straw', 'taiwanese'] },
      { word: 'Croissant', hints: ['flaky', 'crescent', 'french'] },
      { word: 'Watermelon', hints: ['seeds', 'summer', 'green rind'] },
      { word: 'Coffee', hints: ['caffeine', 'beans', 'morning'] },
      { word: 'Donut', hints: ['hole', 'glaze', 'round'] },
    ]
  },
  {
    name: 'Movies & Shows',
    words: [
      { word: 'Star Wars', hints: ['lightsaber', 'force', 'galaxy'] },
      { word: 'Harry Potter', hints: ['wand', 'wizard school', 'scar'] },
      { word: 'The Lion King', hints: ['savanna', 'circle of life', 'simba'] },
      { word: 'Stranger Things', hints: ['upside down', '80s', 'eleven'] },
      { word: 'Shrek', hints: ['ogre', 'swamp', 'onion layers'] },
      { word: 'Breaking Bad', hints: ['chemistry', 'desert', 'blue product'] },
      { word: 'Titanic', hints: ['ship', 'iceberg', 'jack and rose'] },
      { word: 'The Office', hints: ['paper company', 'michael', 'mockumentary'] },
      { word: 'Jurassic Park', hints: ['dinosaurs', 'island', 'DNA'] },
      { word: 'Frozen', hints: ['ice queen', 'let it go', 'snowman'] },
      { word: 'Game of Thrones', hints: ['iron throne', 'dragons', 'winter'] },
      { word: 'Spider-Man', hints: ['web', 'wall crawling', 'new york'] },
      { word: 'The Matrix', hints: ['red pill', 'simulation', 'neo'] },
      { word: 'Avatar', hints: ['blue people', 'pandora', 'nature'] },
      { word: 'Squid Game', hints: ['children games', 'korean', 'elimination'] },
    ]
  },
  {
    name: 'Professions',
    words: [
      { word: 'Firefighter', hints: ['hose', 'red truck', 'flames'] },
      { word: 'Astronaut', hints: ['space', 'helmet', 'zero gravity'] },
      { word: 'Chef', hints: ['kitchen', 'white hat', 'cooking'] },
      { word: 'Pilot', hints: ['cockpit', 'altitude', 'uniform'] },
      { word: 'Detective', hints: ['clues', 'magnifying glass', 'mystery'] },
      { word: 'Surgeon', hints: ['scalpel', 'operating room', 'scrubs'] },
      { word: 'Lifeguard', hints: ['pool', 'whistle', 'rescue'] },
      { word: 'Archaeologist', hints: ['dig', 'artifacts', 'ancient'] },
      { word: 'Magician', hints: ['hat', 'tricks', 'disappear'] },
      { word: 'DJ', hints: ['turntable', 'beats', 'headphones'] },
      { word: 'Blacksmith', hints: ['anvil', 'hammer', 'forge'] },
      { word: 'Barista', hints: ['espresso', 'milk foam', 'cafe'] },
    ]
  },
  {
    name: 'Sports',
    words: [
      { word: 'Basketball', hints: ['hoop', 'dribble', 'court'] },
      { word: 'Tennis', hints: ['racket', 'love score', 'net'] },
      { word: 'Swimming', hints: ['pool', 'lanes', 'strokes'] },
      { word: 'Archery', hints: ['bow', 'target', 'bullseye'] },
      { word: 'Surfing', hints: ['waves', 'board', 'ocean'] },
      { word: 'Fencing', hints: ['sword', 'mask', 'lunge'] },
      { word: 'Boxing', hints: ['ring', 'gloves', 'knockout'] },
      { word: 'Golf', hints: ['hole', 'club', 'green'] },
      { word: 'Skiing', hints: ['snow', 'poles', 'mountain'] },
      { word: 'Cricket', hints: ['bat', 'wicket', 'pitch'] },
      { word: 'Karate', hints: ['belt', 'dojo', 'kick'] },
      { word: 'Formula 1', hints: ['pit stop', 'circuit', 'fast car'] },
    ]
  },
  {
    name: 'Landmarks',
    words: [
      { word: 'Eiffel Tower', hints: ['paris', 'iron', 'tall structure'] },
      { word: 'Great Wall', hints: ['china', 'long', 'ancient defense'] },
      { word: 'Pyramids', hints: ['egypt', 'triangle', 'pharaoh'] },
      { word: 'Statue of Liberty', hints: ['torch', 'new york', 'green'] },
      { word: 'Colosseum', hints: ['rome', 'gladiators', 'arena'] },
      { word: 'Taj Mahal', hints: ['india', 'white marble', 'love'] },
      { word: 'Big Ben', hints: ['clock', 'london', 'tower'] },
      { word: 'Mount Everest', hints: ['tallest', 'nepal', 'climbing'] },
      { word: 'Stonehenge', hints: ['rocks', 'circle', 'england'] },
      { word: 'Niagara Falls', hints: ['waterfall', 'border', 'mist'] },
      { word: 'Machu Picchu', hints: ['inca', 'peru', 'mountain ruins'] },
      { word: 'Sydney Opera House', hints: ['sails', 'australia', 'performing arts'] },
    ]
  },
  {
    name: 'Video Games',
    words: [
      { word: 'Minecraft', hints: ['blocks', 'crafting', 'creeper'] },
      { word: 'Fortnite', hints: ['battle bus', 'building', 'storm'] },
      { word: 'Mario', hints: ['plumber', 'mushroom', 'princess'] },
      { word: 'Zelda', hints: ['link', 'triforce', 'hyrule'] },
      { word: 'Pokemon', hints: ['catch', 'pokeball', 'evolve'] },
      { word: 'GTA', hints: ['open world', 'cars', 'crime'] },
      { word: 'Tetris', hints: ['blocks', 'lines', 'falling'] },
      { word: 'Among Us', hints: ['crew', 'tasks', 'suspicious'] },
      { word: 'Pac-Man', hints: ['dots', 'ghosts', 'maze'] },
      { word: 'Dark Souls', hints: ['difficult', 'bonfire', 'you died'] },
      { word: 'Roblox', hints: ['user-made', 'robux', 'avatar'] },
      { word: 'Valorant', hints: ['agents', 'spike', 'tactical shooter'] },
      { word: 'League of Legends', hints: ['lanes', 'champions', 'nexus'] },
      { word: 'Elden Ring', hints: ['open world', 'tarnished', 'erdtree'] },
      { word: 'Rocket League', hints: ['car', 'soccer', 'boost'] },
    ]
  }
];

export function getCategories(): string[] {
  return categories.map(c => c.name);
}

export function getRandomWord(categoryName: string): { word: string; hint: string; category: string } | null {
  const category = categories.find(c => c.name === categoryName);
  if (!category || category.words.length === 0) return null;

  const entry = category.words[Math.floor(Math.random() * category.words.length)];
  const hint = entry.hints[Math.floor(Math.random() * entry.hints.length)];

  return { word: entry.word, hint, category: categoryName };
}

export function getRandomCategory(): string {
  return categories[Math.floor(Math.random() * categories.length)].name;
}
