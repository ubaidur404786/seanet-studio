// turn whatever the user uploads or pastes into a plain list of numbers.
//
// we accept the common shapes on purpose, so people do not have to clean their file first:
//   - one number per line                      12.1\n13.4\n...
//   - one row of comma / space / tab separated  12.1, 13.4, ...
//   - a csv with a header and several columns   time,visits\n00:00,12.1\n...
//     -> we take the LAST column that is mostly numbers (usually the value, not the timestamp)

export function parseSeries(text: string): number[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("The file is empty.");

  const split = (line: string) => line.split(/[,;\t ]+/).filter((c) => c.length > 0);

  // case 1: everything is on one line -> that line is the series
  if (lines.length === 1) return toNumbers(split(lines[0]));

  // case 2: several lines -> treat it as a table and pick the best numeric column
  const rows = lines.map(split);
  const width = Math.max(...rows.map((r) => r.length));
  for (let col = width - 1; col >= 0; col--) {
    const cells = rows.map((r) => r[col]).filter((c) => c !== undefined);
    const nums = cells.map(Number).filter((v) => Number.isFinite(v));
    // allow a header line (and maybe one broken cell) - but most of it must be numbers
    if (nums.length >= Math.max(2, cells.length - 2)) return nums;
  }
  throw new Error("Could not find a column of numbers in this file.");
}

function toNumbers(cells: string[]): number[] {
  const nums = cells.map(Number);
  const bad = nums.filter((v) => !Number.isFinite(v)).length;
  // a first cell like "Class" or a label is fine to skip, more than that is not
  if (bad > 1) throw new Error("Some values are not numbers.");
  return nums.filter((v) => Number.isFinite(v));
}
