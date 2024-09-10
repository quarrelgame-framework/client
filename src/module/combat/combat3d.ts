import { Players } from "@rbxts/services";
import { CombatController } from "module/combat";
import { Input } from "@quarrelgame-framework/common";
import { CameraController3D } from "module/camera/camera3d";

export abstract class CombatController3D extends CombatController
    {
        constructor(private readonly cameraController3D: CameraController3D)
        {
            super();
        }

        onInit()
        {
        }

        protected keybindMap: Map<Enum.KeyCode, Input> = new Map();

        private lockOnTracker?: RBXScriptConnection;
        public LockOn(target?: Model & { PrimaryPart: Instance; }, doFX?: boolean)
        {
            if (!this.IsEnabled())
                return false;

            if (target)
            {
                const primaryPart = target?.PrimaryPart;
                this.lockOnTarget = primaryPart;

                if (this.lockOnTracker)
                    this.lockOnTracker?.Disconnect?.();

                if (this.lockOnTarget)
                {
                    this.cameraController3D.SetLockOnTarget(this.lockOnTarget);

                    this.lockOnTracker = primaryPart.Destroying.Once(() =>
                    {
                        if (this.lockOnTarget === primaryPart)
                            this.LockOn(undefined);
                    });

                return;
            }
        }

        this.cameraController3D.SetLockOnTarget(undefined);
    }

    public Disable(): void
    {
        super.Disable();

        this.cameraController3D.SetLockOnTarget(undefined);
    }
}
