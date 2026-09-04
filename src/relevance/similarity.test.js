import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity } from "./similarity.js";

test("동일한 벡터는 유사도 1", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
});

test("직교하는 벡터는 유사도 0", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
});

test("정반대 방향 벡터는 유사도 -1", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [-1, -2, -3]) - -1) < 1e-9);
});

test("스케일이 달라도 방향이 같으면 유사도 1", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [2, 4, 6]) - 1) < 1e-9);
});
