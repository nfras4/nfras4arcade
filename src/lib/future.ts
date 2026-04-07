/**
 * Future game feature type definitions and placeholder data structures.
 * Foundation-only -- no UI or runtime logic.
 */

// ---------------------------------------------------------------------------
// Medals / Achievements
// ---------------------------------------------------------------------------

/** Identifiers for all unlockable medals. */
export type MedalId =
  | 'first_win'
  | 'impostor_streak_3'
  | 'detective_5'
  | 'social_butterfly'
  | 'veteran_50_games'
  | 'perfect_round'
  | 'speed_hint';

/** A single unlockable medal / achievement. */
export interface Medal {
  id: MedalId;
  name: string;
  description: string;
  /** Emoji string used as the medal icon. */
  icon: string;
  /** Timestamp when the player unlocked this medal, if ever. */
  unlockedAt?: Date;
}

/** Registry of every available medal and its metadata. */
export const MEDALS: Record<MedalId, Omit<Medal, 'unlockedAt'>> = {
  first_win: {
    id: 'first_win',
    name: 'First Victory',
    description: 'Win your first game.',
    icon: '🏆'
  },
  impostor_streak_3: {
    id: 'impostor_streak_3',
    name: 'Master of Disguise',
    description: 'Survive as the impostor 3 games in a row.',
    icon: '🎭'
  },
  detective_5: {
    id: 'detective_5',
    name: 'Sharp Eye',
    description: 'Correctly vote out the impostor 5 times.',
    icon: '🔍'
  },
  social_butterfly: {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Play a game with 8 or more players.',
    icon: '🦋'
  },
  veteran_50_games: {
    id: 'veteran_50_games',
    name: 'Veteran',
    description: 'Play 50 games.',
    icon: '⭐'
  },
  perfect_round: {
    id: 'perfect_round',
    name: 'Perfect Round',
    description: 'Win a round where every player votes correctly.',
    icon: '💎'
  },
  speed_hint: {
    id: 'speed_hint',
    name: 'Quick Thinker',
    description: 'Submit a hint within 5 seconds of your turn starting.',
    icon: '⚡'
  }
};

// ---------------------------------------------------------------------------
// Player Stats
// ---------------------------------------------------------------------------

/** Cumulative performance statistics for a single player. */
export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  impostorGames: number;
  impostorWins: number;
  correctVotes: number;
  timesVotedOut: number;
  hintsGiven: number;
  /** Total play time in milliseconds. */
  totalPlayTime: number;
  streaks: {
    current: number;
    best: number;
  };
  medals: MedalId[];
}

/** Returns a fresh PlayerStats object with all counters at zero. */
export function createEmptyStats(): PlayerStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    impostorGames: 0,
    impostorWins: 0,
    correctVotes: 0,
    timesVotedOut: 0,
    hintsGiven: 0,
    totalPlayTime: 0,
    streaks: { current: 0, best: 0 },
    medals: []
  };
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

/** Possible states of a friend relationship. */
export type FriendStatus = 'pending' | 'accepted' | 'blocked';

/** A single friend entry in a player's friend list. */
export interface Friend {
  id: string;
  name: string;
  status: FriendStatus;
  addedAt: Date;
  /** When these two players last appeared in the same game. */
  lastPlayedTogether?: Date;
}

/** A player's full friend list. */
export type FriendList = Friend[];

// ---------------------------------------------------------------------------
// Player Profile
// ---------------------------------------------------------------------------

/** Top-level profile that combines stats, medals, and friends. */
export interface PlayerProfile {
  id: string;
  displayName: string;
  stats: PlayerStats;
  medals: Medal[];
  friends: FriendList;
  createdAt: Date;
}
