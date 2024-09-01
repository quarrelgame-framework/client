import { Modding, OnInit, OnStart, Controller } from "@flamework/core";
import { Players, Workspace } from "@rbxts/services";
import type { Map as _Map } from "@quarrelgame-framework/common";

import { Events, Functions } from "network";
import { ICharacter, Managed } from "@quarrelgame-framework/types";

export interface OnArenaChange
{
    onArenaChanged(matchId: string, arenaInstance: _Map.Arena): void;
}

// TODO: Implement.
export interface OnMatchStart
{
    onMatchStart(matchId: string, matchData: ReturnType<typeof Functions["GetCurrentMatch"]>): void;
}

export interface OnMatchRespawn
{
    onMatchRespawn(character: Managed<ICharacter>, player?: Player): void;
}
print("i was required nerd");

/**
 * The controller responsible for
 * handling the match requests sent
 * by the server.
 */
@Controller({})
export class MatchController implements OnStart, OnInit
{
    private arenaChangedHandlers = new Set<OnArenaChange>();

    private matchData?: Awaited<ReturnType<typeof Functions["GetCurrentMatch"]>>;

    private matchRespawnTrackers: Set<OnMatchRespawn> = new Set();

    constructor()
    {print("i was constructed nerd")}

    onStart()
    {
        print("i was started nerd")
        // FIXME: currently there is a massive bug where onMatchRespawn functions
        // made for the local player runs because of other participants respawning.
        // should be an easy fix
        Events.MatchParticipantRespawned.connect((characterModel) =>
        {
            this.updateMatchData().then(() =>
            {
                this.matchRespawnTrackers.forEach(async (l) =>
                {
                    l.onMatchRespawn(characterModel as never, Players.GetPlayerFromCharacter(characterModel));
                });
            })
        });

        Events.ArenaChanged.connect((mapId, arenaId) =>
        {
            this.updateMatchData().then((matchData) => {
                assert(this.matchData, "match data is not defined");
                for (const listener of this.arenaChangedHandlers)
                    task.spawn(() => listener.onArenaChanged(mapId, matchData!.Arena as never));
            })
        });
    }

    protected async updateMatchData()
    {
        return Functions.GetCurrentMatch().then((currentMatch) =>
        {
            if (currentMatch === undefined)
            {
                this.matchData = undefined;
                throw "current match is undefined.";
            }

            return this.matchData = currentMatch;
        });
    }

    onMatchRespawn()
    {
    }

    onInit()
    {
        Events.MatchParticipantRespawned.connect((characterModel) =>
        {
            if (characterModel === undefined)
                return;
        });

        Modding.onListenerAdded<OnArenaChange>((l) => this.arenaChangedHandlers.add(l));
        Modding.onListenerRemoved<OnArenaChange>((l) => this.arenaChangedHandlers.delete(l));

        Modding.onListenerAdded<OnMatchRespawn>((a) => this.matchRespawnTrackers.add(a));
        Modding.onListenerRemoved<OnMatchRespawn>((a) => this.matchRespawnTrackers.delete(a));
    }

    public GetMatchData()
    {
        return this.matchData;
    }

    /**
     * Request the current match data freshly requested from the server.
     * @returns The current match.
     */
    public RequestCurrentMatch()
    {
        return Functions.GetCurrentMatch().await()[1] as ReturnType<typeof Functions["GetCurrentMatch"]>;
    }

    public GetCurrentArena(): _Map.Arena | undefined
    {
        const thisMatch = this.matchData;
        assert(thisMatch !== undefined, "Current match is undefined.");

        return thisMatch.Arena;
    }

    private matchContainer = Workspace.WaitForChild("MapContainer") as Folder;

    private localPlayer = Players.LocalPlayer;
}

export default MatchController;
