// One finger turns the molecule, two fingers pinch to zoom, and a short tap picks.
import * as THREE from 'three';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const q = new THREE.Quaternion();

export class Orbit {
  constructor(stage, canvas) {
    this.stage = stage;
    this.enabled = false;
    this.quat = new THREE.Quaternion();
    this.target = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.dist = 30;
    this.goalDist = 30;
    this.minDist = 8;
    this.maxDist = 160;
    this.spin = new THREE.Vector2();
    this.idle = 0;
    this.pointers = new Map();
    this.pinch = 0;
    this.moved = 0;
    this.onTap = null;
    this.onHover = null;

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.enabled) this.goalDist = Math.min(this.maxDist, Math.max(this.minDist, this.goalDist * Math.exp(e.deltaY * 0.001)));
    }, { passive: false });
  }

  down(e) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.moved = this.pointers.size > 1 ? 99 : 0;
    this.downAt = performance.now();
    this.idle = 0;
    if (this.pointers.size === 2) this.pinch = this.spread();
  }

  spread() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!this.enabled) return;
    this.moved += Math.hypot(dx, dy);
    this.idle = 0;
    if (this.pointers.size === 1) {
      if (this.moved < 7) return;
      this.spin.set(dx, dy).multiplyScalar(0.0062);
      this.turn(this.spin.x, this.spin.y);
    } else if (this.pointers.size === 2) {
      const s = this.spread();
      this.goalDist = Math.min(this.maxDist, Math.max(this.minDist, this.goalDist * (this.pinch / s)));
      this.pinch = s;
    }
  }

  up(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0 && this.moved < 9 && performance.now() - this.downAt < 500) this.onTap?.(e.clientX, e.clientY);
  }

  turn(yaw, pitch) {
    this.quat.multiply(q.setFromAxisAngle(Y, -yaw)).multiply(q.setFromAxisAngle(X, -pitch)).normalize();
  }

  aim(direction) {
    const m = new THREE.Matrix4().lookAt(direction, new THREE.Vector3(), Math.abs(direction.y) > 0.9 ? X : Y);
    this.quat.setFromRotationMatrix(m);
  }

  update(dt, cam, idleSpin = 0.05) {
    this.idle += dt;
    if (this.pointers.size === 0) {
      this.spin.multiplyScalar(Math.exp(-dt * 4));
      if (this.spin.lengthSq() > 1e-7) this.turn(this.spin.x, this.spin.y);
      if (this.idle > 2.5) this.turn(dt * idleSpin, 0);
    }
    const k = 1 - Math.exp(-dt * 3.4);
    this.target.lerp(this.goal, k);
    this.dist += (this.goalDist - this.dist) * k;
    cam.position.set(0, 0, this.dist).applyQuaternion(this.quat).add(this.target);
    cam.quaternion.copy(this.quat);
  }
}

// The view of these points that spreads them furthest apart on screen, so each is easy to tap.
export function bestView(points) {
  let best = new THREE.Vector3(0, 0, 1);
  let score = -1;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < 260; i++) {
    v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    let least = Infinity;
    for (let p = 0; p < points.length; p++) {
      for (let r = p + 1; r < points.length; r++) {
        a.copy(points[p]).sub(points[r]);
        b.copy(a).addScaledVector(v, -a.dot(v));
        least = Math.min(least, b.lengthSq());
      }
    }
    if (least > score) {
      score = least;
      best = v.clone();
    }
  }
  return best;
}
