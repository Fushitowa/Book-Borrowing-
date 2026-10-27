import 'dotenv/config';
import { createInterface } from 'node:readline';
import { databasePool } from '../config/database.js';
import { writeAudit } from '../services/audit.service.js';
import { hashPassword } from '../services/password.service.js';

function ask(label: string): Promise<string> {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => reader.question(label, (answer) => { reader.close(); resolve(answer.trim()); }));
}

function askHidden(label: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(label);
    if (!stdin.isTTY) {
      const reader = createInterface({ input: stdin, output: stdout });
      reader.question('', (answer) => { reader.close(); resolve(answer); });
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    let answer = '';
    const onData = (chunk: Buffer) => {
      const key = chunk.toString('utf8');
      if (key === '\u0003') { stdin.setRawMode(false); process.exit(130); }
      if (key === '\r' || key === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        stdout.write('\n');
        resolve(answer);
      } else if (key === '\u007f' || key === '\b') {
        answer = answer.slice(0, -1);
      } else if (key >= ' ') {
        answer += key;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const roleCode = process.argv[2] === 'LIBRARIAN' ? 'LIBRARIAN' : 'ADMIN';
  const roleLabel = roleCode === 'ADMIN' ? 'administrator' : 'librarian';
  const username = await ask(`${roleLabel[0].toUpperCase()}${roleLabel.slice(1)} username: `);
  const email = await ask(`${roleLabel[0].toUpperCase()}${roleLabel.slice(1)} email (optional): `);
  const firstName = await ask('First name: ');
  const lastName = await ask('Last name: ');
  const password = await askHidden('Password (minimum 12 characters): ');
  const confirmation = await askHidden('Confirm password: ');

  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username)) throw new Error('Username must be 3–80 characters and use letters, numbers, dots, dashes, or underscores.');
  if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) throw new Error('Enter a valid first and last name.');
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error('Enter a valid email address.');
  if (password.length < 12 || password.length > 200) throw new Error('Password must be between 12 and 200 characters.');
  if (password !== confirmation) throw new Error('The passwords do not match.');

  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute<any[]>('SELECT id FROM users WHERE username = ? OR (? <> \'\' AND email = ?) FOR UPDATE', [username, email, email]);
    if (existing.length) throw new Error('That username or email is already in use.');
    const [roleRows] = await connection.execute<any[]>('SELECT id FROM roles WHERE code = ? LIMIT 1', [roleCode]);
    if (!roleRows.length) throw new Error(`The ${roleCode} role was not found. Import the school_library schema first.`);
    const [insert] = await connection.execute<any>(
      'INSERT INTO users (username, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [username, email || null, await hashPassword(password), firstName, lastName],
    );
    const userId = Number(insert.insertId);
    await connection.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleRows[0].id]);
    await writeAudit(connection, userId, 'ADMIN_ACCOUNT_CREATED', 'users', userId, { username, email: email || null });
    await connection.commit();
    console.log(`${roleLabel[0].toUpperCase()}${roleLabel.slice(1)} account "${username}" created. You can now sign in.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await databasePool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not create administrator account.');
  process.exitCode = 1;
});
