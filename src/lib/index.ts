import { Dependency } from "@flamework/core";
import { QuarrelFunctions, SchedulerService } from "@quarrelgame-framework/common";

/**
 * Get the tick rate.
 */
export const GetTickRate =
    () => Dependency<SchedulerService>().GetTickRate()
