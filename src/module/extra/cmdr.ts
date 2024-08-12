import { Controller, OnInit, OnStart } from "@flamework/core";
import type { CmdrClient } from "@rbxts/cmdr";

/*
 * The controller responsible for handling the
 * command backend for the framework. Utilizes `@rbxts/cmdr`.
 *
 * Has a priority of -1.
 */
export class CommandController implements OnInit
{
    private activationKeys: Enum.KeyCode[] = new Array<Enum.KeyCode>();

    constructor(private CmdrClient: CmdrClient)
    {}

    onInit()
    {
        this.applyActivationKeys();
    }

    private applyActivationKeys()
    {
        this.CmdrClient.SetActivationKeys(this.activationKeys);
    }

    public SetKeys(...keys: Enum.KeyCode[])
    {
        this.activationKeys = keys;
        this.applyActivationKeys();
    }
}
