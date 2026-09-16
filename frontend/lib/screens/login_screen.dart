import 'package:flutter/material.dart';
import 'dashboard_screen.dart';
import 'face_registration_screen.dart';
import '../services/api_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  final _apiService = ApiService();

  bool _isOtpSent = false;
  bool _isLoading = false;
  String _selectedMethod = "sms";
  
  // Flag to represent new user flow or existing user flow for the presentation
  bool _isNewUser = false;

  void _sendOtp() async {
    if (_phoneController.text.isEmpty || _phoneController.text.length < 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please enter a valid phone number")),
      );
      return;
    }
    setState(() {
      _isLoading = true;
    });

    try {
      // 1. Check if user exists or is a new user in the main backend database
      final checkResult = await _apiService.checkUserExists(_phoneController.text);
      
      if (checkResult["exists"] == false || checkResult["is_new"] == true) {
        _isNewUser = true;
      }

      // 2. Trigger custom backend API to send real OTP via Twilio (SMS or WhatsApp)
      final otpResult = await _apiService.sendOtp(_phoneController.text, method: _selectedMethod);
      
      setState(() {
        _isLoading = false;
        _isOtpSent = true;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("OTP dispatched to your phone via ${_selectedMethod.toUpperCase()}!"),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Error requesting OTP transmission: $e")),
      );
    }
  }

  void _verifyOtp() async {
    if (_otpController.text.isEmpty || _otpController.text.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please enter the 6-digit OTP received on your phone")),
      );
      return;
    }
    
    setState(() => _isLoading = true);

    try {
      final result = await _apiService.verifyOtp(_phoneController.text, _otpController.text);
      setState(() => _isLoading = false);
      
      if (result["success"] == true || result.containsKey("user_id")) {
        int userId = result["user_id"];
        bool needsFaceSetup = result["needs_face_setup"] ?? false;
        String userName = result["name"] ?? "Faculty Member";
        
        if (mounted) {
          if (needsFaceSetup) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text("First-time login detected! Opening Face Registration Setup."),
                backgroundColor: Colors.orange,
              ),
            );
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(
                builder: (context) => FaceRegistrationScreen(
                  phone: _phoneController.text,
                  userId: userId,
                  userName: userName,
                ),
              ),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text("Authentication Verified Successfully! Opening Dashboard Screen."),
                backgroundColor: Colors.green,
              ),
            );
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (context) => const DashboardScreen()),
            );
          }
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result["message"] ?? "Incorrect OTP code entered. Please check and try again."),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Error performing verification. Please try again."),
          backgroundColor: Colors.red,
        ),
      );
    }
  }


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(25.0),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(height: 50),
                const Text(
                  "Welcome to Smart Attendance",
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.blue),
                ),
                const SizedBox(height: 8),
                Text(
                  "Faculty & Staff Portal",
                  style: TextStyle(fontSize: 16, color: Colors.grey[600]),
                ),
                const SizedBox(height: 40),
                
                // Interactive flow control banner for presentation versatility
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.amber.shade300),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.slideshow, color: Colors.amber),
                          SizedBox(width: 8),
                          Text("Presentation Mode:", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        ],
                      ),
                      Row(
                        children: [
                          const Text("Force New User Setup", style: TextStyle(fontSize: 12)),
                          Checkbox(
                            value: _isNewUser,
                            activeColor: Colors.orange,
                            onChanged: (bool? val) {
                              setState(() {
                                _isNewUser = val ?? false;
                              });
                            },
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 25),

                if (!_isOtpSent) ...[
                  TextField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: "Phone Number",
                      prefixText: "+91 ",
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.phone),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text("Receive OTP via:", style: TextStyle(fontWeight: FontWeight.bold)),
                  Row(
                    children: [
                      Expanded(
                        child: RadioListTile<String>(
                          title: const Text("SMS Message"),
                          value: "sms",
                          groupValue: _selectedMethod,
                          onChanged: (value) => setState(() => _selectedMethod = value!),
                        ),
                      ),
                      Expanded(
                        child: RadioListTile<String>(
                          title: const Text("WhatsApp Message"),
                          value: "whatsapp",
                          groupValue: _selectedMethod,
                          onChanged: (value) => setState(() => _selectedMethod = value!),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 15),
                  ElevatedButton(
                    onPressed: _isLoading ? null : _sendOtp,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 55),
                      backgroundColor: Colors.blue,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: _isLoading 
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text("SEND LIVE OTP CODE", style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ] else ...[
                  TextField(
                    controller: _otpController,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    decoration: const InputDecoration(
                      labelText: "Enter 6-Digit Live OTP Code",
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.lock),
                    ),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: _isLoading ? null : _verifyOtp,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 55),
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: _isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text("VERIFY OTP & SIGN IN", style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                  TextButton(
                    onPressed: () => setState(() => _isOtpSent = false),
                    child: const Text("Change Phone Number Entry"),
                  ),
                ],
                const SizedBox(height: 80),
                const Center(
                  child: Text(
                    "Smart Faculty & Staff Attendance System v1.0",
                    style: TextStyle(color: Colors.grey, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
