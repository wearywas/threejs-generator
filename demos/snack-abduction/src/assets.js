import * as THREE from 'three';
import { createSavedAsset as saucer } from '../a-charming-miniature-flying-saucer-with-a-flattened.js';
import { createSavedAsset as biscuit } from '../a-chunky-golden-chocolate-chip-biscuit-with-a.js';
import { createSavedAsset as mug } from '../a-coffee-mug-with-a-colorful-emblem-sticker.js';
import { createSavedAsset as robot } from '../a-mischievous-little-desktop-cleaning-robot-a-squat.js';
import { createSavedAsset as doughnut } from '../a-plump-doughnut-with-coral-pink-icing-that.js';
import { createSavedAsset as books } from '../a-slightly-untidy-stack-of-three-closed-hardcover.js';
import { createSavedAsset as pencil } from '../one-oversized-mustard-yellow-hexagonal-wooden-pencil-with.js';

const factories = { saucer, biscuit, mug, robot, doughnut, books, pencil };

// Exported source stays untouched. Game scale and placement live in this wrapper.
export function makeAsset(kind, size, { seed, height = false, center = true } = {}) {
  const asset = factories[kind](THREE, seed === undefined ? {} : { seed }, {
    textures: {
      createCanvasTexture(width, height, draw) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        draw(canvas.getContext('2d'), width, height);
        return new THREE.CanvasTexture(canvas);
      },
    },
  });
  const bounds = new THREE.Box3().setFromObject(asset.root);
  const dimensions = bounds.getSize(new THREE.Vector3());
  const midpoint = bounds.getCenter(new THREE.Vector3());
  const alignment = new THREE.Group();
  alignment.add(asset.root);
  alignment.position.set(center ? -midpoint.x : 0, -bounds.min.y, center ? -midpoint.z : 0);
  const root = new THREE.Group();
  root.add(alignment);
  const scale = size / (height ? dimensions.y : Math.max(dimensions.x, dimensions.z));
  alignment.scale.setScalar(scale);
  alignment.position.multiplyScalar(scale);
  root.name = `game-${kind}`;
  asset.root.traverse(object => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return { root, source: asset.root, update: asset.update ?? asset.tick, dispose: asset.dispose };
}
