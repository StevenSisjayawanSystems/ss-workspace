import { useMemo } from 'react'
import { Effect, EffectAttribute } from 'postprocessing'
import * as THREE from 'three'

// Draws a thin warm-brown line wherever depth breaks sharply: the pencil line of a painted cel.
// A Laplacian is used so that flat floors seen at an angle stay clean.
const fragment = /* glsl */ `
uniform vec3 ink;
uniform float strength;
uniform float width;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 px = texelSize * width;
  float c = readDepth(uv);
  float n = readDepth(uv + vec2(0.0, px.y));
  float s = readDepth(uv - vec2(0.0, px.y));
  float e = readDepth(uv + vec2(px.x, 0.0));
  float w = readDepth(uv - vec2(px.x, 0.0));
  float lap = abs(n + s + e + w - 4.0 * c);
  float edge = smoothstep(0.0004, 0.0011, lap);
  outputColor = vec4(mix(inputColor.rgb, ink, edge * strength), inputColor.a);
}
`

class InkEffect extends Effect {
  constructor(width: number) {
    super('InkEffect', fragment, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['ink', new THREE.Uniform(new THREE.Color('#4a2c20'))],
        ['strength', new THREE.Uniform(0.8)],
        ['width', new THREE.Uniform(width)],
      ]),
    })
  }
}

export function Ink({ width = 1 }: { width?: number }) {
  const effect = useMemo(() => new InkEffect(width), [width])
  return <primitive object={effect} dispose={null} />
}
