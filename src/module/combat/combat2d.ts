import { Dependency, Modding, OnTick, OnStart } from "@flamework/core";

import { NullifyYComponent, Motion, Input, HeldInputDescriptor, MotionInput, InputMode, ConvertMoveDirectionToMotion, GenerateRelativeVectorFromNormalId, validateMotion, stringifyMotionInput, CharacterManager, SkillManager, SkillLike, Skill, GetInputFromInputState, GetMotionFromInputState, GetInputModeFromInputState, SkillFunction } from "@quarrelgame-framework/common";
import { MatchController, OnMatchRespawn } from "controllers/match.controller";

import { CombatController } from "module/combat";
import { CharacterController2D } from "module/character/controller2d";
import InputController, { KeyboardEvents } from "controllers/input.controller";
import Client from "module/game/client";
import { Constructor, isConstructor } from "@flamework/core/out/utility";

// TODO: add motion death time which resets the queue
// TODO: successful inputs reset the queue as well
// TODO: add queue limit of 10 so we don't bsod players

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
    public static MAX_QUEUE_SIZE = 16;

    public static PurgeMode: MotionInputPurgeMode = MotionInputPurgeMode.ALL;

    // have the default be neutral so the automatic 'neutral' release is able to be progressed through
    protected readonly currentMotion: Array<HeldInputDescriptor> = [[Motion.Neutral | InputMode.Press, DateTime.now().UnixTimestampMillis]];

    protected readonly normalMap: ReadonlyMap<Enum.KeyCode, Enum.NormalId>;

    protected readonly motionInputEventHandlers: Set<MotionInputHandling> = new Set([this]);

    protected keybindMap: Map<Enum.KeyCode, Input> = new Map();

    constructor(protected client: Client, protected characterController: CharacterController2D, protected matchController: MatchController, protected inputController: InputController, protected skillManager: SkillManager)
    {
        super();
        this.normalMap = this.characterController.GetKeybinds();
    }


    protected removeInputFromUnreleased(input: number)
    {
        this.unreleasedButtons = this.unreleasedButtons.mapFiltered((e) =>
        {
            // remove the input and mode from e
            if ((e & input) === input)

                e &= ~input;

            else 

                return e;


            // when the input stripped away, it should just be the press input
            if (e === InputMode.Press || e === 0x0)

                return undefined;
            


            // make sure we're not putting down any duplicates
            if (this.unreleasedButtons.find((f) => e === f))

                return undefined;

            return e | InputMode.Press;
        });
    }

    private unreleasedButtons = new Array<number>();
    onKeyReleased({KeyCode: buttonReleased}: InputObject): void 
    {
        const keyInputs = this.GetKeybinds();
        const characterEntity = this.characterController.GetEntity();
        const charInputs = this.characterController.GetKeybinds();
        const hasCharacterController = charInputs.has(buttonReleased);
        const hasCombatController = keyInputs.has(buttonReleased);
        const arena = this.matchController.GetCurrentArena();
        const previousMotionSize = this.currentMotion.size();

        if (!arena)

            return;
            
        if (!characterEntity)

            return;


        // TODO: less repetition here, use function call for both
        // and less function calls as a whole (more vars)
        const filteredReleaseMotions = this.currentMotion.filter((e) => (e[0] & InputMode.Release) > 0);
        if (hasCharacterController)
        {
            // convert the input that was released to a motion
            const releasedCardinal = this.normalMap.get(buttonReleased)!
            const releasedMotion = Motion[ConvertMoveDirectionToMotion(GenerateRelativeVectorFromNormalId(this.characterController.GetOrigin(), releasedCardinal))[0]];
            const currentMotion = this.currentMotion;
            const latestPair = currentMotion[currentMotion.size() - 1];
            this.removeInputFromUnreleased(releasedMotion);

            // FIXME: fix key release system to send the actual released input
            // instead of the current input after release
            for (let i = currentMotion.size() - 1; i >= 0; i--)
            {
                const [inputState, timePressed, itemChanged] = currentMotion[i]
                // no need to check if the input contains the motion since
                // the filter makes that implicitly true
                if ((inputState & releasedMotion) === releasedMotion)
                {
                    // if this index is a 'press' that introduces the released motion
                    // AND the index prior did not contain the released motion,
                    // then we know that this is the starting point
                    if ((currentMotion[i - 1][0] & releasedMotion) === 0)
                    {
                        currentMotion[i][1] = DateTime.now().UnixTimestampMillis - this.currentMotion[i][1];

                        // get the last input (which is guaranteed to have this motion)
                        // and then remove this motion from it
                        // WARNING: if this does not have the last input in it
                        // then we have bigger problems to worry about
                        const modelessState = ((latestPair[0] & ~releasedMotion) & ~InputMode.Press) & ~InputMode.Release;
                        const outputDescriptor: HeldInputDescriptor = [releasedMotion | InputMode.Release, DateTime.now().UnixTimestampMillis];

                        // check if this descriptor is really just 0x0 (no input at all) 
                        // and if it is, add the "Neutral" with the press mode
                        // if (modelessState === 0x0)
                        // 
                        //     currentMotion.push([releasedMotion | InputMode.Release, outputDescriptor[1]], [Motion.Neutral | InputMode.Press, DateTime.now().UnixTimestampMillis]);
                        //
                        // else 
                        //
                        //     currentMotion.push(outputDescriptor);

                        currentMotion.push(outputDescriptor);
                        break;
                    }
                }
            }
        } else if (hasCombatController) 
        {
            const input = keyInputs.get(buttonReleased)!; // hasCharacterController ? : keyInputs.get(buttonReleased)!;
            const latestPair = this.currentMotion[this.currentMotion.size() - 1];
            this.removeInputFromUnreleased(input);

            for (let i = this.currentMotion.size() - 1; i >= 0; i--)
            {
                const [state, time] = this.currentMotion[i];

                if (((input | InputMode.Press) & state) > 0) 
                {

                    if ((this.currentMotion[i - 1]?.[0] & input) === 0)
                    
                        this.currentMotion[i][1] = DateTime.now().UnixTimestampMillis - time;

                    // same premise as above
                    // const hasMotion = GetMotionFromInputState(latestPair[0]);
                    // if (!hasMotion)
                    // {
                    //     print("no motion, filling...");
                    //     // give latestPair[0] a motion (because for some reason it doesn't have it?)
                    //     latestPair[0] |= Motion.Neutral;
                    // } 

                    if ((this.currentMotion[i - 1][0] & input) === 0)
                    {
                        this.currentMotion[i][1] = DateTime.now().UnixTimestampMillis - this.currentMotion[i][1];

                        // get the last input (which is guaranteed to have this motion)
                        // and then remove this motion from it
                        // WARNING: if this does not have the last input in it
                        // then we have bigger problems to worry about
                        const modelessState = ((latestPair[0] & ~input) & ~InputMode.Press) & ~InputMode.Release;
                        const outputDescriptor: HeldInputDescriptor = [input | InputMode.Release, DateTime.now().UnixTimestampMillis];

                        // check if this descriptor is really just 0x0 (no input at all) 
                        // and if it is, add the "Neutral" with the press mode
                        print("combat: modless state is", modelessState, );
                        this.currentMotion.push(outputDescriptor);

                        break;
                    }


                    // if ((latestPair[0] & InputMode.Release) > 0)
                    // {
                    //     this.currentMotion.push([Motion.Neutral | InputMode.Press, DateTime.now().UnixTimestampMillis]);
                    // }
                    // else 
                    // {
                    //     this.currentMotion.push([((latestPair[0] & ~InputMode.Press) & ~input) | InputMode.Release, DateTime.now().UnixTimestampMillis]);
                    // }
                

                    break;
                }
            }
        } 


        print("urm end:", this.unreleasedButtons);
        if (this.unreleasedButtons.size() === 0 && ((this.currentMotion[this.currentMotion.size() - 1]?.[0] ?? 0) & Motion.Neutral) === 0)
        
            this.currentMotion.push([Motion.Neutral | InputMode.Press, DateTime.now().UnixTimestampMillis]);

        if (previousMotionSize !== this.currentMotion.size())

            for (const listener of this.motionInputEventHandlers)

                task.spawn(() => listener.onMotionInputChanged?.(this.currentMotion));
    }

    onKeyPressed({KeyCode: buttonPressed}: InputObject): void
    {
        const characterEntity = this.characterController.GetEntity();
        const keyInputs = this.GetKeybinds();
        const hasCombatController = keyInputs.has(buttonPressed);
        const hasCharacterController = this.normalMap.has(buttonPressed);
        const previousMotionSize = this.currentMotion.size();


        // FIXME: remove this after testing is done
        if (buttonPressed === Enum.KeyCode.Backspace || buttonPressed === Enum.KeyCode.K)
        {
            this.Reset();
            return;
        }

        /* TODO: support charge inputs */

        const arena = this.matchController.GetCurrentArena();
        if (!arena)

            return;

        if (!characterEntity)

            return;

        let characterInput: number = Motion.Neutral;
        let combatInput: number | undefined;
        if (hasCharacterController)
        {
            const axis = this.characterController.GetOrigin().LookVector;
            assert(axis, "axis not found. this should not happen"); 

            const rawInput = ConvertMoveDirectionToMotion(this.characterController.GetMoveDirection(this.characterController.GetOrigin()));
            const rawMotion = this.characterController.GetKeybinds().get(buttonPressed);
            characterInput = Motion[rawInput[0]];

            warn("motion pressed:", rawInput, characterInput);
            if (rawMotion)

                this.unreleasedButtons.push(characterInput);


        }
        else if (hasCombatController)
        {
            
            // FIXME: fix the bug where late inputs (e.g. 2 > (wait) > K) becomes 2 + Neutral K instead of
            // just 2 + K

            combatInput = keyInputs.get(buttonPressed)!;
            const buttonsToDelete = [];
            // for (const i of buttonsToDelete)
            // {
            //     print("deleted", i);
            //     this.unreleasedButtons = this.unreleasedButtons.filter((e) => !((e & i) > 0))
            //     this.removeInputFromUnreleased(i);
            // }

            this.unreleasedButtons.push(combatInput);
            for (const i of this.unreleasedButtons)
                
                // compile all inputs unreleased inputs and add it to the combatinput
                combatInput |= i;
            
            // defaulting to the detectedInput is ok since there is no concept of 
            // 'duplicates' in bit flags afaik


            // const lastInput = (this.currentMotion[this.currentMotion.size() - 1]);
            // this.currentMotion.push([detectedInput | InputMode.Press, DateTime.now().UnixTimestampMillis]);
        } 

        print(this.unreleasedButtons, characterInput, combatInput);
        if (this.unreleasedButtons.size() === 1)
        {
            // see if there are any uncompleted neutral inputs
            const filteredMotions = this.currentMotion.filter((e) => (e[0] & Motion.Neutral) > 0)
            for (let i = filteredMotions.size() - 1; i >= 0; i--)
            {
                const [thisMotion, pressTime] = filteredMotions[i]
                if ((thisMotion & InputMode.Release) > 0)

                    break; // no need to search if it's already completed

                else
                {
                    this.currentMotion[i][1] = DateTime.now().UnixTimestampMillis - pressTime;
                    this.currentMotion.push([Motion.Neutral | InputMode.Release, DateTime.now().UnixTimestampMillis]);
                    break;
                }
            }
        }


        if (hasCombatController || hasCharacterController)
        {
            this.currentMotion.push([( (combatInput ?? characterInput) & ~InputMode.Release) | InputMode.Press, DateTime.now().UnixTimestampMillis]);
        }

        if (this.currentMotion.size() !== previousMotionSize)

            for (const listener of this.motionInputEventHandlers)

                task.spawn(() => listener.onMotionInputChanged?.(this.currentMotion));

        return;
    }

    public async PushInput(motionInput: number, duration: number = -1)
    {
        this.currentMotion.push([motionInput, duration]);

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

        const matchingSkills = validateMotion(this.currentMotion, foundCharacter, 
                                              { castingEntity: currentEntity, targetEntities: new Set(), closeEnemies: [], closeFriendlies: []})
            // .map((e) => typeIs(e[1], "function") ? e[1](currentEntity) : e[1])

        const lastSkill = Dependency<SkillManager>().GetSkill(currentEntity.attributes.PreviousSkill ?? tostring({}));
        const decompiledSkills = [...foundCharacter.Skills]
        const noop: Callback = () => '';
        const generateSkillWarning = (skills: [MotionInput, SkillLike | SkillFunction<Constructor<Skill.Skill>>][]) => 
        {
            const mappedSkills = skills.map(([motionInput, skill]) => {

                let outSkill;
                if (typeIs(skill, "function")) {
                    const unwrappedSkill = skill({ castingEntity: currentEntity, targetEntities: new Set(), closeEnemies: [], closeFriendlies: []})
                    if (isConstructor(unwrappedSkill))

                        outSkill = new unwrappedSkill();

                    else outSkill = unwrappedSkill;

                } outSkill = skill;

                return `\n${stringifyMotionInput(motionInput)} => ${skill}`;
            });

            noop(`No skills found for ${this.stringifyMotionInput(this.currentMotion)}. Skills list: ${mappedSkills.reduce((e,a) => e + a, skills.size() === 0 ? "NONE" : "")}`)
        };
        

        if (currentEntity.IsNegative())
        {
            matchingSkills.clear()
            const rekkaMap =  lastSkill?.Rekkas ?? [];
            const gatlingMap =  lastSkill?.Gatlings ?? [];
            const skillMap = new Map([...rekkaMap, ...gatlingMap]);

            const matchingNegativeSkills = validateMotion(
                this.currentMotion, 
                {Skills: skillMap}, 
                { 
                    castingEntity: currentEntity, 
                    targetEntities: new Set(), 
                    closeEnemies: [], 
                    closeFriendlies: []
                })

            const inner = matchingNegativeSkills.map((e) => typeIs(e[1], "function") ? e[1](currentEntity) : e[1]);
            for (const item of inner)

                matchingSkills.push(item);

            if (matchingSkills.size() === 0)

                generateSkillWarning([...gatlingMap])

        } else if (matchingSkills.size() === 0)

            generateSkillWarning(decompiledSkills);


        if (matchingSkills.size() >= 1)

            task.spawn(() => currentEntity?.ExecuteSkill(matchingSkills.mapFiltered(([,e]) => this.skillManager.IdFromSkill(e))).then((hitData) => hitData))


        this.Reset();
        return true;
    }

    Reset(): void
    {
        this.currentMotion.clear();
        // if #unreleasedButtons is > 0, it will automatically be released frame 1
        this.currentMotion.push([Motion.Neutral | InputMode.Press, this.unreleasedButtons.size() > 0 ? 1 : DateTime.now().UnixTimestampMillis - 1/60]);


        // TODO: if the code calls reset and this.unreleasedButtons is now cleared,
        // there is an edge case where motion inputs like 623HS where if 3 is held
        // during the cinematic then a desync occurs where the character is crouching
        // however the combat believes that the player is in the Neutral state


        if (this.unreleasedButtons.size() > 0)
        {

            this.currentMotion.push([Motion.Neutral | InputMode.Release, DateTime.now().UnixTimestampMillis]);
            for (const i of this.unreleasedButtons)
            
                this.currentMotion.push([i | InputMode.Press, DateTime.now().UnixTimestampMillis]);
        }
       

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
                    this.Reset();
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

    //TODO: move validateMotion into this controller
        
    public stringifyMotionInput(motionInput: MotionInput = this.currentMotion)
    {
        return stringifyMotionInput(motionInput);
    }

    onMotionInputChanged(motionInput: MotionInput): void {
      
    }
}

export { CombatController2D as CombatController2D };
