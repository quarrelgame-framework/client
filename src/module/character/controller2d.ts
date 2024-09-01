import {  OnRender, OnStart, OnTick } from "@flamework/core";

import Client, { OnRespawn } from "module/game/client";
import {  GamepadButtons } from "controllers/gamepad.controller";
import { OnMatchRespawn } from "controllers/match.controller";
import { CharacterController } from "module/character";
import { Functions } from "network";

import { Players, Workspace } from "@rbxts/services";
import {  EntityState,  NullifyYComponent, SessionType, GenerateRelativeVectorFromNormalId,  InputMode, InputResult } from "@quarrelgame-framework/common";
import { Map as _Map } from "@quarrelgame-framework/common";
import { MatchController, OnArenaChange } from "controllers/match.controller";

import InputHandler from "controllers/input.controller";
import Make from "@rbxts/make";

export abstract class CharacterController2D extends CharacterController implements OnStart, OnMatchRespawn, OnRender, OnArenaChange, OnRespawn, OnTick
{
    private axis?: Vector3;

    protected _arena?: _Map.Arena;

    constructor(
        protected readonly client: Client,
        protected readonly matchController: MatchController,
        protected readonly input: InputHandler,
    )
    {
        super(matchController, input);
    }

    private invisibleWallSets = new Set<Folder>();
    onArenaChanged(
        _: string,
        arenaInstance: Model & {
            config: _Map.ConfigurationToValue;
            script?: Actor | undefined;
            model: Folder;
        },
    ): void
    {
        for (const wallSet of this.invisibleWallSets)
            wallSet.Destroy();

        // memory leak begone
        this.invisibleWallSets.clear();

        // TODO: use attachment movers like AlignPosition to keep the player inside of the bounds of the
        // of the arena instead of just disabling movement because people can jump and end up using the momentum
        // to get out of the arena
        //
        // might just use an invisible wall or something for now, will have to figure it out later

        this._arena = arenaInstance;
        this.axis = arenaInstance.config.Axis.Value;

        const { config } = arenaInstance;
        const { Size, Origin } = config;

        const Transparency = 1;
        const CanQuery = false;
        const Parent = Make("Folder", {
            Parent: arenaInstance.model,
            Children: [
                Make("Part", {
                    CFrame: Origin.Value.add(new Vector3(Size.Value.X / 2)),
                    Size: new Vector3(1, Size.Value.Y * 2, 45),
                    Anchored: true,
                    Name: "BoundaryLeft",
                    Transparency,
                    CanQuery,
                }),
                Make("Part", {
                    CFrame: Origin.Value.sub(new Vector3(Size.Value.X / 2)),
                    Size: new Vector3(1, Size.Value.Y * 2, 45),
                    Anchored: true,
                    Name: "BoundaryRight",
                    Transparency,
                    CanQuery,
                }),
                Make("Part", {
                    CFrame: Origin.Value.add(new Vector3(45, Size.Value.Y + 4, 0)),
                    Size: new Vector3(45, 4, 45),
                    Anchored: true,
                    Name: "BoundaryTop",
                    Transparency,
                    CanQuery,
                }),
            ],
            Name: "InvisibleWalls",
        });

        this.invisibleWallSets.add(Parent);
    }

