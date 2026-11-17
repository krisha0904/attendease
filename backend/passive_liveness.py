import base64
import binascii
import threading
from pathlib import Path

import cv2
import numpy as np

from liveness_service import LivenessUnavailable

MODEL_DIR = Path(__file__).parent / "assets" / "face_models"
DETECTOR_PATH = MODEL_DIR / "face_detection_yunet_2023mar.onnx"
MODEL_PATHS = (
    (2.7, MODEL_DIR / "2.7_80x80_MiniFASNetV2.onnx"),
    (4.0, MODEL_DIR / "4_0_0_80x80_MiniFASNetV1SE.onnx"),
)
_model_lock = threading.Lock()
_inference_lock = threading.Lock()
_detector = None
_anti_spoof_models = None


def _load_models():
    global _detector, _anti_spoof_models
    if _detector is not None and _anti_spoof_models is not None:
        return _detector, _anti_spoof_models
    with _model_lock:
        if _detector is not None and _anti_spoof_models is not None:
            return _detector, _anti_spoof_models
        missing = [path.name for path in (DETECTOR_PATH, *(path for _, path in MODEL_PATHS)) if not path.is_file()]
        if missing:
            raise LivenessUnavailable(f"Local liveness model files are missing: {', '.join(missing)}.")
        try:
            detector = cv2.FaceDetectorYN_create(
                str(DETECTOR_PATH),
                "",
                (320, 320),
                0.9,
                0.3,
                5000,
            )
            anti_spoof_models = []
            for scale, path in MODEL_PATHS:
                net = cv2.dnn.readNetFromONNX(str(path))
                net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
                anti_spoof_models.append((scale, net))
        except cv2.error as exc:
            raise LivenessUnavailable("The local liveness models could not be loaded.") from exc
        _detector, _anti_spoof_models = detector, anti_spoof_models
        return _detector, _anti_spoof_models


def _decode_frame(frame: str) -> np.ndarray | None:
    encoded = frame.split(",", 1)[-1]
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        return None
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.ndim != 3 or min(image.shape[:2]) < 160:
        return None
    return image


def _expanded_face_crop(image: np.ndarray, face: np.ndarray, scale: float) -> np.ndarray | None:
    height, width = image.shape[:2]
    x, y, face_width, face_height = face[:4]
    if face_width <= 0 or face_height <= 0:
        return None
    scale = min((height - 1) / face_height, (width - 1) / face_width, scale)
    center_x = x + face_width / 2
    center_y = y + face_height / 2
    left = max(0, int(center_x - face_width * scale / 2))
    top = max(0, int(center_y - face_height * scale / 2))
    right = min(width, int(center_x + face_width * scale / 2) + 1)
    bottom = min(height, int(center_y + face_height * scale / 2) + 1)
    crop = image[top:bottom, left:right]
    if crop.size == 0:
        return None
    return cv2.resize(crop, (80, 80)).astype(np.float32).transpose(2, 0, 1)[None, ...]


def _probabilities(logits: np.ndarray) -> np.ndarray:
    scores = np.asarray(logits, dtype=np.float64).reshape(-1)
    if scores.shape != (3,) or not np.isfinite(scores).all():
        raise LivenessUnavailable("The local liveness model returned invalid scores.")
    scores -= np.max(scores)
    probabilities = np.exp(scores)
    total = float(np.sum(probabilities))
    if not np.isfinite(total) or total <= 0:
        raise LivenessUnavailable("The local liveness model returned invalid scores.")
    return probabilities / total


def verify(instruction: str, frames: list[str]) -> dict[str, bool | float]:
    if not 4 <= len(frames) <= 12:
        return {"live": False, "score": 0.0}
    detector, anti_spoof_models = _load_models()
    real_scores = []

    for frame in frames:
        image = _decode_frame(frame)
        if image is None:
            return {"live": False, "score": 0.0}
        height, width = image.shape[:2]
        with _inference_lock:
            detector.setInputSize((width, height))
            _, faces = detector.detect(image)
            if faces is None or len(faces) != 1 or float(faces[0][-1]) < 0.9:
                return {"live": False, "score": 0.0}

            model_scores = []
            for scale, net in anti_spoof_models:
                input_tensor = _expanded_face_crop(image, faces[0], scale)
                if input_tensor is None:
                    return {"live": False, "score": 0.0}
                net.setInput(input_tensor)
                model_scores.append(_probabilities(net.forward())[1])

        real_scores.append(float(np.mean(model_scores)))

    score = float(np.mean(real_scores))
    consistent_live_frames = sum(frame_score >= 0.5 for frame_score in real_scores)
    live = score >= 0.8 and consistent_live_frames >= int(np.ceil(len(real_scores) * 0.75))
    return {"live": live, "score": score}
