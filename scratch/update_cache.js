// scratch/update_cache.js
const fs = require('fs');
const ts = Date.now();
for (const file of ['soldier_lab.html', 'soldier_field_lab.html', 'index.html', 'fx_lab.html', 'vehicle_fx_lab.html', 'vlab_test.html']) {
  if (fs.existsSync(file)) {
    let c = fs.readFileSync(file, 'utf8');
    c = c.replace(/soldier_model\.js\?v=[^"'\s>]+/g, 'soldier_model.js?v=' + ts);
    fs.writeFileSync(file, c, 'utf8');
    console.log('Updated cache buster in', file);
  }
}
