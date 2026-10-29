import { Router } from "express";
import rateLimit from "express-rate-limit";
import { changePassword, getMe, login, logout } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { catchAsync } from "../utils/catchAsync";
import { changePasswordSchema, loginSchema } from "../validators/auth";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 429, message: "Too many login attempts, please try again later" },
  },
});

router.post("/login", loginLimiter, validate(loginSchema), catchAsync(login));

router.use(authenticate);

router.get("/me", catchAsync(getMe));
router.put("/change-password", validate(changePasswordSchema), catchAsync(changePassword));
router.post("/logout", catchAsync(logout));

export default router;
