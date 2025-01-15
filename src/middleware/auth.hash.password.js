import crypto from "crypto";

class authHashPassword {

    static generateSalt() {
        return crypto.randomBytes(16).toString('hex');
    }

    // Function to hash a password with a given salt
    static hashPassword(password, salt) {
        const hash = crypto.createHmac('sha256', salt);
        hash.update(password);
        const hashedPassword = hash.digest('hex');
        return hashedPassword;
    }

    static checkPassword(inputPassword, storedHashedPassword, salt) {
        const hashedInputPassword = authHashPassword.hashPassword(inputPassword, salt);
        return hashedInputPassword === storedHashedPassword;
    }
}

export default authHashPassword;