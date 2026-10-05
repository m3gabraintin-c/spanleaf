import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moveItem } from "@/lib/order";

describe("moveItem", () => {
  const abc = ["a", "b", "c", "d"];
  it("moves an item earlier and later, shifting the ones between", () => {
    assert.deepEqual(moveItem(abc, 2, 1), ["a", "c", "b", "d"]);
    assert.deepEqual(moveItem(abc, 1, 2), ["a", "c", "b", "d"]);
    assert.deepEqual(moveItem(abc, 0, 3), ["b", "c", "d", "a"]);
    assert.deepEqual(moveItem(abc, 3, 0), ["d", "a", "b", "c"]);
  });
  it("leaves the list as it was for the same place or a place that isn't there", () => {
    for (const [from, to] of [[1, 1], [-1, 2], [2, -1], [4, 0], [0, 4], [9, 9]]) assert.deepEqual(moveItem(abc, from, to), abc, `${from} to ${to}`);
  });
  it("never changes the list it was given and always returns the same items", () => {
    const frozen = Object.freeze([...abc]);
    for (let from = 0; from < 4; from++) for (let to = 0; to < 4; to++) assert.deepEqual([...moveItem(frozen, from, to)].sort(), abc);
    assert.deepEqual(frozen, abc);
    assert.deepEqual(moveItem([], 0, 1), []);
  });
  it("stepping the first photo to the end one place at a time gets there", () => {
    let list = abc;
    for (let i = 0; i < 3; i++) list = moveItem(list, i, i + 1);
    assert.equal(list.at(-1), "a");
  });
});
