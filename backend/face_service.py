import base64
import io

import numpy as np
from PIL import Image

try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except Exception as exc:  # pragma: no cover - optional dependency in some environments
    face_recognition = None
    FACE_RECOGNITION_AVAILABLE = False
    print(f"Warning: face_recognition not available: {exc}")

try:
    import cv2
    cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    face_cascade = cv2.CascadeClassifier(cascade_path)
    OPENCV_AVAILABLE = True
except Exception as exc:  # pragma: no cover - optional dependency in some environments
    cv2 = None
    face_cascade = None
    OPENCV_AVAILABLE = False
    print(f"Warning: OpenCV face detection not fully available: {exc}")


def _decode_image_from_base64(base64_str: str):
    img_data = base64.b64decode(base64_str.split(',')[-1])
    return Image.open(io.BytesIO(img_data)).convert("RGB")


def _opencv_face_embedding(image: Image.Image):
    if cv2 is None or face_cascade is None:
        return None

    img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)

    if len(faces) == 0:
        return None

    x, y, w, h = faces[0]
    face_crop = gray[y:y + h, x:x + w]
    resized = cv2.resize(face_crop, (32, 32), interpolation=cv2.INTER_AREA)
    normalized = resized.astype(np.float32) / 255.0
    vector = normalized.reshape(-1)
    vector = vector / (np.linalg.norm(vector) + 1e-8)
    return vector.astype(np.float32)


def get_face_embedding(base64_str):
    """Return a real face embedding when a library is available, otherwise None."""
    if not base64_str:
        return None

    try:
        img = _decode_image_from_base64(base64_str)
    except Exception as exc:
        print(f"Error decoding face image: {exc}")
        return None

    if FACE_RECOGNITION_AVAILABLE and face_recognition is not None:
        try:
            image_array = np.array(img)
            face_locations = face_recognition.face_locations(image_array)
            if not face_locations:
                return None
            encodings = face_recognition.face_encodings(image_array, known_face_locations=face_locations)
            if not encodings:
                return None
            return np.asarray(encodings[0], dtype=np.float32)
        except Exception as exc:
            print(f"face_recognition encoding failed: {exc}")

    if OPENCV_AVAILABLE:
        try:
            embedding = _opencv_face_embedding(img)
            if embedding is not None:
                return embedding
        except Exception as exc:
            print(f"OpenCV embedding failed: {exc}")

    return None


def verify_faces(stored_embedding, current_embedding, threshold=0.6):
    """Compare two face embeddings using Euclidean distance."""
    try:
        if stored_embedding is None or current_embedding is None:
            return False

        stored = np.asarray(stored_embedding, dtype=np.float32)
        current = np.asarray(current_embedding, dtype=np.float32)

        if stored.shape != current.shape:
            return False

        distance = np.linalg.norm(stored - current)
        return float(distance) <= threshold
    except Exception as exc:
        print(f"Error comparing face embeddings: {exc}")
        return False

