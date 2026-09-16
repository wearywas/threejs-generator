import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSavedAsset as apartment } from '../a-modern-apartment-building.js';
import { createSavedAsset as hatchback } from '../a-simple-hatchback-car-face-the-front-toward.js';
import { createSavedAsset as van } from '../a-compact-urban-delivery-van-face-the-front.js';
import { PALETTES } from '../src/model.js';

test('the supplied apartment factory builds actual additional floors without changing footprint', () => {
  const one = apartment(THREE, { seed: 27, params: { ...PALETTES[2], floorCount: 1, windowOpacity: 1 } });
  const ten = apartment(THREE, { seed: 27, params: { ...PALETTES[2], floorCount: 10, windowOpacity: 1 } });
  try {
    const small = new THREE.Box3().setFromObject(one.root).getSize(new THREE.Vector3());
    const tall = new THREE.Box3().setFromObject(ten.root).getSize(new THREE.Vector3());
    assert.ok(Math.abs(tall.y - small.y - 9 * 2.7) < .01);
    assert.equal(tall.x, small.x); assert.equal(tall.z, small.z);
    assert.equal(ten.root.scale.y, 1);
    const colors = new Set(); ten.root.traverse(o => { if (o.material?.color) colors.add(`#${o.material.color.getHexString()}`); });
    assert.ok(colors.has(PALETTES[2].facadeColor)); assert.ok(colors.has(PALETTES[2].accentColor));
  } finally { one.dispose(); ten.dispose(); }
});

test('both generated vehicle factories expose four axle-centered wheels and accept paint variants', () => {
  for (const factory of [hatchback, van]) {
    const a = factory(THREE, { params: { bodyColor: '#cc4466' } });
    try {
      for (const position of ['FrontLeft','FrontRight','RearLeft','RearRight']) {
        const wheel = a.root.getObjectByName(`wheel${position}`);
        assert.ok(wheel); assert.equal(wheel.userData.axleAxis, 'X');
      }
      const colors = new Set(); a.root.traverse(o => { if (o.material?.color) colors.add(o.material.color.getHexString()); });
      assert.ok(colors.has('cc4466'));
    } finally { a.dispose(); }
  }
});
