import { describe, it, expect } from 'vitest';
import { parseCsvGrid, parseRecordsCsv, RECORDS_CSV_TEMPLATE } from '../../app/lib/parseCsv';

describe('parseCsvGrid', () => {
    it('parses simple rows', () => {
        const { grid } = parseCsvGrid('a,b,c\n1,2,3\n4,5,6');
        expect(grid).toEqual([['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6']]);
    });

    it('handles quoted fields with commas', () => {
        const { grid } = parseCsvGrid('name,parents\n"Dela Cruz, Juan","Dela Cruz, Pedro"');
        expect(grid[1]).toEqual(['Dela Cruz, Juan', 'Dela Cruz, Pedro']);
    });

    it('handles escaped quotes inside quoted fields', () => {
        const { grid } = parseCsvGrid('name\n"Juan ""Jun"" Cruz"');
        expect(grid[1][0]).toBe('Juan "Jun" Cruz');
    });

    it('handles CRLF line endings', () => {
        const { grid } = parseCsvGrid('a,b\r\n1,2\r\n');
        expect(grid).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('handles quoted field containing a newline', () => {
        const { grid } = parseCsvGrid('a,b\n"x\ny",2');
        expect(grid[1]).toEqual(['x\ny', '2']);
    });

    it('flags unterminated quote', () => {
        const { errors } = parseCsvGrid('a,b\n"x,y');
        expect(errors.some((e) => e.message.includes('Unterminated'))).toBe(true);
    });
});

describe('parseRecordsCsv', () => {
    it('maps canonical headers and returns rows with line numbers', () => {
        const { rows, errors } = parseRecordsCsv(
            'name,birthday,parents_name\nJuan,1990-01-01,Pedro & Maria\nAna,1992-05-05,Jose & Luz'
        );
        expect(errors).toEqual([]);
        expect(rows).toHaveLength(2);
        expect(rows[0].row).toBe(2);
        expect(rows[0].data).toEqual({ name: 'Juan', birthday: '1990-01-01', parents_name: 'Pedro & Maria' });
    });

    it('maps human-friendly header aliases', () => {
        const { rows, errors } = parseRecordsCsv(
            'Full Name,Date of Birth,Baptism Date,Godparents\nJuan,Jan 1 1990,Feb 1 1990,Ana & Jose'
        );
        expect(errors).toEqual([]);
        expect(rows[0].data.name).toBe('Juan');
        expect(rows[0].data.birthday).toBe('Jan 1 1990');
        expect(rows[0].data.baptismal_date).toBe('Feb 1 1990');
        expect(rows[0].data.godparents_name).toBe('Ana & Jose');
    });

    it('reports missing name column', () => {
        const { errors, rows } = parseRecordsCsv('birthday\n1990-01-01');
        expect(rows).toEqual([]);
        expect(errors[0].message).toContain('Missing required "name" column');
    });

    it('skips rows missing a name and reports the line', () => {
        const { rows, errors } = parseRecordsCsv('name,birthday\nJuan,1990\n,1991\nAna,1992');
        expect(rows).toHaveLength(2);
        expect(errors[0]).toEqual({ row: 3, message: 'Missing name — row skipped' });
    });

    it('flags rows with too many fields', () => {
        const { errors } = parseRecordsCsv('name,birthday\nJuan,1990,extra');
        expect(errors.some((e) => e.message.includes('3 fields'))).toBe(true);
    });

    it('warns about unrecognized columns but still parses', () => {
        const { rows, errors } = parseRecordsCsv('name,favorite_color\nJuan,blue');
        expect(rows).toHaveLength(1);
        expect(errors.some((e) => e.message.includes('Unrecognized column'))).toBe(true);
    });

    it('parses the shipped template without errors', () => {
        const { rows, errors } = parseRecordsCsv(RECORDS_CSV_TEMPLATE);
        expect(errors).toEqual([]);
        expect(rows).toHaveLength(1);
        expect(rows[0].data.name).toBe('Dela Cruz, Juan Miguel');
        expect(rows[0].data.confirmed_by).toBe('Bishop García');
    });
});