    private lastFrameNormal: Vector3 = Vector3.zero;
    private axisRotatedOrigin: CFrame = new CFrame();
    onRender()
    {
        const axis = this.axis,
            character = this.character,
            enabled = this.enabled,
            match = this.matchController.GetMatchData(),
            entity = this.GetEntity();

        if (!enabled)
            throw "not enabled"

        if (!character)
            throw "no character";

        if (!match)
            throw "no match data";

        if (!axis)
            throw "no axis";

        if (!entity)
            throw "no entity";

        const { X, Z } = axis;
        if (this.alignPos?.Attachment0)
        {
            this.alignPos.Position = new Vector3(X, 0, Z);
            this.alignPos.MaxAxesForce = new Vector3(math.sign(X), 0, math.sign(Z))
                .Cross(new Vector3(0, 1, 0))
                .mul(12000);
        }

        const playerHumanoid = character.FindFirstChild("Humanoid") as
            | Humanoid
            | undefined;

        const axisDirection = CFrame.lookAlong(Vector3.zero, axis);
        let axisRotatedOrigin: CFrame;

        const sessionType = match.Participants.size() > 1 ? SessionType.Multiplayer : SessionType.Singleplayer;
        switch ( sessionType )
        {
            case (SessionType.Multiplayer):
            {
                if (match.Participants.size() === 2)
                {
                    const targetPlayer = Players.GetPlayers().find((e) =>
                        e.GetAttribute("ParticipantId")
                            === match.Participants.find(({ ParticipantId }) => ParticipantId !== this.player.GetAttribute("ParticipantId"))
                    );

                    assert(targetPlayer, "no target player");
                    assert(targetPlayer.Character, "target player has no character");

                    this.axisRotatedOrigin = CFrame.lookAt(
                        NullifyYComponent(this.character!.GetPivot()).Position,
                        NullifyYComponent(targetPlayer.Character.GetPivot()).Position,
                    );

                    print("playing multiplayer");
                    break;
                }

                print("playing multiplayer with a lot of people");

                /* falls through */
            }

            default:
            {
                const { Origin, Axis } = match.Arena.config;
                const { Position } = Origin.Value;
                this.axisRotatedOrigin = CFrame.lookAlong(Position, Axis.Value);
            }
        }

        assert(this.axisRotatedOrigin, "no axis rotated origin");
        const playerDirection = this.GetMoveDirection(this.axisRotatedOrigin);

        const currentLastFrameNormal = this.lastFrameNormal;
        this.lastFrameNormal = playerDirection;
        if (playerHumanoid)
        {
            playerHumanoid.AutoRotate = false;
            const bottomNormal = GenerateRelativeVectorFromNormalId(
                axisDirection,
                Enum.NormalId.Bottom,
            );
            const topNormal = GenerateRelativeVectorFromNormalId(
                axisDirection,
                Enum.NormalId.Top,
            );

            const eqLeniency = 0.5;
            if (playerDirection.Dot(bottomNormal) > eqLeniency)
            {
                /* Players can hold Crouch to crouch at any position,
                 * but auto-jumping is disallowed.
                 */
                const lastFrameDot = currentLastFrameNormal.Dot(bottomNormal);
                const frameDot = playerDirection.Dot(bottomNormal);
                // if (playerHumanoid.FloorMaterial !== Enum.Material.Air)
                // {
                if (frameDot >= eqLeniency)
                {
                    if (entity.IsNeutral() && entity.IsGrounded() && !entity.IsState(EntityState.Crouch))
                    {
                        this.Crouch(true);
                        Functions.Crouch(EntityState.Crouch);
                    }
                }
                // }

                return;
            }
            else if ((entity.attributes.State & EntityState.Crouch) > 1)
            {
                print("whjat the dog doin");
                this.Crouch(false);
                Functions.Crouch(EntityState.Idle);
            }
            else if (playerDirection.Dot(topNormal) > eqLeniency)
            {
                const lastFrameDot = currentLastFrameNormal.Dot(topNormal);
                if (lastFrameDot <= eqLeniency)
                {
                    this.Jump();
                    Functions.Jump();
                }

            }

            if (entity)

                if (playerHumanoid.FloorMaterial === Enum.Material.Air && playerHumanoid.GetAttribute("JumpDirection"))
                    entity.ControllerManager.MovingDirection = playerHumanoid.GetAttribute("JumpDirection") as Vector3;
                else
                    entity.ControllerManager.MovingDirection = playerDirection;
        }
    }

    onTick()
    {
        /* TODO: remove if this causes problems, especially with broken rotation at a certain point. */
        this.GetEntity()?.Face(this.axisRotatedOrigin.LookVector);

    }

    onStart(): void
    {
        print("2D Character Controller started.");
    }

    async onMatchRespawn(character: Model): Promise<void>
    {
        super.onMatchRespawn(character);
        const rootPart = character.WaitForChild("HumanoidRootPart") as BasePart;

        this.alignPos = Make("AlignPosition", {
            Mode: Enum.PositionAlignmentMode.OneAttachment,
            Enabled: false,
            ApplyAtCenterOfMass: true,
            MaxAxesForce: Vector3.zero,
            Parent: rootPart,

            Attachment0: rootPart.WaitForChild("RootAttachment") as Attachment,
            ForceLimitMode: Enum.ForceLimitMode.PerAxis,
            Responsiveness: 200,
        });

        // TODO: fix bug that prevents this part in the controller from running
        print("hgweh???");
        const currentMatch = await Functions.GetCurrentMatch();
        if (currentMatch?.Arena)
        {
            this.character = character;
            this.SetAxis(currentMatch.Arena.config.Axis.Value);
            this.SetEnabled(true);

            Workspace.CurrentCamera!.CameraSubject = character.FindFirstChildWhichIsA("Humanoid") as Humanoid;
        }
    }

    public readonly keyboardDirectionMap: Map<Enum.KeyCode, Enum.NormalId> = new Map([
        [ Enum.KeyCode.W, Enum.NormalId.Top ],
        [ Enum.KeyCode.A, Enum.NormalId.Back ],
        [ Enum.KeyCode.S, Enum.NormalId.Bottom ],
        [ Enum.KeyCode.D, Enum.NormalId.Front ],
    ] as [Enum.KeyCode, Enum.NormalId][]);

    onGamepadInput(
        buttonPressed: GamepadButtons,
        inputMode: InputMode,
    ): boolean | InputResult | (() => boolean | InputResult)
    {
        return false;
    }

    public SetAxisTowardsModel(towards: Model)
    {
        assert(this.character, "character is not defined");
        this.axis = towards
            .GetPivot()
            .Position.sub(this.character?.GetPivot().Position).Unit;
    }

    public SetAxis(axis: Enum.NormalId | Vector3)
    {
        assert(this.character, "character is not defined");
        this.axis = typeIs(axis, "EnumItem") ? Vector3.FromNormalId(axis) : axis;
    }

    public SetEnabled(enabled: boolean)
    {
        this.enabled = true;
        if (enabled)
            this.DisableRobloxMovement();
        else
            this.EnableRobloxMovement();
    }
}
