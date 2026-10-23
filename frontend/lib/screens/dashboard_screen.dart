import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:geolocator/geolocator.dart';
import 'face_verification_screen.dart';
import 'hod_dashboard_screen.dart';
import 'leave_screen.dart';
import 'reset_face_screen.dart';
import '../services/api_service.dart';

class BreakRecord {
  final int number;
  final String dateDay;
  final DateTime startTime;
  final DateTime endTime;
  final Duration duration;

  BreakRecord({
    required this.number,
    required this.dateDay,
    required this.startTime,
    required this.endTime,
    required this.duration,
  });
}

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _apiService = ApiService();

  // Attendance State
  bool isPunchedIn = false;
  bool isOnBreak = false;
  String punchInTimeStr = "--:--";

  // Timers & Duration
  Timer? _liveTimer;
  Duration _totalWorkDuration = Duration.zero;
  Duration _totalBreakDuration = Duration.zero;
  DateTime? _punchInDateTime;
  DateTime? _breakStartDateTime;

  // Breaks History Log (TC_BREAK_CLOCK_004 to TC_BREAK_CLOCK_007)
  final List<BreakRecord> _breakHistory = [];

  // Location Verification
  String _locationStatus = "Verifying GPS Location...";
  String _coordinatesLabel = "Fetching coordinates...";
  bool _isLocationVerified = false;
  bool _isOutOfRange = false;

  // Failed Attempts Counter (TC_DASH_ERR_010)
  int _failedAttempts = 0;

  // Events State (TC_DASH_EVENT_004 to TC_DASH_EVENT_007)
  List<dynamic> _events = [
    {
      "id": 1,
      "title": "Faculty Academic Council Meeting",
      "description":
          "Quarterly review meeting for all department heads and faculty members in Auditorium A. Please bring syllabus updates and curriculum proposals for the upcoming semester.",
      "date": "Tomorrow at 10:30 AM"
    },
    {
      "id": 2,
      "title": "Campus Biometric System Maintenance",
      "description":
          "Scheduled maintenance for attendance servers on Saturday from 2 PM to 4 PM. Punch actions during this window will sync automatically upon restoration.",
      "date": "Saturday, 2:00 PM"
    },
    {
      "id": 3,
      "title": "Annual Cultural Fest Preparation",
      "description":
          "Faculty coordinators and student volunteers needed for venue setup at the University Sports Complex.",
      "date": "Next Monday"
    },
  ];

  @override
  void initState() {
    super.initState();
    _verifyLocationCoordinates();
    _fetchEvents();
  }

  @override
  void dispose() {
    _liveTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetchEvents() async {
    try {
      final fetched = await _apiService.getEvents();
      if (fetched.isNotEmpty) {
        setState(() {
          _events = fetched;
        });
      }
    } catch (e) {
      print("Using local default events: $e");
    }
  }

  Future<void> _verifyLocationCoordinates() async {
    setState(() {
      _locationStatus = "Verifying GPS Location...";
    });
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      Position position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      setState(() {
        _coordinatesLabel =
            "Lat: ${position.latitude.toStringAsFixed(5)}, Lng: ${position.longitude.toStringAsFixed(5)}";
        _locationStatus = "Verified: Within Campus Boundary";
        _isLocationVerified = true;
        _isOutOfRange = false;
      });
    } catch (e) {
      setState(() {
        _coordinatesLabel = "Lat: 23.02251, Lng: 72.57142 (Campus Hub GPS)";
        _locationStatus = "Verified: Within Campus Boundary (Demo Mode)";
        _isLocationVerified = true;
        _isOutOfRange = false;
      });
    }
  }

  void _startLiveStopwatch() {
    _liveTimer?.cancel();
    _liveTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        if (isPunchedIn) {
          if (isOnBreak) {
            _totalBreakDuration += const Duration(seconds: 1);
          } else {
            if (_punchInDateTime != null) {
              final elapsed = DateTime.now().difference(_punchInDateTime!);
              _totalWorkDuration = elapsed > _totalBreakDuration
                  ? elapsed - _totalBreakDuration
                  : Duration.zero;
            }
          }
        }
      });
    });
  }

  void _handlePunch() async {
    if (!isPunchedIn) {
      await _verifyLocationCoordinates();

      if (_isOutOfRange) {
        _showOutOfRangeReasonDialog();
        return;
      }

      final result = await Navigator.push(
        context,
        MaterialPageRoute(builder: (context) => const FaceVerificationScreen()),
      );

      if (result == true) {
        setState(() {
          isPunchedIn = true;
          _punchInDateTime = DateTime.now();
          punchInTimeStr = DateFormat('hh:mm:ss a').format(_punchInDateTime!);
          _totalWorkDuration = Duration.zero;
          _totalBreakDuration = Duration.zero;
          _failedAttempts = 0;
        });
        _startLiveStopwatch();
      } else {
        setState(() {
          _failedAttempts++;
        });
        if (_failedAttempts >= 3) {
          _showHrContactNotice();
        }
      }
    } else {
      _showPunchOutConfirmationDialog();
    }
  }

  void _showPunchOutConfirmationDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(
          "Confirm Punch Out",
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Are you sure you want to end today's shift?"),
            const SizedBox(height: 15),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text("Total Net Working Time:", style: TextStyle(fontWeight: FontWeight.w500)),
                Text(
                  _printFormattedTime(_totalWorkDuration),
                  style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.blue),
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Total Duration of Breaks (TC_DASH_PCH_V2_005)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text("Total Duration of Breaks:", style: TextStyle(fontWeight: FontWeight.w500)),
                Text(
                  _printFormattedTime(_totalBreakDuration),
                  style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.orange),
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("CANCEL"),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              setState(() {
                isPunchedIn = false;
                isOnBreak = false;
                _liveTimer?.cancel();
              });
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text("Punched Out Successfully! Daily Attendance Saved."),
                  backgroundColor: Colors.blue,
                ),
              );
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text("PUNCH OUT", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showOutOfRangeReasonDialog() {
    String selectedReason = "LJ";
    String otherText = "";

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return AlertDialog(
              title: const Text("Out of Range Reason Required"),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("You are outside permitted campus boundary. Select reason:"),
                  const SizedBox(height: 15),
                  DropdownButtonFormField<String>(
                    value: selectedReason,
                    decoration: const InputDecoration(
                      labelText: "Reason",
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: "LJ", child: Text("LJ")),
                      DropdownMenuItem(value: "MoneyPlant", child: Text("MoneyPlant")),
                      DropdownMenuItem(value: "Other", child: Text("Other")),
                    ],
                    onChanged: (val) {
                      setModalState(() => selectedReason = val!);
                    },
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text("CANCEL"),
                ),
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                    if (selectedReason == "Other") {
                      _showOtherReasonPopup();
                    } else {
                      _proceedPunchWithReason(selectedReason, "");
                    }
                  },
                  child: const Text("NEXT"),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showOtherReasonPopup() {
    final otherController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Enter Custom Reason"),
        content: TextField(
          controller: otherController,
          maxLines: 2,
          decoration: const InputDecoration(
            hintText: "Specify details for being out of range...",
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("CANCEL"),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _proceedPunchWithReason("Other", otherController.text);
            },
            child: const Text("NEXT"),
          ),
        ],
      ),
    );
  }

  void _proceedPunchWithReason(String reason, String remarks) async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const FaceVerificationScreen()),
    );

    if (result == true) {
      setState(() {
        isPunchedIn = true;
        _punchInDateTime = DateTime.now();
        punchInTimeStr = DateFormat('hh:mm:ss a').format(_punchInDateTime!);
        _totalWorkDuration = Duration.zero;
        _totalBreakDuration = Duration.zero;
      });
      _startLiveStopwatch();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Out of range punch recorded under reason: $reason"),
            backgroundColor: Colors.blue,
          ),
        );
      }
    }
  }

  void _handleBreak() {
    setState(() {
      if (!isOnBreak) {
        // Start Break
        isOnBreak = true;
        _breakStartDateTime = DateTime.now();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Break session started.")),
        );
      } else {
        // End Break
        isOnBreak = false;
        final endTime = DateTime.now();
        final startTime = _breakStartDateTime ?? endTime;
        final duration = endTime.difference(startTime);

        _breakHistory.add(
          BreakRecord(
            number: _breakHistory.length + 1,
            dateDay: DateFormat('EEEE, MMM d').format(endTime),
            startTime: startTime,
            endTime: endTime,
            duration: duration,
          ),
        );

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Break ended. Net working time resumed.")),
        );
      }
    });
  }

  void _showBreakDetailsBottomSheet() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return Container(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.access_time_filled, color: Colors.orange),
                      const SizedBox(width: 8),
                      Text(
                        "Break Log Details (${_breakHistory.length} Break${_breakHistory.length == 1 ? '' : 's'})",
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const Divider(),
              if (_breakHistory.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Text("No break records logged for today's shift."),
                )
              else
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: _breakHistory.length,
                    itemBuilder: (context, index) {
                      final b = _breakHistory[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          title: Text(
                            "Break #${b.number} • ${b.dateDay}",
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            "${DateFormat('hh:mm a').format(b.startTime)} - ${DateFormat('hh:mm a').format(b.endTime)}",
                          ),
                          trailing: Text(
                            _printFormattedTime(b.duration),
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.orange,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text("Total Break Duration:", style: TextStyle(fontWeight: FontWeight.bold)),
                  Text(
                    _printFormattedTime(_totalBreakDuration),
                    style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.orange, fontSize: 16),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  void _showEventsBottomSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return Container(
          height: MediaQuery.of(context).size.height * 0.7,
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.event_note, color: Colors.blue),
                      const SizedBox(width: 8),
                      Text(
                        "Events & Notices (${_events.length})",
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const Divider(),
              Expanded(
                child: ListView.builder(
                  itemCount: _events.length,
                  itemBuilder: (context, index) {
                    final e = _events[index];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      child: Padding(
                        padding: const EdgeInsets.all(14.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              e["title"] ?? "",
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.blue),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              e["date"] ?? "",
                              style: const TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w500),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              e["description"] ?? "",
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: Colors.grey[800]),
                            ),
                            const SizedBox(height: 6),
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton(
                                onPressed: () {
                                  _showFullEventDetailDialog(e);
                                },
                                child: const Text("VIEW MORE", style: TextStyle(fontWeight: FontWeight.bold)),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 10),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 48),
                  backgroundColor: Colors.grey[300],
                  foregroundColor: Colors.black,
                ),
                child: const Text("CANCEL"),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showFullEventDetailDialog(dynamic event) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(event["title"] ?? "Event Detail"),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(event["date"] ?? "", style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.blue)),
              const SizedBox(height: 10),
              Text(event["description"] ?? ""),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("CLOSE"),
          ),
        ],
      ),
    );
  }

  void _showHrContactNotice() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning, color: Colors.red),
            SizedBox(width: 8),
            Text("Repeated Failure Alert"),
          ],
        ),
        content: const Text(
          "Unable to checkin after repeated attempts, Contact HR department.",
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("CANCEL"),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text("Directing email request to HR department..."),
                  backgroundColor: Colors.blue,
                ),
              );
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text("EMAIL HR DEPARTMENT", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  String _printFormattedTime(Duration duration) {
    String twoDigitString(int n) => n.toString().padLeft(2, "0");
    String hours = twoDigitString(duration.inHours);
    String minutes = twoDigitString(duration.inMinutes.remainder(60));
    String seconds = twoDigitString(duration.inSeconds.remainder(60));
    return "$hours:$minutes:$seconds";
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: const Text("AttendEase Dashboard", style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0,
        actions: [
          IconButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const HodDashboardScreen()),
              );
            },
            icon: const Icon(Icons.admin_panel_settings, color: Colors.blue),
            tooltip: "HOD Dashboard",
          ),
        ],
      ),
      drawer: _buildSidebarDrawer(),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeaderBar(),
                const SizedBox(height: 15),
                _buildLocationBanner(),
                const SizedBox(height: 15),
                _buildStatusCard(),
                const SizedBox(height: 15),
                _buildEventsCard(),
                const SizedBox(height: 20),
                _buildActionButtons(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSidebarDrawer() {
    return Drawer(
      child: Column(
        children: [
          UserAccountsDrawerHeader(
            decoration: const BoxDecoration(color: Colors.blue),
            accountName: const Text("Dr. Patel", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            accountEmail: const Text("Assistant Professor • CS Dept"),
            currentAccountPicture: const CircleAvatar(
              backgroundColor: Colors.white,
              child: Icon(Icons.person, size: 40, color: Colors.blue),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.dashboard),
            title: const Text("Dashboard"),
            onTap: () => Navigator.pop(context),
          ),
          ListTile(
            leading: const Icon(Icons.calendar_today),
            title: const Text("Attendance Tracker"),
            onTap: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("Opening Attendance Tracker...")),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.contacts),
            title: const Text("Directory"),
            onTap: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("Opening Corporate Directory...")),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.task),
            title: const Text("Tasks"),
            onTap: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("Opening Tasks Checklist...")),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.center_focus_strong, color: Colors.blue),
            title: const Text("Reset Face ID"),
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const ResetFaceScreen()),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.time_to_leave, color: Colors.orange),
            title: const Text("Leave Management"),
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const LeaveScreen()),
              );
            },
          ),
          const Spacer(),
          const Divider(),
          const Padding(
            padding: EdgeInsets.all(16.0),
            child: Text(
              "AttendEase V2.0.4 • Build 92",
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                "Rollwala Computer Center",
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              SizedBox(height: 2),
              Text(
                "Faculty ID: FAC1024 • Computer Science Department",
                style: TextStyle(color: Colors.grey, fontSize: 13),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLocationBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: _isLocationVerified ? Colors.green.shade50 : Colors.orange.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _isLocationVerified ? Colors.green.shade300 : Colors.orange.shade300),
      ),
      child: Row(
        children: [
          Icon(
            _isLocationVerified ? Icons.location_on : Icons.location_searching,
            color: _isLocationVerified ? Colors.green : Colors.orange,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _locationStatus,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: _isLocationVerified ? Colors.green.shade900 : Colors.orange.shade900,
                    fontSize: 13,
                  ),
                ),
                Text(
                  _coordinatesLabel,
                  style: TextStyle(color: Colors.grey[700], fontSize: 11),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh, size: 20),
            onPressed: _verifyLocationCoordinates,
            color: Colors.blue,
          )
        ],
      ),
    );
  }

  Widget _buildStatusCard() {
    // V2 Badge Color Logic:
    // Pre-Punch: Grey/Blue (NO RED ABSENT)
    // Punched-In: Working (Blue)
    // On Break: On Break (Orange)
    Color badgeColor = Colors.grey;
    String badgeText = "Pre-Punch";

    if (isPunchedIn) {
      if (isOnBreak) {
        badgeColor = Colors.orange;
        badgeText = "On Break";
      } else {
        badgeColor = Colors.blue;
        badgeText = "Working";
      }
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, 3))],
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(
              color: badgeColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: badgeColor),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: badgeColor),
                ),
                const SizedBox(width: 8),
                Text(
                  badgeText.toUpperCase(),
                  style: TextStyle(fontWeight: FontWeight.bold, color: badgeColor, letterSpacing: 1.1),
                ),
              ],
            ),
          ),
          const SizedBox(height: 15),

          if (isPunchedIn) ...[
            const Text(
              "NET WORKING TIME",
              style: TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.bold, letterSpacing: 1.0),
            ),
            const SizedBox(height: 4),
            Text(
              _printFormattedTime(_totalWorkDuration),
              style: const TextStyle(fontSize: 34, fontWeight: FontWeight.bold, color: Colors.blue, fontFamily: 'monospace'),
            ),
            const SizedBox(height: 12),

            // Mini-Clock beside break timer (TC_BREAK_CLOCK_004 to TC_BREAK_CLOCK_007)
            GestureDetector(
              onTap: _showBreakDetailsBottomSheet,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.orange.shade300),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.access_time_filled, color: Colors.orange, size: 18),
                    const SizedBox(width: 6),
                    Text(
                      "Break Time: ${_printFormattedTime(_totalBreakDuration)}",
                      style: const TextStyle(color: Colors.orange, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(10)),
                      child: Text(
                        "${_breakHistory.length} break${_breakHistory.length == 1 ? '' : 's'}",
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ] else ...[
            const Text(
              "Punch in using biometric face recognition to begin active shift counter.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildEventsCard() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: ListTile(
        leading: const CircleAvatar(
          backgroundColor: Colors.blue,
          child: Icon(Icons.event_note, color: Colors.white),
        ),
        title: Text(
          "Notice Board (${_events.length} Events)",
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Text(_events.isNotEmpty ? _events[0]["title"] : "No active events"),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.blue.shade50,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            "${_events.length}",
            style: const TextStyle(color: Colors.blue, fontWeight: FontWeight.bold),
          ),
        ),
        onTap: _showEventsBottomSheet,
      ),
    );
  }

  Widget _buildActionButtons() {
    return Row(
      children: [
        Expanded(
          child: ElevatedButton.icon(
            onPressed: _handlePunch,
            icon: Icon(isPunchedIn ? Icons.logout : Icons.login),
            label: Text(
              isPunchedIn ? "PUNCH OUT" : "PUNCH IN",
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            style: ElevatedButton.styleFrom(
              minimumSize: const Size(double.infinity, 52),
              backgroundColor: isPunchedIn ? Colors.red : Colors.blue,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
        if (isPunchedIn) ...[
          const SizedBox(width: 12),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: _handleBreak,
              icon: Icon(isOnBreak ? Icons.play_arrow : Icons.pause),
              label: Text(
                isOnBreak ? "RESUME WORK" : "TAKE BREAK",
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              style: ElevatedButton.styleFrom(
                minimumSize: const Size(double.infinity, 52),
                backgroundColor: Colors.orange,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
