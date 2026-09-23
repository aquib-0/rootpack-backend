import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken
} from "../utils/tokens.js";

export async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required"
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email
      }
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already registered"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash
      }
    });

    return res.status(201).json({
      message: "Registration successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
};

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        email
      }
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const passwordValid = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordValid) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const accessToken = generateAccessToken(user);

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);

    await prisma.refreshToken.create({
      data: {
        tokenHash: refreshTokenHash,
        userId: user.id,
        expiresAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        )
      }
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      message: "Login successful",
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error"
    });
  }
};

export async function refresh(req, res) {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token missing"
      });
    }

    const tokenHash = hashToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: {
        tokenHash
      },
      include: {
        user: true
      }
    });

    if (!storedToken) {
      return res.status(401).json({
        message: "Invalid refresh token"
      });
    }

    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({
        where: {
          id: storedToken.id
        }
      });

      res.clearCookie("refreshToken");

      return res.status(401).json({
        message: "Refresh token expired"
      });
    }

    // Delete old refresh token
    await prisma.refreshToken.delete({
      where: {
        id: storedToken.id
      }
    });

    // Generate new tokens
    const accessToken = generateAccessToken(
      storedToken.user
    );

    const newRefreshToken = generateRefreshToken();

    const newRefreshTokenHash =
      hashToken(newRefreshToken);

    await prisma.refreshToken.create({
      data: {
        tokenHash: newRefreshTokenHash,
        userId: storedToken.user.id,
        expiresAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        )
      }
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // return res.json({
    //   accessToken
    // });
  return res.json({
    accessToken,
    user: {
        id: storedToken.user.id,
        name: storedToken.user.name,
        email: storedToken.user.email,
      },
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error"
    });
  }
};

export async function logout(req, res) {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);

      await prisma.refreshToken.deleteMany({
        where: {
          tokenHash
        }
      });
    }

    res.clearCookie("refreshToken");

    return res.json({
      message: "Logged out successfully"
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error"
    });
  }
}