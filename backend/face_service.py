import base64
import io
import json
import os

import numpy as np
import requests
from PIL import Image

try:
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
    INSIGHTFACE_APP = None
except Exception as exc:  # pragma: no cover - optional dependency in some environments
    FaceAnalysis = None
    INSIGHTFACE_AVAILABLE = False
    INSIGHTFACE_APP = None
    print(f"Warning: insightface not available: {exc}")

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


def _get_insightface_app():
    global INSIGHTFACE_APP
    if not INSIGHTFACE_AVAILABLE or FaceAnalysis is None:
        return None
    if INSIGHTFACE_APP is not None:
        return INSIGHTFACE_APP
    try:
        app = FaceAnalysis(providers=['CPUExecutionProvider'])
        app.prepare(ctx_id=0, det_size=(640, 640))
        INSIGHTFACE_APP = app
        return app
    except Exception as exc:  # pragma: no cover - optional dependency in some environments
        print(f"InsightFace model initialization failed: {exc}")
        INSIGHTFACE_AVAILABLE = False
        return None

AZURE_FACE_ENDPOINT = os.getenv("AZURE_FACE_ENDPOINT")
AZURE_FACE_KEY = os.getenv("AZURE_FACE_KEY")


def _decode_image_from_base64(base64_str: str):
    img_data = base64.b64decode(base64_str.split(',')[-1])
    return Image.open(io.BytesIO(img_data)).convert("RGB")


def _azure_face_id(base64_str: str):
    if not AZURE_FACE_ENDPOINT or not AZURE_FACE_KEY:
        return None

    try:
        image_bytes = base64.b64decode(base64_str.split(',')[-1])
        endpoint = AZURE_FACE_ENDPOINT.rstrip('/')
        url = f"{endpoint}/face/v1.0/detect?returnFaceId=true&returnFaceLandmarks=false&returnFaceAttributes=emotion"
        headers = {
            "Ocp-Apim-Subscription-Key": AZURE_FACE_KEY,
            "Content-Type": "application/octet-stream",
        }
        response = requests.post(url, headers=headers, data=image_bytes, timeout=20)
        response.raise_for_status()
        data = response.json()
        if not data:
            return None
        face_id = data[0].get('faceId')
        return face_id
    except Exception as exc:
        print(f"Azure Face API detection failed: {exc}")
        return None


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


def _insightface_face_embedding(image: Image.Image):
    model = _get_insightface_app()
    if model is None:
        return None
    try:
        face = model.get(np.asarray(image))
        if not face:
            return None
        embedding = face[0].embedding.astype(np.float32)
        return embedding
    except Exception as exc:  # pragma: no cover - optional dependency in some environments
        print(f"InsightFace embedding failed: {exc}")
        return None


def get_face_embedding(base64_str):
    """Return a real face embedding or Azure face ID if cloud credentials are configured."""
    if not base64_str:
        return None

    azure_face_id = _azure_face_id(base64_str)
    if azure_face_id:
        return {"provider": "azure", "face_id": azure_face_id}

    try:
        img = _decode_image_from_base64(base64_str)
    except Exception as exc:
        print(f"Error decoding face image: {exc}")
        return None

    if INSIGHTFACE_AVAILABLE:
        try:
            embedding = _insightface_face_embedding(img)
            if embedding is not None:
                return embedding
        except Exception as exc:
            print(f"InsightFace encoding failed: {exc}")

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
    """Compare two face embeddings or Azure face IDs using the real provider when available."""
    try:
        if stored_embedding is None or current_embedding is None:
            return False

        if isinstance(stored_embedding, str):
            stored_embedding = json.loads(stored_embedding)
        if isinstance(current_embedding, str):
            current_embedding = json.loads(current_embedding)

        if isinstance(stored_embedding, dict) and stored_embedding.get('provider') == 'azure':
            face_id_1 = stored_embedding.get('face_id')
            face_id_2 = current_embedding.get('face_id') if isinstance(current_embedding, dict) else None
            if face_id_1 and face_id_2 and AZURE_FACE_ENDPOINT and AZURE_FACE_KEY:
                url = f"{AZURE_FACE_ENDPOINT.rstrip('/')}/face/v1.0/verify"
                payload = {"faceId1": face_id_1, "faceId2": face_id_2}
                headers = {"Ocp-Apim-Subscription-Key": AZURE_FACE_KEY, "Content-Type": "application/json"}
                response = requests.post(url, headers=headers, json=payload, timeout=20)
                if response.status_code == 200:
                    data = response.json()
                    return bool(data.get('isIdentical')) and float(data.get('confidence', 0)) >= 0.5
                raise ValueError(response.text)

        if isinstance(current_embedding, dict) and current_embedding.get('provider') == 'azure':
            face_id_2 = current_embedding.get('face_id')
            if isinstance(stored_embedding, dict) and stored_embedding.get('provider') == 'azure':
                face_id_1 = stored_embedding.get('face_id')
                if face_id_1 and face_id_2 and AZURE_FACE_ENDPOINT and AZURE_FACE_KEY:
                    url = f"{AZURE_FACE_ENDPOINT.rstrip('/')}/face/v1.0/verify"
                    payload = {"faceId1": face_id_1, "faceId2": face_id_2}
                    headers = {"Ocp-Apim-Subscription-Key": AZURE_FACE_KEY, "Content-Type": "application/json"}
                    response = requests.post(url, headers=headers, json=payload, timeout=20)
                    if response.status_code == 200:
                        data = response.json()
                        return bool(data.get('isIdentical')) and float(data.get('confidence', 0)) >= 0.5

        stored = np.asarray(stored_embedding, dtype=np.float32)
        current = np.asarray(current_embedding, dtype=np.float32)

        if stored.shape != current.shape:
            return False

        distance = np.linalg.norm(stored - current)
        return float(distance) <= threshold
    except Exception as exc:
        print(f"Error comparing face embeddings: {exc}")
        return False

