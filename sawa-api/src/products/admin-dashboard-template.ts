import * as fs from 'fs';
import * as path from 'path';

export const ADMIN_DASHBOARD_HTML = (() => {
  const paths = [
    path.join(process.cwd(), 'public', 'admin-dashboard.html'),
    path.join(process.cwd(), 'dist', 'public', 'admin-dashboard.html'),
    path.join(__dirname, '..', '..', 'public', 'admin-dashboard.html'),
    path.join(__dirname, '..', '..', '..', 'public', 'admin-dashboard.html'),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  }
  return '<h1>Admin Dashboard HTML not found</h1>';
})();
