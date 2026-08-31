import { invariant } from "./errors.js";

export class RandomService {
  nextUint32(state) {
    let value = state.rng.state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    state.rng.state = value >>> 0;
    state.rng.draws += 1;
    return state.rng.state;
  }

  nextFloat(state) {
    return this.nextUint32(state) / 0x100000000;
  }

  integer(state, maxExclusive) {
    invariant(
      Number.isInteger(maxExclusive) && maxExclusive > 0,
      "RNG_INVALID_RANGE",
      "随机范围必须是正整数。",
      { maxExclusive },
    );
    return Math.floor(this.nextFloat(state) * maxExclusive);
  }

  shuffle(state, values) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = this.integer(state, index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }
}
