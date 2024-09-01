import { Dependency, Modding, OnRender, OnStart } from "@flamework/core";
import { Keyboard, OnKeyboardInput } from "controllers/keyboard.controller";
import { CharacterController } from "module/character";
import { Functions } from "network";

import { CharacterSelectController } from "controllers/characterselect.controller";
import { NullifyYComponent, Motion, Input, MotionInput, InputMode, InputResult, ConvertMoveDirectionToMotion, GenerateRelativeVectorFromNormalId, validateMotion, stringifyMotionInput } from "@quarrelgame-framework/common";
import { MatchController, OnMatchRespawn } from "controllers/match.controller";

import { CombatController } from "module/combat";
import { CharacterController2D } from "module/character/controller2d";
import InputController, { KeyboardEvents } from "controllers/input.controller";
import Client from "module/game/client";

export interface MotionInputHandling
{
    onMotionInputChanged?(motionInput: MotionInput): void;
    onMotionInputTimeout?(motionInput: MotionInput): void;
}

/*
 * Motion Input Purge Mode.
 */
enum MotionInputPurgeMode 
{
    /*
     * Every timeout, remove
     * every item in the input
     * sequence.
     */
    ALL,
    /* 
     * Every timeout, remove
     * the earliest entry
     * in the input sequence.
     */
    TAIL
}

export default abstract class CombatController2D extends CombatController implements OnStart, OnRender, KeyboardEvents, MotionInputHandling, OnMatchRespawn
{
    public static PurgeMode: MotionInputPurgeMode = MotionInputPurgeMode.TAIL;

    protected readonly currentMotion: Array<Motion | Input> = [];

    protected readonly normalMap: ReadonlyMap<Enum.KeyCode, Enum.NormalId>;

    protected readonly motionInputEventHandlers: Set<MotionInputHandling> = new Set([this]);

    protected keybindMap: Map<Enum.KeyCode, Input> = new Map();


    constructor(protected client: Client, protected characterController: CharacterController2D, protected matchController: MatchController, protected inputController: InputController)
    {
        super();
        this.normalMap = this.characterController.GetKeybinds();
    }

    onKeyPressed({KeyCode: buttonPressed, UserInputState: inputMode}: InputObject): boolean | InputResult | (() => boolean | InputResult) 
    {
        const hasCharacterController = this.characterController.GetKeybinds().has(buttonPressed);
        const hasCombatController = this.GetKeybinds().has(buttonPressed);
        if (buttonPressed === Enum.KeyCode.Backspace || buttonPressed === Enum.KeyCode.K)
        {
            this.currentMotion.clear();
            return InputResult.Success;
        } 

        // if (this.currentMotion.size() <= 0)
        // {
         // }

        /* TODO: support charge inputs */

        const arena = this.matchController.GetCurrentArena();
        if (!arena)

            return InputResult.Fail;


        if (hasCharacterController || (hasCombatController && this.currentMotion.size() === 0)) // allow refilling input in-case motion was executed (e.g. DP into crouch)
        {
            // if (inputMode !== InputMode.Release && this.currentMotion.size() !== 0)
            // {
            //     return InputResult.Fail;
            // }

            const motionNormal = this.GetMotionDirection(arena.config.Origin.Value);// this.characterController.GetKeybinds().get(buttonPressed);
            const outMotion = Motion[ConvertMoveDirectionToMotion(motionNormal)[0]];
            this.currentMotion.push(outMotion);

            const currentMotion = [ ... this.currentMotion ];
            for (const listener of this.motionInputEventHandlers)

                task.spawn(() => listener.onMotionInputChanged?.(currentMotion));
        }

        if (hasCombatController)
        {
            const keyInput = this.GetKeybinds();
            if (inputMode.Value === InputMode.Press)
            {
                this.currentMotion.push(keyInput.get(buttonPressed)!);
                this.SubmitMotionInput();
            }
        }

        return InputResult.Success;
    }

