// Her colours (hair, eyes, clothes, skin), shared by the desktop avatar and the VR page.
import * as THREE from 'three'

export const STYLE_MATCH = {
  piel: /_SKIN/,
  pelo: /_HAIR/,
  ojos: /EyeIris/,
  ropa: /Tops_\d+_CLOTH/,
}

// Textures turned grey, so a chosen colour tints them evenly.
function neutralMap(map) {
  if (map.userData.neutral) return map.userData.neutral
  const { width, height } = map.image
  const canvas = Object.assign(document.createElement('canvas'), { width, height })
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(map.image, 0, 0)
  const image = context.getImageData(0, 0, width, height)
  const data = image.data
  let top = 1
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) top = Math.max(top, 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2])
  }
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.min(255, ((0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) * 255) / top)
    data[i] = data[i + 1] = data[i + 2] = value
  }
  context.putImageData(image, 0, 0)
  const neutral = new THREE.CanvasTexture(canvas)
  neutral.flipY = map.flipY
  neutral.colorSpace = map.colorSpace
  neutral.wrapS = map.wrapS
  neutral.wrapT = map.wrapT
  map.userData.neutral = neutral
  return neutral
}

export function applyStyle(vrm, part, color) {
  const match = STYLE_MATCH[part]
  if (!vrm || !match) return
  vrm.scene.traverse(node => {
    if (!node.isMesh) return
    for (const material of [node.material].flat()) {
      if (!match.test(material.name)) continue
      if (!material.userData.original) {
        material.userData.original = {
          map: material.map,
          color: material.color.clone(),
          shade: material.shadeColorFactor?.clone(),
        }
      }
      const original = material.userData.original
      if (color === null || color === undefined) {
        material.map = original.map
        material.color.copy(original.color)
        material.shadeColorFactor?.copy(original.shade)
      } else {
        if (part !== 'piel' && original.map) material.map = neutralMap(original.map)
        material.color.set(color)
        material.shadeColorFactor?.set(color).multiplyScalar(part === 'piel' ? 0.72 : 0.62)
      }
      material.needsUpdate = true
    }
  })
}
