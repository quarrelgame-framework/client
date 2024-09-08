import Make from "@rbxts/make";
import { ContextActionService, Players } from "@rbxts/services";
import { OnMatchRespawn } from "controllers/match.controller";
import { MatchController } from "controllers/match.controller";
import { Entity, GenerateRelativeVectorFromNormalId, InputMode, InputResult } from "@quarrelgame-framework/common";
import { Input } from "controllers/input.controller";
import { Components } from "@flamework/components";
import { Dependency } from "@flamework/core";
import { OnRespawn } from "module/game/client";

export abstract class CharacterController implements OnRespawn, OnMatchRespawn
{
    protected abstract readonly keyboardDirectionMap: Map<Enum.KeyCode, Enum.NormalId>;

    protected character?: Model;

    protected player = Players.LocalPlayer;

    protected alignPos?: AlignPosition;

    constructor(
        protected readonly matchController: MatchController,
        protected readonly input: Input,
    )
    {}


    onRespawn(character: Model)
    {
        // ensure entity component is added on respawn
        const components = Dependency<Components>()
        if (character.GetAttribute("State")) 
        {
            print(character.PrimaryPart, character.GetDescendants());
            if (!character.PrimaryPart)

                Promise.fromEvent(character.GetPropertyChangedSignal("PrimaryPart")).then(() => 
                {
                    print("primarypart found");
                    components.addComponent<Entity>(character);
                });

            else components.addComponent<Entity>(character);
        }
    }

    public GetMoveDirection(relativeTo?: CFrame)
    {
        let totalVector = Vector3.zero;
        this.keyboardDirectionMap.forEach((normal, code) =>
        {
            if (this.input.IsKeyDown(code))

                if (relativeTo)

                    totalVector = totalVector.add(GenerateRelativeVectorFromNormalId(relativeTo, normal));

                else

                    totalVector = totalVector.add(Vector3.FromNormalId(normal));
        });

        return totalVector.Magnitude > 0 ? totalVector.Unit : totalVector;
    }

    public GetKeybinds()
    {
        return new ReadonlyMap([ ...this.keyboardDirectionMap ]);
    }

    public GetCharacter(): Model | undefined
    {
        return this.character;
    }

    public GetEntity(): Entity | undefined
    {
        if (!this.character)

            return;

        return Dependency<Components>().getComponent<Entity>(this.character);
    }

    public Jump()
    {
        this.GetEntity()?.Jump();
    }

    public Crouch(crouchState: boolean)
    {
        this.GetEntity()?.Crouch(crouchState);
    }

    onMatchRespawn(character: Model): void
    {
        print("on respawnded!!");
        this.character = character;
    }

    protected enabled = false;

    SetEnabled(enabled: boolean, target?: Model): void;
    SetEnabled(enabled = true)
    {
        this.enabled = enabled;
    }
}
