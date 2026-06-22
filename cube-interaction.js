/**
 * cube-interaction.js
 *
 * 只做一件事：滚轮 -> 给 cube 一个随机轴向的角速度冲量，像在真空里被推了一下，
 * 之后持续翻滚漂浮、缓慢衰减；不滚的时候也维持一个最小自转，不会完全静止。
 * 不监听鼠标，不改几何体，不碰材质——表面永远是干净的，跟截图里那种"什么都没有"
 * 的状态一致。
 *
 * 用法：
 *   import { attachCubeInteraction } from './cube-interaction.js';
 *   const cubeFX = attachCubeInteraction({ mesh: cubeMesh, domElement: renderer.domElement });
 *
 *   function animate() {
 *     const dt = clock.getDelta();
 *     cubeFX.update(dt);
 *     renderer.render(scene, camera);
 *   }
 */

import * as THREE from 'three';

export function attachCubeInteraction({
  mesh,
  domElement,
  angularDamping = 0.4,     // 衰减系数，越大转动停下来越快
  idleSpin = 0.05,          // 没有滚轮输入时维持的最小漂浮转速 rad/s
  maxAngularSpeed = 3.0,    // 角速度上限，防止连续滚动把转速堆到失控
  scrollImpulse = 0.012,    // 每单位 |deltaY| 换算成的角速度增量
} = {}) {
  const angularVelocity = new THREE.Vector3(); // 方向 = 转轴，长度 = 角速度(rad/s)

  function onWheel(e) {
    const axis = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize();
    const magnitude = Math.min(Math.abs(e.deltaY), 200) * scrollImpulse;
    angularVelocity.addScaledVector(axis, magnitude);
    if (angularVelocity.length() > maxAngularSpeed) {
      angularVelocity.setLength(maxAngularSpeed);
    }
  }
  domElement.addEventListener('wheel', onWheel, { passive: true });

  function update(dt) {
    if (!mesh) return;

    if (angularVelocity.lengthSq() < 1e-6) {
      angularVelocity
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(idleSpin);
    } else if (angularVelocity.length() < idleSpin) {
      angularVelocity.setLength(idleSpin);
    }

    const angle = angularVelocity.length() * dt;
    if (angle > 1e-6) {
      const axis = angularVelocity.clone().normalize();
      mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    }

    angularVelocity.multiplyScalar(Math.max(0, 1 - angularDamping * dt));
  }

  function dispose() {
    domElement.removeEventListener('wheel', onWheel);
  }

  return { update, dispose };
}
