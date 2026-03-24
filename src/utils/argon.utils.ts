import argon2 from "argon2";
import dotenv from "dotenv";
dotenv.config();

/**
 * Argon2id parameters (OWASP 2024 recommendations):
 *
 * memoryCost:  65536 KiB (64 MB) — memory-hard, resists GPU/ASIC attacks
 * timeCost:    3               — number of iterations (passes)
 * parallelism: 4              — threads; tune to your server's CPU cores
 * hashLength:  32              — 256-bit output, sufficient for password hashing
 *
 * Time complexity:  O(timeCost × memoryCost × hashLength)
 * Space complexity: O(memoryCost) — dominant cost, fixed per hash operation
 */
const ARGON2_OPTIONS: argon2.Options & { raw: false } = {
  type: argon2.argon2id,
  memoryCost:  parseInt(process.env.ARGON2_MEMORY_COST  ?? "65536", 10),
  timeCost:    parseInt(process.env.ARGON2_TIME_COST    ?? "3",     10),
  parallelism: parseInt(process.env.ARGON2_PARALLELISM  ?? "4",     10),
  hashLength:  parseInt(process.env.ARGON2_HASH_LENGTH  ?? "32",    10),
  raw: false,
};

class Argon {
  /**
   * Hashes a password using Argon2id.
   * The returned string is self-contained: it encodes the salt, params, and hash.
   *
   * @param password - Plaintext password
   * @returns Argon2 encoded hash string
   */
  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /**
   * Verifies a password against a stored Argon2 hash.
   * Uses constant-time comparison internally — safe against timing attacks.
   *
   * @param password   - Plaintext password to verify
   * @param storedHash - Argon2 encoded hash from hashPassword()
   * @returns true if the password matches
   */
  static async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<boolean> {
    return argon2.verify(storedHash, password);
  }

  /**
   * Checks whether a stored hash needs to be rehashed
   * (e.g. after upgrading memoryCost / timeCost in config).
   *
   * Usage: after a successful login, call this and re-hash if true.
   *
   * @param storedHash - Existing Argon2 hash
   * @returns true if the hash was made with different parameters
   */
  static needsRehash(storedHash: string): boolean {
    return argon2.needsRehash(storedHash, ARGON2_OPTIONS);
  }
}

export default Argon;