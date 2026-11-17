# Face model assets

These ONNX files are the OpenCV Zoo YuNet face detector and SFace face recognizer. They are used only for server-side face detection and 1:1 embedding comparisons. OpenCV Zoo distributes the models under Apache-2.0; see the upstream [license](https://github.com/opencv/opencv_zoo/blob/main/LICENSE).

Model sources:

- [YuNet detector](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)
- [SFace recognizer](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface)

The images supplied for enrollment or verification are processed in memory and are not written to disk. Only encrypted face embeddings are stored.
