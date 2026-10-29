import { Router } from "express";
import { uploadImage } from "../controllers/upload.controller";
import { authenticate, authorize } from "../middlewares/auth";
import { catchAsync } from "../utils/catchAsync";
import { imageUpload } from "../config/upload";

const router = Router();

router.use(authenticate, authorize("super_admin"));

router.post("/", imageUpload, catchAsync(uploadImage));

export default router;
