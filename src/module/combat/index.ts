import { Players } from "@rbxts/services";
import { OnMatchRespawn } from "controllers/match.controller";

import { Dependency } from "@flamework/core";
import { Character, CharacterManager, Input, InputMode, InputResult } from "@quarrelgame-framework/common";

import Object from "@rbxts/object-utils";

export abstract class CombatController implements OnMatchRespawn
{
    private enabled = false;

    protected selectedCharacter?: Character.Character;

    protected lockOnTarget?: Instance & { Position: Vector3; };

    protected character?: Model;

    // TODO: implement a way to automatically register
    // keybinds through a json file in the project
    // created using the framework
    // ***********************************************
    // so that means *don't* try to do it within the
    // framework itself lol

    protected abstract keybindMap: Map<Enum.KeyCode, Input>;

    onMatchRespawn(character: Model): void
    {
        this.character = character;

        if (Players.LocalPlayer.GetAttribute("MatchId"))
        {
            this.selectedCharacter = Dependency<CharacterManager>().GetCharacter(Players.LocalPlayer.GetAttribute("SelectedCharacter") as string);
            assert(this.selectedCharacter, `no selected character found (${Players.LocalPlayer.GetAttribute("SelectedCharacter")})`);
        }
        else
        {
            this.selectedCharacter = undefined;
        }
    }

    public IsEnabled()
    {
        return this.enabled;
    }

    public Enable()
    {
        this.enabled = true;
    }

    public Disable()
    {
        this.enabled = false;
    }

    public Toggle(enabled = this.enabled)
    {
        return this.enabled ? this.Disable() : this.Enable();
    }

    public GetKeybinds()
    {
        return new ReadonlyMap(Object.entries(this.keybindMap));
    }

    constructor()
    {}
}
