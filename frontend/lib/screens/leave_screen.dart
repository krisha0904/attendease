import 'package:flutter/material.dart';

class LeaveScreen extends StatefulWidget {
  const LeaveScreen({super.key});

  @override
  State<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends State<LeaveScreen> {
  final _reasonController = TextEditingController();
  String _selectedLeaveType = 'Casual Leave';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: const Text("Leave Management", style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Apply for Leave", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 15),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(15),
              ),
              child: Column(
                children: [
                  DropdownButtonFormField<String>(
                    value: _selectedLeaveType,
                    decoration: const InputDecoration(labelText: "Leave Type"),
                    items: ['Sick Leave', 'Casual Leave', 'Duty Leave', 'Maternity/Paternity Leave']
                        .map((type) => DropdownMenuItem(value: type, child: Text(type)))
                        .toList(),
                    onChanged: (val) => setState(() => _selectedLeaveType = val!),
                  ),
                  const SizedBox(height: 15),
                  TextField(
                    controller: _reasonController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: "Reason for Leave",
                      hintText: "Briefly explain the reason...",
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: () {
                      // Logic to call API
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text("Leave Request Submitted!")),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 50),
                      backgroundColor: Colors.blue,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text("SUBMIT REQUEST"),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 30),
            const Text("Leave Status", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 15),
            _buildLeaveStatusList(),
          ],
        ),
      ),
    );
  }

  Widget _buildLeaveStatusList() {
    final leaves = [
      {"type": "Sick Leave", "date": "10 Aug 2024", "status": "Approved", "color": Colors.green},
      {"type": "Casual Leave", "date": "15 Aug 2024", "status": "Pending", "color": Colors.orange},
    ];

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: leaves.length,
      itemBuilder: (context, index) {
        final leave = leaves[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          child: ListTile(
            title: Text(leave["type"] as String, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text("Requested for: ${leave["date"]}"),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: (leave["color"] as Color).withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                leave["status"] as String,
                style: TextStyle(color: leave["color"] as Color, fontSize: 10, fontWeight: FontWeight.bold),
              ),
            ),
          ),
        );
      },
    );
  }
}