    public async SubmitMotionInput(): Promise<boolean>
    {
        const Characters = Dependency<CharacterSelectController>().characters;
        const characterId = this.characterController.GetCharacter()?.GetAttribute("CharacterId") as string;
        const foundCharacter = Characters.get(characterId);

        if (!foundCharacter)

            return new Promise((_, rej) => rej(false));

        const matchingAttacks = validateMotion(this.currentMotion, foundCharacter);
        const decompiledAttacks = [...foundCharacter.Attacks]
        if (matchingAttacks.size() === 0)
        {
            warn(`No attacks found for ${this.stringifyMotionInput(this.currentMotion)}. Attacks list: ${decompiledAttacks.map(([motion, skill]) => `\n${this.stringifyMotionInput(motion)} => ${typeIs(skill, "function") ? skill().Name : skill.Name}`).reduce((e,a) => e + a, decompiledAttacks.size() === 0 ? "NONE" : "")}`)
        } else {
            if (matchingAttacks.size() === 1)

                task.spawn(() => Functions.SubmitMotionInput([... this.currentMotion ]));

            warn(`Matching attacks for ${this.stringifyMotionInput(this.currentMotion)}: ${matchingAttacks.map(([motion, skill]) => `\n${this.stringifyMotionInput(motion)} => ${typeIs(skill, "function") ? skill().Name : skill.Name}`).reduce((e,a) => e + a)}`)
        }

        this.currentMotion.clear();
        return true;
    }

    onStart(): void 
    {
        Modding.onListenerAdded<MotionInputHandling>((listener) => this.motionInputEventHandlers.add(listener));
        Modding.onListenerRemoved<MotionInputHandling>((listener) => this.motionInputEventHandlers.delete(listener));
    }

    private timeoutDeltaTime: number = 0;
    private motionInputTimeoutMaximum: number = 2;
    onRender(dt: number): void
    {
        if (this.timeoutDeltaTime >= this.motionInputTimeoutMaximum)
        {
            if (this.currentMotion.size() <= 2)
            {
                /* prevent command normals from being voided */
                this.timeoutDeltaTime = 0;
                return;
            }

            const currentMotion = [ ... this.currentMotion ];
            for (const listener of this.motionInputEventHandlers)
            { 
                task.defer(() => listener.onMotionInputTimeout?.(currentMotion));
                task.defer(() => listener.onMotionInputChanged?.(currentMotion));
            }

            switch (CombatController2D.PurgeMode)
            {
                case (MotionInputPurgeMode.TAIL):
                    this.currentMotion.shift();
                    break;

                default:
                    this.currentMotion.clear();
            }

            this.timeoutDeltaTime = 0;
            return;
        }

        if (this.currentMotion.size() > 0) 

            this.timeoutDeltaTime += dt;

        else this.timeoutDeltaTime = 0;
    }

    public GetMotionDirection(relativeTo: CFrame, fromKeys?: Enum.KeyCode[])
    {
        assert(this.characterController, "no character controller bound.");
        const keyboardDirectionMap = this.characterController.GetKeybinds();
        let totalVector = Vector3.zero;

        keyboardDirectionMap.forEach((normal, code) =>
        {
            if (this.inputController.IsKeyDown(code) || fromKeys?.includes(code))
            {
                const { Top, Bottom, Back: Left, Front: Right } = Enum.NormalId;
                const { character } = this.client;
                if (character)
                {
                    const { LookVector } = character.GetPivot();
                    const facingUnit = NullifyYComponent(relativeTo.Position).Unit.Dot(NullifyYComponent(LookVector))
                    const isFacingAway = facingUnit > 0;

                    if (isFacingAway && ([ Left, Right ] as Enum.NormalId[]).includes(normal))
                    {
                        switch ( normal )
                        {
                            case Left:
                                normal = Right;
                                break;

                            case Right:
                                normal = Left;
                                break;
                        }
                    }

                    if (character.GetPivot().Y < relativeTo.Y && [ Top, Bottom ] as EnumItem[])
                    {
                        switch ( normal )
                        {
                            case Top:
                                normal = Bottom;
                                break;

                            case Bottom:
                                normal = Top;
                                break;
                        }
                    }
                }
                

                if (relativeTo)
                {
                    const vec = GenerateRelativeVectorFromNormalId(relativeTo, normal);
                    const vecOut = new Vector3(vec.Z, vec.Y, vec.X);
                    totalVector = totalVector.add(vecOut);
                }
                else
                {
                    const norm = Vector3.FromNormalId(normal);
                    const normOut = new Vector3(norm.Z, norm.Y, norm.X);
                    totalVector = totalVector.add(normOut);
                }
            }
        });

        return totalVector.Magnitude > 0 ? totalVector.Unit : totalVector;
    }
        
    public stringifyMotionInput(motionInput: MotionInput = this.currentMotion)
    {
        return stringifyMotionInput(motionInput);
    }

    onMotionInputChanged(motionInput: MotionInput)
    {
        print(`motion input changed: [${this.stringifyMotionInput(motionInput)}]`)
    }
}

export { CombatController2D as CombatController2D };
