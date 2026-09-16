import * as THREE from 'three'

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.85,
    metalness: options.metalness ?? 0,
    flatShading: options.flatShading ?? false,
    side: options.side ?? THREE.FrontSide
  })
}

export function createEnvironmentKitLibrary() {
  return {
    grassClump: {
      geometry: new THREE.PlaneGeometry(0.18, 0.65),
      material: makeMaterial(0x4a7f36, { side: THREE.DoubleSide }),
      yOffset: 0.325
    },
    flowerPatch: {
      stem: {
        geometry: new THREE.CylinderGeometry(0.015, 0.02, 0.35, 5),
        material: makeMaterial(0x3d6f2b),
        yOffset: 0.175
      },
      blossom: {
        geometry: new THREE.SphereGeometry(0.08, 6, 5),
        material: makeMaterial(0xf06bb3, { roughness: 0.7 }),
        yOffset: 0.38
      }
    },
    rockMound: {
      geometry: new THREE.DodecahedronGeometry(0.38, 0),
      material: makeMaterial(0x7d8179, { roughness: 0.95, flatShading: true }),
      yOffset: 0.16
    },
    pineTrunk: {
      geometry: new THREE.CylinderGeometry(0.09, 0.14, 1.7, 7),
      material: makeMaterial(0x6b4b2a, { roughness: 0.95 }),
      yOffset: 0.85
    },
    pineFoliageCluster: {
      geometry: new THREE.ConeGeometry(0.72, 1.5, 7),
      material: makeMaterial(0x2f6a35, { flatShading: true }),
      yOffset: 1.85
    },
    leaderTip: {
      geometry: new THREE.CylinderGeometry(0.035, 0.07, 0.6, 5),
      material: makeMaterial(0x5b3d22, { roughness: 0.95 }),
      yOffset: 2.45
    },
    branchWhorl: {
      geometry: new THREE.CylinderGeometry(0.025, 0.055, 0.9, 5),
      material: makeMaterial(0x624126, { roughness: 0.95 }),
      yOffset: 1.35
    },
    needlePadPrimary: {
      geometry: new THREE.ConeGeometry(0.46, 0.55, 6),
      material: makeMaterial(0x285f2f, { flatShading: true }),
      yOffset: 1.55
    },
    needlePadSecondary: {
      geometry: new THREE.ConeGeometry(0.28, 0.38, 6),
      material: makeMaterial(0x2f6f36, { flatShading: true }),
      yOffset: 1.7
    },
    droopingLowerBranch: {
      geometry: new THREE.CylinderGeometry(0.03, 0.06, 1.15, 5),
      material: makeMaterial(0x5e3f24, { roughness: 0.95 }),
      yOffset: 1.1
    },
    broadleafCanopyPrimary: {
      geometry: new THREE.SphereGeometry(0.62, 10, 8),
      material: makeMaterial(0x3b743c, { roughness: 0.86 }),
      yOffset: 1.8
    },
    broadleafCanopySecondary: {
      geometry: new THREE.SphereGeometry(0.38, 9, 7),
      material: makeMaterial(0x4d8646, { roughness: 0.86 }),
      yOffset: 1.72
    },
    branchSegment: {
      geometry: new THREE.CylinderGeometry(0.04, 0.08, 0.9, 5),
      material: makeMaterial(0x654225, { roughness: 0.94 }),
      yOffset: 1.3
    },
    baseFlare: {
      geometry: new THREE.CylinderGeometry(0.17, 0.24, 0.28, 7),
      material: makeMaterial(0x704a2b, { roughness: 0.94 }),
      yOffset: 0.12
    },
    surfaceRoot: {
      geometry: new THREE.CylinderGeometry(0.025, 0.045, 0.65, 5),
      material: makeMaterial(0x6a482d, { roughness: 0.95 }),
      yOffset: 0.08
    },
    deadBranch: {
      geometry: new THREE.CylinderGeometry(0.025, 0.05, 0.8, 5),
      material: makeMaterial(0x5b4126, { roughness: 0.95 }),
      yOffset: 1.3
    },
    shrubMass: {
      geometry: new THREE.SphereGeometry(0.36, 8, 6),
      material: makeMaterial(0x355f2f, { roughness: 0.9 }),
      yOffset: 0.32
    }
  }
}
