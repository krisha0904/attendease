import base64
import io
import json
import os

import numpy as np
import requests
from PIL import Image

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
    resized = cv2.resize(face_crop, (64, 64), interpolation=cv2.INTER_AREA)
    hist = cv2.calcHist([resized], [0], None, [16], [0, 256])
    hist = cv2.normalize(hist, hist).flatten().astype(np.float32)
    return hist


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

