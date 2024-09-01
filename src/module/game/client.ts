import { Modding, OnInit, OnStart } from "@flamework/core";
import { Animator } from "@quarrelgame-framework/common";
import { Players, StarterGui } from "@rbxts/services";

export interface OnRespawn
{
    onRespawn(character: Model & { Humanoid: Humanoid; }): void;
}

/*
 * The controller that is responsible for handling
 * client-related events.
 *
 * Should have a priority of negative "infinity."
 */
export default class Client implements OnInit, OnRespawn
{
    private respawnTrackers: Set<OnRespawn> = new Set();

    constructor()
    {}

    onInit()
    {
        Modding.onListenerAdded<OnRespawn>((a) => this.respawnTrackers.add(a));
        Modding.onListenerRemoved<OnRespawn>((a) => this.respawnTrackers.delete(a));

        const onRespawn = (character: Model) =>
        {
            for (const listener of this.respawnTrackers)
                listener.onRespawn(character as never);
        };

        Players.PlayerAdded.Connect((player) =>
        {
            player.CharacterAdded.Connect(onRespawn);
        });

        for (const Player of Players.GetPlayers())
        {
            Player.CharacterAdded.Connect(onRespawn);
            if (Player.Character)
                onRespawn(Player.Character);
        }
    }

    onRespawn(character: Model)
    {
        this.character = character;
    }

    public readonly player = Players.LocalPlayer as Player & {
        PlayerGui: PlayerGui;
    };

    public character = this.player.Character;
}

export { Client as Client };
