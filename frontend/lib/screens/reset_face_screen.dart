import 'dart:convert';
import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';
import 'dashboard_screen.dart';

class ResetFaceScreen extends StatefulWidget {
  final int userId;

  const ResetFaceScreen({super.key, this.userId = 1});

  @override
  State<ResetFaceScreen> createState() => _ResetFaceScreenState();
}

class _ResetFaceScreenState extends State<ResetFaceScreen> {
  // Stages: 0 = Challenges Screen, 1 = HR OTP Entry, 2 = Camera Enrollment
  int _stage = 0;

  final _hrPhoneController = TextEditingController(text: "9876543210");
  final _hrOtpController = TextEditingController();
  final _apiService = ApiService();

  bool _isLoading = false;

  // Camera State
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isCameraReady = false;
  bool _isProcessing = false;

  @override
  void dispose() {
    _controller?.dispose();
    _hrPhoneController.dispose();
    _hrOtpController.dispose();
    super.dispose();
  }

  void _sendHrOtp() async {
    setState(() => _isLoading = true);
    try {
      final res = await _apiService.sendHrOtp(
        widget.userId,
        _hrPhoneController.text,
        method: "email",
      );

      setState(() => _isLoading = false);

      if (mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.check_circle, color: Colors.green),
                SizedBox(width: 8),
                Text("OTP Sent to HR"),
              ],
            ),
            content: Text(
              "Security OTP dispatched through the HR verification flow.\n\n${res['otp'] != null ? '(Debug HR OTP: ${res['otp']})\n\n' : ''}Please contact HR department to obtain the code and proceed with Reset Face ID.",
            ),
            actions: [
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(context);
                  setState(() {
                    _stage = 1; // Proceed to HR OTP input
                  });
                },
                child: const Text("ENTER HR OTP"),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Failed to send HR OTP: $e"),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _verifyHrOtp() async {
    if (_hrOtpController.text.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Please enter 6-digit HR OTP"),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      bool valid = await _apiService.verifyHrOtp(
        widget.userId,
        _hrOtpController.text,
      );

      setState(() => _isLoading = false);

      if (valid) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("HR Security Verification Passed! Initializing Camera..."),
              backgroundColor: Colors.green,
            ),
          );
          setState(() {
            _stage = 2; // Proceed to camera
          });
          _initializeCamera();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("Invalid or expired HR OTP. Please try again."),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Error verifying HR OTP"),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _initializeCamera() async {
    try {
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
    } catch (e) {
      print("Camera initialization error: $e");
    }
  }

  Future<void> _captureAndResetFace() async {
    if (_controller == null || !_controller!.value.isInitialized || _isProcessing) return;

    setState(() => _isProcessing = true);

    try {
      XFile image = await _controller!.takePicture();
      final bytes = await File(image.path).readAsBytes();
      String base64Image = base64Encode(bytes);

      bool success = await _apiService.registerFaceOnly(
        userId: widget.userId,
        faceImageBase64: base64Image,
      );

      if (success) {
        if (mounted) {
          showDialog(
            context: context,
            barrierDismissible: false,
            builder: (context) => AlertDialog(
              title: const Column(
                children: [
                  Icon(Icons.verified_user, color: Colors.green, size: 48),
                  SizedBox(height: 10),
                  Text("Face ID Reset Complete!"),
                ],
              ),
              content: const Text(
                "Your biometric face profile has been successfully reset and updated. You may now use your updated Face ID for daily attendance punch actions.",
                textAlign: TextAlign.center,
              ),
              actions: [
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context); // close dialog
                    Navigator.pushReplacement(
                      context,
                      MaterialPageRoute(
                        builder: (context) => const DashboardScreen(),
                      ),
                    );
                  },
                  child: const Text("RETURN TO DASHBOARD"),
                ),
              ],
            ),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("Face capture failed. Ensure your face is centered."),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      print("Error resetting face: $e");
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: const Text("Reset Face ID", style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_stage == 0) _buildChallengesStage(),
            if (_stage == 1) _buildHrOtpStage(),
            if (_stage == 2) _buildCameraStage(),
          ],
        ),
      ),
    );
  }

  Widget _buildChallengesStage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          "Challenges & Identity Verification",
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 6),
        Text(
          "Select a verification challenge below to request authorization for resetting your biometric face profile:",
          style: TextStyle(color: Colors.grey[700]),
        ),
        const SizedBox(height: 20),

        Card(
          elevation: 2,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.admin_panel_settings, color: Colors.blue),
                    SizedBox(width: 10),
                    Text(
                      "Verify with HR Department",
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  "Sends an authorization OTP directly to the HR Department. Obtain code from HR to proceed.",
                  style: TextStyle(color: Colors.grey[600], fontSize: 13),
                ),
                const SizedBox(height: 15),
                const Text("HR Contact Mobile Number:", style: TextStyle(fontWeight: FontWeight.w500)),
                const SizedBox(height: 6),
                TextField(
                  controller: _hrPhoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    prefixText: "+91 ",
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
                const SizedBox(height: 15),
                const Text("Delivery Channel:", style: TextStyle(fontWeight: FontWeight.w500)),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blue.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.blue.shade200),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.email_outlined, color: Colors.blue),
                      SizedBox(width: 10),
                      Text("Email-based verification only"),
                    ],
                  ),
                ),
                const SizedBox(height: 15),
                ElevatedButton.icon(
                  onPressed: _isLoading ? null : _sendHrOtp,
                  icon: const Icon(Icons.send_rounded),
                  label: _isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text("SEND OTP TO HR", style: TextStyle(fontWeight: FontWeight.bold)),
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(double.infinity, 48),
                    backgroundColor: Colors.blue,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHrOtpStage() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.lock_clock, color: Colors.blue),
                SizedBox(width: 10),
                Text(
                  "Enter HR Security OTP",
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              "Please enter the 6-digit authorization OTP code provided by your HR Department:",
              style: TextStyle(color: Colors.grey[700]),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _hrOtpController,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.bold),
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                hintText: "000000",
                counterText: "",
              ),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _isLoading ? null : _verifyHrOtp,
              style: ElevatedButton.styleFrom(
                minimumSize: const Size(double.infinity, 50),
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: _isLoading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text("VERIFY HR OTP", style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            TextButton(
              onPressed: () => setState(() => _stage = 0),
              child: const Text("Back to Verification Methods"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCameraStage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const Text(
          "Biometric Re-Enrollment",
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 6),
        Text(
          "Look directly into the camera preview to lock in your updated face profile.",
          style: TextStyle(color: Colors.grey[600]),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 25),
        Center(
          child: _isCameraReady
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(150),
                  child: Container(
                    width: 260,
                    height: 260,
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
        const SizedBox(height: 30),
        ElevatedButton.icon(
          onPressed: _isProcessing ? null : _captureAndResetFace,
          icon: const Icon(Icons.camera_alt),
          label: _isProcessing
              ? const CircularProgressIndicator(color: Colors.white)
              : const Text("CAPTURE & RESET FACE ID", style: TextStyle(fontWeight: FontWeight.bold)),
          style: ElevatedButton.styleFrom(
            minimumSize: const Size(double.infinity, 52),
            backgroundColor: Colors.blue,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ],
    );
  }
}
