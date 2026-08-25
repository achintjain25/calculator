/**
 * Password setup helper
 * ─────────────────────
 * Prints the environment lines to paste into server/.env.
 *
 *   npm run set-password -- "your password here"
 *
 * The password itself is never written to disk by this script — only the
 * scrypt hash is printed, and you choose where it goes.
 */

import crypto from 'crypto'
import { hashPassword } from './auth'

const MIN_LENGTH = 8

function main() {
  // Everything after `--` so a password containing spaces still works when
  // quoted, and one containing shell-ish characters is not re-split.
  const password = process.argv.slice(2).join(' ').trim()

  if (!password) {
    console.error('\nUsage:  npm run set-password -- "your password here"\n')
    console.error('Wrap the password in quotes if it contains spaces.\n')
    process.exit(1)
  }

  if (password.length < MIN_LENGTH) {
    console.error(`\nThat password is ${password.length} characters. Use at least ${MIN_LENGTH}.\n`)
    console.error('This is the only thing standing between the internet and every')
    console.error('customer record in the shop, so make it a real password.\n')
    process.exit(1)
  }

  const hash   = hashPassword(password)
  const secret = crypto.randomBytes(32).toString('hex')

  console.log('\n' + '='.repeat(72))
  console.log('  Copy these lines into server/.env')
  console.log('='.repeat(72) + '\n')
  console.log('AUTH_ENABLED=true')
  console.log(`AUTH_USERNAME=${process.env.AUTH_USERNAME || 'owner'}`)
  console.log(`AUTH_PASSWORD_HASH=${hash}`)
  console.log(`AUTH_SESSION_SECRET=${secret}`)
  console.log('AUTH_SESSION_HOURS=12')
  console.log('\n' + '='.repeat(72))
  console.log('  Notes')
  console.log('='.repeat(72))
  console.log('  - Remove any plaintext AUTH_PASSWORD line if one is present.')
  console.log('  - AUTH_SESSION_SECRET is freshly generated above. Changing it')
  console.log('    signs everyone out; keep it stable between restarts.')
  console.log('  - Restart the server for the change to take effect.')
  console.log('  - Serving over plain HTTP on a LAN? Leave AUTH_COOKIE_SECURE unset.')
  console.log('    Behind HTTPS, set AUTH_COOKIE_SECURE=true.')
  console.log('')
}

main()
