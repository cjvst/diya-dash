// Bloom and the output transform in one pass. three's UnrealBloomPass ends by adding its glow onto the scene
// in place (a full-screen read and write) and OutputPass then reads the whole screen again to tone-map it and
// write it out (another). Here the glow is added and the result tone-mapped in the same shader, in the same
// order and with the same maths (the add as the bloom's additive blend did it: colour times its alpha), so the
// picture is unchanged and one full-screen pass of half-float reads and writes is gone, which is what a
// phone's GPU, short of memory bandwidth, spends most on.
import { RawShaderMaterial } from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const vertexShader = /* glsl */`
  precision highp float;
  uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
  attribute vec3 position; attribute vec2 uv; varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fragmentShader = /* glsl */`
  precision highp float;
  uniform sampler2D tDiffuse, tBloom;
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  varying vec2 vUv;
  void main() {
    vec4 b = texture2D(tBloom, vUv);
    gl_FragColor = texture2D(tDiffuse, vUv);
    gl_FragColor.rgb += b.rgb * b.a;                         // the bloom's additive blend (SRC_ALPHA, ONE)
    gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
    gl_FragColor = sRGBTransferOETF(gl_FragColor);
  }`;

export class BloomOutputPass extends UnrealBloomPass {
  constructor(...args) {
    super(...args);
    this.outMaterial = new RawShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tBloom: { value: null }, toneMappingExposure: { value: 1 } },
      vertexShader, fragmentShader, defines: { ACES_FILMIC_TONE_MAPPING: '', SRGB_TRANSFER: '' }, depthTest: false, depthWrite: false,
    });
    this.outQuad = new FullScreenQuad(this.outMaterial);
    this.needsSwap = true;
    // its eleven blur targets are drawn with full-screen quads and never depth-tested, but three gives every
    // render target a depth buffer unless told not to: one that is allocated, cleared and, on a phone's tiled
    // GPU, written back to memory for nothing (set before the first draw, when the buffers are made)
    for (const rt of [this.renderTargetBright, ...this.renderTargetsHorizontal, ...this.renderTargetsVertical]) rt.depthBuffer = false;
    // the parent's bright pass, blurs and composite run as they are; only its last step, the blend onto the
    // scene, is left out (it happens in the shader above instead)
    const fsq = this.fsQuad, draw = fsq.render.bind(fsq);
    fsq.render = r => { if (fsq.material !== this.blendMaterial) draw(r); };
  }
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    const u = this.outMaterial.uniforms;
    u.tDiffuse.value = readBuffer.texture; u.tBloom.value = this.renderTargetsHorizontal[0].texture; u.toneMappingExposure.value = renderer.toneMappingExposure;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.outQuad.render(renderer);
  }
  dispose() { super.dispose(); this.outMaterial.dispose(); this.outQuad.dispose(); }
}

// The depth buffer is needed while a pass draws and never after it. A phone's tiled GPU keeps depth on chip and
// writes it back to memory at the end of the pass unless told the contents are no longer needed; three only
// says so on one headset. So, after the scene is drawn: invalidate it. (Bandwidth only: the picture is the same.)
export function dropDepth(renderer) {
  const gl = renderer.getContext();
  if (gl.invalidateFramebuffer) gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.DEPTH_ATTACHMENT]);
}
export class SceneRenderPass extends RenderPass {
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    if (!this.renderToScreen) { renderer.setRenderTarget(readBuffer); dropDepth(renderer); }
  }
}
