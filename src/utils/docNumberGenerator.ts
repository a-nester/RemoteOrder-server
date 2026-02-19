
import pool from '../db.js';

/**
 * Generates a document number in format DDMMYY + Sequence
 * Example: 1902261 for the first document on 19th Feb 2026.
 * @param tableName The table name to check for existing numbers (e.g. "Order")
 * @param date The date of the document (Date object or string)
 * @param columnName The column name where the number is stored (default: "docNumber")
 */
export const generateDocNumber = async (tableName: string, date: Date | string = new Date(), columnName: string = 'docNumber'): Promise<string> => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);

    const prefix = `${day}${month}${year}`;

    // We need to find the count of documents with this prefix to determine the next sequence number.
    // Using Regex or simple LIKE match.

    const client = await pool.connect();
    try {
        const query = `
            SELECT COUNT(*) 
            FROM "${tableName}" 
            WHERE "${columnName}" LIKE $1
        `;
        const result = await client.query(query, [`${prefix}%`]);
        const count = parseInt(result.rows[0].count, 10);

        const nextSequence = count + 1;

        return `${prefix}${nextSequence}`;
    } catch (error) {
        console.error('Error generating doc number:', error);
        // Fallback: use timestamp to avoid collision but this violates the format req.
        // Better: throw error or retry.
        throw error;
    } finally {
        client.release();
    }
};
