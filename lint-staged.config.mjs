/*
 * root config avoids discovery issues.
 * resolves plugins by running in workspace.
 */
import path from 'node:path';

const WORKSPACES = ['web/api', 'web/app', 'mobile'];
const isCode = (file) => /\.(ts|tsx|js|jsx|cjs|mjs)$/.test(file);

export default (files) => {
  const root = process.cwd();
  return WORKSPACES.flatMap((workspace) => {
    const dir = path.join(root, workspace);
    const picked = files
      .map((file) => path.resolve(root, file))
      .filter((file) => isCode(file) && file.startsWith(dir + path.sep));
    if (!picked.length) return [];
    const rel = picked.map((file) => path.relative(dir, file)).join(' ');
    const eslint = path.join(root, 'node_modules/eslint/bin/eslint.js');
    return `bash -c 'cd ${workspace} && node ${eslint} --no-warn-ignored ${rel}'`;
  });
};
