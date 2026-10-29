import { Router } from "express";
import { uploadTenantImage } from "../../controllers/tenant/upload.controller";
import { catchAsync } from "../../utils/catchAsync";
import { imageUpload } from "../../config/upload";

const router = Router();

router.post("/", imageUpload, catchAsync(uploadTenantImage));

export default router;
