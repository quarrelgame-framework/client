import { OnStart } from "@flamework/core";
import { Client } from "controllers/client.controller";
import { OnMatchRespawn } from "controllers/match.controller";

import { Managed, ICharacter } from "@quarrelgame-framework/types";

export abstract class HumanoidController implements OnStart, OnMatchRespawn
{
    constructor(private readonly client: Client)
    {
    }

    onStart(): void
    {
    }

    async onMatchRespawn(character: Managed<ICharacter>)
    {
        this.controller = character.Humanoid.ControllerManager;
        
        if (!this.controller.RootPart)
        {
            await new Promise<void>((res, rej) =>
            {
                let thisConnection: RBXScriptConnection | void = this.controller?.GetPropertyChangedSignal("RootPart").Connect(() =>
                {
                    if (this.controller?.RootPart)
                        thisConnection = res();
                });
            });
        }

        const rootPart = this.controller.RootPart;
        print("this other thing:", rootPart, this.controller.RootPart, character.Humanoid.RootPart);

        this.sensors = {
            ClimbSensor: rootPart.ClimbSensor,
            GroundSensor: rootPart.GroundSensor,
            SwimSensor: rootPart.SwimSensor,
        } as typeof this.sensors;

        print("okay done:", this.sensors);

        this.character = character as never;
        print(`Character ${character.Name} has respawned.`);

        return $tuple(this.controller, this.sensors);
    }

    public GetHumanoidController()
    {
        return this.controller;
    }

    public GetSensors()
    {
        return this.sensors;
    }

    public GetCharacter()
    {
        return this.character;
    }

    private controller?: Managed<ICharacter>["Humanoid"]["ControllerManager"];

    private sensors?: {
        ClimbSensor: ControllerPartSensor;
        GroundSensor: ControllerPartSensor;
        SwimSensor: BuoyancySensor;
    };

    protected character?: Managed<ICharacter>;
}
