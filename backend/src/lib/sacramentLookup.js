const pool = require("../db/pool");

/**
 * Look up a sacramental record in the internal sacramental_records table.
 * Mirrors the SVF external-DB matching rules: try name + birthday first
 * (birthday stored as text in several possible formats), then fall back to
 * a name-only match where the record has no birthday.
 *
 * @returns matching row {id, parents_name, ...} or null
 */
async function findSacramentRecord(name, birthday) {
  if (birthday) {
    const ts = new Date(birthday);
    if (!isNaN(ts.getTime())) {
      const birthdayISO = ts.toISOString().slice(0, 10);
      const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const withComma = `${months[ts.getMonth()]} ${ts.getDate()}, ${ts.getFullYear()}`;
      const withoutComma = `${months[ts.getMonth()]} ${ts.getDate()} ${ts.getFullYear()}`;
      const { rows } = await pool.query(
        `SELECT * FROM sacramental_records
         WHERE LOWER(name) = LOWER($1)
           AND (birthday = $2 OR birthday = $3 OR birthday = $4)
         LIMIT 1`,
        [name, birthdayISO, withComma, withoutComma]
      );
      if (rows[0]) return rows[0];
    }
  }

  // Fallback: name match where record has no birthday
  const { rows } = await pool.query(
    `SELECT * FROM sacramental_records
     WHERE LOWER(name) = LOWER($1)
       AND (birthday IS NULL OR birthday = '' OR birthday = '0000-00-00')
     LIMIT 1`,
    [name]
  );
  return rows[0] || null;
}

module.exports = { findSacramentRecord };
