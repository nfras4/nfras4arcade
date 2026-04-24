import type { Difficulty } from '../../src/lib/types';

export interface WordEntry {
  word: string;
  hints: string[];
}

export interface Category {
  name: string;
  difficulty: Difficulty;
  words: WordEntry[];
}

export const categories: Category[] = [
  {
    name: 'Clash Royale Cards',
    difficulty: 'hard',
    words: [
      { word: 'Knight', hints: ['ladder staple', 'cycling backbone', 'three elixir value'] },
      { word: 'Hog Rider', hints: ['OKAYYYY', 'bridge threat', 'cycle win con'] },
      { word: 'Musketeer', hints: ['anti-air support', 'ranged backbone', 'three musketeers'] },
      { word: 'Giant', hints: ['push frontline', 'ignores troops', 'distraction tank'] },
      { word: 'Skeleton Army', hints: ['log bait', 'death by quantity', 'spell bait'] },
      { word: 'Baby Dragon', hints: ['hybrid support', 'flying splash', 'starting hand pick'] },
      { word: 'Prince', hints: ['double prince push', 'charging threat', 'one-shot danger'] },
      { word: 'Wizard', hints: ['behind the giant', 'area control', 'swarm killer support'] },
      { word: 'Mini P.E.K.K.A', hints: ['pancakes', 'punish card', 'lonely terror'] },
      { word: 'Valkyrie', hints: ['spin to win', 'ground splash', 'swarm counter'] },
      { word: 'Goblin Barrel', hints: ['tower snacker', 'bait favorite', 'spell counters it'] },
      { word: 'Fireball', hints: ['medium spell', 'arena tower chip', 'three elixir nuke'] },
      { word: 'Witch', hints: ['skeleton summoner', 'graveyard friend', 'triple threat'] },
      { word: 'Balloon', hints: ['tower killer', 'death bomb drop', 'lumberjack pairs'] },
      { word: 'Golem', hints: ['heavy push anchor', 'splits on death', 'eight elixir risk'] },
      { word: 'P.E.K.K.A', hints: ['butterfly says hi', 'defense monster', 'seven elixir legend'] },
      { word: 'Electro Wizard', hints: ['sparky counter', 'reset mechanic', 'twin target'] },
      { word: 'Bandit', hints: ['untouchable dash', 'dark prince companion', 'mirror pick'] },
      { word: 'Royal Giant', hints: ['ladder menace', 'ranged building sniper', 'fan least favorite'] },
      { word: 'Sparky', hints: ['charge patience', 'tesla trash can', 'electro terror'] },
      { word: 'Inferno Tower', hints: ['tank melter', 'building beam', 'increasing damage'] },
      { word: 'Freeze', hints: ['desperation spell', 'clutch time buyer', 'tower save'] },
      { word: 'Lumberjack', hints: ['rage on death', 'balloon friend', 'fastest axeman'] },
      { word: 'Mega Knight', hints: ['spawn damage jumper', 'swarm stomper', 'ladder bully'] },
      { word: 'Ram Rider', hints: ['lasso snare', 'bridge charger', 'duo mount'] },
      { word: 'Archer Queen', hints: ['clutch invisible', 'ability timing skill', 'bow champion'] },
      { word: 'Golden Knight', hints: ['chain dasher', 'newest champion', 'golden blur'] },
      { word: 'Skeleton King', hints: ['soul collector', 'revive mechanic', 'undead champion'] },
      { word: 'Elixir Golem', hints: ['risky push', 'gifts enemy elixir', 'double split blob'] },
      { word: 'Tornado', hints: ['king activator', 'crowd puller', 'spell combo enabler'] },
    ]
  },
  {
    name: 'Animals',
    difficulty: 'balanced',
    words: [
      { word: 'Elephant', hints: ['never forgets', 'mourns its dead', 'mud bath lover'] },
      { word: 'Penguin', hints: ['toboggans on belly', 'formal dresser', 'flightless diver'] },
      { word: 'Giraffe', hints: ['awkward drinker', 'ossicones on head', 'sleeps two minutes'] },
      { word: 'Octopus', hints: ['three hearts', 'nine brains', 'jar opener'] },
      { word: 'Eagle', hints: ['thermal rider', 'screaming hawk sound', 'patriotic symbol'] },
      { word: 'Chameleon', hints: ['tongue longer than body', 'slowest lizard', 'independent eyes'] },
      { word: 'Dolphin', hints: ['sleeps half brain', 'breathes through forehead', 'plays with prey'] },
      { word: 'Kangaroo', hints: ['boxing stance', 'mob is the plural', 'joey in pocket'] },
      { word: 'Panda', hints: ['digestion failure', 'diplomatic gift animal', 'bamboo only diet'] },
      { word: 'Shark', hints: ['boneless skeleton', 'electroreception sense', 'teeth rows replace'] },
      { word: 'Owl', hints: ['regurgitated pellets', 'parliament is the group', 'silent flight'] },
      { word: 'Flamingo', hints: ['born grey', 'color comes from food', 'filter feeder'] },
      { word: 'Sloth', hints: ['algae grows in fur', 'month to digest', 'lives upside down'] },
      { word: 'Cheetah', hints: ['purrs not roars', 'needs post-chase rest', 'semi-retractable claws'] },
      { word: 'Platypus', hints: ['ankle spurs sting', 'evolution confusion', 'bill has electroreceptors'] },
    ]
  },
  {
    name: 'Food & Drinks',
    difficulty: 'balanced',
    words: [
      { word: 'Pizza', hints: ['pineapple war', 'margherita origin', 'new haven vs neapolitan'] },
      { word: 'Sushi', hints: ['omakase trust', 'wasabi often fake', 'vinegared rice base'] },
      { word: 'Taco', hints: ['tuesday tradition', 'corn vs flour debate', 'al pastor spit'] },
      { word: 'Ice Cream', hints: ['brain freeze nerve', 'machine always broken', 'van melody'] },
      { word: 'Burger', hints: ['smash technique', 'drive-through staple', 'lettuce wrap trend'] },
      { word: 'Pancake', hints: ['dutch baby cousin', 'batter resting tip', 'sunday stack ritual'] },
      { word: 'Ramen', hints: ['24-hour broth', 'slurping is polite', 'soft egg topping'] },
      { word: 'Chocolate', hints: ['Mayan original', 'cacao fermented', 'tempering technique'] },
      { word: 'Avocado', hints: ['ripeness gamble', 'millennial blamed', 'guacamole upcharge'] },
      { word: 'Popcorn', hints: ['cinema markup', 'hull lodged in teeth', 'microwave direction matters'] },
      { word: 'Boba Tea', hints: ['thick straw needed', 'sugar level choice', 'tapioca spheres'] },
      { word: 'Croissant', hints: ['Austrian not French', 'laminated dough', 'buttery layers'] },
      { word: 'Watermelon', hints: ['92% water', 'rind pickled in south', 'seed spitting sport'] },
      { word: 'Coffee', hints: ['civet digested variety', 'third wave obsession', 'latte art leaf'] },
      { word: 'Donut', hints: ['cop stereotype', 'hole saves dough', 'krispy kreme queue'] },
    ]
  },
  {
    name: 'Movies & Shows',
    difficulty: 'easy',
    words: [
      { word: 'Star Wars', hints: ['parsecs misused', 'uncle burned homestead', 'midi-chlorians controversy'] },
      { word: 'Harry Potter', hints: ['under the stairs', 'house elf rights', 'deluminator gift'] },
      { word: 'The Lion King', hints: ['stampede trauma', 'remember who you are', 'hakuna matata'] },
      { word: 'Stranger Things', hints: ['eggo obsession', 'will byers found', 'hawkins lab secret'] },
      { word: 'Shrek', hints: ['all star entrance', 'what are you doing in my', 'far far away'] },
      { word: 'Breaking Bad', hints: ['I am the danger', 'pizza on the roof', 'say my name'] },
      { word: 'Titanic', hints: ['door debate endless', 'steerage passenger', 'heart will go on'] },
      { word: 'The Office', hints: ['thats what she said', 'jim stare to camera', 'dunder mifflin scranton'] },
      { word: 'Jurassic Park', hints: ['clever girl', 'spared no expense', 'objects in mirror'] },
      { word: 'Frozen', hints: ['door argument', 'true love twist', 'conceal dont feel'] },
      { word: 'Game of Thrones', hints: ['red wedding shock', 'disappointing final season', 'you know nothing'] },
      { word: 'Spider-Man', hints: ['great power lesson', 'radioactive bite origin', 'multiverse meeting'] },
      { word: 'The Matrix', hints: ['spoon does not exist', 'bullet time dodge', 'follow the rabbit'] },
      { word: 'Avatar', hints: ['unobtanium', 'neural queue bond', 'tree of souls'] },
      { word: 'Squid Game', hints: ['dalgona honeycomb', 'red light freeze', 'marble trade twist'] },
    ]
  },
  {
    name: 'Professions',
    difficulty: 'hard',
    words: [
      { word: 'Firefighter', hints: ['dalmatian companion', 'pole sliding', 'controlled burn'] },
      { word: 'Astronaut', hints: ['freeze-dried meals', 'bone density loss', 'tether walk'] },
      { word: 'Chef', hints: ['mise en place', 'brigade hierarchy', 'toque tradition'] },
      { word: 'Pilot', hints: ['autopilot babysitter', 'callsign radio', 'license above driver'] },
      { word: 'Detective', hints: ['cold case files', 'witness contradiction', 'poker face needed'] },
      { word: 'Surgeon', hints: ['hands scrubbed before', 'no phone during', 'clamp and tie'] },
      { word: 'Lifeguard', hints: ['no running enforcer', 'red float tube', 'elevated chair post'] },
      { word: 'Archaeologist', hints: ['brush not shovel', 'stratigraphy reading', 'grid system sift'] },
      { word: 'Magician', hints: ['never reveal method', 'misdirection art', 'volunteer assistant'] },
      { word: 'DJ', hints: ['crowd read ability', 'crossfader skill', 'bpm matching'] },
      { word: 'Blacksmith', hints: ['quench in water', 'bellows pump', 'horseshoe first project'] },
      { word: 'Barista', hints: ['milk temperature critical', 'latte rosetta art', 'third place concept'] },
    ]
  },
  {
    name: 'Sports',
    difficulty: 'balanced',
    words: [
      { word: 'Basketball', hints: ['traveling violation', 'shot clock pressure', 'air ball chant'] },
      { word: 'Tennis', hints: ['love means zero', 'deuce repetition', 'Wimbledon white rule'] },
      { word: 'Swimming', hints: ['flip turn technique', 'chlorine smell lingers', 'swim cap struggle'] },
      { word: 'Archery', hints: ['three arrows per end', 'anchor point cheek', 'release surprise'] },
      { word: 'Surfing', hints: ['duck dive under', 'dawn patrol session', 'wax application'] },
      { word: 'Fencing', hints: ['right of way rule', 'touch not slash', 'en garde stance'] },
      { word: 'Boxing', hints: ['eight count standing', 'clinch escape', 'jab cross combo'] },
      { word: 'Golf', hints: ['handicap system', 'sand trap frustration', 'back nine drama'] },
      { word: 'Skiing', hints: ['pizza wedge stop', 'mogul field fear', 'chairlift etiquette'] },
      { word: 'Cricket', hints: ['googly delivery', 'tea break tradition', 'five day test'] },
      { word: 'Karate', hints: ['kiai shout', 'kata memorization', 'board breaking ceremony'] },
      { word: 'Formula 1', hints: ['DRS activation zone', 'tyre strategy critical', 'parc ferme rule'] },
    ]
  },
  {
    name: 'Landmarks',
    difficulty: 'hard',
    words: [
      { word: 'Eiffel Tower', hints: ['meant to be temporary', 'radio mast saved it', 'repainted every seven years'] },
      { word: 'Great Wall', hints: ['not visible from space', 'multiple dynasties built', 'watchtower gaps'] },
      { word: 'Pyramids', hints: ['ramps still debated', 'casing stones gone', 'interior shafts point somewhere'] },
      { word: 'Statue of Liberty', hints: ['gift from France', 'copper turned green', 'broken chain at feet'] },
      { word: 'Colosseum', hints: ['velarium shade system', 'underground animal tunnels', 'free entry once'] },
      { word: 'Taj Mahal', hints: ['decoy tomb identical', 'changes color at dawn', 'grief built it'] },
      { word: 'Big Ben', hints: ['bell is big ben', 'Elizabeth Tower renamed', 'bong sound icon'] },
      { word: 'Mount Everest', hints: ['death zone above 8k', 'queue at summit photo', 'bodies remain up there'] },
      { word: 'Stonehenge', hints: ['bluestone from Wales', 'solstice alignment', 'builders unknown'] },
      { word: 'Niagara Falls', hints: ['twice turned off', 'barrel plunge attempts', 'hydroelectric power'] },
      { word: 'Machu Picchu', hints: ['lost city rediscovered', 'no mortar used', 'abandoned not conquered'] },
      { word: 'Sydney Opera House', hints: ['architect fired midway', 'tiles self-cleaning', 'shells not sails'] },
    ]
  },
  {
    name: 'Music Artists',
    difficulty: 'easy',
    words: [
      { word: 'Taylor Swift', hints: ['easter egg master', 'revenge album writer', 'boyfriend era tracker'] },
      { word: 'Drake', hints: ['wheelchair actor origin', 'champagne papi', 'kendrick response'] },
      { word: 'Beyoncé', hints: ['surprise drop queen', 'destiny child origin', 'halftime iconic'] },
      { word: 'Eminem', hints: ['words per second record', 'Marshall Mathers real name', 'cleaning out closet'] },
      { word: 'The Beatles', hints: ['rooftop final concert', 'Ed Sullivan night', 'she loves you yeah'] },
      { word: 'Billie Eilish', hints: ['bedroom producer start', 'bond song youngest', 'oversized clothes reason'] },
      { word: 'Kanye West', hints: ['Taylor stage incident', 'dropout bear mascot', 'presidential run attempt'] },
      { word: 'Adele', hints: ['ex addressed specifically', 'comeback after silence', '21 named for age'] },
      { word: 'Michael Jackson', hints: ['socks and loafers slide', 'single sparkle glove', 'neverland home'] },
      { word: 'Ed Sheeran', hints: ['loop pedal live trick', 'game of thrones cameo', 'tattoo sleeve collector'] },
      { word: 'Rihanna', hints: ['super bowl no album', 'nine years no music', 'fenty inclusive makeup'] },
      { word: 'Freddie Mercury', hints: ['four octave range', 'teeth never fixed', 'Wembley legendary set'] },
      { word: 'Travis Scott', hints: ['Fortnite astronomical show', 'cactus jack label', 'burger collab'] },
      { word: 'Dua Lipa', hints: ['three rules for exes', 'Albanian roots', 'future nostalgia era'] },
      { word: 'Post Malone', hints: ['Hollywood curse tattoo', 'beer pong champion', 'accidental genre blend'] },
    ]
  },
  {
    name: 'Countries',
    difficulty: 'balanced',
    words: [
      { word: 'Japan', hints: ['vending machine density', 'capsule hotel sleep', 'forest bathing practice'] },
      { word: 'Brazil', hints: ['five world cups', 'Amazon lung claim', 'capoeira martial dance'] },
      { word: 'Egypt', hints: ['cats were sacred', 'hieroglyphics decoded late', 'Nile flows north'] },
      { word: 'Australia', hints: ['lost the emu war', 'venomous everything', 'upside down seasons'] },
      { word: 'Italy', hints: ['tomato from Americas', 'opera birthplace', 'coffee standing up'] },
      { word: 'Mexico', hints: ['chocolate origin country', 'avocado top exporter', 'Mesoamerican civilizations'] },
      { word: 'Iceland', hints: ['no mosquitoes', 'Green is the icy one', 'midnight sun summer'] },
      { word: 'Canada', hints: ['sorry reputation', 'poutine creation', 'two official languages'] },
      { word: 'India', hints: ['zero invented here', 'largest film industry', 'spice trade origin'] },
      { word: 'Greece', hints: ['feta name protected', 'ouzo anise drink', 'blue white island colors'] },
      { word: 'South Korea', hints: ['norebang culture', 'skincare pioneer', 'highest plastic surgery rate'] },
      { word: 'Switzerland', hints: ['four national languages', 'neutral in every war', 'fondue cultural dish'] },
      { word: 'New Zealand', hints: ['first country women voted', 'haka performance', 'Hobbiton still exists'] },
      { word: 'Thailand', hints: ['elephant sanctuaries', 'world longest city name', 'lady boy acceptance'] },
      { word: 'Norway', hints: ['oil fund per citizen', 'salmon farming giant', 'friluftsliv philosophy'] },
    ]
  },
  {
    name: 'Mythical Creatures',
    difficulty: 'hard',
    words: [
      { word: 'Dragon', hints: ['hoard guardian', 'eastern vs western differ', 'drake is wingless'] },
      { word: 'Unicorn', hints: ['Scotland national animal', 'only pure can touch', 'alicorn when winged'] },
      { word: 'Phoenix', hints: ['500-year cycle', 'tears heal wounds', 'only one exists'] },
      { word: 'Kraken', hints: ['release the order', 'Norwegian sea legend', 'tentacles grab masts'] },
      { word: 'Werewolf', hints: ['silver bullet weakness', 'wolfsbane weakens it', 'unwilling curse'] },
      { word: 'Mermaid', hints: ['lured sailors to death', 'comb and mirror carried', 'siren alternate name'] },
      { word: 'Centaur', hints: ['Chiron educated heroes', 'wine rage problem', 'Thessaly origin'] },
      { word: 'Griffin', hints: ['treasure protector', 'mates for life legend', 'heraldry favorite'] },
      { word: 'Minotaur', hints: ['Daedalus maze built', 'thread escape trick', 'Minos shame hidden'] },
      { word: 'Hydra', hints: ['cauterize to stop regrowth', 'Lernean swamp home', 'Hercules second task'] },
      { word: 'Cyclops', hints: ['nobody name trick', 'forged Zeus lightning', 'Polyphemus blinded'] },
      { word: 'Yeti', hints: ['Sherpa sightings', 'yak scalp claimed', 'abominable adjective'] },
      { word: 'Medusa', hints: ['mirror shield trick', 'Athena punished her', 'once beautiful myth'] },
      { word: 'Vampire', hints: ['invitation required entry', 'garlic origin Romania', 'Vlad inspiration'] },
      { word: 'Fairy', hints: ['iron as weakness', 'changeling left behind', 'toadstool ring home'] },
    ]
  },
  {
    name: 'School Subjects',
    difficulty: 'hard',
    words: [
      { word: 'Mathematics', hints: ['proof by contradiction', 'Fibonacci everywhere', 'unsolved Riemann hypothesis'] },
      { word: 'Chemistry', hints: ['118 elements found', 'Avogadro enormous number', 'exothermic releases heat'] },
      { word: 'History', hints: ['victors write it', 'primary source preferred', 'anachronism errors'] },
      { word: 'Biology', hints: ['mitochondria powerhouse meme', 'convergent evolution', 'kingdom classification'] },
      { word: 'Physics', hints: ['Schrödinger cat thought', 'dark matter unseen', 'speed of light constant'] },
      { word: 'Geography', hints: ['Mercator projection lies', 'Greenwich meridian start', 'tectonic plates slow'] },
      { word: 'Art', hints: ['negative space use', 'golden ratio composition', 'art vs craft debate'] },
      { word: 'Music', hints: ['perfect pitch rare', 'circle of fifths', 'polyrhythm complexity'] },
      { word: 'English', hints: ['Oxford comma war', 'unreliable narrator trick', 'passive voice avoided'] },
      { word: 'Computer Science', hints: ['off by one error', 'recursion explains itself', 'boolean only two'] },
      { word: 'Drama', hints: ['method actor commitment', 'fourth wall break', 'understudy always waits'] },
      { word: 'Economics', hints: ['invisible hand theory', 'two quarters recession', 'opportunity cost choice'] },
      { word: 'Philosophy', hints: ['trolley problem debate', 'cogito ergo sum', 'cave allegory Plato'] },
      { word: 'Psychology', hints: ['Dunning-Kruger effect', 'confirmation bias trap', 'cognitive dissonance'] },
      { word: 'Astronomy', hints: ['looking into the past', 'Pluto demoted 2006', 'dark matter mostly universe'] },
    ]
  },
  {
    name: 'Household Items',
    difficulty: 'balanced',
    words: [
      { word: 'Toaster', hints: ['crumb tray neglected', 'bagel setting exists', 'pop up startle'] },
      { word: 'Vacuum Cleaner', hints: ['Roomba pet hair fail', 'bag vs bagless war', 'Dyson ball revolution'] },
      { word: 'Mirror', hints: ['flips left right not up down', 'silver backing tarnish', 'seven years bad luck'] },
      { word: 'Alarm Clock', hints: ['snooze nine minutes why', 'placement across room trick', 'radio alternative'] },
      { word: 'Candle', hints: ['wick trim needed', 'tunneling problem', 'soy vs paraffin debate'] },
      { word: 'Pillow', hints: ['cool side flip', 'feather vs memory foam', 'hotel arrangement art'] },
      { word: 'Umbrella', hints: ['inside out in wind', 'abandoned in taxi', 'golf style oversized'] },
      { word: 'Blender', hints: ['lid forgot splash', 'tamper stick needed', 'Ninja vs Vitamix'] },
      { word: 'Scissors', hints: ['no running rule', 'left-handed version exists', 'pivot point crucial'] },
      { word: 'Remote Control', hints: ['lost in couch', 'unnecessary button count', 'volume war starter'] },
      { word: 'Doorbell', hints: ['Ring camera replaced it', 'delivery trigger', 'custom song option'] },
      { word: 'Lamp', hints: ['IKEA envy', 'Pixar no off switch', 'LED upgrade pressure'] },
      { word: 'Washing Machine', hints: ['odd sock mystery', 'wrong load size drum', 'rinse hold forgotten'] },
      { word: 'Microwave', hints: ['stops one second early', 'standing wave hot spots', 'turntable cleaning neglect'] },
      { word: 'Bookshelf', hints: ['IKEA Billy everywhere', 'books by color aesthetic', 'unread pile shame'] },
    ]
  },
  {
    name: 'Emojis',
    difficulty: 'hard',
    words: [
      { word: 'Skull', hints: ['replaces LOL now', 'crossbones pair', 'dead from cringe'] },
      { word: 'Fire', hints: ['streak maintenance', 'this is fire compliment', 'Beavis approves'] },
      { word: 'Clown', hints: ['honk honk behavior', 'coulrophobia trigger', 'It movie villain'] },
      { word: 'Ghost', hints: ['ghosting someone', 'Snapchat logo', 'Casper friendly'] },
      { word: 'Heart Eyes', hints: ['thirst trap response', 'sliding into DMs', 'simp indicator'] },
      { word: 'Crying Laughing', hints: ['boomers still use it', 'Unicode most popular', 'gen Z calls it cringe'] },
      { word: 'Rocket', hints: ['crypto pump signal', 'startup funding news', 'stonks going up'] },
      { word: 'Eggplant', hints: ['banned in some contexts', 'vegetable in disguise', 'nothing to see here'] },
      { word: 'Monkey', hints: ['three wise set', 'hear and speak variants', 'cringe reaction'] },
      { word: 'Crown', hints: ['GOAT acknowledgment', 'Drake album cover', 'chess queen movement'] },
      { word: 'Sunglasses', hints: ['deal with it meme', 'CSI Miami drop', 'too cool to look'] },
      { word: 'Nerd Face', hints: ['well actually correction', 'pocket protector stereotype', 'um actually'] },
      { word: 'Cold Face', hints: ['AC too strong', 'frozen from inside', 'winter cold take'] },
      { word: 'Thinking Face', hints: ['sus indicator', 'shower thought face', 'conspiracy forming'] },
      { word: 'Alien', hints: ['Area 51 raid meme', 'no proven green ones', 'grey vs green debate'] },
    ]
  },
  {
    name: 'Video Games',
    difficulty: 'easy',
    words: [
      { word: 'Minecraft', hints: ['ssss incoming', 'dirt house shame', 'infinite world seed'] },
      { word: 'Fortnite', hints: ['default dance everywhere', 'building nerf aftermath', 'crossover king'] },
      { word: 'Mario', hints: ['wrong castle again', 'flower makes you shoot', 'overalls red and blue'] },
      { word: 'Zelda', hints: ['link is not zelda', 'ocarina of time peak', 'bottle collecting quest'] },
      { word: 'Pokemon', hints: ['gotta catch all pressure', 'starter three choices', '251 original argument'] },
      { word: 'GTA', hints: ['wanted star escape', 'Trevor most unhinged', 'chaos sandbox excuse'] },
      { word: 'Tetris', hints: ['piece drought panic', 'theme song earworm', 'Soviet origin story'] },
      { word: 'Among Us', hints: ['sus went mainstream', 'vent spotted', 'emergency meeting call'] },
      { word: 'Pac-Man', hints: ['Blinky always cheats', 'power pellet reversal', 'cherry bonus level'] },
      { word: 'Dark Souls', hints: ['you died screen', 'praise the sun gesture', 'NPC dies anyway'] },
      { word: 'Roblox', hints: ['oof sound removed', 'noob default avatar', 'parent credit card'] },
      { word: 'Valorant', hints: ['CSGO killer argument', 'operator camping meta', 'Cypher cam tilt'] },
      { word: 'League of Legends', hints: ['your jungler diff', 'game too long complaint', 'mastery 7 toxic'] },
      { word: 'Elden Ring', hints: ['let me solo her', 'horse double jump', 'Margit first wall'] },
      { word: 'Rocket League', hints: ['ceiling shot difficulty', 'boost steal move', 'grand champ grind'] },
    ]
  }
];

export function getCategories(): string[] {
  return categories.map(c => c.name);
}

export function getCategoriesWithDifficulty(): { name: string; difficulty: Difficulty }[] {
  return categories.map(c => ({ name: c.name, difficulty: c.difficulty }));
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
