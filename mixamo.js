// Mixamo animations (FBX) retargeted onto her VRM: real motion capture for walking, dancing, kissing...
// Based on the official three-vrm example "loadMixamoAnimation" (MIT, pixiv).
import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const RIG = {
  mixamorigHips: 'hips', mixamorigSpine: 'spine', mixamorigSpine1: 'chest', mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck', mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder', mixamorigLeftArm: 'leftUpperArm', mixamorigLeftForeArm: 'leftLowerArm', mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal', mixamorigLeftHandThumb2: 'leftThumbProximal', mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal', mixamorigLeftHandIndex2: 'leftIndexIntermediate', mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal', mixamorigLeftHandMiddle2: 'leftMiddleIntermediate', mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal', mixamorigLeftHandRing2: 'leftRingIntermediate', mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal', mixamorigLeftHandPinky2: 'leftLittleIntermediate', mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder', mixamorigRightArm: 'rightUpperArm', mixamorigRightForeArm: 'rightLowerArm', mixamorigRightHand: 'rightHand',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal', mixamorigRightHandThumb2: 'rightThumbProximal', mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal', mixamorigRightHandIndex2: 'rightIndexIntermediate', mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal', mixamorigRightHandMiddle2: 'rightMiddleIntermediate', mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandRing1: 'rightRingProximal', mixamorigRightHandRing2: 'rightRingIntermediate', mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandPinky1: 'rightLittleProximal', mixamorigRightHandPinky2: 'rightLittleIntermediate', mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg', mixamorigLeftLeg: 'leftLowerLeg', mixamorigLeftFoot: 'leftFoot', mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg', mixamorigRightLeg: 'rightLowerLeg', mixamorigRightFoot: 'rightFoot', mixamorigRightToeBase: 'rightToes',
}

// Reads every Mixamo-rigged clip in an FBX or GLB file: [{ name, clip }] retargeted onto `vrm`.
export async function loadMixamoFile(url, vrm) {
  const isGlb = /\.gl(b|tf)$/i.test(url)
  const loaded = isGlb ? await new GLTFLoader().loadAsync(url) : await new FBXLoader().loadAsync(url)
  const asset = isGlb ? loaded.scene : loaded
  return loaded.animations.map(clip => ({ name: clip.name, clip: retarget(asset, clip, vrm) }))
}

function retarget(asset, clip, vrm) {
  const tracks = []
  const restInverse = new THREE.Quaternion()
  const parentRest = new THREE.Quaternion()
  const q = new THREE.Quaternion()
  const v = new THREE.Vector3()
  // Both in the rig's own units (the official example's way): local hips height of the motion vs. hers.
  const motionHips = asset.getObjectByName('mixamorigHips').position.y || 1
  const vrmHips = Math.abs(vrm.humanoid.getNormalizedBoneNode('hips').getWorldPosition(v).y - vrm.scene.getWorldPosition(v).y)
  const hipsScale = vrmHips / motionHips
  const isVrm0 = vrm.meta?.metaVersion === '0'

  for (const track of clip.tracks) {
    const [rigName, property] = track.name.split('.')
    const node = vrm.humanoid.getNormalizedBoneNode(RIG[rigName])
    const source = asset.getObjectByName(rigName)
    if (!node || !source) continue
    source.getWorldQuaternion(restInverse).invert()
    source.parent.getWorldQuaternion(parentRest)
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const values = track.values.slice()
      for (let i = 0; i < values.length; i += 4) {
        q.fromArray(values, i).premultiply(parentRest).multiply(restInverse).toArray(values, i)
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.${property}`, track.times, values.map((x, i) => (isVrm0 && i % 2 === 0 ? -x : x))))
    } else if (track instanceof THREE.VectorKeyframeTrack && RIG[rigName] === 'hips') {
      // In place: only the hips' up-and-down is kept; the window does the travelling.
      tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.${property}`, track.times, track.values.map((x, i) => (i % 3 === 1 ? x * hipsScale : 0))))
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks)
}
