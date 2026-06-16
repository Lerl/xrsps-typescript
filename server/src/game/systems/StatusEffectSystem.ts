import { StatusHitsplat } from "../combat/HitEffects";
import { NpcState } from "../npc";
import { PlayerState } from "../player";

export class StatusEffectSystem {
    processPlayer(
        player: PlayerState,
        tick: number,
        hasHitpointsCapeRegen: boolean = false,
    ): StatusHitsplat[] | undefined {
        return player.skillSystem.tickHitpoints(tick, hasHitpointsCapeRegen);
    }

    processNpc(npc: NpcState, tick: number): StatusHitsplat[] | undefined {
        return npc.tickStatusEffects(tick);
    }
}
