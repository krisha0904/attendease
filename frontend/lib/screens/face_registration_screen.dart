import 'dart:convert';
import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'dashboard_screen.dart';
import '../services/api_service.dart';

class FaceRegistrationScreen extends StatefulWidget {
  final String phone;
  final int userId;
  final String userName;

  const FaceRegistrationScreen({
    super.key, 
    required this.phone, 
    required this.userId, 
    required this.userName
  });

  @override
  State<FaceRegistrationScreen> createState() => _FaceRegistrationScreenState();
}

class _FaceRegistrationScreenState extends State<FaceRegistrationScreen> {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isCameraReady = false;
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
  }

  Future<void> _initializeCamera() async {
    _cameras = await availableCameras();
    if (_cameras != null && _cameras!.isNotEmpty) {
      CameraDescription? frontCamera;
      for (var camera in _cameras!) {
        if (camera.lensDirection == CameraLensDirection.front) {
          frontCamera = camera;
          break;
        }
      }
      frontCamera ??= _cameras![0];
      _controller = CameraController(frontCamera, ResolutionPreset.medium);
      await _controller!.initialize();
      if (!mounted) return;
      setState(() {
        _isCameraReady = true;
      });
    }
  }

  Future<void> _submitFaceRegistration() async {
    if (_controller == null || !_controller!.value.isInitialized || _isProcessing) return;

    setState(() => _isProcessing = true);

    try {
      // Capture live setup photo for mapping to pre-registered profile
      XFile image = await _controller!.takePicture();
      final bytes = await File(image.path).readAsBytes();
      String base64Image = base64Encode(bytes);

      bool success = await ApiService().registerFaceOnly(
        userId: widget.userId,
        faceImageBase64: base64Image,
      );

      if (success) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("Face Biometric Profile paired successfully!"),
              backgroundColor: Colors.green,
            ),
          );
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => const DashboardScreen()),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("Face registration failed. Please try again in bright lighting."),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      print("Error during face registration: $e");
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text("First-Time Biometric Setup", style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const SizedBox(height: 10),
            Text(
              "Welcome, ${widget.userName}!",
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.blue),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              "Your account is verified. Please look at the camera to lock in your official biometric signature.",
              style: TextStyle(fontSize: 14, color: Colors.grey[600]),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 30),
            Expanded(
              child: Center(
                child: _isCameraReady
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(150),
                        child: Container(
                          width: 280,
                          height: 280,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.blue, width: 3),
                          ),
                          child: AspectRatio(
                            aspectRatio: 1,
                            child: CameraPreview(_controller!),
                          ),
                        ),
                      )
                    : const CircularProgressIndicator(),
              ),
            ),
            const SizedBox(height: 40),
            ElevatedButton.icon(
              onPressed: _isProcessing ? null : _submitFaceRegistration,
              icon: const Icon(Icons.face, size: 24),
              label: _isProcessing 
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text("CAPTURE & INITIALIZE FACE ID", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              style: ElevatedButton.styleFrom(
                minimumSize: const Size(double.infinity, 58),
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                elevation: 2,
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
