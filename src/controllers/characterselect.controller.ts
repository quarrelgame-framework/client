import Make from "@rbxts/make";
import Roact from "@rbxts/roact";

import CharacterSelect from "ui/characterselect";

import { Controller, Modding, OnInit, OnStart } from "@flamework/core";
import { Players } from "@rbxts/services";
import { Functions } from "network";
import { Character } from "@quarrelgame-framework/common";

export interface OnCharacterSelected {
    onCharacterSelected(charcter: Character.Character): void;
}

/*
 * The controller responsible for handling character selection
 * and attributing the selected character to the Client.
 *
 * Should have a priority of 1.
 */
@Controller({})
export default class CharacterSelectController implements OnStart, OnInit {
    private currentCharacterSelect?: Roact.Tree;

    private characterSelectConstructor?: Roact.Element;

    private characterSelectScreenGui: ScreenGui;

    private currentlySelectedCharacter?: Character.Character;

    private readonly characterSelectedListeners = new Set<OnCharacterSelected>();

    public readonly characters = new Map<string, Character.Character>();

    constructor() {
        this.characterSelectScreenGui = Make("ScreenGui", {
            Parent: Players.LocalPlayer.WaitForChild("PlayerGui"),
            IgnoreGuiInset: true,
            ResetOnSpawn: false,
            ZIndexBehavior: Enum.ZIndexBehavior.Sibling,
        });
    }

    onInit() {
        Modding.onListenerAdded<OnCharacterSelected>((listener) => {
            this.characterSelectedListeners.add(listener);
        });
    }

    onStart() {
        if (!Players.LocalPlayer.GetAttribute("SelectedCharacter"))
            this.OpenCharacterSelect();
    }

    public SetCharacters(characters: ReadonlyMap<string, Character.Character>) {
        this.characters.clear();
        for (const [charname, char] of characters)
            this.characters.set(charname, char);
    }

    public BindCharacterSelectInstance(screengui: ScreenGui) {
        this.characterSelectScreenGui = screengui;
    }

    public OpenCharacterSelect() {
        if (!this.currentCharacterSelect) {
            this.currentCharacterSelect = Roact.mount(
                Roact.createElement(CharacterSelect, {
                    Characters: this.characters,
                    OnSelect: (selectedCharacter: Character.Character) => {
                        if (
                            this.currentlySelectedCharacter &&
                            selectedCharacter === this.currentlySelectedCharacter
                        ) {
                            Functions.SelectCharacter(selectedCharacter.Name).then(() =>
                                Functions.RespawnCharacter(selectedCharacter.Name)
                                    .then(() => {
                                        for (const listener of this.characterSelectedListeners)
                                            listener.onCharacterSelected(selectedCharacter);
                                    })
                                    .finally(() => this.CloseCharacterSelect()),
                            );
                        } else {
                            this.currentlySelectedCharacter = selectedCharacter;
                        }
                    },
                }),
                this.characterSelectScreenGui,
                "CharacterSelect",
            );
        }
    }

    public CloseCharacterSelect() {
        if (this.currentCharacterSelect !== undefined)
            Roact.unmount(this.currentCharacterSelect);

        print("closed character select");
    }
}

export { CharacterSelectController as CharacterSelectController };
