import {  Dependency, OnInit, OnStart } from "@flamework/core";
import { MatchController } from "controllers/match.controller";
import { CharacterController } from "module/character";
import { CombatController3D } from "../combat/combat3d";
import InputController from "controllers/input.controller";

export abstract class CharacterController3D extends CharacterController implements OnStart, OnInit
{
    constructor(protected readonly combatController: CombatController3D, protected readonly inputController: InputController)
    {
        super(Dependency<MatchController>(), inputController);
    }

    protected keyboardDirectionMap: Map<Enum.KeyCode, Enum.NormalId> = new Map([
        [ Enum.KeyCode.W, Enum.NormalId.Front ],
        [ Enum.KeyCode.A, Enum.NormalId.Left ],
        [ Enum.KeyCode.S, Enum.NormalId.Back ],
        [ Enum.KeyCode.D, Enum.NormalId.Right ],
    ] as [Enum.KeyCode, Enum.NormalId][]);

    onInit()
    {
    }

    onStart()
    {
    }
}
