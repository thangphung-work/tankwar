// chạy trong soldier_lab: quét các thế của vũ khí __W ở 60 khung/s. jump: nhảy lớn nhất giữa hai khung [đv, giây]; pen: đỉnh áo trong súng; inv: điểm dò súng trong thân
(async () => {
  const W = window.__W, V = (x, y, z) => new THREE.Vector3(x, y, z), out = {};
  const run = (name, seq) => {
    LAB.shot({ weapon: W, motion: seq[0][0], time: 0 });
    const F = LAB.figure, R = F.rifle; let t = 10, prev = null, i = 0, pn = 0, pm = 0, iv = 0, ivm = 0;
    const mx = { gun: [0, 0], elR: [0, 0], elL: [0, 0] };
    for (const [m, dur, st] of seq) {
      LAB.S.motion = m;
      if (st === 'reload') F.atrState = { t: 0, T: dur, empty: true }; else if (st === 'noreload') F.atrState = null;
      for (let k = 0; k < dur * 60; k++, i++) {
        t += 1 / 60; if (F.atrState && F.atrState.t != null) F.atrState.t = Math.min(F.atrState.T, F.atrState.t + 1 / 60);
        LAB.step(t); F.root.updateMatrixWorld(true);
        const cur = { gun: F.chest.worldToLocal(R.localToWorld(V(0, 0, -6))), elR: F.chest.worldToLocal(F.arms[1].fore.getWorldPosition(V(0, 0, 0))), elL: F.chest.worldToLocal(F.arms[0].fore.getWorldPosition(V(0, 0, 0))) };
        if (prev && i > 3) for (const key in cur) { const d = cur[key].distanceTo(prev[key]); if (d > mx[key][0]) mx[key] = [+d.toFixed(3), +(i / 60).toFixed(2)]; }
        prev = cur;
        if (i % 12 === 0) { const r = __pen(F).res; for (const q in r) { pn += r[q].n; pm = Math.max(pm, r[q].max); } const v = __inv(F); iv += v[0]; ivm = Math.max(ivm, v[1]); }
      }
    }
    F.atrState = null;
    out[name] = { jump: mx, penSum: pn, penMax: pm, invSum: iv, invMax: ivm, samples: Math.ceil(i / 12) };
  };
  run('walkrun', [['idle', 0.5], ['walk', 1.2], ['patrol', 1.2], ['run', 1.2], ['idle', 0.8]]);
  run('aim', [['idle', 0.5], ['aim', 3], ['idle', 3]]);
  if (W === 'atr') {
    run('kneelReload', [['idle', 0.5], ['idle', 5.25, 'reload'], ['idle', 1, 'noreload']]);
    run('proneReload', [['idle', 0.5], ['crouch', 1.2], ['crouch', 5.25, 'reload'], ['crouch', 0.5, 'noreload'], ['idle', 1.5]]);
  }
  return out;
})()
