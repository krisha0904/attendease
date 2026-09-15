import 'dart:convert';
import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'dashboard_screen.dart';
import '../services/api_service.dart';

class FaceRegistrationScreen extends StatefulWidget {
  final String phone;
  const FaceRegistrationScreen({super.key, required this.phone});

  @override
  State<FaceRegistrationScreen> createState() => _FaceRegistrationScreenState();
}

class _FaceRegistrationScreenState extends State<FaceRegistrationScreen> {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isCameraReady = false;
  bool _isProcessing = false;
  
  final _facultyIdController = TextEditingController();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  String _selectedRole = "teacher";
  int _departmentId = 1;

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

  Future<void> _submitRegistration() async {
    if (_facultyIdController.text.isEmpty || _nameController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please fill all user info details")),
      );
      return;
    }

    if (_controller == null || !_controller!.value.isInitialized) return;

    setState(() => _isProcessing = true);

    try {
      // Capture setup photo for profile embedding
      XFile image = await _controller!.takePicture();
      final bytes = await File(image.path).readAsBytes();
      String base64Image = base64Encode(bytes);

      bool success = await ApiService().register(
        facultyId: _facultyIdController.text,
        name: _nameController.text,
        email: _emailController.text,
        phone: widget.phone,
        role: _selectedRole,
        departmentId: _departmentId,
        faceImageBase64: base64Image,
      );

      if (success) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Faculty Face Profile Registered successfully!")),
          );
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => DashboardScreen()),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Registration failed. Please check inputs.")),
          );
        }
      }
    } catch (e) {
      print("Error during registration: $e");
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
      appBar: AppBar(title: const Text("Face Profile Setup")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            if (_isCameraReady)
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: double.infinity,
                  height: 220,
                  child: CameraPreview(_controller!),
                ),
              )
            else
              const SizedBox(
                height: 220,
                child: Center(child: CircularProgressIndicator()),
              ),
            const SizedBox(height: 20),
            TextField(
              controller: _facultyIdController,
              decoration: const InputDecoration(labelText: "Faculty/Staff ID", border: OutlineInputBorder()),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: "Full Name", border: OutlineInputBorder()),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(labelText: "Email Address", border: OutlineInputBorder()),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: _selectedRole,
              decoration: const InputDecoration(labelText: "Role", border: OutlineInputBorder()),
              items: ['teacher', 'staff', 'hod']
                  .map((role) => DropdownMenuItem(value: role, child: Text(role.toUpperCase())))
                  .toList(),
              onChanged: (val) => setState(() => _selectedRole = val!),
            ),
            const SizedBox(height: 25),
            ElevatedButton(
              onPressed: _isProcessing ? null : _submitRegistration,
              style: ElevatedButton.styleFrom(
                minimumSize: const Size(double.infinity, 55),
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _isProcessing 
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text("REGISTER FACE PROFILE", style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }
}
