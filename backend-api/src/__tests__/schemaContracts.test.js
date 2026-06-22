const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('database and route contract alignment', () => {
  test('enterprise migration creates columns and tables required by live routes', () => {
    const migration = read('migrations/001_enterprise_schema_alignment.up.sql');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS password_hash');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS refresh_tokens');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS notifications');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS audit_logs');
    expect(migration).toContain("'LOGIN_SUCCESS'");
    expect(migration).toContain("'TOKEN_REFRESH'");
  });

  test('routes use canonical schema table names', () => {
    const geofenceRoutes = read('modules/geofence/routes.js');
    const excelRoutes = read('modules/excel-processing/routes.js');
    const workReportRoutes = read('modules/work-report/routes.js');

    expect(geofenceRoutes).toContain('office_locations');
    expect(geofenceRoutes).not.toContain('office_location LIMIT');
    expect(excelRoutes).toContain('FROM student_attendance a');
    expect(workReportRoutes).toContain('image_urls');
    expect(workReportRoutes).not.toContain('image_data');
  });
});
