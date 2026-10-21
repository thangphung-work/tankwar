/**
 * DRONE TRINH SÁT của pháo tự hành (quadcopter quân sự cỡ ~1.5 m, 8 đơn vị = 1 m).
 * Đậu trên nóc cabin xe pháo; cất cánh khi mở màn hình điều khiển hỏa lực, hết pin bay về đáp lại.
 * Gốc tọa độ = đáy càng đáp, mũi drone hướng -z (cùng hướng mũi xe khi đậu).
 */
const ReconDrone = (() => {
  // vị trí bãi đáp trên nóc cabin Arbalest (hệ tọa độ chassisGroup, xem spg_arbalest.js: CAB_ROOF = 22.5,
  // cabin từ z ≈ -40 tới -21; tránh nắp cửa nóc x -4.6 / z -27 và ăng-ten x 7.6 / z -31.5)
  const PAD = { x: 1.2, y: 22.75, z: -34.0 };

  function build(team) {
    const g = new THREE.Group();
    g.name = 'reconDrone';
    const body = new THREE.MeshLambertMaterial({ color: 0x3a4036 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1b1e1c });
    const steel = new THREE.MeshLambertMaterial({ color: 0x6d726c });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };
    // thân: khoang pin + nắp trên vát, mũi camera
    add(new THREE.BoxGeometry(3.4, 1.3, 4.6), body, 0, 2.5, 0);
    add(new THREE.BoxGeometry(2.6, 0.6, 3.6), body, 0, 3.4, 0.2);
    add(new THREE.BoxGeometry(1.2, 0.25, 1.6), dark, 0, 3.8, 0.9);            // ăng-ten dẹt / GPS
    // cụm gimbal camera dưới mũi
    add(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 8), dark, 0, 1.75, -1.9);
    const ball = add(new THREE.SphereGeometry(0.75, 12, 10), dark, 0, 1.25, -1.9);
    add(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 12), new THREE.MeshBasicMaterial({ color: 0x0c2830 }), 0, 1.2, -2.6, Math.PI / 2);
    // càng đáp
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.3, 0.3, 4.4), steel, s * 1.9, 0.15, 0);
      add(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 6), steel, s * 1.6, 1.1, -1.2, 0, 0, s * 0.3);
      add(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 6), steel, s * 1.6, 1.1, 1.2, 0, 0, s * 0.3);
    }
    // 4 tay đòn + mô-tơ + cánh quạt (2 cánh) + đĩa mờ khi quay nhanh
    const rotors = [];
    const discMat = new THREE.MeshBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const hx = sx * 4.6, hz = sz * 4.6;
      const arm = add(new THREE.BoxGeometry(0.45, 0.4, Math.hypot(hx, hz)), body, hx / 2, 2.9, hz / 2);
      arm.rotation.y = Math.atan2(hx, hz);
      add(new THREE.CylinderGeometry(0.55, 0.6, 0.9, 10), dark, hx, 3.3, hz);
      const hub = new THREE.Group();
      hub.position.set(hx, 3.85, hz);
      const blades = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.08, 0.42), dark);
      hub.add(blades);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2.8, 24), discMat);
      disc.rotation.x = -Math.PI / 2;
      hub.add(disc);
      g.add(hub);
      rotors.push({ hub, blades, dir: sx * sz > 0 ? 1 : -1 });
    }
    // đèn định vị nhấp nháy (màu phe) dưới đuôi
    const led = add(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: team === 'RED' ? 0xff4040 : 0x40a0ff }), 0, 1.9, 2.4);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = true; } });
    g.userData = { rotors, discMat, led, ball, rpm: 0, t: 0 };
    return g;
  }

  // rpm 0..1 (0 = cánh đứng yên, 1 = treo); cánh quay + đĩa mờ hiện dần khi quay nhanh; đèn nháy khi đang bay
  function animate(g, dt, rpm) {
    const U = g.userData;
    U.rpm += (rpm - U.rpm) * Math.min(1, dt * (rpm > U.rpm ? 2.5 : 1.2));
    U.t += dt;
    for (const r of U.rotors) r.hub.rotation.y += r.dir * U.rpm * 95 * dt;
    U.discMat.opacity = Math.max(0, Math.min(0.32, (U.rpm - 0.35) * 0.6));
    for (const r of U.rotors) r.blades.visible = U.rpm < 0.85;
    U.led.visible = U.rpm < 0.05 || (U.t % 1.2) < 0.12;
  }

  return { PAD, build, animate };
})();

if (typeof window !== 'undefined') window.ReconDrone = ReconDrone;
