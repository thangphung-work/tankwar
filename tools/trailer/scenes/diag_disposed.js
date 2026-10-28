/**
 * DÒ LỖI "BYTES_PER_ELEMENT of null" (vẽ lại hình học đã huỷ mà mảng CPU đã bị bỏ): đánh dấu mọi BufferGeometry bị dispose,
 * mỗi 0,5 s quét cảnh — mesh còn hiện mà hình học đã dispose / mảng thuộc tính null -> ghi nhật ký 'diag' kèm đường dẫn.
 * Chạy kèm kịch bản khác: --script tools/trailer/scenes/diag_disposed.js (nối trước kịch bản chính bằng record.js --script2).
 */
(() => {
  const S = __TR.scene, g = window.game;
  const od = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function () { this.__disposedAt = __TW ? __TW.frameN : 1; this.__disposeStack = (new Error().stack || '').split('\n').slice(2, 6).join(' | '); return od.apply(this, arguments); };
  const seen = new Set();
  const pathOf = (o) => { const p = []; while (o) { p.push((o.name || o.type) + (o.userData && o.userData.civMerged ? '[merged]' : '')); o = o.parent; } return p.slice(0, 6).join(' < '); };
  setInterval(() => {
    g.scene.traverseVisible(o => {
      const geo = o.geometry;
      if (!geo || seen.has(geo)) return;
      const nullArr = Object.values(geo.attributes || {}).some(a => a && a.array === null) || (geo.index && geo.index.array === null);
      if (geo.__disposedAt || nullArr) {
        seen.add(geo);
        S.log('diag', { path: pathOf(o), disposedAt: geo.__disposedAt || 0, nullArr, stack: geo.__disposeStack || '' });
        console.error('[DIAG] vẽ hình học đã huỷ:', pathOf(o), geo.__disposeStack || '');
      }
    });
  }, 500);
})();
