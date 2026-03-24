import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

class CryptoUtils {
  static readonly #algorithm: string = process.env.CRYPTO_ALGORITHM ?? "sha512";
  static readonly #keyLength: number = parseInt(
    process.env.CRYPTO_KEY_LENGTH ?? "64",
    10,
  );
  static readonly #saltSize: number = parseInt(
    process.env.CRYPTO_SALT_SIZE ?? "32",
    10,
  );
  static readonly #iterations: number = parseInt(
    process.env.CRYPTO_SALT_ROUNDS ?? "10000",
    10,
  );

  static hashPassword(password: string): string {
    const salt = crypto.randomBytes(this.#saltSize).toString("hex");
    const hash = crypto
      .pbkdf2Sync(
        password,
        salt,
        this.#iterations,
        this.#keyLength,
        this.#algorithm,
      )
      .toString("hex");
    return `${salt}:${hash}`;
  }

  static verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(":");
    const newHash = crypto
      .pbkdf2Sync(
        password,
        salt,
        this.#iterations,
        this.#keyLength,
        this.#algorithm,
      )
      .toString("hex");
    return hash === newHash;
  }
}

export default CryptoUtils;
