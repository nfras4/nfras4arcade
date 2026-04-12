export interface SpectrumCard {
	left: string;
	right: string;
	category: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
	opinions: 'Opinions',
	physical: 'Physical',
	abstract: 'Abstract',
	pop_culture: 'Pop Culture',
	food: 'Food & Drink',
	social: 'Social',
	absurd: 'Absurd',
friend_group: 'Friend Group',
};

const deck: SpectrumCard[] = [
	// opinions
	{ left: 'Overrated', right: 'Underrated', category: 'opinions' },
	{ left: 'Guilty Pleasure', right: 'Genuinely Great', category: 'opinions' },
	{ left: 'Overhyped', right: 'Underhyped', category: 'opinions' },
	{ left: 'Terrible Gift', right: 'Perfect Gift', category: 'opinions' },
	{ left: 'Waste of Time', right: 'Worth Every Minute', category: 'opinions' },
	{ left: 'Skip It', right: 'Must Experience', category: 'opinions' },
	{ left: 'Overpriced', right: 'Bargain', category: 'opinions' },
	{ left: 'Deeply Cringe', right: 'Totally Cool', category: 'opinions' },
	{ left: 'Boring', right: 'Thrilling', category: 'opinions' },
	{ left: 'Too Basic', right: 'Too Niche', category: 'opinions' },
	{ left: 'Peak Nostalgia', right: 'Better Now', category: 'opinions' },
	{ left: 'Should Be Illegal', right: 'Should Be Required', category: 'opinions' },
	{ left: 'Bad First Impression', right: 'Great First Impression', category: 'opinions' },
	{ left: 'Kids Only', right: 'Adults Only', category: 'opinions' },
	{ left: 'Cancelled Correctly', right: 'Cancelled Unfairly', category: 'opinions' },
	{ left: 'Overstayed Welcome', right: 'Gone Too Soon', category: 'opinions' },
	{ left: 'Underachieved', right: 'Overachieved', category: 'opinions' },
	{ left: 'Secretly Terrible', right: 'Secretly Amazing', category: 'opinions' },

	// physical
	{ left: 'Hot', right: 'Cold', category: 'physical' },
	{ left: 'Soft', right: 'Hard', category: 'physical' },
	{ left: 'Fast', right: 'Slow', category: 'physical' },
	{ left: 'Loud', right: 'Quiet', category: 'physical' },
	{ left: 'Tiny', right: 'Enormous', category: 'physical' },
	{ left: 'Rough', right: 'Smooth', category: 'physical' },
	{ left: 'Light', right: 'Heavy', category: 'physical' },
	{ left: 'Sharp', right: 'Dull', category: 'physical' },
	{ left: 'Wet', right: 'Dry', category: 'physical' },
	{ left: 'Bright', right: 'Dark', category: 'physical' },
	{ left: 'Flexible', right: 'Rigid', category: 'physical' },
	{ left: 'Fragile', right: 'Indestructible', category: 'physical' },
	{ left: 'Freezing Cold', right: 'Scorching Hot', category: 'physical' },
	{ left: 'Microscopic', right: 'Massive', category: 'physical' },
	{ left: 'Feather Light', right: 'Crushing Heavy', category: 'physical' },
	{ left: 'Dead Silent', right: 'Deafening', category: 'physical' },
	{ left: 'Paper Thin', right: 'Solid Rock', category: 'physical' },
	{ left: 'Glacially Slow', right: 'Lightning Fast', category: 'physical' },

	// abstract
	{ left: 'Bad Superpower', right: 'Great Superpower', category: 'abstract' },
	{ left: 'Unethical', right: 'Ethical', category: 'abstract' },
	{ left: 'Simple', right: 'Complex', category: 'abstract' },
	{ left: 'Chaotic', right: 'Orderly', category: 'abstract' },
	{ left: 'Selfish', right: 'Selfless', category: 'abstract' },
	{ left: 'Short-Term Thinking', right: 'Long-Term Thinking', category: 'abstract' },
	{ left: 'Impractical', right: 'Practical', category: 'abstract' },
	{ left: 'Risky', right: 'Safe', category: 'abstract' },
	{ left: 'Overconfident', right: 'Underconfident', category: 'abstract' },
	{ left: 'Too Honest', right: 'Too Diplomatic', category: 'abstract' },
	{ left: 'Weak Argument', right: 'Compelling Argument', category: 'abstract' },
	{ left: 'Backwards Thinking', right: 'Forward Thinking', category: 'abstract' },
	{ left: 'Bad Omen', right: 'Good Omen', category: 'abstract' },
	{ left: 'Cursed Ability', right: 'Blessed Ability', category: 'abstract' },
	{ left: 'Luck-Based', right: 'Skill-Based', category: 'abstract' },
	{ left: 'Reactive', right: 'Proactive', category: 'abstract' },
	{ left: 'Nature', right: 'Nurture', category: 'abstract' },
	{ left: 'Ancient Wisdom', right: 'Modern Logic', category: 'abstract' },

	// pop_culture
	{ left: 'One-Hit Wonder', right: 'Legend', category: 'pop_culture' },
	{ left: 'Mainstream', right: 'Underground', category: 'pop_culture' },
	{ left: 'Classic', right: 'Modern', category: 'pop_culture' },
	{ left: 'Opening Act', right: 'Headliner', category: 'pop_culture' },
	{ left: 'Cult Favorite', right: 'Massive Hit', category: 'pop_culture' },
	{ left: 'First Season Peak', right: 'Better Each Season', category: 'pop_culture' },
	{ left: 'Style Over Substance', right: 'Substance Over Style', category: 'pop_culture' },
	{ left: 'Reboot Ruined It', right: 'Reboot Saved It', category: 'pop_culture' },
	{ left: 'Fandom Is Toxic', right: 'Fandom Is Great', category: 'pop_culture' },
	{ left: 'Aged Badly', right: 'Aged Perfectly', category: 'pop_culture' },
	{ left: 'Box Office Bomb', right: 'Box Office Smash', category: 'pop_culture' },
	{ left: 'Forgotten', right: 'Timeless', category: 'pop_culture' },
	{ left: 'Before Its Time', right: 'Of Its Time', category: 'pop_culture' },
	{ left: 'Sequel Ruined It', right: 'Sequel Improved It', category: 'pop_culture' },
	{ left: 'Award Bait', right: 'Award Deserving', category: 'pop_culture' },
	{ left: 'Nostalgia Bait', right: 'Genuinely Iconic', category: 'pop_culture' },
	{ left: 'Meme-ified', right: 'Still Respected', category: 'pop_culture' },
	{ left: 'Niche Appeal', right: 'Universal Appeal', category: 'pop_culture' },

	// food
	{ left: 'Healthy', right: 'Unhealthy', category: 'food' },
	{ left: 'Comfort Food', right: 'Fancy Food', category: 'food' },
	{ left: 'Sweet', right: 'Savory', category: 'food' },
	{ left: 'Breakfast Only', right: 'Anytime Food', category: 'food' },
	{ left: 'Acquired Taste', right: 'Universally Loved', category: 'food' },
	{ left: 'Solo Meal', right: 'Share With Everyone', category: 'food' },
	{ left: 'Party Food', right: 'Romantic Dinner', category: 'food' },
	{ left: 'Plain', right: 'Bold Flavor', category: 'food' },
	{ left: 'Cheap Eats', right: 'Splurge Worthy', category: 'food' },
	{ left: 'Smells Terrible', right: 'Smells Amazing', category: 'food' },
	{ left: 'Looks Terrible', right: 'Looks Beautiful', category: 'food' },
	{ left: 'Takes Forever', right: 'Ready Instantly', category: 'food' },
	{ left: 'Kids Hate It', right: 'Kids Love It', category: 'food' },
	{ left: 'Finger Food', right: 'Fork and Knife', category: 'food' },
	{ left: 'Midnight Snack', right: 'Sunday Brunch', category: 'food' },
	{ left: 'Divisive', right: 'Crowd Pleaser', category: 'food' },
	{ left: 'Fuel', right: 'Experience', category: 'food' },
	{ left: 'Hot Dish', right: 'Cold Dish', category: 'food' },

	// social
	{ left: 'Introvert Activity', right: 'Extrovert Activity', category: 'social' },
	{ left: 'First Date', right: 'Tenth Date', category: 'social' },
	{ left: 'Awkward', right: 'Smooth', category: 'social' },
	{ left: 'Solo Trip', right: 'Group Trip', category: 'social' },
	{ left: 'Kills Conversation', right: 'Sparks Conversation', category: 'social' },
	{ left: 'Antisocial', right: 'Life of the Party', category: 'social' },
	{ left: 'Red Flag', right: 'Green Flag', category: 'social' },
	{ left: 'Oversharing', right: 'Too Mysterious', category: 'social' },
	{ left: 'Embarrassing in Public', right: 'Impressive in Public', category: 'social' },
	{ left: 'Canceled Invite', right: 'Must Invite', category: 'social' },
	{ left: 'Work Friend Only', right: 'Real Friend', category: 'social' },
	{ left: 'Nervous Habit', right: 'Confident Habit', category: 'social' },
	{ left: 'Too Much Eye Contact', right: 'Too Little Eye Contact', category: 'social' },
	{ left: 'Early Arrival', right: 'Fashionably Late', category: 'social' },
	{ left: 'Text Only', right: 'Call Me Now', category: 'social' },
	{ left: 'Ghost Zone', right: 'Reply Immediately', category: 'social' },
	{ left: 'Inside Joke', right: 'Public Humor', category: 'social' },
	{ left: 'Crowd Drainer', right: 'Energy Giver', category: 'social' },

	// absurd
	{ left: 'Would Fight', right: 'Would Befriend', category: 'absurd' },
	{ left: 'Apocalypse Useless', right: 'Apocalypse Essential', category: 'absurd' },
	{ left: 'Die First', right: 'Survive Horror Movie', category: 'absurd' },
	{ left: 'Villain Origin Story', right: 'Hero Origin Story', category: 'absurd' },
	{ left: 'Time Travel Disaster', right: 'Time Travel Success', category: 'absurd' },
	{ left: 'Haunted Object', right: 'Lucky Charm', category: 'absurd' },
	{ left: 'Terrible Sidekick', right: 'Perfect Sidekick', category: 'absurd' },
	{ left: 'Betrays the Group', right: 'Sacrifices for Group', category: 'absurd' },
	{ left: 'Gets Eaten First', right: 'Outruns the Monster', category: 'absurd' },
	{ left: 'Loses the Map', right: 'Finds the Exit', category: 'absurd' },
	{ left: 'Wakes the Neighbors', right: 'Sneaks In Silently', category: 'absurd' },
	{ left: 'Robot Would Replace', right: 'Robot Cannot Replace', category: 'absurd' },
	{ left: 'Alien Abduction Risk', right: 'Alien Ambassador', category: 'absurd' },
	{ left: 'Haunted By', right: 'Protected By', category: 'absurd' },
	{ left: 'Wrong Side of History', right: 'Right Side of History', category: 'absurd' },
	{ left: 'Failed Prophecy', right: 'Fulfilled Prophecy', category: 'absurd' },
	{ left: 'Cursed Artifact', right: 'Enchanted Relic', category: 'absurd' },
	{ left: 'Accidental Villain', right: 'Unlikely Hero', category: 'absurd' },

	// friend_group
	{ left: 'Always Late', right: 'Always Early', category: 'friend_group' },
	{ left: 'Group Chat Silent', right: 'Group Chat Spammer', category: 'friend_group' },
	{ left: 'Plans the Trip', right: 'Just Shows Up', category: 'friend_group' },
	{ left: 'Borrows Everything', right: 'Lends Everything', category: 'friend_group' },
	{ left: 'Drama Starter', right: 'Peacemaker', category: 'friend_group' },
	{ left: 'Disappears for Months', right: 'Always Around', category: 'friend_group' },
	{ left: 'Pays Last', right: 'Covers Everyone', category: 'friend_group' },
	{ left: 'Gives Tough Love', right: 'Gives Comfort', category: 'friend_group' },
	{ left: 'Has Tea on Everyone', right: 'Knows Nothing', category: 'friend_group' },
	{ left: 'Hype Friend', right: 'Honest Friend', category: 'friend_group' },
	{ left: 'Holds Grudges', right: 'Forgives Instantly', category: 'friend_group' },
	{ left: 'Friend Since Birth', right: 'Met Last Year', category: 'friend_group' },
	{ left: 'Worst Influence', right: 'Best Influence', category: 'friend_group' },
	{ left: 'Flakes on Plans', right: 'Never Cancels', category: 'friend_group' },
	{ left: 'Secret Keeper', right: 'Tells Everyone', category: 'friend_group' },
	{ left: 'Main Character', right: 'Supporting Cast', category: 'friend_group' },
	{ left: 'Gives Bad Advice', right: 'Gives Great Advice', category: 'friend_group' },
	{ left: 'Over-Communicator', right: 'Under-Communicator', category: 'friend_group' },
];

export function getCategories(): string[] {
	return Object.keys(CATEGORY_LABELS);
}

export function shuffleDeck(categories?: string[]): SpectrumCard[] {
	let cards = categories && categories.length > 0
		? deck.filter(c => categories.includes(c.category))
		: [...deck];
	for (let i = cards.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[cards[i], cards[j]] = [cards[j], cards[i]];
	}
	return cards;
}

export default deck;
