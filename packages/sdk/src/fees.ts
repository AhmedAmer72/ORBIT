import { MIN_MAX_FEE_PER_GAS } from "./constants";

export function floorMaxFeePerGas(quoted: bigint): bigint {
  return quoted > MIN_MAX_FEE_PER_GAS ? quoted : MIN_MAX_FEE_PER_GAS;
}
