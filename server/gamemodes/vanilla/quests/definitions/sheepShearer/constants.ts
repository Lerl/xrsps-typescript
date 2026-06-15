import type { QuestItemRequirement } from "../../types";

export const SHEEP_SHEARER_KEY = "sheep_shearer";

export const FRED_THE_FARMER_NPC_ID = 732;

export const VARP_SHEEP_SHEARER = 179;
export const STAGE_STARTED = 1;
export const STAGE_COMPLETE = 21;

export const BALL_OF_WOOL_ITEM_ID = 1759;
export const COINS_ITEM_ID = 995;
export const REWARD_SCROLL_ITEM_ID = 1735;

export const REQUIRED_ITEMS: QuestItemRequirement[] = [
    { itemId: BALL_OF_WOOL_ITEM_ID, quantity: 20, journalLabel: "20 Balls of wool" },
];
