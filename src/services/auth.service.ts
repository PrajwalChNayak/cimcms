import ConsumerRepository from '@/repositories/consumer.repository';
import Argon from '@/utils/argon.utils';
import jwt from 'jsonwebtoken';

class AuthService {
  static #_generateAccessToken(subject: { email: string; userId: number }): string {
    return jwt.sign(
      {
        email: subject.email,
        userId: subject.userId,
      },
      process.env.JWT_SECRET_KEY as string,
      { expiresIn: '30d' },
    );
  }

  static async register({
    name,
    email,
    password,
    mobileNumber,
  }: {
    name: string;
    email: string;
    password: string;
    mobileNumber?: string;
  }): Promise<{
    userId: number;
    name: string;
    email: string;
    mobileNumber?: string;
  }> {
    const hashedPassword = await Argon.hashPassword(password);
    const {
      id,
      name: userName,
      email: userEmail,
      mobileNumber: userMobile,
    } = await ConsumerRepository.create({
      name,
      email,
      password: hashedPassword,
      mobileNumber,
    });
    return {
      userId: id,
      name: userName,
      email: userEmail,
      mobileNumber: userMobile ?? undefined,
    };
  }

  static async login({ email, password }: { email: string; password: string }): Promise<{
    authToken: string;
    id: string;
  }> {
    const user = await ConsumerRepository.findOne({
      email,
    });

    if (!user) {
      throw new Error('User not found');
    }

    const isPasswordValid = await Argon.verifyPassword(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }
    await ConsumerRepository.updateById(user.id, { lastLogin: new Date() });
    const authToken = AuthService.#_generateAccessToken({
      email: user.email,
      userId: user.id,
    });

    return { authToken, id: user.id };
  }

  static async refreshToken(subject: { email: string; userId: number }): Promise<{
    authToken: string;
  }> {
    const authToken = AuthService.#_generateAccessToken(subject);
    return { authToken };
  }

  static async me(userId?: number): Promise<{
    userId: number;
    name: string;
    email: string;
    mobileNumber?: string;
  } | null> {
    if (!userId) {
      return null;
    }
    const user = await ConsumerRepository.findById(userId);
    if (!user) {
      return null;
    }
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      mobileNumber: user.mobileNumber ?? undefined,
    };
  }
}

export default AuthService;
