import base64
import os
import threading
from pathlib import Path

import cv2
import numpy as np
from cryptography.fernet import Fernet, InvalidToken

MODEL_DIR = Path(__file__).parent / "assets" / "face_models"
DETECTOR_PATH = MODEL_DIR / "face_detection_yunet_2023mar.onnx"
RECOGNIZER_PATH = MODEL_DIR / "face_recognition_sface_2021dec.onnx"
_model_lock = threading.Lock()
_inference_lock = threading.Lock()
_detector = None
_recognizer = None


class FaceCaptureError(ValueError):
    pass


class FaceServiceUnavailable(RuntimeError):
    pass


def _load_models():
    global _detector, _recognizer
    if _detector is not None and _recognizer is not None:
        return _detector, _recognizer
    with _model_lock:
        if _detector is not None and _recognizer is not None:
            return _detector, _recognizer
        if not DETECTOR_PATH.is_file() or not RECOGNIZER_PATH.is_file():
            raise FaceServiceUnavailable("Face recognition model files are missing.")
        try:
            detector = cv2.FaceDetectorYN_create(
                str(DETECTOR_PATH),
                "",
                (320, 320),
                0.9,
                0.3,
                5000,
            )
            recognizer = cv2.FaceRecognizerSF_create(str(RECOGNIZER_PATH), "")
        except cv2.error as exc:
            raise FaceServiceUnavailable("The installed OpenCV build cannot load the face models.") from exc
        _detector, _recognizer = detector, recognizer
        return _detector, _recognizer


def _decode_image(image_data: str) -> np.ndarray:
    if not image_data:
        raise FaceCaptureError("A face image is required.")
    encoded = image_data.split(",", 1)[-1]
    if len(encoded) > 7_000_000:
        raise FaceCaptureError("The face image exceeds the 5 MB limit.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise FaceCaptureError("The face image is not valid base64.") from exc
    if len(raw) > 5 * 1024 * 1024:
        raise FaceCaptureError("The face image exceeds the 5 MB limit.")
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.ndim != 3:
        raise FaceCaptureError("The face image could not be decoded.")
    height, width = image.shape[:2]
    if width < 160 or height < 160:
        raise FaceCaptureError("The face image resolution is too low.")
    return image


def embedding_from_base64(image_data: str) -> np.ndarray:
    image = _decode_image(image_data)
    height, width = image.shape[:2]
    detector, recognizer = _load_models()
    with _inference_lock:
        detector.setInputSize((width, height))
        _, faces = detector.detect(image)
    if faces is None or len(faces) == 0:
        raise FaceCaptureError("No face was detected. Improve lighting and try again.")
    if len(faces) != 1:
        raise FaceCaptureError("Exactly one face must be visible.")

    face = faces[0]
    x, y, face_width, face_height = face[:4]
    if min(face_width, face_height) < 100:
        raise FaceCaptureError("Move closer so your face is clearly visible.")
    if float(face[-1]) < 0.9:
        raise FaceCaptureError("Face visibility is insufficient. Center your face and try again.")

    left = max(0, int(x))
    top = max(0, int(y))
    right = min(width, int(x + face_width))
    bottom = min(height, int(y + face_height))
    face_image = image[top:bottom, left:right]
    if face_image.size == 0:
        raise FaceCaptureError("Face framing is invalid. Center your face and try again.")
    gray_face = cv2.cvtColor(face_image, cv2.COLOR_BGR2GRAY)
    if float(np.mean(gray_face)) < 35 or float(np.mean(gray_face)) > 220:
        raise FaceCaptureError("Face lighting is too dark or too bright.")
    if float(cv2.Laplacian(gray_face, cv2.CV_64F).var()) < 25:
        raise FaceCaptureError("The image is blurry. Hold the camera steady and try again.")

    with _inference_lock:
        aligned = recognizer.alignCrop(image, face)
        feature = np.asarray(recognizer.feature(aligned), dtype=np.float32).reshape(-1)
    norm = float(np.linalg.norm(feature))
    if not np.isfinite(norm) or norm == 0:
        raise FaceServiceUnavailable("The face model returned an invalid embedding.")
    return feature / norm


def _fernet() -> Fernet:
    key = os.getenv("BIOMETRIC_ENCRYPTION_KEY", "uY_R1W1qQ43u-Xh4r-yNf4r1mZ0lVfA_R9FvV_D7m-k=")
    if not key:
        key = "uY_R1W1qQ43u-Xh4r-yNf4r1mZ0lVfA_R9FvV_D7m-k="
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise FaceServiceUnavailable("BIOMETRIC_ENCRYPTION_KEY is invalid.") from exc


def encrypt_embedding(embedding: np.ndarray) -> str:
    vector = np.asarray(embedding, dtype=np.float32)
    if vector.shape != (128,) or not np.isfinite(vector).all():
        raise FaceServiceUnavailable("The face embedding has an unexpected format.")
    return _fernet().encrypt(vector.tobytes()).decode("ascii")


def decrypt_embedding(encrypted_embedding: str) -> np.ndarray:
    try:
        vector = np.frombuffer(_fernet().decrypt(encrypted_embedding.encode("ascii")), dtype=np.float32)
    except (InvalidToken, ValueError, UnicodeEncodeError) as exc:
        raise FaceServiceUnavailable("The stored biometric template cannot be decrypted.") from exc
    if vector.shape != (128,) or not np.isfinite(vector).all():
        raise FaceServiceUnavailable("The stored biometric template is invalid.")
    return vector


def compare_embeddings(
    stored: np.ndarray,
    current: np.ndarray,
    threshold: float | None = None,
) -> tuple[bool, float]:
    stored_vector = np.asarray(stored, dtype=np.float32)
    current_vector = np.asarray(current, dtype=np.float32)
    if stored_vector.shape != (128,) or current_vector.shape != (128,):
        return False, 0.0
    score = float(np.dot(stored_vector, current_vector))
    if threshold is None:
        try:
            threshold = float(os.getenv("FACE_SIMILARITY_THRESHOLD", "0.363"))
        except ValueError as exc:
            raise FaceServiceUnavailable("FACE_SIMILARITY_THRESHOLD must be a number.") from exc
    if not -1.0 <= threshold <= 1.0:
        raise FaceServiceUnavailable("FACE_SIMILARITY_THRESHOLD must be between -1 and 1.")
    return bool(np.isfinite(score) and score >= threshold), score
