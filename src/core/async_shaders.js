/**
 * BIÊN DỊCH SHADER KHÔNG CHẶN LÚC ĐANG CHƠI (KHR_parallel_shader_compile)
 * Vật liệu / biến thể lần đầu xuất hiện giữa trận (vết đạn, hố rỗ tường, gốc cây gãy, gạch vụn, hiệu ứng nổ...) cần shader
 * mới: three r128 tạo chương trình (không chặn — game tắt checkShaderErrors) rồi đọc ngay danh sách uniform
 * (getProgramParameter ACTIVE_UNIFORMS) -> trình duyệt phải chờ GPU biên dịch xong: khựng 0,2-2 s mỗi shader (ANGLE D3D11).
 * Ở đây: trong lượt vẽ (renderBufferDirect), shader chưa biên dịch xong thì bỏ qua vật đó ở khung này (chưa gán
 * currentProgram, vật liệu đánh dấu needsUpdate -> khung sau three lấy lại đúng chương trình trong bộ đệm), GPU biên dịch
 * song song; xong thì vẽ bình thường. Vật mới hiện trễ vài khung thay vì cả game đứng hình.
 * Lượt làm nóng (renderer.compile, compileShadersAsync) không đi qua đây — giữ nguyên.
 */
(function () {
  const PENDING = { asyncShaderPending: true };
  function install(R) {
    if (!R || R.__asyncShaders) return false;
    const gl = R.getContext();
    const ext = gl && gl.getExtension('KHR_parallel_shader_compile');
    if (!ext) return false;
    const DONE = ext.COMPLETION_STATUS_KHR || 0x91B1;
    const gpp = gl.getProgramParameter;
    let depth = 0, skipped = 0;
    // ACTIVE_UNIFORMS / ACTIVE_ATTRIBUTES: chỉ three hỏi khi dựng danh sách uniform / thuộc tính lần đầu
    gl.getProgramParameter = function (prog, pname) {
      if (depth > 0 && (pname === 0x8B86 || pname === 0x8B89) && !gpp.call(this, prog, DONE)) throw PENDING;
      return gpp.call(this, prog, pname);
    };
    const rbd = R.renderBufferDirect;
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      depth++;
      try { return rbd.call(this, camera, scene, geometry, material, object, group); } catch (e) {
        if (e !== PENDING) throw e;
        material.needsUpdate = true;
        skipped++;
      } finally { depth--; }
    };
    R.__asyncShaders = { skipped: () => skipped };
    return true;
  }
  window.AsyncShaders = { install };
})();
