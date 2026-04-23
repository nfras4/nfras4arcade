/**
 * Liar's Dice bot facade. Delegates to the pure logic module so the decision
 * function can also be unit-tested directly from worker/liarsDice/__tests__/.
 */
export { decideLiarsDiceAction, type BotDecision, type BotInput } from '../liarsDice/logic';
