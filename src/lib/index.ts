import { QuarrelFunctions } from "@quarrelgame-framework/common";

/**
 * Get the tick rate.
 */
export const GetTickRate =
    () => (QuarrelFunctions.createClient({}).GetGameTickRate().await()[1] as number | undefined);
