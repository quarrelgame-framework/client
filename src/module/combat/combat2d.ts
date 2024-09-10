import { Dependency, Modding, OnRender, OnStart } from "@flamework/core";

import { NullifyYComponent, Motion, Input, MotionInput, InputMode, ConvertMoveDirectionToMotion, GenerateRelativeVectorFromNormalId, validateMotion, stringifyMotionInput, CharacterManager, SkillManager, SkillLike } from "@quarrelgame-framework/common";
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

    onKeyReleased({KeyCode: buttonPressed}: InputObject): void 
    {
        const hasCharacterController = this.characterController.GetKeybinds().has(buttonPressed);
        const hasCombatController = this.GetKeybinds().has(buttonPressed);
        const arena = this.matchController.GetCurrentArena();

        if (!arena)

            return;

        if (hasCharacterController || (hasCombatController && this.currentMotion.size() === 0)) 

            this.PushMotion(Motion[ConvertMoveDirectionToMotion(this.GetMotionDirection(arena.config.Origin.Value))[0]]);
    }

    onKeyPressed({KeyCode: buttonPressed, UserInputState: inputMode}: InputObject): void
    {
        const hasCharacterController = this.characterController.GetKeybinds().has(buttonPressed);
        const hasCombatController = this.GetKeybinds().has(buttonPressed);
        if (buttonPressed === Enum.KeyCode.Backspace || buttonPressed === Enum.KeyCode.K)

            this.currentMotion.clear();

        /* TODO: support charge inputs */

        const arena = this.matchController.GetCurrentArena();
        if (!arena)

            return;

        // allow refilling input in-case motion was executed (e.g. DP into crouch)
        if (hasCharacterController || (hasCombatController && this.currentMotion.size() === 0)) 

            this.PushMotion(Motion[ConvertMoveDirectionToMotion(this.GetMotionDirection(arena.config.Origin.Value))[0]]);

        if (hasCombatController)
        {
            const keyInput = this.GetKeybinds();
            if (inputMode.Value === InputMode.Press)
            {
                this.currentMotion.push(keyInput.get(buttonPressed)!);
                for (const listener of this.motionInputEventHandlers)

                    task.spawn(() => listener.onMotionInputChanged?.(this.currentMotion));

                this.SubmitMotionInput();
            }
        }

        return;
    }

    public async PushMotion(motion: Motion)
    {
        this.currentMotion.push(motion);

        const currentMotion = [ ... this.currentMotion ];
        for (const listener of this.motionInputEventHandlers)

            task.spawn(() => listener.onMotionInputChanged?.(currentMotion));
    }

    public async SubmitMotionInput(): Promise<boolean>
    {
        const characterId = this.characterController.GetCharacter()?.GetAttribute("CharacterId") as string;
        const foundCharacter = Dependency<CharacterManager>().GetCharacter(characterId);
        const currentEntity = this.characterController.GetEntity();

        if (!foundCharacter)

            return new Promise((_, rej) => rej(false))

        if (!currentEntity)

            return new Promise((_, rej) => rej(false));

        const matchingSkills = validateMotion(this.currentMotion, foundCharacter)
            .map((e) => typeIs(e[1], "function") ? e[1](currentEntity) : e[1])

        const lastSkill = Dependency<SkillManager>().GetSkill(currentEntity.attributes.PreviousSkill ?? tostring({}));
        const decompiledSkills = [...foundCharacter.Skills]
        const noop: Callback = () => '';
        const generateSkillWarning = (skills: [MotionInput, SkillLike][]) => 
            noop(`No skills found for ${this.stringifyMotionInput(this.currentMotion)}. Skills list: ${skills.map(([motionInput, skill]) => `\n${this.stringifyMotionInput(motionInput)} => ${typeIs(skill, "function") ? skill().Name : skill.Name}`).reduce((e,a) => e + a, skills.size() === 0 ? "NONE" : "")}`)

        if (currentEntity.IsNegative())
        {
            matchingSkills.clear()
            const rekkaMap =  lastSkill?.Rekkas ?? [];
            const gatlingMap =  lastSkill?.Gatlings ?? [];
            const skillMap = new Map([...rekkaMap, ...gatlingMap]);

            const matchingNegativeSkills = validateMotion(this.currentMotion, {Skills: skillMap});
            const inner = matchingNegativeSkills.map((e) => typeIs(e[1], "function") ? e[1](currentEntity) : e[1]);
            for (const item of inner)

                matchingSkills.push(item);

            if (matchingSkills.size() === 0)

                generateSkillWarning([...gatlingMap])

        } else if (matchingSkills.size() === 0)

            generateSkillWarning(decompiledSkills);

        if (matchingSkills.size() >= 1)

            task.spawn(() => currentEntity?.ExecuteSkill(matchingSkills.map((e) => e.Id)).then((hitData) => hitData))

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
                const { character } = this;
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
    }
}

export { CombatController2D as CombatController2D };
