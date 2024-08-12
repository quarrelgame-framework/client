import { Dependency } from "@flamework/core";
import { Players } from "@rbxts/services";
import { QuarrelEvents, QuarrelFunctions } from "@quarrelgame-framework/common";
import { QuarrelMaps, Jump } from "@quarrelgame-framework/common";
import { ResourceController } from "controllers/resourcecontroller.controller";

export const Events = QuarrelEvents.createClient({disableIncomingGuards: true});
export const Functions = QuarrelFunctions.createClient({disableIncomingGuards: true});

export interface OnFrame {
  /**
   * Runs everytime a Game frame passes.
   */
  onFrame(frameTime: number, tickRate: number): void;
}

// const onFrameListeners: Set<OnFrame> = new Set();
// Events.Tick.connect(async (frameTime: Frames, tickRate: number) => 
// {
//   for (const listener of onFrameListeners)
//     listener.onFrame(frameTime, tickRate);
// });

Functions.RequestLoadMap.setCallback((mapId: string) => 
{
  return new Promise((res) => 
  {
    print("request received");
    assert(QuarrelMaps.FindFirstChild(mapId), `Map ${mapId} does not exist.`);
    Dependency<ResourceController>()
      .requestPreloadInstances(
        QuarrelMaps.FindFirstChild(mapId)!.GetDescendants(),
      )
      .then(() => 
      {
        res(true);
      });
  });
});

Events.Jump.connect(() =>

  Players.LocalPlayer.Character
    ? Jump(Players.LocalPlayer.Character as (Model & { Humanoid: Humanoid, PrimaryPart: BasePart}))
    : undefined,
);

