// proot blocks networkInterfaces; vite --host crashes
const os = require('os');

const original = os.networkInterfaces;
os.networkInterfaces = function () {
  try {
    return original.call(os);
  } catch {
    return {};
  }
};
