import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";

const draft = {
  uploadToken: "token",
  fileName: "photo.jpg",
  caption: null,
  isPublic: false,
  type: "GALLERY_COVER",
};
test("one gallery cover is valid whether public or private", () => {
  for (const isPublic of [false, true])
    assert.ok(
      v1.scooters.scooterPhotoDraftsSchema.safeParse([{ ...draft, isPublic }])
        .success,
    );
  assert.equal(
    v1.scooters.scooterPhotoDraftsSchema.safeParse([
      draft,
      { ...draft, uploadToken: "other" },
    ]).success,
    false,
  );
});
test("rental photo types are defined but rejected by gallery contracts", () => {
  for (const type of ["RENTAL_BEFORE", "RENTAL_AFTER"]) {
    assert.ok(v1.scooters.scooterPhotoTypeSchema.safeParse(type).success);
    assert.equal(
      v1.scooters.scooterPhotoDraftsSchema.safeParse([{ ...draft, type }])
        .success,
      false,
    );
    assert.equal(
      v1.scooters.updateScooterPhotoSchema.safeParse({ type }).success,
      false,
    );
    assert.equal(
      v1.scooters.scooterPhotoSchema.safeParse({
        id: "photo",
        fileName: "photo.jpg",
        caption: null,
        isPublic: false,
        position: 0,
        contentUrl: "/photo",
        createdAt: new Date().toISOString(),
        type,
      }).success,
      false,
    );
  }
});
test("public visibility does not modify cover type in updates", () => {
  assert.deepEqual(
    v1.scooters.updateScooterPhotoSchema.parse({ isPublic: false }),
    { isPublic: false },
  );
  assert.deepEqual(
    v1.scooters.updateScooterPhotoSchema.parse({
      isPublic: true,
      type: "GALLERY_COVER",
    }),
    { isPublic: true, type: "GALLERY_COVER" },
  );
});
